// NeuraOAB — Portal Mestre — allowlist de e-mails autorizados a entrar no
// Portal do Professor por autoatendimento (e-mail+senha, criando a própria
// conta na primeira vez — ver professor-portal/js/auth.js), tabela
// "professores_autorizados" (ver supabase/schema_professores_autorizados.sql). CRUD
// direto na tabela (RLS "professores_autorizados_admin" já exige
// is_admin() — sem precisar de Edge Function, mesmo padrão de js/planos.js
// pra editar plan_limits). A checagem em si, no momento do login, é feita
// pela Edge Function professor-auth-check (service_role, ignora RLS).

let autorizadosCache = [];
let currentAdminId = null;

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
    td.colSpan = 4;
    td.textContent = "Nenhum e-mail autorizado ainda.";
    tr.appendChild(td);
    autorizadosTableBodyEl.appendChild(tr);
    return;
  }

  autorizadosCache.forEach((a) => {
    const tr = document.createElement("tr");
    [a.email, a.nome || "—", fmtDateAutorizado(a.created_at)].forEach((text) => {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    });

    const actionsTd = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "row-actions";

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
  renderAutorizados();
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
