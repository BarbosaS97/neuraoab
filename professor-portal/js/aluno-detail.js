// NeuraOAB — Portal do Professor — detalhe do aluno: cabeçalho com
// desempenho geral (ver js/metrics.js), desempenho por área, evolução no
// tempo (aluno vs turma, ver js/charts.js), últimas atividades, informações
// do aluno + edição, e o histórico completo de 2ª fase (peças/questões com
// nota e feedback da IA, critério a critério).
//
// Só leituras diretas via client.from(...).select(...) — nenhuma Edge
// Function aqui (fora "estatisticas-ia", que só gera texto, não toca no
// banco). Quem garante que este professor só vê os PRÓPRIOS alunos (e não os
// de outro professor) são as policies de RLS criadas em
// supabase/schema_professor_portal.sql (oab_respostas_select,
// oab2_tentativas_select_auth, oab2_respostas_select_auth — todas com um
// exists(...) checando profiles.professor_id = auth.uid()). Se o id da URL
// for de um aluno de outro professor, as queries abaixo simplesmente
// devolvem zero linhas (não é uma tela de erro, é uma tela vazia).

let currentProfessorId = null;
let turmasCache = []; // pro seletor do modal de editar aluno

function fmtValor(n) {
  if (n === null || n === undefined) return "—";
  return (Number(n) || 0).toFixed(2).replace(".", ",");
}

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

function notaClass(nota, valorMax) {
  if (nota == null) return "";
  if (nota <= 0) return "zero";
  if (valorMax != null && nota >= valorMax - 0.005) return "full";
  return "";
}

// Tipo de treinamento da tentativa (ver "Novo simulado" em
// estudos/simulado2fase.js) — só a peça, só as questões, ou o caderno
// completo (padrão de sempre, por isso sem rótulo próprio abaixo).
const MODO_LABELS = { peca: "Peça profissional", questoes: "Questões discursivas" };

function getStudentId() {
  return new URLSearchParams(window.location.search).get("id");
}

// Seta que gira 180° quando o bloco abre — mesmo ícone usado no <details>
// dos simulados (ver CSS), só que aqui dentro de um <button> comum, pra
// deixar claro em TODOS os pontos de expandir/recolher da tela que dá pra
// clicar e o que vai acontecer, sem precisar adivinhar pelo texto sozinho.
const CHEVRON_SVG = '<svg class="toggle-chevron" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';

// Monta um <button> de toggle com ícone + rótulo (que muda conforme aberto/
// fechado) — usado pelos três botões de item (enunciado/resposta/correção).
function createToggleButton(className, closedLabel, openLabel) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  const label = document.createElement("span");
  label.textContent = closedLabel;
  btn.innerHTML = CHEVRON_SVG;
  btn.appendChild(label);
  function setOpen(isOpen) {
    btn.classList.toggle("is-open", isOpen);
    label.textContent = isOpen ? openLabel : closedLabel;
  }
  return { btn, setOpen };
}

// ------------------------------------------------------------------ Cabeçalho

let currentStudent = null;

async function loadStudentHeader(studentId) {
  // "turmas!turma_id(nome)" — embed via FK profiles.turma_id -> turmas.id,
  // só pro breadcrumb (se o aluno não tiver turma, student.turmas vem
  // null). O hint "!turma_id" é OBRIGATÓRIO aqui: profiles e turmas têm
  // DUAS relações (profiles.turma_id -> turmas.id E turmas.professor_id ->
  // profiles.id), então "turmas(nome)" sem hint é ambíguo pro PostgREST —
  // ele responde com erro HTTP 300, que quebra o tratamento de erro do
  // supabase-js sem mensagem nenhuma (é isso que travava a tela em
  // "Carregando..." pra sempre, sem erro visível no console nem na tela).
  const { data: student, error } = await client
    .from("profiles")
    .select("id, nome, email, ativo, created_at, turma_id, turmas!turma_id(nome)")
    .eq("id", studentId)
    .maybeSingle();

  if (error || !student) {
    document.getElementById("studentPageTitle").textContent = "Aluno não encontrado";
    document.getElementById("studentName").textContent = "Aluno não encontrado";
    document.getElementById("studentMeta").textContent =
      "Este aluno não existe ou não pertence à sua turma.";
    return null;
  }

  currentStudent = student;
  const nome = student.nome || "(sem nome)";
  document.getElementById("studentPageTitle").textContent = `Aluno – ${nome}`;
  document.getElementById("studentName").textContent = nome;
  applyAvatar(document.getElementById("studentAvatar"), student.id, nome);

  // Breadcrumb (seta de voltar) volta pra turma de onde o aluno veio (ou
  // "Sem turma") em vez de sempre pra lista geral.
  const turmaHref = `turma.html?id=${encodeURIComponent(student.turma_id || "none")}`;
  document.getElementById("backLink").href = turmaHref;

  document.getElementById("infoEmail").textContent = student.email || "—";
  const infoTurmaLink = document.createElement("a");
  infoTurmaLink.href = turmaHref;
  infoTurmaLink.textContent = student.turmas?.nome || "Sem turma";
  const infoTurmaEl = document.getElementById("infoTurma");
  infoTurmaEl.innerHTML = "";
  infoTurmaEl.appendChild(infoTurmaLink);
  document.getElementById("infoConvidado").textContent = fmtDate(student.created_at);

  return student;
}

// Chamado depois que fase1AnswersCache e fase2TentativasCache já foram
// carregados (ver init) — cabeçalho e stat cards dependem das DUAS fases
// pra calcular desempenho geral, então não dá pra renderizar isso antes.
function renderHeaderSummary() {
  const respostas = fase1AnswersCache || [];
  const tentativas = fase2TentativasCache || [];

  const desempenho = computeDesempenho(respostas, tentativas);
  const band = classifyBand(desempenho);
  const ultimoAcesso = lastActivityAt(respostas, tentativas);
  const evolucao = computeEvolucao(respostas, tentativas);

  const badgeEl = document.getElementById("studentBandBadge");
  badgeEl.hidden = false;
  badgeEl.className = `badge ${band}`;
  badgeEl.textContent = BAND_LABELS[band];

  const statusLabel = currentStudent.ativo ? "Ativo" : "Inativo";
  document.getElementById("studentMeta").textContent =
    `${currentStudent.email || "—"} · Último acesso: ${fmtUltimoAcesso(ultimoAcesso)} · ${statusLabel}`;
  document.getElementById("infoUltimoAcesso").textContent = fmtUltimoAcesso(ultimoAcesso);

  document.getElementById("statDesempenhoGeral").textContent = fmtNota10(desempenho);
  const evolEl = document.getElementById("statDesempenhoEvolucao");
  if (evolucao) {
    evolEl.className = evolucao.direction === "up" ? "evolucao-up" : "evolucao-down";
    evolEl.textContent = `${evolucao.direction === "up" ? "↑" : "↓"} ${evolucao.pct > 0 ? "+" : ""}${evolucao.pct}%`;
  } else {
    evolEl.className = "";
    evolEl.textContent = "";
  }

  document.getElementById("statFase1").textContent = respostas.length;
  document.getElementById("statFase2").textContent = tentativas.filter((t) => t.finished_at).length;
}

// ----------------------------------------------- Estatísticas — 1ª fase
//
// Mesma logica de estudos/estudos.js (loadAndRenderStats/renderStats) —
// aqui pro PROFESSOR ver a estatistica completa de UM aluno especifico
// (nao a dele mesmo). RLS ja' cobre isso: "oab_respostas_select" (ver
// supabase/schema_professor_portal.sql) libera o professor ler as
// respostas de qualquer aluno vinculado a ele (profiles.professor_id =
// auth.uid()) — sem precisar de nenhuma policy nova.

// So' id+discipline (nao o enunciado inteiro) — o suficiente pra' cruzar
// com oab_respostas.question_id e agrupar por materia; "oab_questions" e'
// publicamente legivel (policy "oab_questions_select_anon", ver
// supabase/schema.sql), entao nao precisa de nenhum tratamento especial
// de permissao aqui. fetchAllRows (js/config.js) pagina — o banco de
// questoes ja' passa de 1000 linhas somando todos os exames.
async function fetchDisciplineById() {
  const { data } = await fetchAllRows((from, to) =>
    client.from("oab_questions").select("id, discipline").range(from, to),
  );
  const map = new Map();
  (data || []).forEach((q) => map.set(q.id, q.discipline || "Sem disciplina"));
  return map;
}

function pctOf(correct, total) {
  return total === 0 ? 0 : Math.round((correct / total) * 100);
}

// Barra grossa colorida pela faixa (verde/amarelo/vermelho), só com o % à
// direita — mais direto que a versão anterior (que também mostrava a fração
// "72/100"), pra ficar consistente com o resto do dashboard.
function buildDesempenhoAreaRow({ discipline, total, correct }) {
  const row = document.createElement("div");
  row.className = "desempenho-area-row";

  const name = document.createElement("div");
  name.className = "desempenho-area-name";
  name.textContent = discipline;
  row.appendChild(name);

  const pct = pctOf(correct, total);
  const bar = document.createElement("div");
  bar.className = "desempenho-area-bar";
  const fill = document.createElement("div");
  fill.className = "desempenho-area-bar-fill" + (pct < 50 ? " low" : pct >= 75 ? " high" : "");
  fill.style.width = `${pct}%`;
  bar.appendChild(fill);
  row.appendChild(bar);

  const pctEl = document.createElement("div");
  pctEl.className = "desempenho-area-pct";
  pctEl.textContent = `${pct}%`;
  row.appendChild(pctEl);

  return row;
}

// Mesma Edge Function usada em estudos/estudos.js (requestStatsAnalysis) —
// só que aqui manda também o "studentId": a function checa se a análise por
// IA está liberada olhando o PLANO de quem ela vai analisar, não de quem
// chamou — sem o studentId ela checava o plano do PROFESSOR (que nunca tem
// profiles.plano preenchido, então sempre caía no plano grátis e recusava
// com 403, não importa o plano do aluno) — ver resolveStatsSubject em
// supabase/functions/estatisticas-ia/index.ts.
async function requestFase1Analysis(stats, container, studentId) {
  const loading = document.createElement("p");
  loading.className = "fase1-ai-loading";
  loading.textContent = "Analisando o desempenho do aluno...";
  container.appendChild(loading);

  const { data, error } = await client.functions.invoke("estatisticas-ia", { body: { ...stats, studentId } });
  loading.remove();

  if (error || !data) {
    const errEl = document.createElement("p");
    errEl.className = "fase1-ai-error";
    errEl.textContent = "Não foi possível gerar a análise agora.";
    container.appendChild(errEl);
    return;
  }

  const cards = document.createElement("div");
  cards.className = "fase1-ai-cards";
  [
    { key: "pontosFracos", cls: "weak", title: "Pontos fracos" },
    { key: "precisaEstudar", cls: "focus", title: "Precisa estudar mais" },
    { key: "pontosFortes", cls: "strong", title: "Pontos fortes" },
  ].forEach(({ key, cls, title }) => {
    const card = document.createElement("div");
    card.className = `fase1-ai-card ${cls}`;
    const h3 = document.createElement("h3");
    h3.textContent = title;
    card.appendChild(h3);
    const p = document.createElement("p");
    p.textContent = data[key] || "Ainda não há dados suficientes para essa análise.";
    card.appendChild(p);
    cards.appendChild(card);
  });
  container.appendChild(cards);
}

// Busca UMA vez todo o historico de respostas do aluno e guarda aqui —
// trocar o filtro de periodo (ver fase1Period / initFase1PeriodSwitch) so'
// refiltra esse cache em memoria e re-renderiza, sem nova consulta.
let fase1AnswersCache = null;
let fase1DisciplineById = null;
let fase1Period = "all"; // "today" | "7d" | "30d" | "all"

// Mesmo corte de datas usado em estudos/estudos.js (cutoffForPeriod) —
// "Hoje" usa meia-noite local, nao "24h atras".
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

function filterAnswersByPeriod(answers, period) {
  const cutoff = cutoffForPeriod(period);
  if (!cutoff) return answers;
  return answers.filter((a) => a.answered_at >= cutoff);
}

function initFase1PeriodSwitch() {
  const switchEl = document.getElementById("fase1PeriodSwitch");
  if (!switchEl) return;
  const buttons = switchEl.querySelectorAll(".period-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (fase1AnswersCache === null) return; // ainda carregando — nada pra filtrar
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      fase1Period = btn.dataset.period;
      renderFase1Filtered();
    });
  });
}

async function loadFase1Summary(studentId) {
  const { data: answers, error } = await fetchAllRows((from, to) =>
    client
      .from("oab_respostas")
      .select("question_id, correct, answered_at")
      .eq("user_id", studentId)
      .range(from, to),
  );

  if (error) {
    const detailEl = document.getElementById("fase1Detail");
    detailEl.innerHTML = "";
    const errEl = document.createElement("p");
    errEl.className = "field-hint warn";
    errEl.textContent = `Erro ao carregar estatísticas: ${error.message}`;
    detailEl.appendChild(errEl);
    fase1AnswersCache = [];
    return;
  }

  fase1AnswersCache = answers || [];
  if (fase1AnswersCache.length > 0) fase1DisciplineById = await fetchDisciplineById();
  renderFase1Filtered();
}

function renderFase1Filtered() {
  const detailEl = document.getElementById("fase1Detail");
  const answers = filterAnswersByPeriod(fase1AnswersCache || [], fase1Period);

  detailEl.innerHTML = "";

  if (answers.length === 0) {
    const empty = document.createElement("p");
    empty.className = "field-hint";
    empty.textContent = fase1Period === "all"
      ? "Este aluno ainda não respondeu nenhuma questão da 1ª fase."
      : "Nenhuma questão respondida nesse período.";
    detailEl.appendChild(empty);
    return;
  }

  const bySubject = new Map();
  answers.forEach((a) => {
    const disc = fase1DisciplineById?.get(a.question_id) || "Sem disciplina";
    const s = bySubject.get(disc) || { total: 0, correct: 0 };
    s.total++;
    if (a.correct) s.correct++;
    bySubject.set(disc, s);
  });

  const bySubjectList = Array.from(bySubject.entries())
    .map(([discipline, s]) => ({ discipline, total: s.total, correct: s.correct }))
    .sort((a, b) => b.total - a.total);

  const areaRows = document.createElement("div");
  areaRows.className = "desempenho-area-list";
  bySubjectList.forEach((s) => areaRows.appendChild(buildDesempenhoAreaRow(s)));
  detailEl.appendChild(areaRows);

  const aiTitle = document.createElement("h3");
  aiTitle.className = "fase1-ai-title";
  aiTitle.textContent = "Análise por IA";
  detailEl.appendChild(aiTitle);

  const aiContainer = document.createElement("div");
  detailEl.appendChild(aiContainer);

  const totalAll = answers.length;
  const correctAll = answers.filter((a) => a.correct).length;
  requestFase1Analysis({ overall: { total: totalAll, correct: correctAll }, bySubject: bySubjectList }, aiContainer, getStudentId());
}

// -------------------------------------------------------- Últimas atividades

function buildActivityItem({ icon, title, meta, value, valueClass }) {
  const item = document.createElement("div");
  item.className = "activity-item";

  const iconEl = document.createElement("div");
  iconEl.className = "activity-item-icon";
  iconEl.innerHTML = icon;
  item.appendChild(iconEl);

  const info = document.createElement("div");
  info.className = "activity-item-info";
  const titleEl = document.createElement("div");
  titleEl.className = "activity-item-title";
  titleEl.textContent = title;
  const metaEl = document.createElement("div");
  metaEl.className = "activity-item-meta";
  metaEl.textContent = meta;
  info.append(titleEl, metaEl);
  item.appendChild(info);

  const valueEl = document.createElement("div");
  valueEl.className = `activity-item-value ${valueClass || ""}`;
  valueEl.textContent = value;
  item.appendChild(valueEl);

  return item;
}

const ICON_QUESTOES = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>';
const ICON_SIMULADO = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';

function renderActivityFeed(respostas, tentativas, disciplineById) {
  const feedEl = document.getElementById("activityFeed");
  feedEl.innerHTML = "";

  const clusters = clusterFase1Activity(respostas, disciplineById).map((c) => ({
    at: c.at,
    node: buildActivityItem({
      icon: ICON_QUESTOES,
      title: `Questões — ${c.discipline}`,
      meta: `${c.count} questão(ões) · ${fmtDate(c.at)}`,
      value: `${c.pct}%`,
    }),
  }));

  const sortedTentativas = tentativas.slice().sort((a, b) => (a.started_at < b.started_at ? -1 : 1));
  const tentativaEntries = sortedTentativas
    .filter((t) => t.finished_at)
    .map((t, idx) => {
      const valorMax = t.valor_total_tentativa;
      return {
        at: t.corrected_at || t.finished_at || t.started_at,
        node: buildActivityItem({
          icon: ICON_SIMULADO,
          title: `Simulado ${idx + 1} – 2ª fase`,
          meta: fmtDate(t.corrected_at || t.finished_at),
          value: t.nota_total != null ? `${fmtValor(t.nota_total)}` : "Aguardando correção",
        }),
      };
    });

  const all = clusters.concat(tentativaEntries).sort((a, b) => (a.at < b.at ? 1 : -1));

  if (all.length === 0) {
    feedEl.innerHTML = '<p class="field-hint">Nenhuma atividade registrada ainda.</p>';
    return;
  }

  all.slice(0, 6).forEach((entry) => feedEl.appendChild(entry.node));
}

// ------------------------------------------------------------- Evolução no tempo

// Compara o aluno com a MÉDIA da turma (ou do grupo "Sem turma") — busca os
// colegas ativos e não excluídos e agrega os mesmos eventos (respostas +
// tentativas corrigidas) que alimentam o desempenho do próprio aluno. Os
// dois buckets usam o MESMO ponto de partida (earliestEventAt dos eventos da
// turma, que é um superconjunto dos do aluno) pra ficarem alinhados no eixo
// X — sem isso, cada linha teria seus próprios limites de tempo e comparar
// os pontos lado a lado não faria sentido.
async function loadEvolucaoChart(student, respostas, tentativas) {
  const container = document.getElementById("evolucaoChartContainer");

  const alunoEvents = respostas
    .map((r) => ({ at: r.answered_at, score01to10: r.correct ? 10 : 0 }))
    .concat(
      tentativas
        .filter((t) => t.status === "corrigida" && t.nota_total != null && t.valor_total_tentativa)
        .map((t) => ({ at: t.corrected_at || t.started_at, score01to10: (Number(t.nota_total) / Number(t.valor_total_tentativa)) * 10 })),
    );

  let query = client
    .from("profiles")
    .select("id")
    .eq("professor_id", currentProfessorId)
    .eq("ativo", true)
    .is("excluido_em", null);
  query = student.turma_id ? query.eq("turma_id", student.turma_id) : query.is("turma_id", null);
  const { data: colegas } = await query;
  const turmaIds = (colegas || []).map((c) => c.id);

  let turmaEvents = alunoEvents.slice();
  if (turmaIds.length > 0) {
    const { data: turmaRespostas } = await fetchAllRows((from, to) =>
      client.from("oab_respostas").select("correct, answered_at").in("user_id", turmaIds).range(from, to),
    );
    const { data: turmaTentativas } = await fetchAllRows((from, to) =>
      client
        .from("oab2_tentativas")
        .select("nota_total, valor_total_tentativa, status, started_at, corrected_at")
        .in("user_id", turmaIds)
        .range(from, to),
    );
    turmaEvents = (turmaRespostas || [])
      .map((r) => ({ at: r.answered_at, score01to10: r.correct ? 10 : 0 }))
      .concat(
        (turmaTentativas || [])
          .filter((t) => t.status === "corrigida" && t.nota_total != null && t.valor_total_tentativa)
          .map((t) => ({ at: t.corrected_at || t.started_at, score01to10: (Number(t.nota_total) / Number(t.valor_total_tentativa)) * 10 })),
      );
  }

  const sharedStart = new Date(earliestEventAt(turmaEvents) || earliestEventAt(alunoEvents) || Date.now()).getTime();
  const alunoBuckets = bucketTimeline(alunoEvents, 6, sharedStart);
  const turmaBuckets = bucketTimeline(turmaEvents, 6, sharedStart);

  buildLineChartSVG(container, [
    { name: student.nome || "Aluno", color: "var(--accent)", points: alunoBuckets.map((b) => ({ x: b.label, y: b.value * 10 })) },
    { name: "Turma", color: "var(--text-dim)", points: turmaBuckets.map((b) => ({ x: b.label, y: b.value * 10 })) },
  ], { emptyText: "Ainda não há atividade suficiente pra mostrar a evolução." });
}

function renderCriterios(criterios) {
  if (!Array.isArray(criterios) || criterios.length === 0) return null;
  const wrap = document.createElement("div");
  criterios.forEach((c) => {
    const item = document.createElement("div");
    item.className = "criterio-item";

    const head = document.createElement("div");
    head.className = "criterio-head";
    const label = document.createElement("span");
    label.textContent = c.rotulo ? `Critério ${c.rotulo}` : "Critério";
    // Critério anulado pela Coordenação do Exame: pontuação máxima já foi
    // concedida (ver supabase/functions/corretor-2fase/index.ts), mas exibir
    // como uma nota "cheia" comum confundiria com um acerto normal.
    const nota = document.createElement("span");
    if (c.anulado) {
      nota.className = "anulado";
      nota.textContent = "Anulado";
    } else {
      nota.className = notaClass(c.pontuacao_obtida, c.pontuacao_maxima);
      nota.textContent = `${fmtValor(c.pontuacao_obtida)} / ${fmtValor(c.pontuacao_maxima)}`;
    }
    head.append(label, nota);
    item.appendChild(head);

    if (c.justificativa) {
      const just = document.createElement("p");
      just.className = "criterio-just";
      just.textContent = c.justificativa;
      item.appendChild(just);
    }

    wrap.appendChild(item);
  });
  return wrap;
}

function itemLabel(item) {
  if (!item) return "Item";
  return item.tipo === "peca" ? "Peça profissional" : `Questão ${item.numero}`;
}

// Botão "Ver resposta do aluno" — pedido explícito pra ficar mais destacado
// que um link de texto discreto: um botão de verdade (.btn-accent), não um
// <details>/<summary> nativo estilizado como texto.
function buildRespostaToggle(texto) {
  const wrap = document.createElement("div");
  const { btn, setOpen } = createToggleButton("btn-accent resposta-toggle-btn", "Ver resposta do aluno", "Ocultar resposta do aluno");
  const box = document.createElement("p");
  box.className = "item-answer-text";
  box.hidden = true;
  box.textContent = texto || "(sem resposta)";
  btn.addEventListener("click", () => {
    box.hidden = !box.hidden;
    setOpen(!box.hidden);
  });
  wrap.append(btn, box);
  return wrap;
}

// Botão "Ver enunciado" — mostra o texto original da peça/questão (+
// subitens, quando existirem) direto no painel do item, pra o professor
// conferir do que a resposta trata sem precisar ir atrás do caderno em
// outro lugar. Estilo mais discreto (.btn-ghost) que o de resposta —
// contexto de apoio, não o conteúdo principal a revisar.
function buildEnunciadoToggle(item) {
  if (!item || !item.enunciado) return null;

  const wrap = document.createElement("div");
  const { btn, setOpen } = createToggleButton("btn-ghost enunciado-toggle-btn", "Ver enunciado", "Ocultar enunciado");

  const box = document.createElement("div");
  box.className = "item-enunciado-text";
  box.hidden = true;

  const enunciadoP = document.createElement("p");
  enunciadoP.textContent = item.enunciado;
  box.appendChild(enunciadoP);

  if (item.observacao) {
    const obsP = document.createElement("p");
    obsP.className = "item-enunciado-obs";
    obsP.textContent = item.observacao;
    box.appendChild(obsP);
  }

  (item.oab2_subitens || [])
    .slice()
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    .forEach((s) => {
      const subP = document.createElement("p");
      subP.className = "item-enunciado-sub";
      subP.textContent = `${s.letra}) ${s.enunciado}`;
      box.appendChild(subP);
    });

  btn.addEventListener("click", () => {
    box.hidden = !box.hidden;
    setOpen(!box.hidden);
  });
  wrap.append(btn, box);
  return wrap;
}

// Botão "Ver correção do Neura" — reúne o que a IA decidiu (feedback
// geral, critério a critério, e observações adicionais que não afetam a
// nota) atrás de um terceiro toggle, minimizado por padrão igual aos
// outros dois. Devolve null se não há nada corrigido ainda pra mostrar.
function buildCorrecaoToggle(r) {
  const hasFeedback = !!r.feedback_geral;
  const hasCriterios = Array.isArray(r.feedback_criterios) && r.feedback_criterios.length > 0;
  const hasAlertas = Array.isArray(r.alertas_juridicos) && r.alertas_juridicos.length > 0;
  if (!hasFeedback && !hasCriterios && !hasAlertas) return null;

  const wrap = document.createElement("div");
  const { btn, setOpen } = createToggleButton("btn-ghost correcao-toggle-btn", "Ver correção do Neura", "Ocultar correção do Neura");

  const box = document.createElement("div");
  box.className = "item-correcao-box";
  box.hidden = true;

  if (hasFeedback) {
    const feedback = document.createElement("p");
    feedback.className = "criterio-just";
    feedback.textContent = r.feedback_geral;
    box.appendChild(feedback);
  }

  const criteriosEl = renderCriterios(r.feedback_criterios);
  if (criteriosEl) box.appendChild(criteriosEl);

  // "Camada 2": observações jurídicas/formais que não afetam a nota (ver
  // alertas_juridicos em supabase/functions/corretor-2fase/index.ts) —
  // separadas visualmente dos critérios oficiais.
  if (hasAlertas) {
    const alertasBox = document.createElement("div");
    alertasBox.className = "alertas-juridicos";
    const alertasTitulo = document.createElement("div");
    alertasTitulo.className = "alertas-juridicos-titulo";
    alertasTitulo.textContent = "Observações adicionais (não afetam a nota)";
    alertasBox.appendChild(alertasTitulo);
    r.alertas_juridicos.forEach((texto) => {
      const p = document.createElement("p");
      p.className = "alertas-juridicos-item";
      p.textContent = texto;
      alertasBox.appendChild(p);
    });
    box.appendChild(alertasBox);
  }

  btn.addEventListener("click", () => {
    box.hidden = !box.hidden;
    setOpen(!box.hidden);
  });
  wrap.append(btn, box);
  return wrap;
}

// Detalhe de UM item (peça ou questão) — três botões independentes
// (enunciado / resposta do aluno / correção do Neura), todos minimizados
// por padrão. Nessa ordem de propósito: o professor confere primeiro do
// que se trata a pergunta e o que o aluno respondeu, pra só depois abrir a
// correção da IA e julgar se ela faz sentido — não o contrário. Cada
// tentativa monta um painel desses por item e alterna qual fica visível
// pelas abas (ver loadFase2).
function buildItemPanel(r) {
  const panel = document.createElement("div");
  panel.className = "item-answer";

  const answerHead = document.createElement("div");
  answerHead.className = "tentativa-head";
  const answerTitle = document.createElement("strong");
  answerTitle.textContent = itemLabel(r.oab2_itens);
  const answerNota = document.createElement("span");
  answerNota.className = notaClass(r.nota, r.oab2_itens?.valor_total);
  answerNota.textContent = `${fmtValor(r.nota)} / ${fmtValor(r.oab2_itens?.valor_total)}`;
  answerHead.append(answerTitle, answerNota);
  panel.appendChild(answerHead);

  const enunciadoEl = buildEnunciadoToggle(r.oab2_itens);
  if (enunciadoEl) panel.appendChild(enunciadoEl);

  panel.appendChild(buildRespostaToggle(r.texto_resposta));

  const correcaoEl = buildCorrecaoToggle(r);
  if (correcaoEl) panel.appendChild(correcaoEl);

  return panel;
}

let fase2TentativasCache = [];

async function loadFase2(studentId) {
  const listEl = document.getElementById("fase2List");

  const { data: tentativas, error } = await client
    .from("oab2_tentativas")
    .select("id, status, nota_total, modo, valor_total_tentativa, started_at, finished_at, corrected_at, oab2_provas(exam_number, area, valor_total)")
    .eq("user_id", studentId)
    .order("started_at", { ascending: false });

  fase2TentativasCache = tentativas || [];

  if (error || !tentativas || tentativas.length === 0) {
    listEl.innerHTML = "";
    const empty = document.createElement("p");
    empty.className = "field-hint";
    empty.textContent = "Nenhum caderno da 2ª fase respondido ainda.";
    listEl.appendChild(empty);
    return;
  }

  listEl.innerHTML = "";

  // Cada tentativa é um bloco recolhido por padrão (<details>) — só expande
  // no clique, e só então busca faz sentido mostrar peça/questões, uma de
  // cada vez, via abas — em vez de despejar os 5 itens sempre abertos.
  for (const tentativa of tentativas) {
    const card = document.createElement("details");
    card.className = "tentativa-card";

    const summary = document.createElement("summary");
    const prova = tentativa.oab2_provas;

    const modoLabel = MODO_LABELS[tentativa.modo];
    const titleSpan = document.createElement("span");
    titleSpan.className = "tentativa-summary-title";
    titleSpan.textContent = prova
      ? `Exame ${prova.exam_number} — ${prova.area}${modoLabel ? ` (${modoLabel})` : ""}`
      : "Caderno";

    const statusLabels = { em_andamento: "Em andamento", corrigindo: "Corrigindo", corrigida: "Corrigida" };
    const statusBadge = document.createElement("span");
    statusBadge.className = "badge " + (tentativa.status === "corrigida" ? "ativo" : "inativo");
    statusBadge.textContent = statusLabels[tentativa.status] || tentativa.status;

    const dateSpan = document.createElement("span");
    dateSpan.className = "tentativa-summary-date";
    dateSpan.textContent = `Iniciado em ${fmtDate(tentativa.started_at)}`;

    const notaSpan = document.createElement("span");
    notaSpan.className = "tentativa-summary-nota";
    // valor_total_tentativa (schema_fase2_dashboard.sql) reflete o que essa
    // tentativa especifica valia — pode ser menor que o caderno inteiro num
    // treino de "so' a peca"/"so' as questoes"; sem isso, uma peca perfeita
    // apareceria como "4,00 / 10,00" (usando o valor do caderno completo).
    const valorMax = tentativa.valor_total_tentativa ?? prova?.valor_total;
    notaSpan.textContent = tentativa.nota_total != null
      ? `${fmtValor(tentativa.nota_total)} / ${fmtValor(valorMax)}`
      : "—";

    const chevron = document.createElement("span");
    chevron.innerHTML = CHEVRON_SVG;

    summary.append(titleSpan, statusBadge, dateSpan, notaSpan, chevron);
    card.appendChild(summary);

    const body = document.createElement("div");
    body.className = "tentativa-body";

    const { data: respostas } = await client
      .from("oab2_respostas")
      .select(
        "id, texto_resposta, nota, feedback_geral, feedback_criterios, alertas_juridicos, " +
          "oab2_itens(tipo, numero, ordem, valor_total, enunciado, observacao, oab2_subitens(letra, enunciado, ordem, valor))",
      )
      .eq("tentativa_id", tentativa.id)
      .order("id");

    const itens = (respostas || []).sort((a, b) => (a.oab2_itens?.ordem ?? 0) - (b.oab2_itens?.ordem ?? 0));

    if (itens.length === 0) {
      const empty = document.createElement("p");
      empty.className = "field-hint";
      empty.textContent = "Nenhum item corrigido ainda.";
      body.appendChild(empty);
    } else {
      const tabsEl = document.createElement("div");
      tabsEl.className = "item-tabs";
      const panelsWrap = document.createElement("div");

      const panels = itens.map((r) => buildItemPanel(r));
      panels.forEach((p, idx) => {
        p.hidden = idx !== 0;
        panelsWrap.appendChild(p);
      });

      itens.forEach((r, idx) => {
        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = "item-tab" + (idx === 0 ? " active" : "");
        tab.textContent = itemLabel(r.oab2_itens);
        tab.addEventListener("click", () => {
          tabsEl.querySelectorAll(".item-tab").forEach((t) => t.classList.remove("active"));
          tab.classList.add("active");
          panels.forEach((p, i) => {
            p.hidden = i !== idx;
          });
        });
        tabsEl.appendChild(tab);
      });

      body.append(tabsEl, panelsWrap);
    }

    card.appendChild(body);
    listEl.appendChild(card);
  }
}

// --------------------------------------------------------------- Edit modal

const editModal = document.getElementById("editModal");
const editModalMsg = document.getElementById("editModalMsg");
const editForm = document.getElementById("editForm");
const edNome = document.getElementById("edNome");
const edTurma = document.getElementById("edTurma");
const editModalSaveBtn = document.getElementById("editModalSave");

function showMsg(el, text, kind) {
  el.textContent = text;
  el.className = `modal-msg show ${kind}`;
}
function clearMsg(el) {
  el.className = "modal-msg";
  el.textContent = "";
}

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

function openEditModal() {
  editForm.reset();
  edNome.value = currentStudent.nome || "";
  populateEditTurmaSelect(currentStudent.turma_id);
  clearMsg(editModalMsg);
  editModal.hidden = false;
  edNome.focus();
}
function closeEditModal() {
  editModal.hidden = true;
}

document.getElementById("editStudentBtn").addEventListener("click", openEditModal);
document.getElementById("editModalClose").addEventListener("click", closeEditModal);
document.getElementById("editModalCancel").addEventListener("click", closeEditModal);
editModal.addEventListener("click", (ev) => {
  if (ev.target === editModal) closeEditModal();
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && !editModal.hidden) closeEditModal();
});

editForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  clearMsg(editModalMsg);
  editModalSaveBtn.disabled = true;

  try {
    const { error } = await client
      .from("profiles")
      .update({ nome: edNome.value.trim(), turma_id: edTurma.value || null })
      .eq("id", currentStudent.id);
    if (error) throw new Error(error.message);
    closeEditModal();
    window.location.reload();
  } catch (err) {
    showMsg(editModalMsg, err.message || "Ocorreu um erro inesperado.", "err");
  } finally {
    editModalSaveBtn.disabled = false;
  }
});

// -------------------------------------------------------------------- Init

async function init() {
  const user = await requireProfessorSession();
  if (!user) return;
  currentProfessorId = user.id;

  const studentId = getStudentId();
  if (!studentId) {
    document.getElementById("studentName").textContent = "Aluno não encontrado";
    document.getElementById("studentMeta").textContent = "Nenhum id de aluno informado na URL.";
    return;
  }

  const student = await loadStudentHeader(studentId);
  if (!student) return;

  const { data: turmas } = await client.from("turmas").select("id, nome").eq("professor_id", currentProfessorId).order("nome");
  turmasCache = turmas || [];

  initFase1PeriodSwitch();
  await Promise.all([loadFase1Summary(studentId), loadFase2(studentId)]);

  renderHeaderSummary();
  renderActivityFeed(fase1AnswersCache || [], fase2TentativasCache || [], fase1DisciplineById);
  await loadEvolucaoChart(student, fase1AnswersCache || [], fase2TentativasCache || []);
}

// Rede de segurança: se qualquer coisa aqui lançar uma exceção inesperada
// (ex.: o mesmo tipo de erro de embed ambíguo do Supabase que causou a
// tela travada em "Carregando..." pra sempre, sem mensagem nenhuma), pelo
// menos mostra um erro visível em vez de ficar travado silenciosamente.
init().catch((err) => {
  console.error("Falha ao carregar detalhes do aluno:", err);
  const nameEl = document.getElementById("studentName");
  const metaEl = document.getElementById("studentMeta");
  if (nameEl) nameEl.textContent = "Não foi possível carregar este aluno";
  if (metaEl) metaEl.textContent = `Ocorreu um erro inesperado: ${err.message || err}`;
});
