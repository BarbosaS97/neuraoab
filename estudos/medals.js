// Sistema de medalhas (gamificação) — script clássico compartilhado pelas 3
// páginas do app (estudos/index.html, estudos/simulado2fase.html,
// estudos/medalhas.html), mesmo padrão de estudos/dr-laureano.js: variáveis e
// funções ficam no escopo global da página, sem import/export. Precisa
// carregar ANTES do script de cada página (ver <script src="medals.js"> nos
// respectivos HTML), pra "client"/"MEDAL_CATALOG"/etc já existirem quando
// esses scripts chamarem checkAndAwardMedals.
//
// Nenhuma medalha é definida no banco — só o catálogo aqui (nome, ícone,
// critério). A tabela oab_medals_earned (ver supabase/schema_medals.sql) só
// guarda O QUÊ (medal_id) e QUANDO cada aluno conquistou; uma vez lá, é
// permanente (não há UPDATE/DELETE).

// ------------------------------------------------------------- Categorias

// Valores EXATOS de oab_questions.discipline (ver py/extract_oab.py,
// DISCIPLINE_KEYWORDS) — só as 14 que entram numa das 4 categorias; as
// outras 4 disciplinas reais (Ética Profissional, Filosofia do Direito e
// Direitos Humanos, Estatuto da Criança e do Adolescente, Direito Digital e
// Proteção de Dados) e as questões sem disciplina classificada não contam
// pra nenhuma medalha de CATEGORIA — só entram nas medalhas GERAIS (que são
// por volume total, sem filtro de matéria). Decisão explícita do produto:
// manter as 4 categorias e as 16 medalhas como especificado, sem inventar
// uma 5ª categoria "outras".
const CATEGORY_DISCIPLINES = {
  publico: ["Direito Constitucional", "Direito Administrativo", "Direito Tributário", "Direito Penal"],
  privado: ["Direito Civil", "Direito Empresarial", "Direito do Consumidor", "Direito do Trabalho"],
  processual: ["Direito Processual Civil", "Direito Processual Penal", "Direito Processual do Trabalho"],
  especializado: ["Direito Ambiental", "Direito Internacional e Migração", "Direito Previdenciário"],
};

const CATEGORY_LABELS = {
  publico: "Direito Público",
  privado: "Direito Privado",
  processual: "Direito Processual",
  especializado: "Direito Especializado",
};

const DISCIPLINE_TO_CATEGORY = {};
Object.entries(CATEGORY_DISCIPLINES).forEach(([catKey, list]) => {
  list.forEach(discipline => { DISCIPLINE_TO_CATEGORY[discipline] = catKey; });
});

const CATEGORY_TIERS = [
  { tier: "iniciante", label: "Iniciante", target: 10 },
  { tier: "intermediario", label: "Intermediário", target: 30 },
  { tier: "avancado", label: "Avançado", target: 60 },
  { tier: "expert", label: "Expert", target: 100 },
];

const MEDAL_SECTION_LABELS = {
  categoria: "Por Matéria",
  geral: "Geral",
  fase2: "2ª Fase",
  tempo: "Tempo de Estudo",
};

// ------------------------------------------------------------------ Ícones
//
// Tudo SVG inline (stroke-based, viewBox 24x24), nunca emoji — mesmo estilo
// de SCISSORS_ICON/STAR_ICON em estudos.js. As 16 medalhas de categoria
// reaproveitam UM ícone por categoria (o nível é mostrado à parte, por
// pontinhos preenchidos — ver medalTierDotsHTML); as outras 13 têm ícone
// próprio, sem repetir nenhum entre si.

const CATEGORY_ICONS = {
  publico: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z"></path></svg>',
  privado: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="12" rx="2"></rect><path d="M8 8V6a4 4 0 0 1 8 0v2"></path></svg>',
  processual: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2h6v4H9z"></path><path d="M7 6h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"></path><line x1="8" y1="12" x2="16" y2="12"></line><line x1="8" y1="16" x2="13" y2="16"></line></svg>',
  especializado: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polygon points="12 7 14 12 12 17 10 12"></polygon></svg>',
};

const OTHER_MEDAL_ICONS = {
  "geral-primeiro-passo": '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>',
  "geral-dedicado": '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>',
  "geral-persistente": '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>',
  "geral-incansavel": '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 23c-4 0-7-3-7-7 0-3 1.5-5 3-7 .5 1.5 1.5 2 2 1-1-3 1-6 4-8-1 3 0 5 2 6 2 1 3 3 3 6 0 4-3 9-7 9z"></path></svg>',
  "geral-lendario": '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>',
  "geral-precisao": '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"></circle></svg>',
  "geral-sequencia": '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>',
  "fase2-estreante": '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>',
  "fase2-praticante": '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"></circle><path d="M9 13.5 7 22l5-3 5 3-2-8.5"></path></svg>',
  "fase2-mestre": '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"></path><line x1="5" y1="21" x2="19" y2="21"></line></svg>',
  "tempo-comprometido": '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
  "tempo-disciplinado": '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><path d="M9 16l2 2 4-4"></path></svg>',
  "tempo-imparavel": '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7a5 5 0 0 1 0-10h2"></path><path d="M15 7h2a5 5 0 1 1 0 10h-2"></path><line x1="8" y1="12" x2="16" y2="12"></line></svg>',
};

// Check verde do badge "Conquistado" (mesmo traço de CONVITE_ICON_CHECK em
// estudos.js, mas com stroke="currentColor" em vez de "#fff" fixo, pra
// herdar a cor do badge via CSS em vez de ficar preso a fundo escuro).
const MEDAL_CHECK_ICON =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

const MEDAL_LOCK_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>';

function medalIconSVG(medal) {
  if (medal.section === "categoria") return CATEGORY_ICONS[medal.category];
  return OTHER_MEDAL_ICONS[medal.id] || "";
}

// 4 pontinhos, preenchidos até o nível da medalha (tierIndex 0-3) — é assim
// que o nível de uma medalha de categoria aparece, já que as 4 dividem o
// mesmo ícone (ver CATEGORY_ICONS acima).
function medalTierDotsHTML(tierIndex) {
  return Array.from({ length: 4 }, (_, i) =>
    `<span class="medal-tier-dot${i <= tierIndex ? " filled" : ""}"></span>`,
  ).join("");
}

// -------------------------------------------------------------- Catálogo

function pluralize(count, unit) {
  return count === 1 ? unit.one : unit.many;
}

const MEDAL_CATALOG = [];

Object.keys(CATEGORY_DISCIPLINES).forEach(catKey => {
  CATEGORY_TIERS.forEach((t, tierIndex) => {
    MEDAL_CATALOG.push({
      id: `categoria-${catKey}-${t.tier}`,
      section: "categoria",
      category: catKey,
      tierIndex,
      title: `${CATEGORY_LABELS[catKey]} — ${t.label}`,
      description: `${t.target} acertos em questões de ${CATEGORY_LABELS[catKey]}`,
      unit: { one: "acerto", many: "acertos" },
      evaluate: (context, derived) => {
        if (!derived.categoryCorrect) return null;
        const progress = derived.categoryCorrect[catKey] || 0;
        return { progress, target: t.target, earned: progress >= t.target };
      },
    });
  });
});

[
  { id: "geral-primeiro-passo", title: "Primeiro Passo", description: "Resolveu 1 questão", target: 1 },
  { id: "geral-dedicado", title: "Dedicado", description: "Resolveu 50 questões", target: 50 },
  { id: "geral-persistente", title: "Persistente", description: "Resolveu 200 questões", target: 200 },
  { id: "geral-incansavel", title: "Incansável", description: "Resolveu 500 questões", target: 500 },
  { id: "geral-lendario", title: "Lendário", description: "Resolveu 1000 questões", target: 1000 },
].forEach(def => {
  MEDAL_CATALOG.push({
    ...def,
    section: "geral",
    unit: { one: "questão", many: "questões" },
    evaluate: (context, derived) => (derived.totalAnswers == null ? null : {
      progress: derived.totalAnswers,
      target: def.target,
      earned: derived.totalAnswers >= def.target,
    }),
  });
});

MEDAL_CATALOG.push({
  id: "geral-precisao",
  section: "geral",
  title: "Precisão",
  description: "70% de acerto geral (mínimo 50 questões)",
  unit: { one: "%", many: "%" },
  evaluate: (context, derived) => {
    if (derived.totalAnswers == null) return null;
    const pct = derived.totalAnswers === 0 ? 0 : Math.round((derived.correctAnswers / derived.totalAnswers) * 100);
    return { progress: pct, target: 70, total: derived.totalAnswers, earned: derived.totalAnswers >= 50 && pct >= 70 };
  },
});

MEDAL_CATALOG.push({
  id: "geral-sequencia",
  section: "geral",
  title: "Sequência",
  description: "10 acertos consecutivos",
  unit: { one: "acerto seguido", many: "acertos seguidos" },
  evaluate: (context, derived) => (derived.bestCorrectStreak == null ? null : {
    progress: derived.bestCorrectStreak,
    target: 10,
    earned: derived.bestCorrectStreak >= 10,
  }),
});

[
  { id: "fase2-estreante", title: "Estreante", description: "Fez 1 simulado da 2ª fase", target: 1 },
  { id: "fase2-praticante", title: "Praticante", description: "Fez 5 simulados da 2ª fase", target: 5 },
  { id: "fase2-mestre", title: "Mestre", description: "Fez 10 simulados da 2ª fase", target: 10 },
].forEach(def => {
  MEDAL_CATALOG.push({
    ...def,
    section: "fase2",
    unit: { one: "simulado", many: "simulados" },
    evaluate: (context, derived) => (derived.phase2CorrigidasCount == null ? null : {
      progress: derived.phase2CorrigidasCount,
      target: def.target,
      earned: derived.phase2CorrigidasCount >= def.target,
    }),
  });
});

[
  { id: "tempo-comprometido", title: "Comprometido", description: "7 dias consecutivos de estudo", target: 7 },
  { id: "tempo-disciplinado", title: "Disciplinado", description: "15 dias consecutivos de estudo", target: 15 },
  { id: "tempo-imparavel", title: "Imparável", description: "30 dias consecutivos de estudo", target: 30 },
].forEach(def => {
  MEDAL_CATALOG.push({
    ...def,
    section: "tempo",
    unit: { one: "dia seguido", many: "dias seguidos" },
    evaluate: (context, derived) => (derived.bestStudyStreak == null ? null : {
      progress: derived.bestStudyStreak,
      target: def.target,
      earned: derived.bestStudyStreak >= def.target,
    }),
  });
});

// --------------------------------------------------------------- Cálculo

function disciplineToCategory(discipline) {
  return DISCIPLINE_TO_CATEGORY[discipline] || null;
}

// Melhor sequência de acertos JÁ alcançada (não a atual) — uma vez batido
// o alvo, a medalha "Sequência" fica permanente mesmo que o aluno erre a
// próxima questão.
function bestCorrectStreak(answers) {
  const sorted = [...answers].sort((a, b) => (a.answered_at < b.answered_at ? -1 : a.answered_at > b.answered_at ? 1 : 0));
  let best = 0;
  let current = 0;
  sorted.forEach(a => {
    current = a.correct ? current + 1 : 0;
    if (current > best) best = current;
  });
  return best;
}

// "YYYY-MM-DD" local (não UTC) — duas respostas no mesmo dia de calendário
// do aluno devem contar como o MESMO dia de estudo, não duas.
function toDateKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Melhor sequência de dias consecutivos COM atividade já alcançada (não a
// atual/em andamento) — mesma lógica de "permanente" de bestCorrectStreak.
function bestConsecutiveDayStreak(isoDates) {
  const uniqueDays = [...new Set(isoDates.map(toDateKey))].sort();
  let best = 0;
  let current = 0;
  let prevDate = null;
  uniqueDays.forEach(key => {
    const date = new Date(`${key}T00:00:00`);
    current = prevDate && Math.round((date - prevDate) / 86400000) === 1 ? current + 1 : 1;
    if (current > best) best = current;
    prevDate = date;
  });
  return best;
}

// Sequência ATIVA agora (termina hoje ou ontem) — 0 se a última atividade
// foi antes de ontem, ou seja, a sequência já quebrou. Complementa
// bestConsecutiveDayStreak (que é sobre o recorde histórico, não sobre "estou
// em sequência AGORA") — usado pelo Calendário de Estudos (estudos.js) pro
// badge "🔥 N dias em sequência" no card.
function currentDayStreak(isoDates) {
  const uniqueDays = [...new Set(isoDates.map(toDateKey))].sort();
  if (uniqueDays.length === 0) return 0;

  const todayKey = toDateKey(new Date().toISOString());
  const lastKey = uniqueDays[uniqueDays.length - 1];
  const daysSinceLast = Math.round(
    (new Date(`${todayKey}T00:00:00`) - new Date(`${lastKey}T00:00:00`)) / 86400000,
  );
  if (daysSinceLast > 1) return 0;

  let streak = 1;
  for (let i = uniqueDays.length - 1; i > 0; i--) {
    const cur = new Date(`${uniqueDays[i]}T00:00:00`);
    const prev = new Date(`${uniqueDays[i - 1]}T00:00:00`);
    if (Math.round((cur - prev) / 86400000) === 1) streak++;
    else break;
  }
  return streak;
}

// Todos os "runs" (sequências) de dias consecutivos com atividade, do
// histórico INTEIRO — diferente de currentDayStreak/bestConsecutiveDayStreak
// (que só devolvem um número), aqui cada dia dentro de um run de 2+ fica
// disponível pra ser destacado visualmente no Calendário de Estudos (⭐ 2-4
// dias, 🔥 5+ dias), não só a sequência ativa/recorde.
function consecutiveDayRuns(isoDates) {
  const uniqueDays = [...new Set(isoDates.map(toDateKey))].sort();
  const runs = [];
  let current = [];
  let prevDate = null;
  uniqueDays.forEach(key => {
    const date = new Date(`${key}T00:00:00`);
    if (prevDate && Math.round((date - prevDate) / 86400000) === 1) {
      current.push(key);
    } else {
      if (current.length > 0) runs.push(current);
      current = [key];
    }
    prevDate = date;
  });
  if (current.length > 0) runs.push(current);
  return runs.map(keys => ({ keys, length: keys.length }));
}

// Pré-calcula tudo que mais de uma medalha usa (uma vez só por chamada, não
// uma vez por medalha) a partir do contexto disponível — ver comentário no
// topo do arquivo sobre contexto PARCIAL: cada bloco só roda se a página
// que chamou passou o dado necessário; sem ele, os campos ficam undefined e
// as medalhas que dependem deles são puladas (evaluate devolve null) em vez
// de "erradas".
function computeDerived(context) {
  const derived = {};

  if (context.answers) {
    derived.totalAnswers = context.answers.length;
    derived.correctAnswers = context.answers.filter(a => a.correct).length;
    derived.bestCorrectStreak = bestCorrectStreak(context.answers);
  }

  if (context.answers && context.questionsById) {
    derived.categoryCorrect = {};
    Object.keys(CATEGORY_DISCIPLINES).forEach(k => { derived.categoryCorrect[k] = 0; });
    context.answers.forEach(a => {
      if (!a.correct) return;
      const q = context.questionsById.get(a.question_id);
      const catKey = q && disciplineToCategory(q.discipline);
      if (catKey) derived.categoryCorrect[catKey]++;
    });
  }

  if (context.phase2CorrigidasCount != null) {
    derived.phase2CorrigidasCount = context.phase2CorrigidasCount;
  }

  if (context.studyDates && context.studyDates.length > 0) {
    derived.bestStudyStreak = bestConsecutiveDayStreak(context.studyDates);
  } else if (context.studyDates) {
    derived.bestStudyStreak = 0;
  }

  return derived;
}

// Map<medal_id, {progress, target, earned, total?} | null> — null quando o
// contexto não tinha o necessário pra avaliar aquela medalha nessa chamada.
function evaluateMedals(context) {
  const derived = computeDerived(context);
  const results = new Map();
  MEDAL_CATALOG.forEach(medal => {
    results.set(medal.id, medal.evaluate(context, derived));
  });
  return results;
}

// "Faltam X ... para desbloquear" — usado tanto no card da tela de medalhas
// quanto (indiretamente) na descrição da medalha. Precisão tem 2 condições
// (mínimo de questões E percentual), por isso é tratada à parte das demais,
// que são todas "falta uma quantidade simples pro alvo".
function formatRemaining(medal, evalResult) {
  if (!evalResult) return "";
  if (evalResult.earned) return "Conquistado";
  if (medal.id === "geral-precisao") {
    const total = evalResult.total || 0;
    if (total < 50) {
      const faltam = 50 - total;
      return `Faltam ${faltam} ${pluralize(faltam, { one: "questão respondida", many: "questões respondidas" })} (mínimo 50)`;
    }
    return `Aumente sua precisão para 70% (atual ${evalResult.progress}%)`;
  }
  const remaining = Math.max(0, evalResult.target - evalResult.progress);
  return `Faltam ${remaining} ${pluralize(remaining, medal.unit)} para desbloquear`;
}

// Confere o catálogo inteiro contra o que já está gravado, grava (upsert,
// ignorando quem já existe — evita erro numa corrida rara entre duas
// chamadas quase simultâneas, ex.: init() e handleAnswer() em sequência
// rápida) o que for NOVO, e devolve só as medalhas recém-conquistadas nesta
// chamada (pra disparar a comemoração). Nunca lança: falha aqui não deve
// travar o fluxo de estudo por trás.
async function checkAndAwardMedals(client, userId, context) {
  const results = evaluateMedals(context);
  const earnedNow = [];
  results.forEach((r, id) => { if (r && r.earned) earnedNow.push(id); });
  if (earnedNow.length === 0) return [];

  const { data: existing, error: fetchError } = await client
    .from("oab_medals_earned")
    .select("medal_id")
    .eq("user_id", userId);
  if (fetchError) {
    console.error("Falha ao carregar medalhas já conquistadas:", fetchError.message);
    return [];
  }

  const existingIds = new Set((existing || []).map(r => r.medal_id));
  const newIds = earnedNow.filter(id => !existingIds.has(id));
  if (newIds.length === 0) return [];

  const rows = newIds.map(id => ({ user_id: userId, medal_id: id }));
  const { error: insertError } = await client
    .from("oab_medals_earned")
    .upsert(rows, { onConflict: "user_id,medal_id", ignoreDuplicates: true });
  if (insertError) {
    console.error("Falha ao registrar medalhas conquistadas:", insertError.message);
    return [];
  }

  return newIds.map(id => MEDAL_CATALOG.find(m => m.id === id)).filter(Boolean);
}

// "Hoje"/"Ontem"/"Há N dias" — movida de estudos.js pra cá porque agora é
// usada em 3 lugares (aqui não usa, mas medalhas.js e estudos.js/
// simulado2fase.js usam pra "conquistado há X dias"/"última atividade").
function fmtRelativeDate(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  if (diffDays <= 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  if (diffDays < 30) return `Há ${diffDays} dias`;
  return date.toLocaleDateString("pt-BR");
}

// ------------------------------------------------------ Modal de comemoração
//
// Markup replicado em estudos/index.html e estudos/simulado2fase.html (mesmo
// padrão de menu/help-modal já replicados nas duas páginas) — nesta página
// (estudos/medalhas.html) não existe, então os elementos abaixo dão `null`
// e renderMedalCelebration() simplesmente não faz nada (a página já mostra
// os cards desbloqueados na hora, não precisa de popup).

const medalCelebrationOverlay = document.getElementById("medalCelebrationOverlay");
const medalCelebrationTitle = document.getElementById("medalCelebrationTitle");
const medalCelebrationList = document.getElementById("medalCelebrationList");
const medalCelebrationContinueBtn = document.getElementById("medalCelebrationContinueBtn");

function closeMedalCelebration() {
  if (medalCelebrationOverlay) medalCelebrationOverlay.hidden = true;
}

function renderMedalCelebration(medals) {
  if (!medalCelebrationOverlay || !medals || medals.length === 0) return;

  medalCelebrationTitle.textContent = medals.length === 1 ? "Medalha conquistada!" : "Medalhas conquistadas!";
  medalCelebrationList.innerHTML = "";

  medals.forEach(medal => {
    const card = document.createElement("div");
    card.className = "medal-celebration-card";

    const icon = document.createElement("span");
    icon.className = "medal-celebration-icon";
    icon.innerHTML = medalIconSVG(medal);
    card.appendChild(icon);

    const info = document.createElement("div");
    info.className = "medal-celebration-info";
    const title = document.createElement("strong");
    title.textContent = medal.title;
    info.appendChild(title);
    const desc = document.createElement("span");
    desc.textContent = medal.description;
    info.appendChild(desc);
    card.appendChild(info);

    medalCelebrationList.appendChild(card);
  });

  medalCelebrationOverlay.hidden = false;
}

if (medalCelebrationContinueBtn) {
  medalCelebrationContinueBtn.addEventListener("click", closeMedalCelebration);
}
if (medalCelebrationOverlay) {
  medalCelebrationOverlay.addEventListener("click", ev => {
    if (ev.target === medalCelebrationOverlay) closeMedalCelebration();
  });
}
document.addEventListener("keydown", ev => {
  if (ev.key === "Escape" && medalCelebrationOverlay && !medalCelebrationOverlay.hidden) closeMedalCelebration();
});
