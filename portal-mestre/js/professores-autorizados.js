// NeuraOAB — Portal Mestre — allowlist de e-mails autorizados a entrar no
// Portal do Professor por autoatendimento (e-mail+senha, criando a própria
// conta na primeira vez — ver professor-portal/js/auth.js), tabela
// "professores_autorizados" (ver supabase/schema_professores_autorizados.sql). CRUD
// direto na tabela (RLS "professores_autorizados_admin" já exige
// is_admin() — sem precisar de Edge Function, mesmo padrão de js/planos.js
// pra editar plan_limits). A checagem em si, no momento do login, é feita
// pela Edge Function professor-auth-check (service_role, ignora RLS).
//
// "Conta" (ver loadAccountsForAutorizados): cruza cada e-mail autorizado com
// "profiles" pra mostrar se alguém já tentou entrar com aquele e-mail — quem
// se cadastra pelo Portal do Professor (ver professor-self-signup/index.ts)
// nasce com role_id "aluno" e só vira "professor" no PRIMEIRO login depois
// de confirmado (professor-auth-check) — até lá, essa conta ficava invisível
// aqui (só aparecia misturada na aba "Alunos", sem jeito de desativar/
// excluir ela como conta do Portal do Professor). Ativar/desativar usa
// profiles.ativo direto (mesma coluna que a tabela "Professores" já usa,
// agora também aplicada nesta view — checkIsProfessor/requireProfessor
// passaram a checar esse campo, ver professor-portal/js/auth.js e
// supabase/functions/professor-portal/index.ts); excluir reusa a ação
// "delete" de portal-admin (já funciona pra qualquer perfil não-admin, não
// só pra quem já é "professor").

let autorizadosCache = [];
let currentAdminId = null;
// e-mail (minúsculo) -> { id, nome, role, ativo, created_at } | undefined —
// preenchido por loadAccountsForAutorizados, cruzado com autorizadosCache
// na hora de desenhar a tabela (ver renderAutorizados).
let accountsByEmail = new Map();

// Nomes prefixados com "autorizado"/"at" de propósito — este script roda no
// mesmo escopo global que admin.js (scripts clássicos, não módulos), que já
// declara tableBodyEl/modalOverlay/modalMsg/modalForm/fieldEmail/fieldNome/
// modalSaveBtn/fmtDate/showModalMsg/clearModalMsg pro painel de Professores;
// reusar esses nomes aqui é um SyntaxError de redeclaração que impede o
// arquivo INTEIRO de rodar (mesmo padrão de prefixo que js/alunos.js já usa
// pros seus próprios elementos, ex.: studentsTableBodyEl).
const autorizadosTableBodyEl = document.getElementById("autorizadosTableBody");
const autorizadoModalOverlay = document.getElementById("autorizadoModal");
const autorizadoModalMsgEl = document.getElementById("autorizadoModalMsg");
const autorizadoModalForm = document.getElementById("autorizadoForm");
const atFieldEmail = document.getElementById("atEmail");
const atFieldNome = document.getElementById("atNome");
const autorizadoModalSaveBtn = document.getElementById("autorizadoModalSave");

function fmtDateAutorizado(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return "—";
  }
}

function showAutorizadoModalMsg(text, kind) {
  autorizadoModalMsgEl.textContent = text;
  autorizadoModalMsgEl.className = `modal-msg show ${kind}`;
}
function clearAutorizadoModalMsg() {
  autorizadoModalMsgEl.className = "modal-msg";
  autorizadoModalMsgEl.textContent = "";
}

function renderAutorizados() {
  autorizadosTableBodyEl.innerHTML = "";

  if (autorizadosCache.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = "Nenhum e-mail autorizado ainda.";
    tr.appendChild(td);
    autorizadosTableBodyEl.appendChild(tr);
    return;
  }

  autorizadosCache.forEach((a) => {
    const tr = document.createElement("tr");
    const account = accountsByEmail.get(a.email);

    [a.email, a.nome || account?.nome || "—"].forEach((text) => {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    });

    const contaTd = document.createElement("td");
    if (!account) {
      const badge = document.createElement("span");
      badge.className = "badge inativo";
      badge.textContent = "Sem conta ainda";
      contaTd.appendChild(badge);
    } else if (account.role === "professor" || account.role === "admin") {
      const badge = document.createElement("span");
      badge.className = "badge ativo";
      badge.textContent = "Já é professor";
      contaTd.appendChild(badge);
    } else {
      const badge = document.createElement("span");
      badge.className = "badge " + (account.ativo ? "ativo" : "inativo");
      badge.textContent = account.ativo ? "Conta criada — aguardando 1º login como professor" : "Conta desativada";
      contaTd.appendChild(badge);
    }
    tr.appendChild(contaTd);

    const dateTd = document.createElement("td");
    dateTd.textContent = fmtDateAutorizado(a.created_at);
    tr.appendChild(dateTd);

    const actionsTd = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "row-actions";

    // Ativar/desativar e excluir só fazem sentido pra uma conta que já
    // existe e ainda não é "professor" de verdade — quem já é professor se
    // gerencia pela tabela "Professores" acima (evita ação duplicada em dois
    // lugares, mesmo espírito do comentário em js/planos.js sobre não
    // duplicar a troca de plano).
    if (account && account.role !== "professor" && account.role !== "admin") {
      const toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.textContent = account.ativo ? "Desativar" : "Ativar";
      toggleBtn.addEventListener("click", () => toggleContaAtiva(account, a.email));
      actions.appendChild(toggleBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "danger";
      deleteBtn.textContent = "Excluir conta";
      deleteBtn.addEventListener("click", () => excluirConta(account, a.email));
      actions.appendChild(deleteBtn);
    }

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "danger";
    removeBtn.textContent = "Remover";
    removeBtn.addEventListener("click", () => removeAutorizado(a));

    actions.appendChild(removeBtn);
    actionsTd.appendChild(actions);
    tr.appendChild(actionsTd);

    autorizadosTableBodyEl.appendChild(tr);
  });
}

// Cruza cada e-mail autorizado com "profiles" (RLS já libera admin ler
// qualquer linha, ver profiles_select em schema_portal_mestre.sql) — ilike
// (sem eq) porque profiles.email nem sempre está gravado em minúsculo (só
// professores_autorizados.email é normalizado por gatilho, ver schema_
// professores_autorizados.sql); "%"/"_" escapados pra "_" (válido em
// e-mail) não virar wildcard do ilike.
function escapeIlike(value) {
  return value.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

async function loadAccountsForAutorizados() {
  accountsByEmail = new Map();
  if (autorizadosCache.length === 0) return;

  const { data: roles } = await client.from("roles").select("id, name");
  const roleNameById = new Map((roles || []).map((r) => [r.id, r.name]));

  const lookups = autorizadosCache.map(async (a) => {
    const { data } = await client
      .from("profiles")
      .select("id, nome, role_id, ativo, created_at")
      .ilike("email", escapeIlike(a.email))
      .maybeSingle();
    if (data) {
      accountsByEmail.set(a.email, {
        id: data.id,
        nome: data.nome,
        role: roleNameById.get(data.role_id) || null,
        ativo: data.ativo,
        created_at: data.created_at,
      });
    }
  });
  await Promise.all(lookups);
}

async function loadAutorizados() {
  const { data, error } = await client
    .from("professores_autorizados")
    .select("email, nome, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Falha ao carregar e-mails autorizados:", error);
    autorizadosCache = [];
  } else {
    autorizadosCache = data || [];
  }
  await loadAccountsForAutorizados();
  renderAutorizados();
}

async function toggleContaAtiva(account, email) {
  const novoAtivo = !account.ativo;
  const { error } = await client.from("profiles").update({ ativo: novoAtivo }).eq("id", account.id);
  if (error) {
    window.alert(`Não foi possível ${novoAtivo ? "ativar" : "desativar"} a conta: ${error.message}`);
    return;
  }
  await loadAutorizados();
}

async function excluirConta(account, email) {
  // Aviso mais forte que o de "Excluir" na tabela Professores de propósito:
  // esta conta ainda tem role "aluno" (nunca chegou a virar professor), o
  // que significa que pode ser uma conta de aluno de verdade que só por
  // coincidência compartilha esse e-mail (ex.: o próprio professor também
  // usa o app pra estudar) — excluir apaga TUDO dela (tentativas, respostas,
  // conversas), não só o acesso ao Portal do Professor.
  const confirmed = window.confirm(
    `Excluir definitivamente a conta de ${email}? Essa conta ainda é de ALUNO (nunca virou professor) — se essa pessoa já usa o app pra estudar, isso apaga todo o histórico dela (respostas, tentativas, conversas), não só o acesso ao Portal do Professor. Não pode ser desfeito.\n\nA autorização na allowlist continua valendo depois — esse e-mail ainda pode se cadastrar de novo, a menos que você também clique em "Remover".`,
  );
  if (!confirmed) return;

  try {
    await callPortalAdmin({ action: "delete", id: account.id });
    await loadAutorizados();
  } catch (err) {
    window.alert(`Não foi possível excluir: ${err.message}`);
  }
}

function openAutorizadoModal() {
  autorizadoModalForm.reset();
  clearAutorizadoModalMsg();
  autorizadoModalOverlay.hidden = false;
  atFieldEmail.focus();
}
function closeAutorizadoModal() {
  autorizadoModalOverlay.hidden = true;
}

document.getElementById("newAutorizadoBtn").addEventListener("click", openAutorizadoModal);
document.getElementById("autorizadoModalClose").addEventListener("click", closeAutorizadoModal);
document.getElementById("autorizadoModalCancel").addEventListener("click", closeAutorizadoModal);
autorizadoModalOverlay.addEventListener("click", (ev) => {
  if (ev.target === autorizadoModalOverlay) closeAutorizadoModal();
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && !autorizadoModalOverlay.hidden) closeAutorizadoModal();
});

autorizadoModalForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  clearAutorizadoModalMsg();
  autorizadoModalSaveBtn.disabled = true;

  const email = atFieldEmail.value.trim().toLowerCase();
  const nome = atFieldNome.value.trim() || null;

  try {
    const { error } = await client
      .from("professores_autorizados")
      .upsert({ email, nome, autorizado_por: currentAdminId });
    if (error) throw new Error(error.message);
    closeAutorizadoModal();
    await loadAutorizados();
  } catch (err) {
    showAutorizadoModalMsg(err.message || "Ocorreu um erro inesperado.", "err");
  } finally {
    autorizadoModalSaveBtn.disabled = false;
  }
});

async function removeAutorizado(autorizado) {
  const confirmed = window.confirm(
    `Remover ${autorizado.email} da lista de autorizados? Quem já é professor (role já promovido) não perde o acesso — isso só impede um e-mail NOVO de entrar sozinho a partir de agora.`,
  );
  if (!confirmed) return;

  try {
    const { error } = await client.from("professores_autorizados").delete().eq("email", autorizado.email);
    if (error) throw new Error(error.message);
    await loadAutorizados();
  } catch (err) {
    window.alert(`Não foi possível remover: ${err.message}`);
  }
}

async function initAutorizados() {
  const user = await requireAdminSession();
  if (!user) return; // requireAdminSession já redirecionou pro login
  currentAdminId = user.id;
  await loadAutorizados();
}

initAutorizados();
