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

const statTotalAlunosEl = document.getElementById("statTotalAlunos");
const statMediaFase1El = document.getElementById("statMediaFase1");
const statMediaFase2El = document.getElementById("statMediaFase2");
const barsEl = document.getElementById("turmasBars");
const tableBodyEl = document.getElementById("analisesTableBody");

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
  const { data: turmas } = await client
    .from("turmas")
    .select("id, nome")
    .eq("professor_id", currentProfessorId)
    .order("nome", { ascending: true });

  const { data: students } = await client
    .from("profiles")
    .select("id, turma_id")
    .eq("role_id", alunoRoleId)
    .eq("professor_id", currentProfessorId);

  const allStudents = students || [];
  const groups = (turmas || []).map((t) => ({
    nome: t.nome,
    studentIds: allStudents.filter((s) => s.turma_id === t.id).map((s) => s.id),
  }));

  const semTurmaIds = allStudents.filter((s) => !s.turma_id).map((s) => s.id);
  if (semTurmaIds.length > 0 || groups.length === 0) {
    groups.push({ nome: "Sem turma", studentIds: semTurmaIds });
  }

  const allIds = allStudents.map((s) => s.id);
  let respostas1 = [];
  let tentativas2 = [];
  if (allIds.length > 0) {
    const { data: r1 } = await client.from("oab_respostas").select("user_id, correct").in("user_id", allIds);
    respostas1 = r1 || [];
    const { data: t2 } = await client
      .from("oab2_tentativas")
      .select("user_id, nota_total")
      .in("user_id", allIds)
      .eq("status", "corrigida");
    tentativas2 = t2 || [];
  }

  const rows = groups.map((g) => {
    const idSet = new Set(g.studentIds);
    const gRespostas = respostas1.filter((r) => idSet.has(r.user_id));
    const gTentativas = tentativas2.filter((t) => idSet.has(t.user_id));
    return {
      nome: g.nome,
      alunos: g.studentIds.length,
      acertoPct: computeAcertoPct(gRespostas),
      notaMedia: computeNotaMedia(gTentativas),
      tentativas: gTentativas.length,
    };
  });

  statTotalAlunosEl.textContent = allStudents.length;
  statMediaFase1El.textContent = fmtPct(computeAcertoPct(respostas1));
  statMediaFase2El.textContent = fmtNota(computeNotaMedia(tentativas2));

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

  await loadData();
}

init();
