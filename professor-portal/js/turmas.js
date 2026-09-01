// NeuraOAB — Portal do Professor — página Turmas: CRUD de turma + grade de
// cards com contagem rápida de alunos por turma.
//
// Criar/renomear/excluir turma é direto na tabela "turmas" (RLS já garante
// que cada professor só mexe nas próprias — ver supabase/schema_turmas.sql),
// sem precisar de Edge Function: turma não toca em auth.users, então o
// mesmo raciocínio de "editar professor" em portal-mestre/js/admin.js vale
// aqui. Convite de aluno mora em turma.html (cada turma, ou o pseudo-id
// "none" pra "Sem turma") — esta página só organiza os grupos.

let currentProfessorId = null;
let alunoRoleId = null;
let studentsCache = [];
let turmasCache = [];
let loadError = null; // distingue "nenhuma turma" de "falha ao carregar" na grade (ver renderTurmasGrid)

const statTotalAlunosEl = document.getElementById("statTotalAlunos");
const statAlunosAtivosEl = document.getElementById("statAlunosAtivos");
const statTotalTurmasEl = document.getElementById("statTotalTurmas");
const turmasGridEl = document.getElementById("turmasGrid");

const turmaModal = document.getElementById("turmaModal");
const turmaModalTitle = document.getElementById("turmaModalTitle");
const turmaModalMsg = document.getElementById("turmaModalMsg");
const turmaForm = document.getElementById("turmaForm");
const tuId = document.getElementById("tuId");
const tuNome = document.getElementById("tuNome");
const turmaModalSaveBtn = document.getElementById("turmaModalSave");

const EDIT_ICON = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
const DELETE_ICON = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>`;

function showMsg(el, text, kind) {
  el.textContent = text;
  el.className = `modal-msg show ${kind}`;
}
function clearMsg(el) {
  el.className = "modal-msg";
  el.textContent = "";
}

// -------------------------------------------------------------- Modal turma

function closeTurmaModal() {
  turmaModal.hidden = true;
}

function openCreateTurmaModal() {
  turmaForm.reset();
  tuId.value = "";
  turmaModalTitle.textContent = "Nova turma";
  turmaModalSaveBtn.textContent = "Criar turma";
  clearMsg(turmaModalMsg);
  turmaModal.hidden = false;
  tuNome.focus();
}

function openEditTurmaModal(turma) {
  turmaForm.reset();
  tuId.value = turma.id;
  tuNome.value = turma.nome;
  turmaModalTitle.textContent = "Renomear turma";
  turmaModalSaveBtn.textContent = "Salvar";
  clearMsg(turmaModalMsg);
  turmaModal.hidden = false;
  tuNome.focus();
}

document.getElementById("newTurmaBtn").addEventListener("click", openCreateTurmaModal);
document.getElementById("turmaModalClose").addEventListener("click", closeTurmaModal);
document.getElementById("turmaModalCancel").addEventListener("click", closeTurmaModal);
turmaModal.addEventListener("click", (ev) => {
  if (ev.target === turmaModal) closeTurmaModal();
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && !turmaModal.hidden) closeTurmaModal();
});

turmaForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  clearMsg(turmaModalMsg);
  turmaModalSaveBtn.disabled = true;

  const nome = tuNome.value.trim();
  try {
    if (tuId.value) {
      const { error } = await client.from("turmas").update({ nome }).eq("id", tuId.value);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await client.from("turmas").insert({ professor_id: currentProfessorId, nome });
      if (error) throw new Error(error.message);
    }
    closeTurmaModal();
    await refreshAll();
  } catch (err) {
    showMsg(turmaModalMsg, err.message || "Ocorreu um erro inesperado.", "err");
  } finally {
    turmaModalSaveBtn.disabled = false;
  }
});

async function deleteTurma(turma) {
  const confirmed = window.confirm(
    `Excluir a turma "${turma.nome}"? Os alunos dela não são apagados — voltam pra "Sem turma".`,
  );
  if (!confirmed) return;

  try {
    const { error } = await client.from("turmas").delete().eq("id", turma.id);
    if (error) throw new Error(error.message);
    await refreshAll();
  } catch (err) {
    window.alert(`Não foi possível excluir: ${err.message}`);
  }
}

// -------------------------------------------------------------------- Grade

function buildTurmaCard(turma, students) {
  const pendentes = students.filter((s) => !s.nome).length;

  const card = document.createElement("a");
  card.className = "turma-card";
  card.href = `turma.html?id=${encodeURIComponent(turma.id)}`;

  const actions = document.createElement("div");
  actions.className = "turma-card-actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.innerHTML = EDIT_ICON;
  editBtn.setAttribute("aria-label", "Renomear turma");
  editBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    openEditTurmaModal(turma);
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "danger";
  deleteBtn.innerHTML = DELETE_ICON;
  deleteBtn.setAttribute("aria-label", "Excluir turma");
  deleteBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    deleteTurma(turma);
  });

  actions.append(editBtn, deleteBtn);

  const title = document.createElement("h3");
  title.textContent = turma.nome;

  const stats = document.createElement("div");
  stats.className = "turma-stats";
  stats.innerHTML = `
    <div><strong>${students.length}</strong><span>aluno(s)</span></div>
    <div><strong>${pendentes}</strong><span>convite pendente</span></div>
  `;

  card.append(actions, title, stats);
  return card;
}

function buildUnassignedCard(students) {
  const card = document.createElement("a");
  card.className = "turma-card turma-card-unassigned";
  card.href = "turma.html?id=none";

  const title = document.createElement("h3");
  title.textContent = "Sem turma";

  const stats = document.createElement("div");
  stats.className = "turma-stats";
  stats.innerHTML = `<div><strong>${students.length}</strong><span>aluno(s)</span></div>`;

  card.append(title, stats);
  return card;
}

function renderTurmasGrid() {
  turmasGridEl.innerHTML = "";

  if (loadError) {
    const msg = document.createElement("p");
    msg.className = "field-hint warn";
    msg.textContent = `Não foi possível carregar suas turmas: ${loadError}`;
    turmasGridEl.appendChild(msg);
    return;
  }

  turmasCache.forEach((turma) => {
    const students = studentsCache.filter((s) => s.turma_id === turma.id);
    turmasGridEl.appendChild(buildTurmaCard(turma, students));
  });

  const semTurma = studentsCache.filter((s) => !s.turma_id);
  if (turmasCache.length === 0 || semTurma.length > 0) {
    turmasGridEl.appendChild(buildUnassignedCard(semTurma));
  }
}

// ------------------------------------------------------------------- Dados

async function loadTurmas() {
  const { data, error } = await client
    .from("turmas")
    .select("id, nome, created_at")
    .eq("professor_id", currentProfessorId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Falha ao carregar turmas:", error);
    loadError = error.message;
  }
  turmasCache = error ? [] : data || [];
}

// excluido_em IS NULL de propósito: aluno excluído não conta em NENHUMA
// estatística (aqui, na turma, ou em Análises) — ver
// supabase/schema_alunos_exclusao.sql.
async function loadStudents() {
  if (!alunoRoleId) return;
  const { data, error } = await client
    .from("profiles")
    .select("id, nome, ativo, turma_id")
    .eq("role_id", alunoRoleId)
    .eq("professor_id", currentProfessorId)
    .is("excluido_em", null);
  if (error) {
    console.error("Falha ao carregar alunos:", error);
    loadError = error.message;
  }
  studentsCache = error ? [] : data || [];
}

function renderStats() {
  statTotalAlunosEl.textContent = studentsCache.length;
  statAlunosAtivosEl.textContent = studentsCache.filter((s) => s.ativo).length;
  statTotalTurmasEl.textContent = turmasCache.length;
}

async function refreshAll() {
  loadError = null; // reseta antes de recarregar, senão um erro antigo já corrigido continuaria exibido
  await Promise.all([loadTurmas(), loadStudents()]);
  renderStats();
  renderTurmasGrid();
}

// -------------------------------------------------------------------- Init

async function init() {
  const user = await requireProfessorSession();
  if (!user) return;
  currentProfessorId = user.id;

  const { data: role } = await client.from("roles").select("id").eq("name", "aluno").maybeSingle();
  alunoRoleId = role?.id ?? null;

  if (!alunoRoleId) {
    turmasGridEl.innerHTML = "";
    const msg = document.createElement("p");
    msg.className = "field-hint";
    msg.textContent = 'Papel "aluno" não encontrado — rode supabase/schema_portal_mestre.sql.';
    turmasGridEl.appendChild(msg);
    return;
  }

  await refreshAll();
}

init();
