// Página "Minhas Medalhas" — lista as 29 medalhas do catálogo (ver
// estudos/medals.js, carregado antes deste arquivo) com progresso e estado
// bloqueado/desbloqueado. Página própria (não uma tela dentro de
// estudos/index.html), mesmo padrão de estudos/simulado2fase.html: seu
// próprio client Supabase, seu próprio requireAuth()/menu/tema.

const SUPABASE_URL = "https://lgcphxncteqpbntnlzhe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnY3BoeG5jdGVxcGJudG5semhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NzI5NTIsImV4cCI6MjEwMzM0ODk1Mn0.gQltbgj-OPpDEPuyOSonM3G8h1ppwwez0Dwi3SOdx98";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const menuBtn = document.getElementById("menuBtn");
const menuCloseBtn = document.getElementById("menuCloseBtn");
const menuBackdrop = document.getElementById("menuBackdrop");
const menuPanel = document.getElementById("menuPanel");
const menuAvatar = document.getElementById("menuAvatar");
const menuUserLabel = document.getElementById("menuUserLabel");
const sessionLogoutBtn = document.getElementById("sessionLogoutBtn");
const medalsBody = document.getElementById("medalsBody");
const medalsCountHint = document.getElementById("medalsCountHint");
const backBtn = document.getElementById("backBtn");

// Esta página é aberta tanto da 1ª quanto da 2ª fase (menu "Minhas
// Medalhas" em estudos.js e simulado2fase.js, sempre via
// window.location.href — nunca um link normal aberto em aba nova), então
// sempre existe uma entrada anterior no histórico da MESMA aba pra voltar.
// Só cai no fallback (dashboard da 1ª fase) se a página foi aberta direto
// (link salvo, digitado na barra de endereço etc.), sem histórico nenhum.
backBtn.addEventListener("click", () => {
  if (window.history.length > 1) window.history.back();
  else window.location.href = "index.html";
});

// ------------------------------------------------------------------ Menu
//
// Mesmo painel overlay das outras 2 páginas (ver comentário em
// estudos/estudos.js) — abre por cima do conteúdo, fecha clicando fora, no
// X ou com Escape.

function openMenu() {
  menuBackdrop.hidden = false;
  menuPanel.hidden = false;
  menuBtn.setAttribute("aria-expanded", "true");
}

function closeMenu() {
  menuBackdrop.hidden = true;
  menuPanel.hidden = true;
  menuBtn.setAttribute("aria-expanded", "false");
}

menuBtn.addEventListener("click", openMenu);
menuCloseBtn.addEventListener("click", closeMenu);
menuBackdrop.addEventListener("click", closeMenu);

document.addEventListener("keydown", ev => {
  if (ev.key === "Escape" && !menuPanel.hidden) closeMenu();
});

// ------------------------------------------------------------------ Tema

function safeGetItem(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSetItem(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignora */ }
}

const THEME_STORAGE_KEY = "neuraoab-theme";

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.querySelectorAll("[data-theme-btn]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.themeBtn === theme);
  });
  safeSetItem(THEME_STORAGE_KEY, theme);
}

document.querySelectorAll(".mode-switch").forEach(group => {
  group.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.themeBtn) applyTheme(btn.dataset.themeBtn);
    });
  });
});

applyTheme(safeGetItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark");

// ------------------------------------------------------ Sessão do aluno

let currentSession = null;

async function requireAuth() {
  const { data } = await client.auth.getSession();
  if (!data.session?.user) {
    window.location.replace("../index.html");
    return null;
  }
  return data.session;
}

function updateSessionUI() {
  if (!currentSession?.user) return;
  const label = currentSession.user.user_metadata?.nome || currentSession.user.email || "?";
  menuAvatar.textContent = label.trim().charAt(0).toUpperCase() || "?";
  menuUserLabel.textContent = currentSession.user.email;
}

sessionLogoutBtn.addEventListener("click", async () => {
  currentSession = null;
  closeMenu();
  try {
    await client.auth.signOut();
  } catch (err) {
    console.error("Erro ao encerrar sessão:", err);
  }
  window.location.href = "../index.html";
});

client.auth.onAuthStateChange((_event, session) => {
  currentSession = session;
  if (session?.user) updateSessionUI();
  else window.location.replace("../index.html");
});

// --------------------------------------------------------------- Dados

const PAGE_SIZE = 1000; // mesmo limite do PostgREST contornado em estudos.js (fetchAllQuestions)

// Só "id, discipline" — bem mais leve que o fetch completo de estudos.js
// (que também traz enunciado/alternativas), porque aqui só precisamos saber
// de qual matéria é cada questão respondida, pras medalhas de categoria.
async function fetchQuestionDisciplines() {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await client
      .from("oab_questions")
      .select("id, discipline")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("Falha ao carregar questões (medalhas):", error.message);
      break;
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function fetchAnswers(userId) {
  const { data, error } = await client
    .from("oab_respostas")
    .select("question_id, correct, answered_at")
    .eq("user_id", userId);
  if (error) {
    console.error("Falha ao carregar respostas (medalhas):", error.message);
    return [];
  }
  return data || [];
}

async function fetchPhase2Summary(userId) {
  const { data, error } = await client
    .from("oab2_tentativas")
    .select("finished_at")
    .eq("user_id", userId)
    .eq("status", "corrigida");
  if (error) {
    console.error("Falha ao carregar simulados da 2ª fase (medalhas):", error.message);
    return { count: 0, dates: [] };
  }
  const rows = data || [];
  return { count: rows.length, dates: rows.map(r => r.finished_at).filter(Boolean) };
}

// Map<medal_id, earned_at> — fonte de verdade pro estado "Conquistado" (ver
// comentário em checkAndAwardMedals, estudos/medals.js: uma vez gravada, uma
// medalha é permanente, então o card usa isto — não o `earned` recalculado
// na hora — pra decidir se mostra o badge dourado).
async function fetchEarnedMedalsMap(userId) {
  const { data, error } = await client
    .from("oab_medals_earned")
    .select("medal_id, earned_at")
    .eq("user_id", userId);
  if (error) {
    console.error("Falha ao carregar medalhas conquistadas:", error.message);
    return new Map();
  }
  return new Map((data || []).map(r => [r.medal_id, r.earned_at]));
}

// -------------------------------------------------------------- Render

function earnedLabel(iso) {
  const rel = fmtRelativeDate(iso);
  if (rel === "Hoje") return "Conquistado hoje";
  if (rel === "Ontem") return "Conquistado ontem";
  if (rel.startsWith("Há")) return `Conquistado ${rel.toLowerCase()}`;
  return `Conquistado em ${rel}`;
}

function buildMedalCard(medal, evalResult, earnedAt) {
  const unlocked = !!earnedAt;
  const card = document.createElement("div");
  card.className = "medal-card" + (unlocked ? " unlocked" : " locked");

  const icon = document.createElement("div");
  icon.className = "medal-card-icon";
  icon.innerHTML = medalIconSVG(medal);
  card.appendChild(icon);

  const body = document.createElement("div");
  body.className = "medal-card-body";

  const titleRow = document.createElement("div");
  titleRow.className = "medal-card-title-row";
  const title = document.createElement("strong");
  title.textContent = medal.title;
  titleRow.appendChild(title);
  if (medal.section === "categoria") {
    const dots = document.createElement("span");
    dots.className = "medal-tier-dots";
    dots.innerHTML = medalTierDotsHTML(medal.tierIndex);
    titleRow.appendChild(dots);
  }
  body.appendChild(titleRow);

  const desc = document.createElement("p");
  desc.className = "medal-card-desc";
  desc.textContent = medal.description;
  body.appendChild(desc);

  const status = document.createElement("div");
  status.className = "medal-card-status";
  if (unlocked) {
    status.classList.add("earned");
    status.innerHTML = `${MEDAL_CHECK_ICON}<span>${earnedLabel(earnedAt)}</span>`;
  } else {
    status.innerHTML = `${MEDAL_LOCK_ICON}<span>${formatRemaining(medal, evalResult)}</span>`;
  }
  body.appendChild(status);

  card.appendChild(body);
  return card;
}

function buildMedalGrid(medals, evalResults, earnedMap) {
  const grid = document.createElement("div");
  grid.className = "medal-grid";
  medals.forEach(medal => {
    grid.appendChild(buildMedalCard(medal, evalResults.get(medal.id), earnedMap.get(medal.id)));
  });
  return grid;
}

function buildSectionTitle(text) {
  const el = document.createElement("h2");
  el.className = "stats-section-title";
  el.textContent = text;
  return el;
}

function buildCategoryTitle(text) {
  const el = document.createElement("h3");
  el.className = "medal-category-title";
  el.textContent = text;
  return el;
}

function renderMedals(evalResults, earnedMap) {
  medalsBody.innerHTML = "";
  medalsCountHint.textContent = `${earnedMap.size} de ${MEDAL_CATALOG.length} conquistadas`;

  const categorySection = document.createElement("div");
  categorySection.appendChild(buildSectionTitle(MEDAL_SECTION_LABELS.categoria));
  Object.keys(CATEGORY_DISCIPLINES).forEach(catKey => {
    const group = document.createElement("div");
    group.className = "medal-category-group";
    group.appendChild(buildCategoryTitle(CATEGORY_LABELS[catKey]));
    const medals = MEDAL_CATALOG
      .filter(m => m.section === "categoria" && m.category === catKey)
      .sort((a, b) => a.tierIndex - b.tierIndex);
    group.appendChild(buildMedalGrid(medals, evalResults, earnedMap));
    categorySection.appendChild(group);
  });
  medalsBody.appendChild(categorySection);

  ["geral", "fase2", "tempo"].forEach(section => {
    const sec = document.createElement("div");
    sec.appendChild(buildSectionTitle(MEDAL_SECTION_LABELS[section]));
    const medals = MEDAL_CATALOG.filter(m => m.section === section);
    sec.appendChild(buildMedalGrid(medals, evalResults, earnedMap));
    medalsBody.appendChild(sec);
  });
}

function renderMedalsError() {
  medalsCountHint.textContent = "—";
  medalsBody.innerHTML = '<p class="stats-error">Não foi possível carregar suas medalhas agora. Tente novamente em instantes.</p>';
}

async function loadAndRenderMedals(userId) {
  const [questions, answers, phase2] = await Promise.all([
    fetchQuestionDisciplines(),
    fetchAnswers(userId),
    fetchPhase2Summary(userId),
  ]);

  const context = {
    answers,
    questionsById: new Map(questions.map(q => [q.id, { discipline: q.discipline }])),
    phase2CorrigidasCount: phase2.count,
    studyDates: [...answers.map(a => a.answered_at), ...phase2.dates],
  };

  // Garante que qualquer medalha já alcançada antes mesmo de o aluno abrir
  // esta página (ex.: histórico de antes da funcionalidade existir) fica
  // gravada — sem popup de comemoração aqui (ver medals.js: nesta página
  // não há markup de celebração, renderMedalCelebration não faz nada), a
  // própria grade já nasce mostrando tudo desbloqueado.
  await checkAndAwardMedals(client, userId, context);

  const earnedMap = await fetchEarnedMedalsMap(userId);
  const evalResults = evaluateMedals(context);
  renderMedals(evalResults, earnedMap);
}

// ---------------------------------------------------------------- Init

(async () => {
  const session = await requireAuth();
  if (!session) return;

  currentSession = session;
  updateSessionUI();

  try {
    await loadAndRenderMedals(session.user.id);
  } catch (err) {
    console.error("Falha ao carregar medalhas:", err);
    renderMedalsError();
  }
})();
