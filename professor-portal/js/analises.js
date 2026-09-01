// NeuraOAB — Portal do Professor — Análises: comparação de desempenho
// entre as turmas do professor logado (1ª fase = % de acerto em
// oab_respostas; 2ª fase = nota média em oab2_tentativas corrigidas).
//
// Só leitura, só client.from(...).select(...) — RLS de schema_turmas.sql/
// schema_professor_portal.sql já garante que só os dados dos PRÓPRIOS
// alunos deste professor voltam nessas queries. Busca tudo de uma vez (um
// .in("user_id", allIds) em vez de uma query por turma) e agrupa no
// cliente — mais simples e mais barato que N queries pra N turmas.

let currentProfessorId = null;
let alunoRoleId = null;

// Busca tudo (todo o histórico) uma única vez e guarda aqui — trocar o
// período (ver analysisPeriod/initPeriodSwitch) só refiltra esse cache em
// memória e re-renderiza, sem nova consulta. Mesmo padrão de
// js/aluno-detail.js (fase1AnswersCache/renderFase1Filtered).
let analysisCache = null; // { groups, respostas1, tentativas2 }
let analysisPeriod = "all"; // "today" | "7d" | "30d" | "all"

const statTotalAlunosEl = document.getElementById("statTotalAlunos");
const statMediaFase1El = document.getElementById("statMediaFase1");
const statMediaFase2El = document.getElementById("statMediaFase2");
const barsEl = document.getElementById("turmasBars");
const tableBodyEl = document.getElementById("analisesTableBody");

// Mesmo corte de datas usado em js/aluno-detail.js (cutoffForPeriod) —
// "Hoje" usa meia-noite local, não "24h atrás".
function cutoffForPeriod(period) {
  const now = new Date();
  if (period === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }
  if (period === "7d") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (period === "30d") {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }
  return null;
}

function initPeriodSwitch() {
  const switchEl = document.getElementById("analisesPeriodSwitch");
  if (!switchEl) return;
  const buttons = switchEl.querySelectorAll(".period-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!analysisCache) return; // ainda carregando — nada pra filtrar
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      analysisPeriod = btn.dataset.period;
      renderAnalysis();
    });
  });
}

function fmtPct(n) {
  return n == null ? "—" : `${Math.round(n)}%`;
}
function fmtNota(n) {
  return n == null ? "—" : n.toFixed(2).replace(".", ",");
}

function computeAcertoPct(respostas) {
  if (respostas.length === 0) return null;
  return (respostas.filter((r) => r.correct).length / respostas.length) * 100;
}
function computeNotaMedia(tentativas) {
  if (tentativas.length === 0) return null;
  const soma = tentativas.reduce((acc, t) => acc + (Number(t.nota_total) || 0), 0);
  return soma / tentativas.length;
}

function renderBars(rows) {
  barsEl.innerHTML = "";
  if (rows.length === 0) {
    barsEl.innerHTML = '<p class="field-hint">Nenhuma turma ainda.</p>';
    return;
  }
  rows.forEach((row) => {
    const pct = row.acertoPct ?? 0;
    const wrap = document.createElement("div");
    wrap.className = "bar-row";
    wrap.innerHTML = `
      <span>${row.nome}</span>
      <div class="bar-track"><div class="bar-fill" style="width: ${pct}%;"></div></div>
      <span class="bar-value">${fmtPct(row.acertoPct)}</span>
    `;
    barsEl.appendChild(wrap);
  });
}

function renderTable(rows) {
  tableBodyEl.innerHTML = "";
  if (rows.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = "Nenhuma turma criada ainda.";
    tr.appendChild(td);
    tableBodyEl.appendChild(tr);
    return;
  }
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    [row.nome, row.alunos, fmtPct(row.acertoPct), fmtNota(row.notaMedia), row.tentativas].forEach((val) => {
      const td = document.createElement("td");
      td.textContent = val;
      tr.appendChild(td);
    });
    tableBodyEl.appendChild(tr);
  });
}

async function loadData() {
  const { data: turmas, error: turmasErr } = await client
    .from("turmas")
    .select("id, nome")
    .eq("professor_id", currentProfessorId)
    .order("nome", { ascending: true });
  if (turmasErr) console.error("Falha ao carregar turmas:", turmasErr);

  // excluido_em IS NULL: aluno excluído não conta em nenhuma análise, mesma
  // regra de js/turma.js e js/turmas.js (supabase/schema_alunos_exclusao.sql).
  const { data: students, error: studentsErr } = await client
    .from("profiles")
    .select("id, turma_id")
    .eq("role_id", alunoRoleId)
    .eq("professor_id", currentProfessorId)
    .is("excluido_em", null);
  if (studentsErr) console.error("Falha ao carregar alunos:", studentsErr);

  const loadErr = turmasErr || studentsErr;
  if (loadErr) {
    tableBodyEl.innerHTML = "";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "field-hint warn";
    td.textContent = `Não foi possível carregar os dados: ${loadErr.message}`;
    tr.appendChild(td);
    tableBodyEl.appendChild(tr);
    barsEl.innerHTML = "";
    return;
  }

  const allStudents = students || [];
  const groups = (turmas || []).map((t) => ({
    nome: t.nome,
    studentIds: allStudents.filter((s) => s.turma_id === t.id).map((s) => s.id),
  }));

  const semTurmaIds = allStudents.filter((s) => !s.turma_id).map((s) => s.id);
  if (semTurmaIds.length > 0 || groups.length === 0) {
    groups.push({ nome: "Sem turma", studentIds: semTurmaIds });
  }

  // fetchAllRows (js/config.js) pagina de 1000 em 1000 — sem isso, o total
  // acumulado de respostas/tentativas de TODOS os alunos deste professor
  // podia estourar o limite padrão do PostgREST e a comparação entre turmas
  // saía calculada sobre um subconjunto arbitrário, sem nenhum aviso.
  // answered_at/corrected_at vêm junto pra dar pro filtro de período (ver
  // renderAnalysis) refiltrar em memória, sem nova consulta a cada troca.
  const allIds = allStudents.map((s) => s.id);
  let respostas1 = [];
  let tentativas2 = [];
  if (allIds.length > 0) {
    const { data: r1, error: err1 } = await fetchAllRows((from, to) =>
      client.from("oab_respostas").select("user_id, correct, answered_at").in("user_id", allIds).range(from, to),
    );
    if (err1) console.error("Falha ao carregar respostas da 1ª fase:", err1);
    respostas1 = r1 || [];

    const { data: t2, error: err2 } = await fetchAllRows((from, to) =>
      client
        .from("oab2_tentativas")
        .select("user_id, nota_total, corrected_at")
        .in("user_id", allIds)
        .eq("status", "corrigida")
        .range(from, to),
    );
    if (err2) console.error("Falha ao carregar tentativas da 2ª fase:", err2);
    tentativas2 = t2 || [];
  }

  analysisCache = { groups, totalAlunos: allStudents.length, respostas1, tentativas2 };
  renderAnalysis();
}

function renderAnalysis() {
  if (!analysisCache) return;
  const { groups, totalAlunos, respostas1, tentativas2 } = analysisCache;

  const cutoff = cutoffForPeriod(analysisPeriod);
  const fRespostas1 = cutoff ? respostas1.filter((r) => r.answered_at >= cutoff) : respostas1;
  const fTentativas2 = cutoff ? tentativas2.filter((t) => t.corrected_at >= cutoff) : tentativas2;

  const rows = groups.map((g) => {
    const idSet = new Set(g.studentIds);
    const gRespostas = fRespostas1.filter((r) => idSet.has(r.user_id));
    const gTentativas = fTentativas2.filter((t) => idSet.has(t.user_id));
    return {
      nome: g.nome,
      alunos: g.studentIds.length,
      acertoPct: computeAcertoPct(gRespostas),
      notaMedia: computeNotaMedia(gTentativas),
      tentativas: gTentativas.length,
    };
  });

  statTotalAlunosEl.textContent = totalAlunos;
  statMediaFase1El.textContent = fmtPct(computeAcertoPct(fRespostas1));
  statMediaFase2El.textContent = fmtNota(computeNotaMedia(fTentativas2));

  renderBars(rows);
  renderTable(rows);
}

async function init() {
  const user = await requireProfessorSession();
  if (!user) return;
  currentProfessorId = user.id;

  const { data: role } = await client.from("roles").select("id").eq("name", "aluno").maybeSingle();
  alunoRoleId = role?.id ?? null;
  if (!alunoRoleId) {
    tableBodyEl.innerHTML = "";
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = 'Papel "aluno" não encontrado — rode supabase/schema_portal_mestre.sql.';
    tr.appendChild(td);
    tableBodyEl.appendChild(tr);
    return;
  }

  initPeriodSwitch();
  await loadData();
}

init();
