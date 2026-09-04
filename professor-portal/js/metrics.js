// NeuraOAB — Portal do Professor — métricas derivadas (desempenho, evolução,
// risco, atividade) compartilhadas entre js/turma.js e js/aluno-detail.js.
//
// Tudo calculado no cliente a partir do que já é buscado hoje (oab_respostas,
// oab2_tentativas) — não existe nenhuma tabela de "sessão" pra 1ª fase, então
// "atividade" e "últimas atividades" são reconstruídas por agrupamento de
// respostas por matéria + intervalo de tempo (ver clusterFase1Activity).

const BAND_BOM_MIN = 7; // desempenho >= 7 -> "bom"
const BAND_ATENCAO_MIN = 5; // 5 <= desempenho < 7 -> "atencao"; < 5 -> "critico"
const ROLLING_WINDOW_DAYS = 30; // janela usada em computeEvolucao (atual vs anterior)
const INACTIVITY_DAYS = 14; // sem nenhuma atividade há N dias -> conta como risco

function daysAgoIso(days, from) {
  return new Date((from || new Date()).getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

// fase1Score: % de acerto (0-100) reescalado pra 0-10. fase2Score: soma das
// notas obtidas sobre soma dos valores máximos das tentativas corrigidas,
// reescalado pra 0-10 (pondera cadernos maiores mais que um treino curto de
// só-peça, em vez de tirar a média simples das notas "cruas"). Se as duas
// existirem, desempenho é a média das duas; senão, o que existir.
function computeDesempenho(respostas, tentativas) {
  const totalRespostas = (respostas || []).length;
  const fase1Score = totalRespostas > 0
    ? (respostas.filter((r) => r.correct).length / totalRespostas) * 10
    : null;

  const corrigidas = (tentativas || []).filter((t) => t.status === "corrigida" && t.nota_total != null);
  let fase2Score = null;
  if (corrigidas.length > 0) {
    const somaNota = corrigidas.reduce((acc, t) => acc + (Number(t.nota_total) || 0), 0);
    const somaValor = corrigidas.reduce((acc, t) => acc + (Number(t.valor_total_tentativa) || 0), 0);
    fase2Score = somaValor > 0 ? (somaNota / somaValor) * 10 : null;
  }

  if (fase1Score != null && fase2Score != null) return (fase1Score + fase2Score) / 2;
  if (fase1Score != null) return fase1Score;
  if (fase2Score != null) return fase2Score;
  return null;
}

function classifyBand(desempenho) {
  if (desempenho == null) return "critico";
  if (desempenho >= BAND_BOM_MIN) return "bom";
  if (desempenho >= BAND_ATENCAO_MIN) return "atencao";
  return "critico";
}

const BAND_LABELS = { bom: "Bom", atencao: "Atenção", critico: "Crítico" };

// Compara o desempenho na janela [now-30d, now] contra [now-60d, now-30d) —
// null se não houver dado suficiente na janela anterior pra comparar (evita
// divisão por zero e "evolução" inventada sobre uma base vazia).
function computeEvolucao(respostas, tentativas, now) {
  const ref = now || new Date();
  const cutCurrent = daysAgoIso(ROLLING_WINDOW_DAYS, ref);
  const cutPrevious = daysAgoIso(ROLLING_WINDOW_DAYS * 2, ref);

  const respCurrent = (respostas || []).filter((r) => r.answered_at >= cutCurrent);
  const respPrevious = (respostas || []).filter((r) => r.answered_at >= cutPrevious && r.answered_at < cutCurrent);
  const tentCurrent = (tentativas || []).filter((t) => (t.corrected_at || t.started_at) >= cutCurrent);
  const tentPrevious = (tentativas || []).filter(
    (t) => (t.corrected_at || t.started_at) >= cutPrevious && (t.corrected_at || t.started_at) < cutCurrent,
  );

  const scoreCurrent = computeDesempenho(respCurrent, tentCurrent);
  const scorePrevious = computeDesempenho(respPrevious, tentPrevious);
  if (scoreCurrent == null || scorePrevious == null || scorePrevious <= 0.01) return null;

  const pct = ((scoreCurrent - scorePrevious) / scorePrevious) * 100;
  return { pct: Math.round(pct), direction: pct >= 0 ? "up" : "down" };
}

function lastActivityAt(respostas, tentativas) {
  let last = null;
  (respostas || []).forEach((r) => {
    if (r.answered_at && (!last || r.answered_at > last)) last = r.answered_at;
  });
  (tentativas || []).forEach((t) => {
    const at = t.started_at;
    if (at && (!last || at > last)) last = at;
  });
  return last;
}

function isInactive(lastActivityIso, now, thresholdDays) {
  const ref = now || new Date();
  const days = thresholdDays == null ? INACTIVITY_DAYS : thresholdDays;
  if (!lastActivityIso) return true;
  return new Date(lastActivityIso).getTime() < ref.getTime() - days * 24 * 60 * 60 * 1000;
}

function isAtRisk({ desempenho, lastActivityIso, ativo }, now) {
  if (ativo === false) return false; // aluno inativo (login pausado) não entra na contagem de risco
  const band = classifyBand(desempenho);
  return band !== "bom" || isInactive(lastActivityIso, now);
}

function fmtUltimoAcesso(iso) {
  if (!iso) return "Nunca acessou";
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (isSameDay(date, now)) return `Hoje, ${time}`;
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (isSameDay(date, yesterday)) return `Ontem, ${time}`;
  return date.toLocaleDateString("pt-BR");
}

// Agrupa eventos (respostas + tentativas, cada um com uma nota 0-10 e uma
// data) em até numBuckets janelas de tempo iguais entre startMsOverride (ou o
// primeiro evento, se omitido) e agora — usado pros gráficos de evolução
// (turma inteira, ou aluno vs turma quando as duas séries precisam dos
// MESMOS limites de bucket pra ficarem alinhadas no eixo X — ver
// earliestEventAt). Buckets sem nenhum evento são omitidos (não
// interpola/zera), então o chamador pode receber menos de numBuckets pontos.
function earliestEventAt(events) {
  const valid = (events || []).filter((e) => e.at);
  if (valid.length === 0) return null;
  return valid.reduce((min, e) => (e.at < min ? e.at : min), valid[0].at);
}

function bucketTimeline(events, numBuckets, startMsOverride) {
  const n = numBuckets || 6;
  const valid = (events || []).filter((e) => e.at && e.score01to10 != null).sort((a, b) => (a.at < b.at ? -1 : 1));
  if (valid.length === 0) return [];

  const startMs = startMsOverride != null ? startMsOverride : new Date(valid[0].at).getTime();
  const endMs = Date.now();
  const span = Math.max(endMs - startMs, 1);
  const bucketMs = span / n;

  const buckets = Array.from({ length: n }, () => []);
  valid.forEach((e) => {
    const offset = new Date(e.at).getTime() - startMs;
    let idx = Math.floor(offset / bucketMs);
    if (idx >= n) idx = n - 1;
    if (idx < 0) idx = 0;
    buckets[idx].push(e.score01to10);
  });

  const ordinals = ["1ª", "2ª", "3ª", "4ª", "5ª", "6ª", "7ª", "8ª", "9ª", "10ª"];
  return buckets
    .map((scores, idx) => ({
      label: ordinals[idx] || `${idx + 1}ª`,
      value: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    }))
    .filter((b) => b.value != null);
}

// Reconstrói "atividades" de 1ª fase a partir do log plano de respostas: uma
// nova atividade começa quando a matéria muda OU o intervalo desde a
// resposta anterior passa de gapMinutes — sem isso, cada resposta individual
// viraria uma linha no feed, o que não é o que "últimas atividades" quer
// dizer pra quem está lendo.
function clusterFase1Activity(respostas, disciplineById, gapMinutes) {
  const gapMs = (gapMinutes || 30) * 60 * 1000;
  const sorted = (respostas || [])
    .slice()
    .sort((a, b) => (a.answered_at < b.answered_at ? -1 : 1));

  const clusters = [];
  let current = null;
  sorted.forEach((r) => {
    const discipline = disciplineById?.get(r.question_id) || "Sem disciplina";
    const at = new Date(r.answered_at).getTime();
    const sameCluster = current
      && current.discipline === discipline
      && at - current.lastAt <= gapMs;
    if (!sameCluster) {
      current = { discipline, count: 0, correct: 0, lastAt: at, firstAnsweredAt: r.answered_at };
      clusters.push(current);
    }
    current.count++;
    if (r.correct) current.correct++;
    current.lastAt = at;
    current.at = r.answered_at; // último answered_at do cluster, pra ordenar/mostrar
  });

  return clusters.map((c) => ({
    discipline: c.discipline,
    count: c.count,
    correct: c.correct,
    pct: c.count > 0 ? Math.round((c.correct / c.count) * 100) : 0,
    at: c.at,
  }));
}

// ------------------------------------------------------------------ Avatares
//
// Iniciais + cor derivada de um hash simples do id (estável entre
// carregamentos — o mesmo aluno sempre cai na mesma cor, sem guardar nada a
// mais no banco). Compartilhado entre js/turma.js (linhas da tabela e painel
// de atenção) e js/aluno-detail.js (cabeçalho do aluno).

const AVATAR_PALETTE = ["#4f7cff", "#35c78a", "#e8b339", "#ef5757", "#a55eea", "#26b4c9"];

function initials(nome) {
  const parts = (nome || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

function avatarColor(seed) {
  let hash = 0;
  for (let i = 0; i < (seed || "").length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function buildAvatar(id, nome) {
  const el = document.createElement("div");
  el.className = "avatar-circle";
  applyAvatar(el, id, nome);
  return el;
}

function applyAvatar(el, id, nome) {
  el.style.background = avatarColor(id || nome || "?");
  el.textContent = initials(nome);
}
