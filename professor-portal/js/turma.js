// NeuraOAB — Portal do Professor — detalhe de uma turma (ou o pseudo-id
// "none", que representa "Sem turma"): lista de alunos, convite em lote
// escopado a esta turma, edição (nome + mover de turma) e exclusão (soft).
//
// RLS de profiles/turmas (supabase/schema_turmas.sql, schema_professor_
// portal.sql) já garante que este professor só vê/edita os PRÓPRIOS alunos
// e turmas — as queries abaixo nem precisam filtrar por professor_id de
// novo, mas fazem isso mesmo assim como reforço (mesmo padrão adotado em
// professor-portal/js/students.js originalmente).

const TURMA_ID = new URLSearchParams(window.location.search).get("id");
const IS_UNASSIGNED = TURMA_ID === "none";

let currentProfessorId = null;
let alunoRoleId = null;
let studentsCache = [];
let turmasCache = []; // todas as turmas do professor, pro seletor do modal de editar

const turmaTitleEl = document.getElementById("turmaTitle");
const turmaSubtitleEl = document.getElementById("turmaSubtitle");
const renameTurmaBtn = document.getElementById("renameTurmaBtn");
const statAlunosEl = document.getElementById("statAlunos");
const statAcertoFase1El = document.getElementById("statAcertoFase1");
const statNotaFase2El = document.getElementById("statNotaFase2");
const tableBodyEl = document.getElementById("studentsTableBody");

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

// ------------------------------------------------------------------ Cabeçalho

async function loadTurmaHeader() {
  if (IS_UNASSIGNED) {
    turmaTitleEl.textContent = "Sem turma";
    turmaSubtitleEl.textContent = "Alunos que ainda não foram organizados em nenhuma turma.";
    renameTurmaBtn.hidden = true;
    return true;
  }

  const { data: turma, error } = await client
    .from("turmas")
    .select("id, nome")
    .eq("id", TURMA_ID)
    .maybeSingle();

  if (error || !turma) {
    turmaTitleEl.textContent = "Turma não encontrada";
    turmaSubtitleEl.textContent = "Esta turma não existe ou não é sua.";
    renameTurmaBtn.hidden = true;
    return false;
  }

  turmaTitleEl.textContent = turma.nome;
  turmaSubtitleEl.textContent = "";
  renameTurmaBtn.hidden = false;
  return true;
}

// -------------------------------------------------------------- Listagem

function renderStudents() {
  tableBodyEl.innerHTML = "";

  if (studentsCache.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = "Nenhum aluno aqui ainda.";
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
  let query = client
    .from("profiles")
    .select("id, nome, email, ativo, created_at, turma_id")
    .eq("role_id", alunoRoleId)
    .eq("professor_id", currentProfessorId);

  query = IS_UNASSIGNED ? query.is("turma_id", null) : query.eq("turma_id", TURMA_ID);

  const { data, error } = await query.order("created_at", { ascending: false });
  studentsCache = error ? [] : data || [];
  statAlunosEl.textContent = studentsCache.length;
  renderStudents();
}

async function loadTurmasForSelect() {
  const { data } = await client
    .from("turmas")
    .select("id, nome")
    .eq("professor_id", currentProfessorId)
    .order("nome", { ascending: true });
  turmasCache = data || [];
}

async function loadQuickStats() {
  const ids = studentsCache.map((s) => s.id);
  if (ids.length === 0) {
    statAcertoFase1El.textContent = "—";
    statNotaFase2El.textContent = "—";
    return;
  }

  const { data: respostas1 } = await client.from("oab_respostas").select("correct").in("user_id", ids);
  if (respostas1 && respostas1.length > 0) {
    const acertos = respostas1.filter((r) => r.correct).length;
    statAcertoFase1El.textContent = `${Math.round((acertos / respostas1.length) * 100)}%`;
  } else {
    statAcertoFase1El.textContent = "—";
  }

  const { data: tentativas } = await client
    .from("oab2_tentativas")
    .select("nota_total")
    .in("user_id", ids)
    .eq("status", "corrigida");
  if (tentativas && tentativas.length > 0) {
    const soma = tentativas.reduce((acc, t) => acc + (Number(t.nota_total) || 0), 0);
    statNotaFase2El.textContent = (soma / tentativas.length).toFixed(2).replace(".", ",");
  } else {
    statNotaFase2El.textContent = "—";
  }
}

async function refreshAll() {
  await loadStudents();
  await loadQuickStats();
}

// ------------------------------------------------------------ Convite modal

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    students.push(IS_UNASSIGNED ? { email, nome } : { email, nome, turma_id: TURMA_ID });
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

const editModal = document.getElementById("editModal");
const editModalMsg = document.getElementById("editModalMsg");
const editForm = document.getElementById("editForm");
const edId = document.getElementById("edId");
const edNome = document.getElementById("edNome");
const edTurma = document.getElementById("edTurma");
const editModalSaveBtn = document.getElementById("editModalSave");

function populateTurmaSelect(selectedTurmaId) {
  edTurma.innerHTML = '<option value="">Sem turma</option>';
  turmasCache.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.nome;
    edTurma.appendChild(opt);
  });
  edTurma.value = selectedTurmaId || "";
}

function openEditModal(student) {
  editForm.reset();
  edId.value = student.id;
  edNome.value = student.nome || "";
  populateTurmaSelect(student.turma_id);
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
      .update({ nome: edNome.value.trim(), turma_id: edTurma.value || null })
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

// ------------------------------------------------------------- Renomear turma

const renameModal = document.getElementById("renameModal");
const renameModalMsg = document.getElementById("renameModalMsg");
const renameForm = document.getElementById("renameForm");
const renameNome = document.getElementById("renameNome");
const renameModalSaveBtn = document.getElementById("renameModalSave");

function openRenameModal() {
  renameForm.reset();
  renameNome.value = turmaTitleEl.textContent;
  clearMsg(renameModalMsg);
  renameModal.hidden = false;
  renameNome.focus();
}
function closeRenameModal() {
  renameModal.hidden = true;
}

renameTurmaBtn.addEventListener("click", openRenameModal);
document.getElementById("renameModalClose").addEventListener("click", closeRenameModal);
document.getElementById("renameModalCancel").addEventListener("click", closeRenameModal);
renameModal.addEventListener("click", (ev) => {
  if (ev.target === renameModal) closeRenameModal();
});

renameForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  clearMsg(renameModalMsg);
  renameModalSaveBtn.disabled = true;

  try {
    const { error } = await client.from("turmas").update({ nome: renameNome.value.trim() }).eq("id", TURMA_ID);
    if (error) throw new Error(error.message);
    turmaTitleEl.textContent = renameNome.value.trim();
    closeRenameModal();
  } catch (err) {
    showMsg(renameModalMsg, err.message || "Ocorreu um erro inesperado.", "err");
  } finally {
    renameModalSaveBtn.disabled = false;
  }
});

document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape") return;
  if (!inviteModal.hidden) closeInviteModal();
  if (!editModal.hidden) closeEditModal();
  if (!renameModal.hidden) closeRenameModal();
});

// -------------------------------------------------------------------- Init

async function init() {
  if (!TURMA_ID) {
    turmaTitleEl.textContent = "Turma não encontrada";
    return;
  }

  const user = await requireProfessorSession();
  if (!user) return;
  currentProfessorId = user.id;

  const { data: role } = await client.from("roles").select("id").eq("name", "aluno").maybeSingle();
  alunoRoleId = role?.id ?? null;
  if (!alunoRoleId) {
    turmaTitleEl.textContent = 'Papel "aluno" não encontrado';
    turmaSubtitleEl.textContent = "Rode supabase/schema_portal_mestre.sql.";
    return;
  }

  const ok = await loadTurmaHeader();
  if (!ok) return;

  await loadTurmasForSelect();
  await refreshAll();
}

init();
