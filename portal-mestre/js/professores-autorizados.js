// NeuraOAB — Portal Mestre — allowlist de e-mails autorizados a entrar no
// Portal do Professor via login com Google (tabela "professores_
// autorizados", ver supabase/schema_professores_autorizados.sql). CRUD
// direto na tabela (RLS "professores_autorizados_admin" já exige
// is_admin() — sem precisar de Edge Function, mesmo padrão de js/planos.js
// pra editar plan_limits). A checagem em si, no momento do login, é feita
// pela Edge Function professor-auth-check (service_role, ignora RLS).

let autorizadosCache = [];
let currentAdminId = null;

const tableBodyEl = document.getElementById("autorizadosTableBody");
const modalOverlay = document.getElementById("autorizadoModal");
const modalMsg = document.getElementById("autorizadoModalMsg");
const modalForm = document.getElementById("autorizadoForm");
const fieldEmail = document.getElementById("atEmail");
const fieldNome = document.getElementById("atNome");
const modalSaveBtn = document.getElementById("autorizadoModalSave");

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

function renderAutorizados() {
  tableBodyEl.innerHTML = "";

  if (autorizadosCache.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    const td = document.createElement("td");
    td.colSpan = 4;
    td.textContent = "Nenhum e-mail autorizado ainda.";
    tr.appendChild(td);
    tableBodyEl.appendChild(tr);
    return;
  }

  autorizadosCache.forEach((a) => {
    const tr = document.createElement("tr");
    [a.email, a.nome || "—", fmtDate(a.created_at)].forEach((text) => {
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

    tableBodyEl.appendChild(tr);
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
  modalForm.reset();
  clearModalMsg();
  modalOverlay.hidden = false;
  fieldEmail.focus();
}
function closeAutorizadoModal() {
  modalOverlay.hidden = true;
}

document.getElementById("newAutorizadoBtn").addEventListener("click", openAutorizadoModal);
document.getElementById("autorizadoModalClose").addEventListener("click", closeAutorizadoModal);
document.getElementById("autorizadoModalCancel").addEventListener("click", closeAutorizadoModal);
modalOverlay.addEventListener("click", (ev) => {
  if (ev.target === modalOverlay) closeAutorizadoModal();
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && !modalOverlay.hidden) closeAutorizadoModal();
});

modalForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  clearModalMsg();
  modalSaveBtn.disabled = true;

  const email = fieldEmail.value.trim().toLowerCase();
  const nome = fieldNome.value.trim() || null;

  try {
    const { error } = await client
      .from("professores_autorizados")
      .upsert({ email, nome, autorizado_por: currentAdminId });
    if (error) throw new Error(error.message);
    closeAutorizadoModal();
    await loadAutorizados();
  } catch (err) {
    showModalMsg(err.message || "Ocorreu um erro inesperado.", "err");
  } finally {
    modalSaveBtn.disabled = false;
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
