// NeuraOAB — Portal Mestre — dashboard: estatísticas + CRUD de professores.
//
// "Criar", "excluir" e "redefinir senha" passam pela Edge Function
// portal-admin (client.functions.invoke já manda o token da sessão atual
// no header Authorization automaticamente — mesmo padrão já usado em
// estudos/dr-laureano.js e estudos/simulado2fase.js pras outras Edge
// Functions do projeto). "Editar" campos simples (nome/cursinho/
// telefone/ativo) é um UPDATE direto em profiles, protegido pela policy
// de RLS "profiles_update_admin" — não precisa da service_role pra isso.

let professorRoleId = null;
let professorsCache = [];

const statTotalEl = document.getElementById("statTotalProfessores");
const statAtivosEl = document.getElementById("statProfessoresAtivos");
const tableBodyEl = document.getElementById("professorsTableBody");

const modalOverlay = document.getElementById("professorModal");
const modalTitle = document.getElementById("professorModalTitle");
const modalMsg = document.getElementById("professorModalMsg");
const modalForm = document.getElementById("professorForm");
const fieldId = document.getElementById("pfId");
const fieldNome = document.getElementById("pfNome");
const fieldEmail = document.getElementById("pfEmail");
const fieldCursinho = document.getElementById("pfCursinho");
const fieldTelefone = document.getElementById("pfTelefone");
const fieldAtivo = document.getElementById("pfAtivo");
const passwordSection = document.getElementById("pfPasswordSection");
const fieldPassword = document.getElementById("pfPassword");
const generatePasswordBtn = document.getElementById("pfGeneratePassword");
const nomeFieldWrap = document.getElementById("pfNomeWrap");
const emailFieldWrap = document.getElementById("pfEmailWrap");
const activeFieldWrap = document.getElementById("pfAtivoWrap");
const modalSaveBtn = document.getElementById("professorModalSave");

// Estados alternativos do corpo/rodapé do modal: formulário normal, ou o
// resultado do convite depois de criar um professor (ver openCreateModal
// / showInviteResult).
const formFieldsEl = document.getElementById("pfFormFields");
const formFooterEl = document.getElementById("pfFormFooter");
const inviteResultEl = document.getElementById("pfInviteResult");
const inviteFooterEl = document.getElementById("pfInviteFooter");
const inviteHintEl = document.getElementById("pfInviteHint");
const inviteLinkInput = document.getElementById("pfInviteLink");
const copyInviteLinkBtn = document.getElementById("pfCopyInviteLink");
const inviteDoneBtn = document.getElementById("pfInviteDone");

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return "—";
  }
}

function showModalMsg(text, kind) {
  modalMsg.textContent = text;
  modalMsg.className = `modal-msg show ${kind}`;
}

function clearModalMsg() {
  modalMsg.className = "modal-msg";
  modalMsg.textContent = "";
}

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => chars[n % chars.length]).join("");
}

generatePasswordBtn.addEventListener("click", () => {
  fieldPassword.value = generatePassword();
  fieldPassword.type = "text";
});

// ------------------------------------------------------------ Estatísticas

async function loadStats() {
  if (!professorRoleId) return;

  const { count: totalCount } = await client
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role_id", professorRoleId);
  statTotalEl.textContent = totalCount ?? "—";

  const { count: ativosCount } = await client
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role_id", professorRoleId)
    .eq("ativo", true);
  statAtivosEl.textContent = ativosCount ?? "—";
}

// -------------------------------------------------------------- Listagem

function renderProfessors() {
  tableBodyEl.innerHTML = "";

  if (professorsCache.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = "Nenhum professor cadastrado ainda.";
    tr.appendChild(td);
    tableBodyEl.appendChild(tr);
    return;
  }

  professorsCache.forEach((p) => {
    const tr = document.createElement("tr");

    const nomeTd = document.createElement("td");
    if (p.nome) {
      nomeTd.textContent = p.nome;
    } else {
      // "nome" só é preenchido pelo próprio professor, ao aceitar o
      // convite (ver professor/definir-senha.html) — vazio aqui significa
      // que o convite ainda não foi aceito, não que faltou preencher algo.
      const pending = document.createElement("span");
      pending.className = "badge inativo";
      pending.textContent = "Convite pendente";
      nomeTd.appendChild(pending);
    }
    tr.appendChild(nomeTd);

    [p.email || "—", p.cursinho || "—", fmtDate(p.created_at)].forEach((text) => {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    });

    const statusTd = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "badge " + (p.ativo ? "ativo" : "inativo");
    badge.textContent = p.ativo ? "Ativo" : "Inativo";
    statusTd.appendChild(badge);
    tr.appendChild(statusTd);

    const actionsTd = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "row-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "Editar";
    editBtn.addEventListener("click", () => openEditModal(p));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "danger";
    deleteBtn.textContent = "Excluir";
    deleteBtn.addEventListener("click", () => deleteProfessor(p));

    actions.append(editBtn, deleteBtn);
    actionsTd.appendChild(actions);
    tr.appendChild(actionsTd);

    tableBodyEl.appendChild(tr);
  });
}

async function loadProfessors() {
  if (!professorRoleId) return;
  const { data, error } = await client
    .from("profiles")
    .select("id, nome, email, cursinho, telefone, ativo, created_at")
    .eq("role_id", professorRoleId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Falha ao carregar professores:", error);
    professorsCache = [];
  } else {
    professorsCache = data || [];
  }
  renderProfessors();
}

async function refreshAll() {
  await Promise.all([loadStats(), loadProfessors()]);
}

// ---------------------------------------------------------------- Modal

// Volta o modal pro estado de formulário (desfaz showInviteResult, se
// tiver sido chamado numa abertura anterior).
function showFormFields() {
  formFieldsEl.hidden = false;
  formFooterEl.hidden = false;
  inviteResultEl.hidden = true;
  inviteFooterEl.hidden = true;
}

function openCreateModal() {
  modalForm.reset();
  fieldId.value = "";
  modalTitle.textContent = "Novo professor";
  // O professor define o próprio nome e senha ao aceitar o convite (ver
  // professor/definir-senha.html) — aqui o admin só informa o e-mail.
  nomeFieldWrap.hidden = true;
  fieldNome.required = false;
  emailFieldWrap.hidden = false;
  fieldEmail.disabled = false;
  fieldEmail.required = true;
  activeFieldWrap.hidden = true;
  passwordSection.hidden = true;
  modalSaveBtn.textContent = "Gerar convite";
  clearModalMsg();
  showFormFields();
  modalOverlay.hidden = false;
  fieldEmail.focus();
}

function openEditModal(professor) {
  modalForm.reset();
  fieldId.value = professor.id;
  fieldNome.value = professor.nome || "";
  fieldCursinho.value = professor.cursinho || "";
  fieldTelefone.value = professor.telefone || "";
  fieldAtivo.checked = !!professor.ativo;

  modalTitle.textContent = "Editar professor";
  nomeFieldWrap.hidden = false;
  fieldNome.required = false; // pode estar vazio ainda (convite não aceito)
  emailFieldWrap.hidden = true; // e-mail de login não muda por aqui
  fieldEmail.disabled = true;
  fieldEmail.required = false;
  activeFieldWrap.hidden = false;
  passwordSection.hidden = false;
  fieldPassword.value = "";
  fieldPassword.type = "password";
  modalSaveBtn.textContent = "Salvar alterações";
  clearModalMsg();
  showFormFields();
  modalOverlay.hidden = false;
  fieldNome.focus();
}

// Mostrado só depois de criar um professor com sucesso — troca o
// formulário pelo resultado do convite. O e-mail já foi disparado via
// Resend pela Edge Function (ver portal-admin/index.ts); o link continua
// aparecendo aqui como reforço/fallback, caso o envio tenha falhado (ex.:
// RESEND_API_KEY não configurado, domínio não verificado) ou o professor
// não encontre o e-mail.
function showInviteResult(link, emailSent) {
  formFieldsEl.hidden = true;
  formFooterEl.hidden = true;
  inviteResultEl.hidden = false;
  inviteFooterEl.hidden = false;
  inviteLinkInput.value = link;
  inviteHintEl.textContent = emailSent
    ? "Convite enviado por e-mail. Se preferir, copie o link abaixo e mande por outro canal."
    : "Professor cadastrado, mas o e-mail de convite não pôde ser enviado. Copie o link abaixo e envie manualmente.";
  inviteHintEl.className = "field-hint" + (emailSent ? "" : " warn");
}

function closeModal() {
  modalOverlay.hidden = true;
}

copyInviteLinkBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(inviteLinkInput.value);
  } catch {
    // Sem permissão de clipboard (ex.: contexto não-seguro) — seleciona o
    // texto pro admin copiar manualmente com Ctrl+C.
    inviteLinkInput.select();
  }
  const original = copyInviteLinkBtn.textContent;
  copyInviteLinkBtn.textContent = "Copiado!";
  setTimeout(() => { copyInviteLinkBtn.textContent = original; }, 1500);
});

inviteDoneBtn.addEventListener("click", async () => {
  closeModal();
  await refreshAll();
});

document.getElementById("newProfessorBtn").addEventListener("click", openCreateModal);
document.getElementById("professorModalClose").addEventListener("click", closeModal);
document.getElementById("professorModalCancel").addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (ev) => {
  if (ev.target === modalOverlay) closeModal();
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && !modalOverlay.hidden) closeModal();
});

async function callPortalAdmin(payload) {
  const { data, error } = await client.functions.invoke("portal-admin", { body: payload });
  if (error) {
    // client.functions.invoke devolve o corpo do erro em error.context,
    // quando a function respondeu com um JSON {error: "..."} (nosso
    // formato padrão nas outras Edge Functions do projeto).
    let detail = error.message;
    try {
      const body = await error.context?.json?.();
      if (body?.error) detail = body.error;
    } catch {
      // mantém a mensagem genérica
    }
    throw new Error(detail);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

modalForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  clearModalMsg();
  modalSaveBtn.disabled = true;

  const id = fieldId.value;
  const cursinho = fieldCursinho.value.trim();
  const telefone = fieldTelefone.value.trim();

  try {
    if (!id) {
      // Criação: sempre passa pela Edge Function, porque cria uma conta
      // de auth nova por convite (id ainda não existe) — ver comentário
      // no topo do arquivo. Sem nome nem senha aqui: o professor define
      // os dois ao aceitar o convite.
      const email = fieldEmail.value.trim();
      const result = await callPortalAdmin({ action: "create", email, cursinho, telefone });
      await refreshAll(); // já reflete o novo professor na lista, atrás do modal
      showInviteResult(result.inviteLink, result.emailSent);
      return; // modal continua aberto, mostrando o link — fecha em inviteDoneBtn
    }

    // Edição: campos simples direto na tabela (RLS já garante que só
    // admin grava aqui); senha nova (se preenchida) vai separada pra
    // Edge Function, que é a única que sabe mexer em auth.users.
    const nome = fieldNome.value.trim();
    const password = fieldPassword.value;
    const { error } = await client
      .from("profiles")
      .update({ nome, cursinho, telefone, ativo: fieldAtivo.checked })
      .eq("id", id);
    if (error) throw new Error(error.message);

    if (password) {
      await callPortalAdmin({ action: "reset-password", id, password });
    }

    closeModal();
    await refreshAll();
  } catch (err) {
    showModalMsg(err.message || "Ocorreu um erro inesperado.", "err");
  } finally {
    modalSaveBtn.disabled = false;
  }
});

async function deleteProfessor(professor) {
  const label = professor.nome || professor.email || "este professor";
  const confirmed = window.confirm(
    `Excluir ${label}? Essa ação não pode ser desfeita — o login dele para de funcionar imediatamente.`,
  );
  if (!confirmed) return;

  try {
    await callPortalAdmin({ action: "delete", id: professor.id });
    await refreshAll();
  } catch (err) {
    window.alert(`Não foi possível excluir: ${err.message}`);
  }
}

// -------------------------------------------------------------------- Init

async function init() {
  const user = await requireAdminSession();
  if (!user) return; // requireAdminSession já redirecionou pro login

  const { data: role } = await client.from("roles").select("id").eq("name", "professor").maybeSingle();
  professorRoleId = role?.id ?? null;

  if (!professorRoleId) {
    tableBodyEl.innerHTML = "";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = "Papel \"professor\" não encontrado — rode supabase/schema_portal_mestre.sql.";
    tr.appendChild(td);
    tableBodyEl.appendChild(tr);
    return;
  }

  await refreshAll();
}

init();
