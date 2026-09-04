// NeuraOAB — Portal do Professor — detalhe de uma turma (ou o pseudo-id
// "none", que representa "Sem turma"): dashboard rico com métricas de
// desempenho por aluno (ver js/metrics.js), busca/filtro/ordenação, painel
// de "alunos que precisam de atenção" e gráfico de evolução da turma (ver
// js/charts.js) — além de tudo que já existia: convite em lote, mover de
// turma, editar nome, inativar/reativar e excluir/restaurar.
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
let convitesCache = []; // convites pendentes desta turma (ver loadConvites) — misturados na mesma tabela
let excludedCache = [];
let turmasCache = []; // todas as turmas do professor, pro seletor do modal de editar aluno
let currentTurmaLimite = null; // turmas.limite_alunos desta turma (null = sem limite) — ver openRenameModal
let studentsLoadError = null; // distingue "sem alunos" de "falha ao carregar" na tabela (ver renderStudents)
let metricsByStudent = new Map(); // id -> { desempenho, band, evolucao, ultimoAcesso, atRisco }

let searchTerm = "";
let filterTipo = "todos";
let filterDesempenho = "todos";
let filterStatus = "todos";
let sortBy = "nome";

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
const statParticipacaoEl = document.getElementById("statParticipacao");
const statEmRiscoEl = document.getElementById("statEmRisco");
const tableBodyEl = document.getElementById("studentsTableBody");

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return "—";
  }
}

function fmtNota10(n) {
  return n == null ? "—" : n.toFixed(1).replace(".", ",");
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
      "Alunos que ainda não foram organizados em nenhuma turma — use \"Editar\" na tabela pra incluí-los numa.";
    renameTurmaBtn.hidden = true;
    deleteTurmaBtn.hidden = true; // "Sem turma" é um agrupamento, não uma turma de verdade — nada pra excluir
    return true;
  }

  const { data: turma, error } = await client
    .from("turmas")
    .select("id, nome, limite_alunos")
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
  currentTurmaLimite = turma.limite_alunos;
  turmaSubtitleEl.textContent = "Organize seus alunos por turma pra acompanhar o progresso de cada grupo separadamente.";
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

// Convite pendente vira uma linha na mesma tabela dos alunos já aceitos —
// mesma ideia de "Excluídos" (uma seção, não uma tela separada), mas aqui
// misturado direto porque não há tanto volume normalmente. Sem métricas de
// desempenho (não há profiles row até ser aceito, ver
// supabase/functions/aluno-portal/index.ts) — só "Reenviar"/"Cancelar".
function buildConviteRow(c) {
  const tr = document.createElement("tr");
  tr.className = "convite-row";

  const alunoTd = document.createElement("td");
  const cell = document.createElement("div");
  cell.className = "student-cell";
  cell.appendChild(buildAvatar(c.id, c.nome || c.email));
  const info = document.createElement("div");
  const nameEl = document.createElement("div");
  nameEl.className = "student-cell-name";
  nameEl.textContent = c.nome || "(sem nome)";
  const emailEl = document.createElement("div");
  emailEl.className = "student-cell-email";
  emailEl.textContent = c.email || "—";
  info.append(nameEl, emailEl);
  cell.appendChild(info);
  alunoTd.appendChild(cell);
  tr.appendChild(alunoTd);

  // Desempenho/Evolução não se aplicam a um convite ainda pendente (não há
  // profiles row até ser aceito) — "—" em vez de célula vazia.
  [1, 2].forEach(() => {
    const td = document.createElement("td");
    td.textContent = "—";
    tr.appendChild(td);
  });

  const acessoTd = document.createElement("td");
  acessoTd.textContent = "—";
  tr.appendChild(acessoTd);

  const expirado = new Date(c.expires_at).getTime() < Date.now();
  const statusTd = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = "badge " + (expirado ? "err" : "inativo");
  badge.textContent = expirado ? "Convite expirado" : "Convite pendente";
  statusTd.appendChild(badge);
  tr.appendChild(statusTd);

  const actionsTd = document.createElement("td");
  const actions = document.createElement("div");
  actions.className = "row-actions";

  const resendBtn = document.createElement("button");
  resendBtn.type = "button";
  resendBtn.textContent = "Reenviar convite";
  resendBtn.addEventListener("click", () => resendInvite(c, resendBtn));

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "danger";
  cancelBtn.textContent = "Cancelar convite";
  cancelBtn.addEventListener("click", () => cancelInvite(c, cancelBtn));

  actions.append(resendBtn, cancelBtn);
  actionsTd.appendChild(actions);
  tr.appendChild(actionsTd);

  return tr;
}

// Fecha qualquer menu "⋯" aberto ao clicar fora ou trocar de linha — só um
// aberto por vez.
function closeAllRowMenus() {
  document.querySelectorAll(".row-menu-dropdown.open").forEach((el) => el.classList.remove("open"));
}
document.addEventListener("click", closeAllRowMenus);

function buildRowMenu(student) {
  const wrap = document.createElement("div");
  wrap.className = "row-menu";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "row-menu-btn";
  btn.setAttribute("aria-label", "Mais ações");
  btn.textContent = "⋯";

  const dropdown = document.createElement("div");
  dropdown.className = "row-menu-dropdown";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.textContent = "Editar";
  editBtn.addEventListener("click", () => {
    closeAllRowMenus();
    openEditModal(student);
  });

  const toggleActiveBtn = document.createElement("button");
  toggleActiveBtn.type = "button";
  toggleActiveBtn.textContent = student.ativo ? "Inativar" : "Reativar";
  toggleActiveBtn.addEventListener("click", () => {
    closeAllRowMenus();
    toggleActive(student);
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "danger";
  deleteBtn.textContent = "Excluir";
  deleteBtn.addEventListener("click", () => {
    closeAllRowMenus();
    deleteStudent(student);
  });

  dropdown.append(editBtn, toggleActiveBtn, deleteBtn);

  btn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const wasOpen = dropdown.classList.contains("open");
    closeAllRowMenus();
    dropdown.classList.toggle("open", !wasOpen);
  });
  dropdown.addEventListener("click", (ev) => ev.stopPropagation());

  wrap.append(btn, dropdown);
  return wrap;
}

function buildEvolucaoCell(evolucao) {
  const td = document.createElement("td");
  if (!evolucao) {
    td.textContent = "—";
    td.className = "evolucao-neutral";
    return td;
  }
  const span = document.createElement("span");
  span.className = evolucao.direction === "up" ? "evolucao-up" : "evolucao-down";
  span.textContent = `${evolucao.direction === "up" ? "↑" : "↓"} ${evolucao.pct > 0 ? "+" : ""}${evolucao.pct}%`;
  td.appendChild(span);
  return td;
}

function buildStudentRow(s) {
  const m = metricsByStudent.get(s.id) || {};
  const tr = document.createElement("tr");

  const alunoTd = document.createElement("td");
  const cell = document.createElement("div");
  cell.className = "student-cell";
  cell.appendChild(buildAvatar(s.id, s.nome));
  const info = document.createElement("div");
  const nameEl = document.createElement("div");
  nameEl.className = "student-cell-name";
  nameEl.textContent = s.nome || "(sem nome)";
  const emailEl = document.createElement("div");
  emailEl.className = "student-cell-email";
  emailEl.textContent = s.email || "—";
  info.append(nameEl, emailEl);
  cell.appendChild(info);
  alunoTd.appendChild(cell);
  tr.appendChild(alunoTd);

  const desempenhoTd = document.createElement("td");
  const desempenhoBadge = document.createElement("span");
  desempenhoBadge.className = "badge " + (m.band || "critico");
  desempenhoBadge.textContent = fmtNota10(m.desempenho);
  desempenhoTd.appendChild(desempenhoBadge);
  tr.appendChild(desempenhoTd);

  tr.appendChild(buildEvolucaoCell(m.evolucao));

  const acessoTd = document.createElement("td");
  acessoTd.textContent = fmtUltimoAcesso(m.ultimoAcesso);
  tr.appendChild(acessoTd);

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

  actions.append(detailsLink, buildRowMenu(s));
  actionsTd.appendChild(actions);
  tr.appendChild(actionsTd);

  return tr;
}

function matchesFilters(s) {
  const term = searchTerm.trim().toLowerCase();
  if (term) {
    const haystack = `${s.nome || ""} ${s.email || ""}`.toLowerCase();
    if (!haystack.includes(term)) return false;
  }
  if (filterStatus === "ativo" && !s.ativo) return false;
  if (filterStatus === "inativo" && s.ativo) return false;

  const m = metricsByStudent.get(s.id) || {};
  if (filterDesempenho === "risco" && !m.atRisco) return false;
  if (["bom", "atencao", "critico"].includes(filterDesempenho) && m.band !== filterDesempenho) return false;

  return true;
}

function sortStudents(list) {
  const sorted = list.slice();
  sorted.sort((a, b) => {
    const ma = metricsByStudent.get(a.id) || {};
    const mb = metricsByStudent.get(b.id) || {};
    if (sortBy === "desempenho") return (mb.desempenho ?? -1) - (ma.desempenho ?? -1);
    if (sortBy === "evolucao") return (mb.evolucao?.pct ?? -Infinity) - (ma.evolucao?.pct ?? -Infinity);
    if (sortBy === "acesso") return (mb.ultimoAcesso || "").localeCompare(ma.ultimoAcesso || "");
    return (a.nome || "").localeCompare(b.nome || "", "pt-BR");
  });
  return sorted;
}

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

  const showStudents = filterTipo !== "convites";
  const showConvites = filterTipo !== "alunos";

  const filteredStudents = showStudents ? sortStudents(studentsCache.filter(matchesFilters)) : [];
  const filteredConvites = showConvites && filterDesempenho === "todos" ? convitesCache : [];

  if (filteredStudents.length === 0 && filteredConvites.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = studentsCache.length === 0 && convitesCache.length === 0
      ? "Nenhum aluno aqui ainda."
      : "Nenhum aluno encontrado com esses filtros.";
    tr.appendChild(td);
    tableBodyEl.appendChild(tr);
    return;
  }

  filteredStudents.forEach((s) => tableBodyEl.appendChild(buildStudentRow(s)));
  filteredConvites.forEach((c) => tableBodyEl.appendChild(buildConviteRow(c)));
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
    [s.nome || "(sem nome)", s.email || "—", fmtDate(s.excluido_em)].forEach((text) => {
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

// ------------------------------------------------------------ Painel de atenção

function buildAttentionItem(s, m) {
  const a = document.createElement("a");
  a.className = "attention-item";
  a.href = `aluno.html?id=${encodeURIComponent(s.id)}`;

  a.appendChild(buildAvatar(s.id, s.nome));

  const info = document.createElement("div");
  info.className = "attention-item-info";
  const nameEl = document.createElement("div");
  nameEl.className = "attention-item-name";
  nameEl.textContent = s.nome || "(sem nome)";
  const metaEl = document.createElement("div");
  metaEl.className = "attention-item-meta";

  if (isInactive(m.ultimoAcesso)) {
    if (!m.ultimoAcesso) {
      metaEl.textContent = "Nunca acessou";
    } else {
      const days = Math.floor((Date.now() - new Date(m.ultimoAcesso).getTime()) / (24 * 60 * 60 * 1000));
      metaEl.textContent = `Sem acesso há ${days} dias`;
    }
  } else {
    metaEl.textContent = `${fmtNota10(m.desempenho)} de média`;
    if (m.evolucao) {
      const span = document.createElement("span");
      span.className = m.evolucao.direction === "up" ? "evolucao-up" : "evolucao-down";
      span.textContent = ` · ${m.evolucao.direction === "up" ? "↑" : "↓"} ${m.evolucao.pct}%`;
      metaEl.appendChild(span);
    }
  }

  info.append(nameEl, metaEl);
  a.appendChild(info);

  const chevron = document.createElement("span");
  chevron.className = "attention-item-chevron";
  chevron.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
  a.appendChild(chevron);

  return a;
}

function renderAttentionPanel() {
  const listEl = document.getElementById("attentionList");
  const subtitleEl = document.getElementById("attentionSubtitle");
  const viewAllBtn = document.getElementById("attentionViewAllBtn");
  listEl.innerHTML = "";

  const atRisk = studentsCache
    .filter((s) => (metricsByStudent.get(s.id) || {}).atRisco)
    .sort((a, b) => {
      const ma = metricsByStudent.get(a.id) || {};
      const mb = metricsByStudent.get(b.id) || {};
      return (ma.desempenho ?? -1) - (mb.desempenho ?? -1);
    });

  subtitleEl.textContent = atRisk.length === 0
    ? "Nenhum aluno abaixo da média ou sem atividade recente. 🎉"
    : `${atRisk.length} aluno(s) abaixo da média ou sem atividade recente.`;

  const VISIBLE = 3;
  atRisk.slice(0, VISIBLE).forEach((s) => {
    listEl.appendChild(buildAttentionItem(s, metricsByStudent.get(s.id) || {}));
  });

  viewAllBtn.hidden = atRisk.length <= VISIBLE;
}

document.getElementById("attentionViewAllBtn").addEventListener("click", () => {
  document.getElementById("filterDesempenho").value = "risco";
  filterDesempenho = "risco";
  renderStudents();
  document.querySelector(".turma-layout-main .panel").scrollIntoView({ behavior: "smooth", block: "start" });
});

// -------------------------------------------------------------------- Dados

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

// Convites "cancelado"/"usado" não aparecem aqui de propósito — um usado
// virou aluno de verdade (já está em studentsCache), e um cancelado é
// passado (RLS ainda deixa o professor ler a linha, mas não há motivo pra
// mostrar na lista). Convite expirado (mas ainda "pendente") continua
// aparecendo — precisa dar pra "Reenviar", ver buildConviteRow.
async function loadConvites() {
  let query = client
    .from("convites")
    .select("id, email, nome, expires_at, created_at")
    .eq("professor_id", currentProfessorId)
    .eq("status", "pendente");

  query = IS_UNASSIGNED ? query.is("turma_id", null) : query.eq("turma_id", TURMA_ID);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) console.error("Falha ao carregar convites:", error);
  convitesCache = error ? [] : data || [];
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

// Busca respostas (1ª fase) e tentativas (2ª fase) de TODOS os alunos desta
// turma numa tacada só (em vez de uma query por aluno) e calcula as métricas
// de cada um com js/metrics.js. fetchAllRows (js/config.js) pagina de 1000
// em 1000 — sem isso, uma turma com muito histórico acumulado podia estourar
// o limite padrão do PostgREST e as métricas saírem calculadas sobre um
// subconjunto arbitrário, sem nenhum aviso.
async function loadMetrics() {
  const ids = studentsCache.map((s) => s.id);
  metricsByStudent = new Map();

  if (ids.length === 0) {
    statAcertoFase1El.textContent = "—";
    statNotaFase2El.textContent = "—";
    statParticipacaoEl.textContent = "—";
    statEmRiscoEl.textContent = "0";
    return { respostasByUser: new Map(), tentativasByUser: new Map() };
  }

  const { data: respostas1, error: err1 } = await fetchAllRows((from, to) =>
    client.from("oab_respostas").select("user_id, correct, answered_at").in("user_id", ids).range(from, to),
  );
  if (err1) console.error("Falha ao carregar estatísticas da 1ª fase:", err1);

  const { data: tentativas, error: err2 } = await fetchAllRows((from, to) =>
    client
      .from("oab2_tentativas")
      .select("user_id, nota_total, valor_total_tentativa, status, started_at, corrected_at")
      .in("user_id", ids)
      .range(from, to),
  );
  if (err2) console.error("Falha ao carregar estatísticas da 2ª fase:", err2);

  const respostasByUser = new Map();
  (respostas1 || []).forEach((r) => {
    if (!respostasByUser.has(r.user_id)) respostasByUser.set(r.user_id, []);
    respostasByUser.get(r.user_id).push(r);
  });

  const tentativasByUser = new Map();
  (tentativas || []).forEach((t) => {
    if (!tentativasByUser.has(t.user_id)) tentativasByUser.set(t.user_id, []);
    tentativasByUser.get(t.user_id).push(t);
  });

  studentsCache.forEach((s) => {
    const respostas = respostasByUser.get(s.id) || [];
    const tentativasAluno = tentativasByUser.get(s.id) || [];
    const desempenho = computeDesempenho(respostas, tentativasAluno);
    const ultimoAcesso = lastActivityAt(respostas, tentativasAluno);
    metricsByStudent.set(s.id, {
      desempenho,
      band: classifyBand(desempenho),
      evolucao: computeEvolucao(respostas, tentativasAluno),
      ultimoAcesso,
      atRisco: isAtRisk({ desempenho, lastActivityIso: ultimoAcesso, ativo: s.ativo }),
    });
  });

  // Cards do topo: acerto geral (todas as respostas somadas), nota média
  // geral (todas as tentativas corrigidas somadas), participação (% de
  // alunos ATIVOS com pelo menos 1 atividade nos últimos 7 dias).
  const allRespostas = respostas1 || [];
  statAcertoFase1El.textContent = allRespostas.length > 0
    ? `${Math.round((allRespostas.filter((r) => r.correct).length / allRespostas.length) * 100)}%`
    : "—";

  const corrigidas = (tentativas || []).filter((t) => t.status === "corrigida" && t.nota_total != null);
  statNotaFase2El.textContent = corrigidas.length > 0
    ? (corrigidas.reduce((acc, t) => acc + (Number(t.nota_total) || 0), 0) / corrigidas.length).toFixed(2).replace(".", ",")
    : "—";

  const ativos = studentsCache.filter((s) => s.ativo);
  const ativosComAtividade = ativos.filter((s) => !isInactive(metricsByStudent.get(s.id)?.ultimoAcesso, new Date(), 7));
  statParticipacaoEl.textContent = ativos.length > 0
    ? `${Math.round((ativosComAtividade.length / ativos.length) * 100)}%`
    : "—";

  statEmRiscoEl.textContent = studentsCache.filter((s) => metricsByStudent.get(s.id)?.atRisco).length;

  return { respostasByUser, tentativasByUser };
}

function renderTurmaChart(respostasByUser, tentativasByUser) {
  const events = [];
  respostasByUser.forEach((respostas) => {
    respostas.forEach((r) => events.push({ at: r.answered_at, score01to10: r.correct ? 10 : 0 }));
  });
  tentativasByUser.forEach((tentativas) => {
    tentativas
      .filter((t) => t.status === "corrigida" && t.nota_total != null && t.valor_total_tentativa)
      .forEach((t) => events.push({
        at: t.corrected_at || t.started_at,
        score01to10: (Number(t.nota_total) / Number(t.valor_total_tentativa)) * 10,
      }));
  });

  const bucketed = bucketTimeline(events, 6);
  const container = document.getElementById("turmaChartContainer");
  buildLineChartSVG(container, [
    { name: "Turma", color: "var(--accent)", points: bucketed.map((b) => ({ x: b.label, y: b.value * 10 })) },
  ], { emptyText: "Ainda não há atividade suficiente pra mostrar a evolução da turma." });
}

async function refreshAll() {
  await Promise.all([loadStudents(), loadExcluded(), loadConvites()]);
  const { respostasByUser, tentativasByUser } = await loadMetrics();
  renderStudents();
  renderAttentionPanel();
  renderTurmaChart(respostasByUser, tentativasByUser);
}

// ------------------------------------------------------------ Toolbar

document.getElementById("searchInput").addEventListener("input", (ev) => {
  searchTerm = ev.target.value;
  renderStudents();
});
document.getElementById("filterTipo").addEventListener("change", (ev) => {
  filterTipo = ev.target.value;
  renderStudents();
});
document.getElementById("filterDesempenho").addEventListener("change", (ev) => {
  filterDesempenho = ev.target.value;
  renderStudents();
});
document.getElementById("filterStatus").addEventListener("change", (ev) => {
  filterStatus = ev.target.value;
  renderStudents();
});
document.getElementById("sortBy").addEventListener("change", (ev) => {
  sortBy = ev.target.value;
  renderStudents();
});

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
const inviteSendingEl = document.getElementById("inviteSending");
const inviteSendingMsg = document.getElementById("inviteSendingMsg");

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
  inviteSendingEl.hidden = true;
  inviteResultEl.hidden = true;
  inviteResultFooter.hidden = true;
}

// Sem barra de progresso de verdade: "bulk-invite-students" é uma chamada
// só que só responde depois de mandar TODOS os e-mails (sequencial no
// servidor, ver comentário em professor-portal/index.ts) — não há como
// saber "quantos já foram" no meio do caminho, só "começou"/"terminou".
function showInviteSendingState(count) {
  inviteFormFields.hidden = true;
  inviteFormFooter.hidden = true;
  inviteResultEl.hidden = true;
  inviteResultFooter.hidden = true;
  inviteSendingMsg.textContent =
    count === 1 ? "Enviando 1 convite..." : `Enviando ${count} convites... isso pode levar alguns segundos.`;
  inviteSendingEl.hidden = false;
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
  inviteSendingEl.hidden = true;
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
  showInviteSendingState(students.length);
  try {
    const { results } = await callProfessorPortal({ action: "bulk-invite-students", students });
    await refreshAll();
    renderInviteResults(results, parseErrors);
  } catch (err) {
    // Volta pro formulário (preenchido do jeito que a pessoa deixou, ver
    // inviteForm.reset só em openInviteModal/closeInviteModal) pra dar pra
    // tentar de novo, com o erro explicado acima do textarea.
    showInviteFormState();
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

function populateEditTurmaSelect(selectedTurmaId) {
  edTurma.innerHTML = "";
  const semTurmaOpt = document.createElement("option");
  semTurmaOpt.value = "";
  semTurmaOpt.textContent = "Sem turma";
  edTurma.appendChild(semTurmaOpt);
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
  populateEditTurmaSelect(student.turma_id);
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

// ------------------------------------------------------- Reenviar/cancelar convite

async function resendInvite(convite, btn) {
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = "Enviando...";
  try {
    await callProfessorPortal({ action: "resend-invite", id: convite.id });
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

async function cancelInvite(convite, btn) {
  const label = convite.nome || convite.email || "este convite";
  const confirmed = window.confirm(`Cancelar o convite de ${label}? Ele não vai mais conseguir usar esse código.`);
  if (!confirmed) return;

  btn.disabled = true;
  try {
    await callProfessorPortal({ action: "cancel-invite", id: convite.id });
    await loadConvites();
    renderStudents();
  } catch (err) {
    window.alert(`Não foi possível cancelar o convite: ${err.message}`);
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
const renameLimite = document.getElementById("renameLimite");
const renameModalSaveBtn = document.getElementById("renameModalSave");

function openRenameModal() {
  renameForm.reset();
  renameNome.value = turmaTitleEl.textContent;
  renameLimite.value = currentTurmaLimite ?? "";
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

  // Campo em branco = sem limite (null) — nunca 0, que travaria qualquer
  // convite novo pra esta turma.
  const limite = renameLimite.value.trim() ? parseInt(renameLimite.value, 10) : null;

  try {
    const { error } = await client
      .from("turmas")
      .update({ nome: renameNome.value.trim(), limite_alunos: limite })
      .eq("id", TURMA_ID);
    if (error) throw new Error(error.message);
    setTurmaName(renameNome.value.trim());
    currentTurmaLimite = limite;
    await loadTurmasForSelect();
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
