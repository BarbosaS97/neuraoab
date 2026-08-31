// NeuraOAB — Portal do Professor — dashboard: estatísticas + convite em
// lote + CRUD simples de alunos.
//
// "Convidar" e "excluir" passam pela Edge Function professor-portal
// (client.functions.invoke já manda o token da sessão atual no header
// Authorization automaticamente — mesmo padrão de portal-mestre/js/
// admin.js). "Editar" (só o nome) é um UPDATE direto em profiles,
// protegido pela policy de RLS "profiles_update_professor" — não precisa
// da service_role pra isso. RLS também é quem garante que este professor só
// enxerga/edita os PRÓPRIOS alunos (profiles.professor_id = auth.uid()),
// não precisa filtrar isso de novo no cliente.

let alunoRoleId = null;
let studentsCache = [];
let currentProfessorId = null;

const statTotalEl = document.getElementById("statTotalAlunos");
const statAtivosEl = document.getElementById("statAlunosAtivos");
const tableBodyEl = document.getElementById("studentsTableBody");

// ------------------------------------------------------------- Convite modal

const inviteModal = document.getElementById("inviteModal");
const inviteModalMsg = document.getElementById("inviteModalMsg");
const inviteForm = document.getElementById("inviteForm");
const inviteTextarea = document.getElementById("inviteTextarea");
const inviteFormFields = document.getElementById("inviteFormFields");
const inviteFormFooter = document.getElementById("inviteFormFooter");
const inviteResultEl = document.getElementById("inviteResult");
const inviteResultHint = document.getElementById("inviteResultHint");
const inviteResultBody = document.getElementById("inviteResultBody");
const inviteResultFooter = document.getElementById("inviteResultFooter");
const inviteModalSaveBtn = document.getElementById("inviteModalSave");

// ---------------------------------------------------------------- Edit modal

const editModal = document.getElementById("editModal");
const editModalMsg = document.getElementById("editModalMsg");
const editForm = document.getElementById("editForm");
const edId = document.getElementById("edId");
const edNome = document.getElementById("edNome");
const editModalSaveBtn = document.getElementById("editModalSave");

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return "—";
  }
}

function showMsg(el, text, kind) {
  el.textContent = text;
  el.className = `modal-msg show ${kind}`;
}

function clearMsg(el) {
  el.className = "modal-msg";
  el.textContent = "";
}

// ------------------------------------------------------------ Estatísticas

async function loadStats() {
  if (!alunoRoleId) return;

  // Filtro por professor_id explícito aqui, mesmo já sendo garantido pela
  // policy de RLS "profiles_select_professor" — não custa nada e deixa a
  // intenção clara na própria query, sem depender só do banco pra isolar
  // os alunos de outro professor.
  const { count: totalCount } = await client
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role_id", alunoRoleId)
    .eq("professor_id", currentProfessorId);
  statTotalEl.textContent = totalCount ?? "—";

  const { count: ativosCount } = await client
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role_id", alunoRoleId)
    .eq("professor_id", currentProfessorId)
    .eq("ativo", true);
  statAtivosEl.textContent = ativosCount ?? "—";
}

// -------------------------------------------------------------- Listagem

function renderStudents() {
  tableBodyEl.innerHTML = "";

  if (studentsCache.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = "Nenhum aluno cadastrado ainda.";
    tr.appendChild(td);
    tableBodyEl.appendChild(tr);
    return;
  }

  studentsCache.forEach((s) => {
    const tr = document.createElement("tr");

    const nomeTd = document.createElement("td");
    if (s.nome) {
      nomeTd.textContent = s.nome;
    } else {
      const pending = document.createElement("span");
      pending.className = "badge inativo";
      pending.textContent = "Convite pendente";
      nomeTd.appendChild(pending);
    }
    tr.appendChild(nomeTd);

    [s.email || "—", fmtDate(s.created_at)].forEach((text) => {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    });

    const statusTd = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "badge " + (s.ativo ? "ativo" : "inativo");
    badge.textContent = s.ativo ? "Ativo" : "Inativo";
    statusTd.appendChild(badge);
    tr.appendChild(statusTd);

    const actionsTd = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "row-actions";

    const detailsLink = document.createElement("a");
    detailsLink.href = `aluno.html?id=${encodeURIComponent(s.id)}`;
    detailsLink.textContent = "Ver detalhes";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "Editar";
    editBtn.addEventListener("click", () => openEditModal(s));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "danger";
    deleteBtn.textContent = "Excluir";
    deleteBtn.addEventListener("click", () => deleteStudent(s));

    actions.append(detailsLink, editBtn, deleteBtn);
    actionsTd.appendChild(actions);
    tr.appendChild(actionsTd);

    tableBodyEl.appendChild(tr);
  });
}

async function loadStudents() {
  if (!alunoRoleId) return;
  const { data, error } = await client
    .from("profiles")
    .select("id, nome, email, ativo, created_at")
    .eq("role_id", alunoRoleId)
    .eq("professor_id", currentProfessorId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Falha ao carregar alunos:", error);
    studentsCache = [];
  } else {
    studentsCache = data || [];
  }
  renderStudents();
}

async function refreshAll() {
  await Promise.all([loadStats(), loadStudents()]);
}

async function callProfessorPortal(payload) {
  const { data, error } = await client.functions.invoke("professor-portal", { body: payload });
  if (error) {
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

// ------------------------------------------------------------ Convite modal

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Aceita "email" ou "email, nome" por linha — o "cadastro em lote" pedido
// é exatamente isto: colar várias linhas de uma vez. Duplicatas (mesmo
// e-mail em mais de uma linha) são silenciosamente ignoradas na segunda
// ocorrência; e-mails com formato inválido viram um erro por linha, sem
// travar o parse das linhas válidas.
function parseInviteInput(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const seen = new Set();
  const students = [];
  const parseErrors = [];

  for (const line of lines) {
    const commaIdx = line.indexOf(",");
    const email = (commaIdx === -1 ? line : line.slice(0, commaIdx)).trim();
    const nome = commaIdx === -1 ? undefined : line.slice(commaIdx + 1).trim() || undefined;

    if (!EMAIL_RE.test(email)) {
      parseErrors.push(`"${line}" — e-mail inválido.`);
      continue;
    }
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    students.push({ email, nome });
  }

  return { students, parseErrors };
}

function showInviteFormState() {
  inviteFormFields.hidden = false;
  inviteFormFooter.hidden = false;
  inviteResultEl.hidden = true;
  inviteResultFooter.hidden = true;
}

function openInviteModal() {
  inviteForm.reset();
  clearMsg(inviteModalMsg);
  showInviteFormState();
  inviteModal.hidden = false;
  inviteTextarea.focus();
}

function closeInviteModal() {
  inviteModal.hidden = true;
}

function renderInviteResults(results, parseErrors) {
  inviteFormFields.hidden = true;
  inviteFormFooter.hidden = true;
  inviteResultEl.hidden = false;
  inviteResultFooter.hidden = false;

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  let hint = `${okCount} convite(s) enviado(s) com sucesso.`;
  if (failCount > 0) hint += ` ${failCount} falharam — veja abaixo.`;
  if (parseErrors.length > 0) hint += ` ${parseErrors.length} linha(s) ignorada(s) por e-mail inválido.`;
  inviteResultHint.textContent = hint;

  inviteResultBody.innerHTML = "";
  for (const r of results) {
    const tr = document.createElement("tr");
    const emailTd = document.createElement("td");
    emailTd.textContent = r.email;
    tr.appendChild(emailTd);

    const statusTd = document.createElement("td");
    const badge = document.createElement("span");
    if (r.ok && r.emailSent) {
      badge.className = "badge ok";
      badge.textContent = "Convite enviado";
    } else if (r.ok) {
      badge.className = "badge warn";
      badge.textContent = "Cadastrado, e-mail falhou";
    } else {
      badge.className = "badge err";
      badge.textContent = r.error || "Falha";
    }
    statusTd.appendChild(badge);
    tr.appendChild(statusTd);

    inviteResultBody.appendChild(tr);
  }
  for (const err of parseErrors) {
    const tr = document.createElement("tr");
    const emailTd = document.createElement("td");
    emailTd.textContent = err;
    emailTd.colSpan = 2;
    tr.appendChild(emailTd);
    inviteResultBody.appendChild(tr);
  }
}

inviteForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  clearMsg(inviteModalMsg);

  const { students, parseErrors } = parseInviteInput(inviteTextarea.value);
  if (students.length === 0) {
    showMsg(inviteModalMsg, "Digite pelo menos um e-mail válido.", "err");
    return;
  }

  inviteModalSaveBtn.disabled = true;
  try {
    const { results } = await callProfessorPortal({ action: "bulk-invite-students", students });
    await refreshAll();
    renderInviteResults(results, parseErrors);
  } catch (err) {
    showMsg(inviteModalMsg, err.message || "Ocorreu um erro inesperado.", "err");
  } finally {
    inviteModalSaveBtn.disabled = false;
  }
});

document.getElementById("newStudentsBtn").addEventListener("click", openInviteModal);
document.getElementById("inviteModalClose").addEventListener("click", closeInviteModal);
document.getElementById("inviteModalCancel").addEventListener("click", closeInviteModal);
document.getElementById("inviteResultDone").addEventListener("click", async () => {
  closeInviteModal();
  await refreshAll();
});
inviteModal.addEventListener("click", (ev) => {
  if (ev.target === inviteModal) closeInviteModal();
});

// --------------------------------------------------------------- Edit modal

function openEditModal(student) {
  editForm.reset();
  edId.value = student.id;
  edNome.value = student.nome || "";
  clearMsg(editModalMsg);
  editModal.hidden = false;
  edNome.focus();
}

function closeEditModal() {
  editModal.hidden = true;
}

document.getElementById("editModalClose").addEventListener("click", closeEditModal);
document.getElementById("editModalCancel").addEventListener("click", closeEditModal);
editModal.addEventListener("click", (ev) => {
  if (ev.target === editModal) closeEditModal();
});

editForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  clearMsg(editModalMsg);
  editModalSaveBtn.disabled = true;

  try {
    const { error } = await client
      .from("profiles")
      .update({ nome: edNome.value.trim() })
      .eq("id", edId.value);
    if (error) throw new Error(error.message);

    closeEditModal();
    await refreshAll();
  } catch (err) {
    showMsg(editModalMsg, err.message || "Ocorreu um erro inesperado.", "err");
  } finally {
    editModalSaveBtn.disabled = false;
  }
});

// ------------------------------------------------------------------ Excluir

async function deleteStudent(student) {
  const label = student.nome || student.email || "este aluno";
  const confirmed = window.confirm(
    `Desativar ${label}? O login dele para de funcionar imediatamente, mas o histórico de respostas é mantido.`,
  );
  if (!confirmed) return;

  try {
    await callProfessorPortal({ action: "delete-student", id: student.id });
    await refreshAll();
  } catch (err) {
    window.alert(`Não foi possível desativar: ${err.message}`);
  }
}

document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape") return;
  if (!inviteModal.hidden) closeInviteModal();
  if (!editModal.hidden) closeEditModal();
});

// -------------------------------------------------------------------- Init

async function init() {
  const user = await requireProfessorSession();
  if (!user) return; // requireProfessorSession já redirecionou pro login
  currentProfessorId = user.id;

  const { data: role } = await client.from("roles").select("id").eq("name", "aluno").maybeSingle();
  alunoRoleId = role?.id ?? null;

  if (!alunoRoleId) {
    tableBodyEl.innerHTML = "";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = "Papel \"aluno\" não encontrado — rode supabase/schema_portal_mestre.sql.";
    tr.appendChild(td);
    tableBodyEl.appendChild(tr);
    return;
  }

  await refreshAll();
}

init();
