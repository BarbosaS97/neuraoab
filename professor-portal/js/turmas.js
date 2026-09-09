// NeuraOAB — Portal do Professor — página Turmas: CRUD de turma + grade de
// cards com contagem de alunos, desempenho médio (1ª e 2ª fase), última
// atividade e convites pendentes por turma.
//
// Criar/renomear/excluir turma é direto na tabela "turmas" (RLS já garante
// que cada professor só mexe nas próprias — ver supabase/schema_turmas.sql),
// sem precisar de Edge Function: turma não toca em auth.users, então o
// mesmo raciocínio de "editar professor" em portal-mestre/js/admin.js vale
// aqui. Convite de aluno mora em turma.html (cada turma, ou o pseudo-id
// "none" pra "Sem turma") — esta página só organiza os grupos.
//
// As métricas de desempenho (acerto médio 1ª fase, média 2ª fase, última
// atividade) usam as MESMAS fórmulas que turma.html já usa pros seus
// próprios cards do topo (ver loadMetrics em js/turma.js) — só que
// agregadas aqui por TURMA em vez de por aluno individual, numa única
// busca (js/metrics.js e fetchAllRows de js/config.js, carregados antes
// deste arquivo).

let currentProfessorId = null;
let alunoRoleId = null;
let studentsCache = [];
let convitesCache = []; // convites pendentes (ver loadConvites) — contam separado dos alunos já aceitos
let turmasCache = [];
let metricsByTurma = new Map(); // turmaKey ("id" da turma ou "none") -> {acertoPct, notaFase2, ultimaAtividade}
let loadError = null; // distingue "nenhuma turma" de "falha ao carregar" na grade (ver renderTurmasGrid)
let searchTerm = "";
let filterMode = "todas"; // "todas" | "convites" | "critico"

const statTotalAlunosEl = document.getElementById("statTotalAlunos");
const statAlunosAtivosEl = document.getElementById("statAlunosAtivos");
const statTotalTurmasEl = document.getElementById("statTotalTurmas");
const turmasGridEl = document.getElementById("turmasGrid");
const turmaSearchInput = document.getElementById("turmaSearchInput");
const turmaFilterSelect = document.getElementById("turmaFilterSelect");

const turmaModal = document.getElementById("turmaModal");
const turmaModalTitle = document.getElementById("turmaModalTitle");
const turmaModalMsg = document.getElementById("turmaModalMsg");
const turmaForm = document.getElementById("turmaForm");
const tuId = document.getElementById("tuId");
const tuNome = document.getElementById("tuNome");
const tuDescricao = document.getElementById("tuDescricao");
const tuLimite = document.getElementById("tuLimite");
const turmaModalSaveBtn = document.getElementById("turmaModalSave");

const PEOPLE_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;
const PEOPLE_ICON_SM = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;
const TARGET_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"></circle></svg>`;
const DOC_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`;
const CALENDAR_ICON = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;
const ENVELOPE_ICON = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M2 6l10 7 10-7"></path></svg>`;
const PLUS_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
const ARROW_ICON = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`;

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
  tuDescricao.value = turma.descricao || "";
  tuLimite.value = turma.limite_alunos ?? "";
  turmaModalTitle.textContent = "Editar turma";
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
  const descricao = tuDescricao.value.trim() || null;
  // Campo em branco = sem limite (null) — nunca 0, que travaria qualquer
  // convite novo pra esta turma (mesmo tratamento de turma.html).
  const limite = tuLimite.value.trim() ? parseInt(tuLimite.value, 10) : null;
  try {
    if (tuId.value) {
      const { error } = await client
        .from("turmas")
        .update({ nome, descricao, limite_alunos: limite })
        .eq("id", tuId.value);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await client
        .from("turmas")
        .insert({ professor_id: currentProfessorId, nome, descricao, limite_alunos: limite });
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

// Fecha qualquer menu "⋯" aberto ao clicar fora ou trocar de card — mesmo
// padrão de closeAllRowMenus em js/turma.js, duplicado aqui porque cada
// página do portal já tem suas próprias funções de UI local (sem módulo
// compartilhado pra isso).
function closeAllRowMenus() {
  document.querySelectorAll(".row-menu-dropdown.open").forEach((el) => el.classList.remove("open"));
}
document.addEventListener("click", closeAllRowMenus);

function buildTurmaMenu(turma) {
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
  editBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    closeAllRowMenus();
    openEditTurmaModal(turma);
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "danger";
  deleteBtn.textContent = "Excluir";
  deleteBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    closeAllRowMenus();
    deleteTurma(turma);
  });

  dropdown.append(editBtn, deleteBtn);

  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const wasOpen = dropdown.classList.contains("open");
    closeAllRowMenus();
    dropdown.classList.toggle("open", !wasOpen);
  });
  dropdown.addEventListener("click", (ev) => ev.stopPropagation());

  wrap.append(btn, dropdown);
  return wrap;
}

function buildMetric(icon, value, label) {
  const el = document.createElement("div");
  el.className = "turma-card-metric";
  el.innerHTML = `<span class="turma-card-metric-icon">${icon}</span><strong>${value}</strong><span>${label}</span>`;
  return el;
}

// turma: registro real de "turmas" (id/nome/descricao/...), ou null pra
// representar "Sem turma" (pseudo-grupo dos alunos com turma_id nulo) —
// tratado como um card a mais na mesma grade, só sem menu de editar/excluir
// (não é uma turma de verdade, não tem o que editar).
function buildTurmaCard(turma, students, pendentes) {
  const isReal = !!turma;
  const key = isReal ? turma.id : "none";
  const nome = isReal ? turma.nome : "Sem turma";
  const descricao = isReal ? turma.descricao : null;
  const href = isReal ? `turma.html?id=${encodeURIComponent(turma.id)}` : "turma.html?id=none";

  const card = document.createElement("a");
  card.className = "turma-card" + (isReal ? "" : " turma-card-unassigned");
  card.href = href;

  const metrics = metricsByTurma.get(key) || { acertoPct: null, notaFase2: null, ultimaAtividade: null };

  const top = document.createElement("div");
  top.className = "turma-card-top";

  const avatar = document.createElement("div");
  avatar.className = "turma-card-avatar";
  avatar.style.background = avatarColor(key);
  avatar.innerHTML = PEOPLE_ICON;
  top.appendChild(avatar);

  const heading = document.createElement("div");
  heading.className = "turma-card-heading";
  const h3 = document.createElement("h3");
  h3.textContent = nome;
  heading.appendChild(h3);
  if (descricao) {
    const sub = document.createElement("p");
    sub.className = "turma-card-subtitle";
    sub.textContent = descricao;
    heading.appendChild(sub);
  }
  top.appendChild(heading);

  if (isReal) {
    top.appendChild(buildTurmaMenu(turma));
  }

  card.appendChild(top);

  const metricsRow = document.createElement("div");
  metricsRow.className = "turma-card-metrics";
  metricsRow.appendChild(buildMetric(PEOPLE_ICON_SM, students.length, "alunos"));
  metricsRow.appendChild(buildMetric(
    TARGET_ICON,
    metrics.acertoPct == null ? "—" : `${metrics.acertoPct}%`,
    "acerto médio (1ª fase)",
  ));
  metricsRow.appendChild(buildMetric(
    DOC_ICON,
    metrics.notaFase2 == null ? "—" : metrics.notaFase2.toFixed(2).replace(".", ","),
    "média (2ª fase)",
  ));
  card.appendChild(metricsRow);

  const bar = document.createElement("div");
  bar.className = "progress-bar";
  const fill = document.createElement("div");
  const band = metrics.acertoPct == null ? "sem-dados" : classifyBand(metrics.acertoPct / 10);
  fill.className = `progress-bar-fill band-${band}`;
  fill.style.width = `${metrics.acertoPct || 0}%`;
  bar.appendChild(fill);
  card.appendChild(bar);

  const meta = document.createElement("div");
  meta.className = "turma-card-meta";
  const atividadeItem = document.createElement("span");
  atividadeItem.className = "turma-card-meta-item";
  atividadeItem.innerHTML = `${CALENDAR_ICON}<span>Última atividade <b>${fmtUltimoAcesso(metrics.ultimaAtividade)}</b></span>`;
  const convitesItem = document.createElement("span");
  convitesItem.className = "turma-card-meta-item";
  convitesItem.innerHTML = `${ENVELOPE_ICON}<b>${pendentes}</b><span>${pendentes === 1 ? "convite pendente" : "convites pendentes"}</span>`;
  meta.append(atividadeItem, convitesItem);
  card.appendChild(meta);

  const footerBtn = document.createElement("span");
  footerBtn.className = "turma-card-footer-btn";
  footerBtn.innerHTML = `Ver turma ${ARROW_ICON}`;
  card.appendChild(footerBtn);

  return card;
}

function buildCreateTurmaCard() {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "turma-card-create";
  card.innerHTML = `
    <span class="turma-card-create-icon">${PLUS_ICON}</span>
    <strong>Criar nova turma</strong>
    <p>Cadastre uma nova turma e comece a acompanhar seus alunos.</p>
  `;
  card.addEventListener("click", openCreateTurmaModal);
  return card;
}

// Aplica busca (nome/descrição) + filtro do toolbar — chamada tanto pras
// turmas reais quanto pro pseudo-grupo "Sem turma" (ver renderTurmasGrid),
// então "turmaLike" é sempre {id, nome, descricao}, nunca o registro cru.
function matchesFilters(turmaLike, pendentes) {
  if (searchTerm) {
    const haystack = `${turmaLike.nome} ${turmaLike.descricao || ""}`.toLowerCase();
    if (!haystack.includes(searchTerm)) return false;
  }
  if (filterMode === "convites" && pendentes === 0) return false;
  if (filterMode === "critico") {
    const metrics = metricsByTurma.get(turmaLike.id);
    if (!metrics || metrics.acertoPct == null || classifyBand(metrics.acertoPct / 10) !== "critico") return false;
  }
  return true;
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

  const turmaEntries = turmasCache.map((turma) => ({
    turma,
    students: studentsCache.filter((s) => s.turma_id === turma.id),
    pendentes: convitesCache.filter((c) => c.turma_id === turma.id).length,
  }));

  const semTurmaStudents = studentsCache.filter((s) => !s.turma_id);
  const semTurmaPendentes = convitesCache.filter((c) => !c.turma_id).length;
  // "Sem turma" só entra na lista se fizer sentido mostrar: ou é o único
  // jeito de ver os alunos (nenhuma turma criada ainda), ou tem gente/
  // convite pendente ali dentro — nunca um card vazio à toa.
  if (turmasCache.length === 0 || semTurmaStudents.length > 0 || semTurmaPendentes > 0) {
    turmaEntries.push({ turma: null, students: semTurmaStudents, pendentes: semTurmaPendentes });
  }

  const visible = turmaEntries.filter(({ turma, pendentes }) => {
    const turmaLike = turma || { id: "none", nome: "Sem turma", descricao: null };
    return matchesFilters(turmaLike, pendentes);
  });

  visible.forEach(({ turma, students, pendentes }) => {
    turmasGridEl.appendChild(buildTurmaCard(turma, students, pendentes));
  });

  // "Criar nova turma" só aparece sem busca/filtro ativos — senão fica
  // esquisito oferecer criar turma no meio de um resultado filtrado vazio.
  if (!searchTerm && filterMode === "todas") {
    turmasGridEl.appendChild(buildCreateTurmaCard());
  }

  if (turmasGridEl.children.length === 0) {
    const msg = document.createElement("p");
    msg.className = "field-hint";
    msg.textContent = "Nenhuma turma encontrada.";
    turmasGridEl.appendChild(msg);
  }
}

turmaSearchInput.addEventListener("input", () => {
  searchTerm = turmaSearchInput.value.trim().toLowerCase();
  renderTurmasGrid();
});
turmaFilterSelect.addEventListener("change", () => {
  filterMode = turmaFilterSelect.value;
  renderTurmasGrid();
});

// ------------------------------------------------------------------- Dados

async function loadTurmas() {
  const { data, error } = await client
    .from("turmas")
    .select("id, nome, descricao, created_at, limite_alunos")
    .eq("professor_id", currentProfessorId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Falha ao carregar turmas:", error);
    loadError = error.message;
  }
  turmasCache = error ? [] : data || [];
}

// excluido_em IS NULL de propósito: aluno excluído não conta em NENHUMA
// estatística (aqui ou na turma) — ver supabase/schema_alunos_exclusao.sql.
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

// Só "pendente" (ver mesma escolha em loadConvites de turma.js) — contagem
// por card é só pra sinalizar "tem convite esperando resposta", não um
// histórico de tudo que já foi enviado.
async function loadConvites() {
  const { data, error } = await client
    .from("convites")
    .select("turma_id")
    .eq("professor_id", currentProfessorId)
    .eq("status", "pendente");
  if (error) console.error("Falha ao carregar convites:", error);
  convitesCache = error ? [] : data || [];
}

// Busca respostas (1ª fase) e tentativas (2ª fase) de TODOS os alunos do
// professor numa tacada só (mesmo padrão de loadMetrics em js/turma.js,
// fetchAllRows de js/config.js pagina de 1000 em 1000) e agrega por turma —
// "acerto médio (1ª fase)" = % de respostas certas sobre o total de
// respostas da turma; "média (2ª fase)" = média simples de nota_total das
// tentativas corrigidas da turma (mesmas fórmulas dos stat-cards do topo de
// turma.html, só que uma vez por turma em vez de uma vez pra turma toda).
async function loadTurmaMetrics() {
  metricsByTurma = new Map();
  const ids = studentsCache.map((s) => s.id);
  if (ids.length === 0) return;

  const turmaIdByStudent = new Map(studentsCache.map((s) => [s.id, s.turma_id || "none"]));

  const { data: respostas, error: err1 } = await fetchAllRows((from, to) =>
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

  const respostasByTurma = new Map(); // turmaKey -> respostas[]
  (respostas || []).forEach((r) => {
    const key = turmaIdByStudent.get(r.user_id);
    if (!key) return;
    if (!respostasByTurma.has(key)) respostasByTurma.set(key, []);
    respostasByTurma.get(key).push(r);
  });

  const tentativasByTurma = new Map();
  (tentativas || []).forEach((t) => {
    const key = turmaIdByStudent.get(t.user_id);
    if (!key) return;
    if (!tentativasByTurma.has(key)) tentativasByTurma.set(key, []);
    tentativasByTurma.get(key).push(t);
  });

  const allKeys = new Set([...turmasCache.map((t) => t.id), "none"]);
  allKeys.forEach((key) => {
    const respostasTurma = respostasByTurma.get(key) || [];
    const tentativasTurma = tentativasByTurma.get(key) || [];

    const acertoPct = respostasTurma.length > 0
      ? Math.round((respostasTurma.filter((r) => r.correct).length / respostasTurma.length) * 100)
      : null;

    const corrigidas = tentativasTurma.filter((t) => t.status === "corrigida" && t.nota_total != null);
    const notaFase2 = corrigidas.length > 0
      ? corrigidas.reduce((acc, t) => acc + (Number(t.nota_total) || 0), 0) / corrigidas.length
      : null;

    metricsByTurma.set(key, {
      acertoPct,
      notaFase2,
      ultimaAtividade: lastActivityAt(respostasTurma, tentativasTurma),
    });
  });
}

function renderStats() {
  statTotalAlunosEl.textContent = studentsCache.length;
  statAlunosAtivosEl.textContent = studentsCache.filter((s) => s.ativo).length;
  statTotalTurmasEl.textContent = turmasCache.length;
}

async function refreshAll() {
  loadError = null; // reseta antes de recarregar, senão um erro antigo já corrigido continuaria exibido
  await Promise.all([loadTurmas(), loadStudents(), loadConvites()]);
  await loadTurmaMetrics(); // depende de studentsCache/turmasCache já carregados
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
