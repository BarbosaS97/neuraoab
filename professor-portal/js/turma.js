// NeuraOAB — Portal do Professor — detalhe de uma turma (ou o pseudo-id
// "none", que representa "Sem turma"): lista de alunos, convite em lote
// escopado a esta turma, mover de turma (seletor inline na própria tabela
// — cobre tanto trocar de turma quanto incluir um aluno de "Sem turma"
// numa turma), editar nome, inativar/reativar (pausa reversível de login,
// sem sair da lista/estatísticas) e excluir/restaurar (sai da lista/
// estatísticas de vez, vai pra caixa "Excluídos" — ver
// supabase/schema_alunos_exclusao.sql).
//
// RLS de profiles/turmas (supabase/schema_turmas.sql, schema_professor_
// portal.sql) já garante que este professor só vê/edita os PRÓPRIOS alunos
// e turmas — as queries abaixo nem precisam filtrar por professor_id de
// novo, mas fazem isso mesmo assim como reforço.

const TURMA_ID = new URLSearchParams(window.location.search).get("id");
const IS_UNASSIGNED = TURMA_ID === "none";

let currentProfessorId = null;
let alunoRoleId = null;
let studentsCache = [];
let excludedCache = [];
let turmasCache = []; // todas as turmas do professor, pro seletor inline de cada linha da tabela
let studentsLoadError = null; // distingue "sem alunos" de "falha ao carregar" na tabela (ver renderStudents)

const turmaTitleEl = document.getElementById("turmaTitle"); // breadcrumb (nome curto)
const turmaHeadingEl = document.getElementById("turmaHeading"); // h1 grande
const turmaSubtitleEl = document.getElementById("turmaSubtitle");

function setTurmaName(text) {
  turmaTitleEl.textContent = text;
  turmaHeadingEl.textContent = text;
}
const renameTurmaBtn = document.getElementById("renameTurmaBtn");
const deleteTurmaBtn = document.getElementById("deleteTurmaBtn");
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
    setTurmaName("Sem turma");
    turmaSubtitleEl.textContent =
      "Alunos que ainda não foram organizados em nenhuma turma — use o seletor \"Turma\" na tabela pra incluí-los numa.";
    renameTurmaBtn.hidden = true;
    deleteTurmaBtn.hidden = true; // "Sem turma" é um agrupamento, não uma turma de verdade — nada pra excluir
    return true;
  }

  const { data: turma, error } = await client
    .from("turmas")
    .select("id, nome")
    .eq("id", TURMA_ID)
    .maybeSingle();

  if (error || !turma) {
    setTurmaName("Turma não encontrada");
    turmaSubtitleEl.textContent = "Esta turma não existe ou não é sua.";
    renameTurmaBtn.hidden = true;
    deleteTurmaBtn.hidden = true;
    return false;
  }

  setTurmaName(turma.nome);
  turmaSubtitleEl.textContent = "";
  renameTurmaBtn.hidden = false;
  deleteTurmaBtn.hidden = false;
  return true;
}

// Antes só dava pra excluir uma turma pela grade em dashboard.html — quem já
// estava dentro da turma tinha que voltar pra lista geral só pra isso.
// Mesma ação (delete direto, RLS já restringe ao professor dono — ver
// supabase/schema_turmas.sql), só que redireciona pro dashboard depois,
// porque a página atual deixa de existir.
async function deleteTurma() {
  const confirmed = window.confirm(
    `Excluir a turma "${turmaTitleEl.textContent}"? Os alunos dela não são apagados — voltam pra "Sem turma".`,
  );
  if (!confirmed) return;

  deleteTurmaBtn.disabled = true;
  try {
    const { error } = await client.from("turmas").delete().eq("id", TURMA_ID);
    if (error) throw new Error(error.message);
    window.location.href = "dashboard.html";
  } catch (err) {
    window.alert(`Não foi possível excluir: ${err.message}`);
    deleteTurmaBtn.disabled = false;
  }
}

deleteTurmaBtn.addEventListener("click", deleteTurma);

// -------------------------------------------------------------- Listagem

function renderStudents() {
  tableBodyEl.innerHTML = "";

  if (studentsLoadError) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    const td = document.createElement("td");
    td.colSpan = 6;
    td.className = "field-hint warn";
    td.textContent = `Não foi possível carregar os alunos: ${studentsLoadError}`;
    tr.appendChild(td);
    tableBodyEl.appendChild(tr);
    return;
  }

  if (studentsCache.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    const td = document.createElement("td");
    td.colSpan = 6;
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

    // Seletor de turma inline: move o aluno na hora, sem precisar abrir o
    // modal de editar — cobre tanto "trocar de turma" quanto "incluir um
    // aluno de 'Sem turma' numa turma", que é exatamente a mesma ação.
    const turmaTd = document.createElement("td");
    const turmaSelect = document.createElement("select");
    turmaSelect.className = "turma-select";
    const semTurmaOpt = document.createElement("option");
    semTurmaOpt.value = "";
    semTurmaOpt.textContent = "Sem turma";
    turmaSelect.appendChild(semTurmaOpt);
    turmasCache.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.nome;
      turmaSelect.appendChild(opt);
    });
    turmaSelect.value = s.turma_id || "";
    turmaSelect.addEventListener("change", () => moveStudentToTurma(s, turmaSelect.value));
    turmaTd.appendChild(turmaSelect);
    tr.appendChild(turmaTd);

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

    // Só pra convite pendente (nome ainda null): o e-mail original pode ter
    // se perdido/expirado, e sem isso não havia como recuperar — convidar
    // de novo pelo mesmo e-mail esbarra em "já cadastrado" (ver
    // inviteStudent na Edge Function), porque a conta já existe desde o
    // primeiro convite.
    let resendBtn = null;
    if (!s.nome) {
      resendBtn = document.createElement("button");
      resendBtn.type = "button";
      resendBtn.textContent = "Reenviar convite";
      resendBtn.addEventListener("click", () => resendInvite(s, resendBtn));
    }

    // Inativar/Reativar: pausa reversível de login, sem tirar o aluno da
    // turma nem das estatísticas — diferente de "Excluir" logo abaixo.
    const toggleActiveBtn = document.createElement("button");
    toggleActiveBtn.type = "button";
    toggleActiveBtn.textContent = s.ativo ? "Inativar" : "Reativar";
    toggleActiveBtn.addEventListener("click", () => toggleActive(s));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "danger";
    deleteBtn.textContent = "Excluir";
    deleteBtn.addEventListener("click", () => deleteStudent(s));

    actions.append(detailsLink, editBtn);
    if (resendBtn) actions.append(resendBtn);
    actions.append(toggleActiveBtn, deleteBtn);
    actionsTd.appendChild(actions);
    tr.appendChild(actionsTd);

    tableBodyEl.appendChild(tr);
  });
}

function renderExcluded() {
  const excludedTableBody = document.getElementById("excludedTableBody");
  const excludedCount = document.getElementById("excludedCount");
  excludedCount.textContent = excludedCache.length;
  excludedTableBody.innerHTML = "";

  if (excludedCache.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    const td = document.createElement("td");
    td.colSpan = 4;
    td.textContent = "Nenhum aluno excluído.";
    tr.appendChild(td);
    excludedTableBody.appendChild(tr);
    return;
  }

  excludedCache.forEach((s) => {
    const tr = document.createElement("tr");
    [s.nome || "(convite pendente)", s.email || "—", fmtDate(s.excluido_em)].forEach((text) => {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    });

    const actionsTd = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "row-actions";

    const detailsLink = document.createElement("a");
    detailsLink.href = `aluno.html?id=${encodeURIComponent(s.id)}`;
    detailsLink.textContent = "Ver detalhes";

    const restoreBtn = document.createElement("button");
    restoreBtn.type = "button";
    restoreBtn.textContent = "Restaurar";
    restoreBtn.addEventListener("click", () => restoreStudent(s));

    actions.append(detailsLink, restoreBtn);
    actionsTd.appendChild(actions);
    tr.appendChild(actionsTd);

    excludedTableBody.appendChild(tr);
  });
}

// Excluído (excluido_em preenchido) some da lista principal e de TODA
// estatística (aqui, em Turmas e em Análises) — só volta a contar depois
// de restaurado. Ver supabase/schema_alunos_exclusao.sql.
async function loadStudents() {
  if (!alunoRoleId) return;
  let query = client
    .from("profiles")
    .select("id, nome, email, ativo, created_at, turma_id")
    .eq("role_id", alunoRoleId)
    .eq("professor_id", currentProfessorId)
    .is("excluido_em", null);

  query = IS_UNASSIGNED ? query.is("turma_id", null) : query.eq("turma_id", TURMA_ID);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) console.error("Falha ao carregar alunos:", error);
  studentsLoadError = error ? error.message : null;
  studentsCache = error ? [] : data || [];
  statAlunosEl.textContent = studentsLoadError ? "—" : studentsCache.length;
  renderStudents();
}

async function loadExcluded() {
  if (!alunoRoleId) return;
  let query = client
    .from("profiles")
    .select("id, nome, email, excluido_em, turma_id")
    .eq("role_id", alunoRoleId)
    .eq("professor_id", currentProfessorId)
    .not("excluido_em", "is", null);

  query = IS_UNASSIGNED ? query.is("turma_id", null) : query.eq("turma_id", TURMA_ID);

  const { data, error } = await query.order("excluido_em", { ascending: false });
  if (error) console.error("Falha ao carregar excluídos:", error);
  excludedCache = error ? [] : data || [];
  renderExcluded();
}

async function loadTurmasForSelect() {
  const { data, error } = await client
    .from("turmas")
    .select("id, nome")
    .eq("professor_id", currentProfessorId)
    .order("nome", { ascending: true });
  if (error) console.error("Falha ao carregar turmas:", error);
  turmasCache = data || [];
}

// fetchAllRows (js/config.js) pagina de 1000 em 1000 — sem isso, uma turma
// com muitas respostas/tentativas acumuladas ao longo do tempo podia
// estourar o limite padrão do PostgREST e mostrar um % de acerto/nota
// média calculado sobre um subconjunto arbitrário, sem nenhum aviso.
async function loadQuickStats() {
  const ids = studentsCache.map((s) => s.id);
  if (ids.length === 0) {
    statAcertoFase1El.textContent = "—";
    statNotaFase2El.textContent = "—";
    return;
  }

  const { data: respostas1, error: err1 } = await fetchAllRows((from, to) =>
    client.from("oab_respostas").select("correct").in("user_id", ids).range(from, to),
  );
  if (err1) {
    console.error("Falha ao carregar estatísticas da 1ª fase:", err1);
    statAcertoFase1El.textContent = "—";
  } else if (respostas1 && respostas1.length > 0) {
    const acertos = respostas1.filter((r) => r.correct).length;
    statAcertoFase1El.textContent = `${Math.round((acertos / respostas1.length) * 100)}%`;
  } else {
    statAcertoFase1El.textContent = "—";
  }

  const { data: tentativas, error: err2 } = await fetchAllRows((from, to) =>
    client
      .from("oab2_tentativas")
      .select("nota_total")
      .in("user_id", ids)
      .eq("status", "corrigida")
      .range(from, to),
  );
  if (err2) {
    console.error("Falha ao carregar estatísticas da 2ª fase:", err2);
    statNotaFase2El.textContent = "—";
  } else if (tentativas && tentativas.length > 0) {
    const soma = tentativas.reduce((acc, t) => acc + (Number(t.nota_total) || 0), 0);
    statNotaFase2El.textContent = (soma / tentativas.length).toFixed(2).replace(".", ",");
  } else {
    statNotaFase2El.textContent = "—";
  }
}

async function refreshAll() {
  await Promise.all([loadStudents(), loadExcluded()]);
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
const editModalSaveBtn = document.getElementById("editModalSave");

function openEditModal(student) {
  editForm.reset();
  edId.value = student.id;
  edNome.value = student.nome || "";
  clearMsg(editModalMsg);
  editModal.hidden = false;
  edNome.focus();
}

// Mover de turma é feito pelo seletor inline na tabela (ver renderStudents),
// não pelo modal de editar — um clique, sem confirmação (fácil de desfazer
// escolhendo a turma de volta).
async function moveStudentToTurma(student, newTurmaId) {
  try {
    const { error } = await client
      .from("profiles")
      .update({ turma_id: newTurmaId || null })
      .eq("id", student.id);
    if (error) throw new Error(error.message);
    await refreshAll();
  } catch (err) {
    window.alert(`Não foi possível mover o aluno: ${err.message}`);
    await refreshAll(); // desfaz a seleção visual, volta pro estado real
  }
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

// --------------------------------------------------------- Reenviar convite

async function resendInvite(student, btn) {
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = "Enviando...";
  try {
    await callProfessorPortal({ action: "resend-invite", id: student.id });
    btn.textContent = "Convite reenviado!";
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 2500);
  } catch (err) {
    window.alert(`Não foi possível reenviar o convite: ${err.message}`);
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// ------------------------------------------------------------------ Excluir

async function deleteStudent(student) {
  const label = student.nome || student.email || "este aluno";
  const confirmed = window.confirm(
    `Excluir ${label}? Ele sai desta lista e para de contar nas estatísticas — o login também é desativado. ` +
      `Nada é apagado: ele fica na caixa "Excluídos" e pode ser restaurado quando quiser.`,
  );
  if (!confirmed) return;

  try {
    await callProfessorPortal({ action: "delete-student", id: student.id });
    await refreshAll();
  } catch (err) {
    window.alert(`Não foi possível excluir: ${err.message}`);
  }
}

async function restoreStudent(student) {
  const label = student.nome || student.email || "este aluno";
  const confirmed = window.confirm(`Restaurar ${label}? Ele volta a aparecer na turma e a contar nas estatísticas.`);
  if (!confirmed) return;

  try {
    await callProfessorPortal({ action: "restore-student", id: student.id });
    await refreshAll();
  } catch (err) {
    window.alert(`Não foi possível restaurar: ${err.message}`);
  }
}

// Inativar/Reativar: só pausa/retoma o login — o aluno continua na turma e
// nas estatísticas, diferente de excluir. Sem confirmação (reversível a
// qualquer momento, um clique).
async function toggleActive(student) {
  try {
    await callProfessorPortal({
      action: student.ativo ? "deactivate-student" : "activate-student",
      id: student.id,
    });
    await refreshAll();
  } catch (err) {
    window.alert(`Não foi possível atualizar o status: ${err.message}`);
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
    setTurmaName(renameNome.value.trim());
    await loadTurmasForSelect(); // atualiza o nome também nos seletores de turma da tabela
    renderStudents();
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
  // Checa a sessão ANTES de qualquer outra coisa, mesmo se a URL não tiver
  // "?id=" válido — sem isso, um visitante sem sessão que abrisse
  // turma.html sem parâmetro nunca passava pela guarda de autenticação
  // (inconsistente com dashboard.html/aluno.html/analises.html, que sempre
  // checam primeiro).
  const user = await requireProfessorSession();
  if (!user) return;
  currentProfessorId = user.id;

  if (!TURMA_ID) {
    setTurmaName("Turma não encontrada");
    return;
  }

  const { data: role } = await client.from("roles").select("id").eq("name", "aluno").maybeSingle();
  alunoRoleId = role?.id ?? null;
  if (!alunoRoleId) {
    setTurmaName('Papel "aluno" não encontrado');
    turmaSubtitleEl.textContent = "Rode supabase/schema_portal_mestre.sql.";
    return;
  }

  const ok = await loadTurmaHeader();
  if (!ok) return;

  await loadTurmasForSelect();
  await refreshAll();
}

init();
