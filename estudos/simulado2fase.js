// Simulado de Prática — 2ª Fase (NeuraOAB)
//
// Fluxo: aluno escolhe exame + área -> responde a peça profissional e as 4
// questões discursivas -> "Finalizar" dispara uma correção por IA por item
// (Edge Function corretor-2fase) -> nota + feedback item a item.
//
// EXIGE LOGIN, igual ao resto do site (ver requireAuth() abaixo, mesmo
// padrão de estudos/estudos.js) — até aqui esta era a ÚNICA área que
// funcionava sem conta (identidade por um UUID anônimo gerado no primeiro
// acesso e guardado no localStorage). Isso mudou por um motivo concreto, não
// só de consistência: sem exigir login, "corretor-2fase" (a correção por
// IA, que custa dinheiro de verdade a cada chamada) não tinha NENHUM limite
// de plano — ver planAllowsSegundaFase em supabase/functions/corretor-2fase/
// index.ts — então o paywall dos planos Básico/Pro era contornável só não
// fazendo login. Ver também supabase/schema_fase2_login_obrigatorio.sql.
// A identidade agora é sempre currentSession.user.id — não existe mais
// "aluno_id anônimo" separado de "user_id".

const SUPABASE_URL = "https://lgcphxncteqpbntnlzhe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnY3BoeG5jdGVxcGJudG5semhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NzI5NTIsImV4cCI6MjEwMzM0ODk1Mn0.gQltbgj-OPpDEPuyOSonM3G8h1ppwwez0Dwi3SOdx98";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DRAFT_KEY_PREFIX = "sim2_draft_"; // + provaId + "_" + itemId
const TENTATIVA_PTR_PREFIX = "sim2_tentativa_ptr_"; // + provaId -> tentativa id
const MODO_KEY_PREFIX = "sim2_modo_"; // + provaId -> "completo" | "peca" | "questoes"

function safeGetItem(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSetItem(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignora */ }
}
function safeRemoveItem(key) {
  try { localStorage.removeItem(key); } catch { /* ignora */ }
}

function fmtValor(n) {
  return (Number(n) || 0).toFixed(2).replace(".", ",");
}

// ----------------------------------------------------------------- Ícones
//
// SVG em linha (sem emoji) — mesmo padrão usado em estudos/dr-laureano.js.

const PLAY_ICON = `<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor">
  <polygon points="6 3 20 12 6 21 6 3"></polygon>
</svg>`;

const PAUSE_ICON = `<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor">
  <rect x="6" y="4" width="4" height="16" rx="1"></rect>
  <rect x="14" y="4" width="4" height="16" rx="1"></rect>
</svg>`;

const MODO_LABELS = {
  completo: "Simulado completo",
  peca: "Peça profissional",
  questoes: "Questões discursivas",
};

// Mesmas 3 cores da marca usadas nos icones do painel de desempenho (ver
// .sim2-metric-tile--peca/--questoes em simulado2fase.css) — reaproveitadas
// na bolinha de cada item do historico, pra' o olho reconhecer o padrao
// entre os dois paineis.
const MODO_DOT_VAR = {
  completo: "--primary",
  peca: "--logo-blue",
  questoes: "--logo-orange",
};

// -------------------------------------------------------------- Elementos

const els = {
  viewPicker: document.getElementById("viewPicker"),
  viewCaderno: document.getElementById("viewCaderno"),
  viewCorrigindo: document.getElementById("viewCorrigindo"),
  viewResultado: document.getElementById("viewResultado"),

  dashGreeting: document.getElementById("dashGreeting"),
  streakPill: document.getElementById("streakPill"),
  streakPillText: document.getElementById("streakPillText"),
  dashboardError: document.getElementById("dashboardError"),
  dashboardRetryBtn: document.getElementById("dashboardRetryBtn"),

  heroFormState: document.getElementById("heroFormState"),
  heroContinueState: document.getElementById("heroContinueState"),

  continueBadge: document.getElementById("continueBadge"),
  continueSub: document.getElementById("continueSub"),
  continueProgressWrap: document.getElementById("continueProgressWrap"),
  continueProgressText: document.getElementById("continueProgressText"),
  continueProgressPct: document.getElementById("continueProgressPct"),
  continueProgressFill: document.getElementById("continueProgressFill"),
  btnContinuar: document.getElementById("btnContinuar"),

  pickerLoading: document.getElementById("pickerLoading"),
  pickerForm: document.getElementById("pickerForm"),
  pickerEmpty: document.getElementById("pickerEmpty"),
  pickerError: document.getElementById("pickerError"),
  selExame: document.getElementById("selExame"),
  selArea: document.getElementById("selArea"),
  modeTabs: document.getElementById("modeTabs"),
  btnStart: document.getElementById("btnStart"),

  focusText: document.getElementById("focusText"),

  perfPanelSub: document.getElementById("perfPanelSub"),
  notaMediaValue: document.getElementById("notaMediaValue"),
  notaMediaHint: document.getElementById("notaMediaHint"),
  evolucaoValue: document.getElementById("evolucaoValue"),
  evolucaoHint: document.getElementById("evolucaoHint"),
  pecaValue: document.getElementById("pecaValue"),
  pecaHint: document.getElementById("pecaHint"),
  questoesValue: document.getElementById("questoesValue"),
  questoesHint: document.getElementById("questoesHint"),

  historyEmpty: document.getElementById("historyEmpty"),
  historyEmptyText: document.getElementById("historyEmptyText"),
  chartWrap: document.getElementById("chartWrap"),
  lastList: document.getElementById("lastList"),

  recommendEmpty: document.getElementById("recommendEmpty"),
  recommendEmptyText: document.getElementById("recommendEmptyText"),
  recommendBody: document.getElementById("recommendBody"),
  recommendPriority: document.getElementById("recommendPriority"),
  recommendArea: document.getElementById("recommendArea"),
  recommendText: document.getElementById("recommendText"),
  recommendBtn: document.getElementById("recommendBtn"),

  howToggle: document.getElementById("howToggle"),
  howContent: document.getElementById("howContent"),

  cadernoTitulo: document.getElementById("cadernoTitulo"),
  cadernoSub: document.getElementById("cadernoSub"),
  btnReiniciarCaderno: document.getElementById("btnReiniciarCaderno"),
  btnSairCaderno: document.getElementById("btnSairCaderno"),
  tabStrip: document.getElementById("tabStrip"),
  itemMeta: document.getElementById("itemMeta"),
  itemEnunciado: document.getElementById("itemEnunciado"),
  startGate: document.getElementById("startGate"),
  btnIniciarCaderno: document.getElementById("btnIniciarCaderno"),
  answerSheet: document.getElementById("answerSheet"),
  lineGutter: document.getElementById("lineGutter"),
  itemResposta: document.getElementById("itemResposta"),
  itemContagem: document.getElementById("itemContagem"),
  itemLinhasInfo: document.getElementById("itemLinhasInfo"),
  itemSalvo: document.getElementById("itemSalvo"),
  btnPrevItem: document.getElementById("btnPrevItem"),
  btnNextItem: document.getElementById("btnNextItem"),
  btnFinalizar: document.getElementById("btnFinalizar"),

  corrigindoLista: document.getElementById("corrigindoLista"),

  notaTotalNum: document.getElementById("notaTotalNum"),
  notaTotalDen: document.getElementById("notaTotalDen"),
  resultadoSub: document.getElementById("resultadoSub"),
  resultadoItens: document.getElementById("resultadoItens"),
  btnNovoSimulado: document.getElementById("btnNovoSimulado"),

  timerDisplay: document.getElementById("timerDisplay"),
  timerPlayPause: document.getElementById("timerPlayPause"),
  timerReset: document.getElementById("timerReset"),

  menuBtn: document.getElementById("menuBtn"),
  menuCloseBtn: document.getElementById("menuCloseBtn"),
  menuBackdrop: document.getElementById("menuBackdrop"),
  menuPanel: document.getElementById("menuPanel"),
  menuAvatar: document.getElementById("menuAvatar"),
  menuUserLabel: document.getElementById("menuUserLabel"),

  sessionLogoutBtn: document.getElementById("sessionLogoutBtn"),
};

// ------------------------------------------------------------------ Menu
//
// Mesmo painel overlay de estudos/estudos.js (ver comentário lá) — abre por
// cima do conteúdo, fecha clicando fora, no X ou com Escape.

function openMenu() {
  els.menuBackdrop.hidden = false;
  els.menuPanel.hidden = false;
  els.menuBtn.setAttribute("aria-expanded", "true");
}

function closeMenu() {
  els.menuBackdrop.hidden = true;
  els.menuPanel.hidden = true;
  els.menuBtn.setAttribute("aria-expanded", "false");
}

els.menuBtn.addEventListener("click", openMenu);
els.menuCloseBtn.addEventListener("click", closeMenu);
els.menuBackdrop.addEventListener("click", closeMenu);

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && !els.menuPanel.hidden) closeMenu();
});

// ------------------------------------------------------ Sessão do aluno
//
// EXIGE LOGIN, mesmo padrão de requireAuth() em estudos/estudos.js (ver
// comentário no topo do arquivo pra motivo) — o menu só tem UM estado
// (logado), diferente de antes (que tinha logado/deslogado).

let currentSession = null;

// Confere sessão ANTES de qualquer outra coisa (chamado no bootstrap, no
// fim do arquivo) — sem sessão válida, manda de volta pra' landing page em
// vez de liberar o uso anônimo de antes. Mesmo formato de requireAuth() em
// estudos/estudos.js.
async function requireAuth() {
  const { data } = await client.auth.getSession();
  if (!data.session?.user) {
    window.location.replace("../index.html");
    return null;
  }
  return data.session;
}

// Primeiro nome do aluno no cabeçalho do dashboard ("Olá, João!") — sem
// nome preenchido em "Meu Perfil", fica só o "Olá!" genérico.
function renderGreeting() {
  const nome = currentSession?.user?.user_metadata?.nome?.trim();
  const primeiroNome = nome ? nome.split(/\s+/)[0] : null;
  els.dashGreeting.textContent = primeiroNome ? `Olá, ${primeiroNome}! 👋` : "Olá! 👋";
}

function updateSessionUI() {
  if (!currentSession?.user) return; // requireAuth() já garante sessão antes de chegar aqui
  const label = currentSession.user.user_metadata?.nome || currentSession.user.email || "?";
  els.menuAvatar.textContent = label.trim().charAt(0).toUpperCase() || "?";
  els.menuUserLabel.textContent = currentSession.user.email;
  renderGreeting();
}

// Mesmo comportamento de estudos/estudos.js (handleSessionLogout): sai e
// redireciona na hora pra' landing page, em vez de so' fechar o menu e
// deixar o aluno na propria pagina — sem isso o clique em "Sair" na 2a
// fase parecia nao fazer nada de imediato (so' mudava o menu por baixo).
els.sessionLogoutBtn.addEventListener("click", async () => {
  currentSession = null;
  closeMenu();
  try {
    await client.auth.signOut();
  } catch (err) {
    console.error("Erro ao encerrar sessão:", err);
  }
  window.location.href = "../index.html";
});

// Se a sessao cair enquanto o aluno esta' na pagina (token expirado, logout
// em outra aba etc.), manda de volta pra' landing page — mesmo tratamento
// de estudos/estudos.js, agora que login e' obrigatorio aqui tambem.
client.auth.onAuthStateChange((_event, session) => {
  currentSession = session;
  if (session?.user) updateSessionUI();
  else window.location.replace("../index.html");
});

// ---------------------------------------------- Prévia pro plano grátis
//
// Pro aluno no plano grátis (sem segunda_fase, ver supabase/schema_planos.sql),
// deixa ele navegar pelos exames e ler o enunciado da peça/questões à
// vontade ("um gostinho") — só nunca deixa clicar em "Iniciar" de verdade,
// porque é isso que libera escrever e, no fim, chamar a correção paga
// (corretor-2fase). previewLocked é lido em updateAnswerLock() (força a
// trava mesmo que currentTentativa exista, ex.: uma tentativa antiga de
// quando o plano ainda permitia) e no clique de btnIniciarCaderno (abaixo).
// corretor-2fase/index.ts também recusa a correção pra quem está nesta
// situação — defesa em profundidade, caso alguém contorne esta trava do
// lado do cliente.
let previewLocked = false;

async function applySegundaFaseLock() {
  const { data, error } = await client.rpc("get_my_plan_status");
  if (error || !data || data.length === 0) return;
  if (data[0].segunda_fase) return;

  previewLocked = true;

  // Troca o texto do "startGate" (mesmo elemento que já trava a escrita até
  // clicar "Iniciar") uma vez só — updateAnswerLock() roda de novo a cada
  // troca de item, mas só mexe em hidden/disabled, nunca no conteúdo.
  const lede = els.startGate.querySelector(".sim2-start-gate-lede");
  if (lede) {
    lede.innerHTML =
      "A 2ª fase completa — escrever a peça/questões e receber correção por IA — é exclusiva dos planos " +
      "<b>Básico</b> e <b>Pro</b>. Por enquanto você pode navegar pelos enunciados pra conhecer o formato.";
  }
  els.btnIniciarCaderno.textContent = "Fazer upgrade";

  // Se já existia uma tentativa em andamento (ex.: começou quando o plano
  // ainda permitia, e foi rebaixado depois) — atualiza a trava visual na
  // hora, sem esperar a próxima renderItem().
  updateAnswerLock();
}

function showView(name) {
  ["viewPicker", "viewCaderno", "viewCorrigindo", "viewResultado"].forEach(v => {
    els[v].hidden = v !== name;
  });
  updateLayoutVars();
}

// Mede a altura real do topbar e escreve em --topbar-h, usada pelo CSS pra
// grudar a régua de abas logo abaixo dele (ver .sim2-tabs-sticky em
// simulado2fase.css). Sem isso, um valor fixo no CSS quebraria sempre que o
// topbar quebrasse linha (ex.: tela estreita com o cronometro, ver .topbar
// em estudos/style.css).
const topbarEl = document.querySelector(".topbar");

function updateLayoutVars() {
  if (topbarEl) {
    document.documentElement.style.setProperty("--topbar-h", topbarEl.offsetHeight + "px");
  }
}

window.addEventListener("resize", updateLayoutVars);
updateLayoutVars();

// ------------------------------------------------------------------ Tema
//
// Mesma chave usada em estudos/estudos.js — o tema escolhido em qualquer
// uma das duas paginas vale na outra. Trocado no mesmo mode-switch
// (Escuro/Claro) do menu lateral, igual a' 1a fase — em vez de um botao
// solto de sol/lua no topbar.

const THEME_STORAGE_KEY = "neuraoab-theme";

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.querySelectorAll("[data-theme-btn]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.themeBtn === theme);
  });
  safeSetItem(THEME_STORAGE_KEY, theme);
}

document.querySelectorAll(".mode-switch").forEach(group => {
  const buttons = group.querySelectorAll(".mode-btn");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.themeBtn) applyTheme(btn.dataset.themeBtn);
    });
  });
});

applyTheme(safeGetItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark");

// --------------------------------------------------------------- Cronômetro
//
// Cronometro de sessao (nao vinculado a um caderno especifico — fica no
// topbar, visivel em qualquer view). Guarda {elapsedMs, running, lastStartTs}
// no localStorage: o tempo decorrido enquanto "running" e' sempre calculado
// a partir de lastStartTs (timestamp real), entao ele continua contando
// certo mesmo se a aba ficar em segundo plano ou o navegador for fechado e
// reaberto com o cronometro ainda rodando.

const TIMER_KEY = "sim2_timer_state";
let timerState = { elapsedMs: 0, running: false, lastStartTs: null };
let timerInterval = null;

function loadTimerState() {
  try {
    const raw = safeGetItem(TIMER_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignora estado corrompido, comeca do zero */ }
  return { elapsedMs: 0, running: false, lastStartTs: null };
}

function saveTimerState() {
  safeSetItem(TIMER_KEY, JSON.stringify(timerState));
}

function currentElapsedMs() {
  if (timerState.running && timerState.lastStartTs) {
    return timerState.elapsedMs + (Date.now() - timerState.lastStartTs);
  }
  return timerState.elapsedMs;
}

function fmtTimer(ms) {
  const totalSec = Math.floor(ms / 1000);
  const pad = n => String(n).padStart(2, "0");
  return `${pad(Math.floor(totalSec / 3600))}:${pad(Math.floor((totalSec % 3600) / 60))}:${pad(totalSec % 60)}`;
}

function renderTimerDisplay() {
  els.timerDisplay.textContent = fmtTimer(currentElapsedMs());
}

function setTimerButtonRunning(running) {
  els.timerPlayPause.innerHTML = running ? PAUSE_ICON : PLAY_ICON;
  els.timerPlayPause.setAttribute("aria-label", running ? "Pausar cronômetro" : "Iniciar cronômetro");
  els.timerPlayPause.classList.toggle("running", running);
}

function startTimer() {
  if (timerState.running) return;
  timerState.running = true;
  timerState.lastStartTs = Date.now();
  saveTimerState();
  setTimerButtonRunning(true);
  timerInterval = setInterval(renderTimerDisplay, 1000);
}

function pauseTimer() {
  if (!timerState.running) return;
  timerState.elapsedMs = currentElapsedMs();
  timerState.running = false;
  timerState.lastStartTs = null;
  saveTimerState();
  clearInterval(timerInterval);
  timerInterval = null;
  setTimerButtonRunning(false);
  renderTimerDisplay();
}

function resetTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerState = { elapsedMs: 0, running: false, lastStartTs: null };
  saveTimerState();
  setTimerButtonRunning(false);
  renderTimerDisplay();
}

els.timerPlayPause.addEventListener("click", () => {
  if (timerState.running) pauseTimer(); else startTimer();
});

els.timerReset.addEventListener("click", () => {
  if (currentElapsedMs() > 0 && !confirm("Zerar o cronômetro?")) return;
  resetTimer();
});

(function initTimer() {
  timerState = loadTimerState();
  renderTimerDisplay();
  // Sempre desenha o icone (play OU pausa) — antes so' fazia isso quando o
  // cronometro ja estava rodando ao carregar a pagina; parado (o estado
  // inicial mais comum), o botao ficava com o innerHTML vazio, sem icone
  // nenhum.
  setTimerButtonRunning(timerState.running);
  if (timerState.running) {
    timerInterval = setInterval(renderTimerDisplay, 1000);
  }
})();

// -------------------------------------------------------------- Estado

let provas = [];              // [{id, exam_number, area, valor_total}]
let currentProva = null;
let currentItens = [];        // itens da tentativa atual (ja filtrados pelo modo), com oab2_subitens/oab2_criterios embutidos
let currentTentativa = null;  // {id, status, ...}
let currentModo = "completo"; // "completo" | "peca" | "questoes" — ver MODO_LABELS
let currentValorTotal = 0;    // soma do valor_total dos itens de currentItens (== prova.valor_total só no modo completo)
let drafts = new Map();       // item_id -> texto
let activeIndex = 0;
let saveTimer = null;

// ------------------------------------------------------------ Dashboard
//
// Estado do painel inicial (Tela 1) — carregado uma vez em initPicker() e
// recarregado ao voltar do caderno (ver refreshDashboard/backToPicker), pra
// refletir uma tentativa que acabou de ser iniciada/concluida.

let minhasTentativas = [];   // ver oab2_minhas_tentativas() em schema_fase2_dashboard.sql
let continueTentativa = null; // a tentativa em_andamento mostrada no card "Continuar simulado", se houver

function dayOfYear(date) {
  return Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
}

function fmt1(n) {
  return (Number(n) || 0).toFixed(1).replace(".", ",");
}

// Nota do item/tentativa reescalada pra base 10 — necessario pra comparar
// tentativas de modos diferentes (peca vale menos que o caderno completo)
// numa unica media/grafico.
function notaPct(nota, valorTotal) {
  const vt = Number(valorTotal) || 0;
  if (vt <= 0) return 0;
  return (Number(nota) || 0) / vt * 10;
}

// ------------------------------------------------------------ 1. Picker

async function loadProvas() {
  const { data, error } = await client
    .from("oab2_provas")
    .select("id, exam_number, area, valor_total")
    .order("exam_number", { ascending: false })
    .order("area", { ascending: true });

  if (error) throw error;
  return data || [];
}

function populateExameSelect() {
  const exames = [...new Set(provas.map(p => p.exam_number))].sort((a, b) => b - a);
  els.selExame.innerHTML = "";
  exames.forEach(n => els.selExame.appendChild(new Option(`${n}º Exame`, String(n))));
}

function populateAreaSelect() {
  const exameSel = els.selExame.value;
  const areas = provas.filter(p => String(p.exam_number) === exameSel);
  els.selArea.innerHTML = "";
  areas.forEach(p => els.selArea.appendChild(new Option(p.area, p.id)));
}

els.selExame.addEventListener("change", populateAreaSelect);

// Tipo de treinamento: peca sozinha ou so' as 4 questoes discursivas, alem
// do caderno completo de sempre — guardado por prova (ver MODO_KEY_PREFIX)
// pra abrir/retomar sempre no mesmo modo em que a tentativa foi criada.
let selectedModo = "completo";

els.modeTabs.querySelectorAll(".sim2-mode-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    selectedModo = btn.dataset.modo;
    els.modeTabs.querySelectorAll(".sim2-mode-tab").forEach(b => {
      const active = b === btn;
      b.classList.toggle("active", active);
      b.setAttribute("aria-checked", String(active));
    });
  });
});

const BTN_START_LABEL = "Começar simulado →";
const BTN_CONTINUAR_LABEL = "Continuar simulado →";

els.btnStart.addEventListener("click", () => {
  const provaId = els.selArea.value;
  const prova = provas.find(p => p.id === provaId);
  if (!prova) return;
  safeSetItem(MODO_KEY_PREFIX + prova.id, selectedModo);
  els.btnStart.disabled = true;
  els.btnStart.textContent = "Abrindo...";
  openCaderno(prova, selectedModo).finally(() => {
    els.btnStart.disabled = false;
    els.btnStart.textContent = BTN_START_LABEL;
  });
});

els.btnContinuar.addEventListener("click", () => {
  if (!continueTentativa) return;
  const prova = provas.find(p => p.id === continueTentativa.prova_id) || {
    id: continueTentativa.prova_id,
    exam_number: continueTentativa.exam_number,
    area: continueTentativa.area,
    valor_total: continueTentativa.valor_total,
  };
  els.btnContinuar.disabled = true;
  els.btnContinuar.textContent = "Abrindo...";
  openCaderno(prova, continueTentativa.modo).finally(() => {
    els.btnContinuar.disabled = false;
    els.btnContinuar.textContent = BTN_CONTINUAR_LABEL;
  });
});

async function initPicker() {
  try {
    provas = await loadProvas();
  } catch (err) {
    els.pickerLoading.hidden = true;
    els.pickerError.hidden = false;
    els.pickerError.textContent = `Erro ao carregar cadernos: ${err.message}`;
    return;
  }

  els.pickerLoading.hidden = true;

  if (provas.length === 0) {
    els.pickerEmpty.hidden = false;
  } else {
    populateExameSelect();
    populateAreaSelect();
    els.pickerForm.hidden = false;
  }

  refreshDashboard();
}

function backToPicker() {
  currentProva = null;
  currentItens = [];
  currentTentativa = null;
  currentModo = "completo";
  currentValorTotal = 0;
  drafts = new Map();
  showView("viewPicker");
  // Uma tentativa pode ter acabado de ser criada/concluida — recarrega o
  // dashboard pra refletir isso (card "Continuar simulado", estatisticas
  // etc.). Nao precisa de await: a tela ja mostra o skeleton normalmente.
  refreshDashboard();
}

// ----------------------------------------------------------- 2. Caderno

const ITEM_COLUMNS = "id, prova_id, tipo, numero, ordem, enunciado, observacao, valor_total, " +
  "gabarito_comentado, criterios_texto_bruto, oab2_subitens(*), oab2_criterios(*)";

async function loadItens(provaId) {
  const { data, error } = await client
    .from("oab2_itens")
    .select(ITEM_COLUMNS)
    .eq("prova_id", provaId)
    .order("ordem");
  if (error) throw error;

  (data || []).forEach(item => {
    item.oab2_subitens = (item.oab2_subitens || []).sort((a, b) => a.ordem - b.ordem);
    item.oab2_criterios = (item.oab2_criterios || []).sort((a, b) => a.ordem - b.ordem);
  });
  return data || [];
}

// Busca uma tentativa em andamento já existente (retomada), sem criar
// nenhuma nova — a criação fica a cargo de createTentativa(), disparada só
// no clique em "Iniciar" (ver btnIniciarCaderno abaixo). Assim, abrir o
// caderno pra so' ler os enunciados não conta como "início" pro professor.
async function findTentativa(provaId) {
  const ptrKey = TENTATIVA_PTR_PREFIX + provaId;
  const ptr = safeGetItem(ptrKey);

  if (ptr) {
    // RPC em vez de .from().select() direto: o RLS de oab2_tentativas não
    // libera mais leitura aberta pro papel anon (ver
    // supabase/schema_security_hardening.sql) — o id da tentativa (aleatório,
    // guardado só neste navegador) já era a "senha" de fato usada aqui, então
    // a função exige exatamente esse id em vez de confiar numa policy aberta.
    const { data } = await client.rpc("oab2_get_tentativa", { p_tentativa_id: ptr });
    if (data && data.length > 0) return data[0];
    safeRemoveItem(ptrKey);
  }

  // Segundo caminho de retomada: o ponteiro acima é por navegador
  // (localStorage), então trocar de dispositivo/navegador perderia a
  // tentativa em andamento sem isso — busca por user_id+prova_id+status em
  // vez de confiar só no ponteiro local (RLS "oab2_tentativas_select_auth",
  // ver schema_professor_portal.sql, garante que só volta tentativa do
  // PRÓPRIO aluno logado).
  const { data } = await client
    .from("oab2_tentativas")
    .select("*")
    .eq("user_id", currentSession.user.id)
    .eq("prova_id", provaId)
    .eq("status", "em_andamento")
    .maybeSingle();
  if (data) {
    safeSetItem(ptrKey, data.id);
    return data;
  }

  return null;
}

// Cria a tentativa de fato — started_at grava o momento do clique em
// "Iniciar", que é o que o Portal do Professor mostra como "Iniciado em"
// (ver professor-portal/js/aluno-detail.js, loadFase2). aluno_id (coluna
// legada de quando o fluxo era anônimo, ver topo do arquivo) sempre grava o
// próprio user.id como texto agora — nunca mais um id aleatório separado —
// é o que oab2_minhas_tentativas/oab2_minhas_respostas_corrigidas usam pra
// achar o histórico do aluno (ver loadMinhasTentativas/loadMinhasRespostas
// abaixo), e precisa bater com "user_id = auth.uid()" exigido pela policy
// de insert (ver supabase/schema_fase2_login_obrigatorio.sql).
async function createTentativa(provaId) {
  const { data, error } = await client
    .from("oab2_tentativas")
    .insert({
      aluno_id: currentSession.user.id,
      user_id: currentSession.user.id,
      prova_id: provaId,
      status: "em_andamento",
      modo: currentModo,
      valor_total_tentativa: currentValorTotal,
    })
    .select("*")
    .single();
  if (error) throw error;

  safeSetItem(TENTATIVA_PTR_PREFIX + provaId, data.id);
  return data;
}

// Trava/libera a escrita conforme a tentativa existir ou não — chamada a
// cada renderItem() (currentTentativa não muda de item pra item, mas assim
// o estado visual sempre bate com o real) e depois do clique em "Iniciar".
function updateAnswerLock() {
  const locked = !currentTentativa || previewLocked;
  els.itemResposta.disabled = locked;
  els.answerSheet.classList.toggle("locked", locked);
  els.startGate.hidden = !locked;
  els.btnFinalizar.disabled = locked;
}

els.btnIniciarCaderno.addEventListener("click", async () => {
  if (previewLocked) {
    // Sem modal de planos nesta página (o "bloco grande" mora em
    // estudos/index.html, ver openPlansModal) — manda pra lá já abrindo o
    // modal (ver o handler de "#upgrade" no init() de estudos.js).
    window.location.href = "index.html#upgrade";
    return;
  }

  els.btnIniciarCaderno.disabled = true;
  els.btnIniciarCaderno.textContent = "Iniciando...";
  try {
    currentTentativa = await createTentativa(currentProva.id);
    updateAnswerLock();
  } catch (err) {
    alert(`Não foi possível iniciar: ${err.message}`);
  } finally {
    els.btnIniciarCaderno.disabled = false;
    els.btnIniciarCaderno.textContent = "Iniciar";
  }
});

async function loadDrafts(provaId, tentativaId, itens) {
  drafts = new Map();

  // 1) localStorage primeiro (instantaneo, sem depender de rede)
  itens.forEach(item => {
    const local = safeGetItem(DRAFT_KEY_PREFIX + provaId + "_" + item.id);
    if (local) drafts.set(item.id, local);
  });

  // 2) Supabase por cima, quando existir (fonte mais confiavel entre
  // sessoes/abas diferentes do mesmo navegador) — RPC pelo mesmo motivo do
  // findTentativa() acima (ver supabase/schema_security_hardening.sql).
  const { data } = await client.rpc("oab2_get_respostas", { p_tentativa_id: tentativaId });

  (data || []).forEach(r => {
    if (r.texto_resposta) drafts.set(r.item_id, r.texto_resposta);
  });
}

async function openCaderno(prova, modoParam) {
  els.pickerError.hidden = true;
  try {
    currentProva = prova;
    // Sem modo explicito (retomada por um caminho que nao passa pelo
    // picker/card "Continuar simulado"), usa o modo salvo pra esta prova —
    // sempre reabre no mesmo subconjunto de itens em que a tentativa foi
    // criada, nunca o caderno completo por engano.
    currentModo = modoParam || safeGetItem(MODO_KEY_PREFIX + prova.id) || "completo";

    const todosItens = await loadItens(prova.id);
    currentItens = currentModo === "completo"
      ? todosItens
      : todosItens.filter(i => i.tipo === (currentModo === "peca" ? "peca" : "questao"));

    if (currentItens.length === 0) {
      els.pickerError.hidden = false;
      els.pickerError.textContent = "Este caderno não tem itens importados ainda.";
      return;
    }
    currentValorTotal = currentItens.reduce((sum, i) => sum + (Number(i.valor_total) || 0), 0);

    currentTentativa = await findTentativa(prova.id);
    if (currentTentativa) {
      await loadDrafts(prova.id, currentTentativa.id, currentItens);
    } else {
      drafts = new Map();
    }

    activeIndex = 0;
    const modoSuffix = currentModo === "completo" ? "" : ` — ${MODO_LABELS[currentModo]}`;
    els.cadernoTitulo.textContent = `${prova.exam_number}º Exame — ${prova.area}${modoSuffix}`;

    renderTabs();
    // Mostra a view ANTES de renderItem(): refreshSheetSize() (chamada por
    // renderItem) precisa medir scrollHeight da textarea, o que so' funciona
    // com o elemento de fato visivel (display != none).
    showView("viewCaderno");
    renderItem();
  } catch (err) {
    els.pickerError.hidden = false;
    els.pickerError.textContent = `Erro ao abrir o caderno: ${err.message}`;
  }
}

function itemLabel(item) {
  return item.tipo === "peca" ? "Peça" : `Questão ${item.numero}`;
}

function renderTabs() {
  els.tabStrip.innerHTML = "";
  let filledCount = 0;
  currentItens.forEach((item, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sim2-tab" + (idx === activeIndex ? " active" : "");
    const filled = (drafts.get(item.id) || "").trim().length > 0;
    if (filled) { btn.classList.add("filled"); filledCount++; }

    const dot = document.createElement("span");
    dot.className = "sim2-tab-dot";
    const label = document.createElement("span");
    label.textContent = `${itemLabel(item)} (${fmtValor(item.valor_total)})`;

    btn.append(dot, label);
    btn.addEventListener("click", () => switchToItem(idx));
    els.tabStrip.appendChild(btn);
  });

  els.cadernoSub.textContent = `Valor total: ${fmtValor(currentValorTotal)} pontos · ` +
    `${filledCount}/${currentItens.length} itens preenchidos`;
}

function buildEnunciadoHTML(item) {
  const frag = document.createElement("div");

  // Paragrafos reais do enunciado (extrator preserva a quebra entre eles
  // como "\n\n" — ver flow_paragraphs em py/extract_oab2.py) viram um <p>
  // cada, com espacamento e justificacao proprios (mais controlavel do que
  // so' confiar no "white-space: pre-wrap" pra render a linha em branco).
  (item.enunciado || "").split(/\n{2,}/).forEach(paragraph => {
    const trimmed = paragraph.trim();
    if (!trimmed) return;
    const p = document.createElement("p");
    p.className = "sim2-enunciado-p";
    p.textContent = trimmed;
    frag.appendChild(p);
  });

  (item.oab2_subitens || []).forEach(s => {
    const div = document.createElement("div");
    div.className = "sim2-subitem";
    const b = document.createElement("b");
    b.textContent = `${s.letra}) `;
    div.appendChild(b);
    div.appendChild(document.createTextNode(`${s.enunciado} (Valor: ${fmtValor(s.valor)})`));
    frag.appendChild(div);
  });

  if (item.observacao) {
    const obs = document.createElement("div");
    obs.className = "sim2-obs";
    obs.textContent = `Obs.: ${item.observacao}`;
    frag.appendChild(obs);
  }

  return frag;
}

function updateContagem() {
  const text = els.itemResposta.value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  els.itemContagem.textContent = `${words} palavra${words === 1 ? "" : "s"}`;
}

// -------------------------------------------------- Folha de texto definitivo
//
// O caderno de textos definitivos da OAB tem um numero fixo de linhas
// pautadas por item — 150 para a peca profissional (5 paginas de 30 linhas)
// e 30 para cada questao discursiva (1 pagina). Reproduzimos a folha
// INTEIRA (sem scroll interno): a textarea recebe uma altura fixa em px
// igual a esse total de linhas, e quem rola pra ve-la e' a PAGINA — ver
// LINE_HEIGHT_PX abaixo, que precisa bater com --sheet-line-height do CSS.
// Se o aluno escrever alem do numero oficial de linhas, a folha CRESCE (o
// texto nunca e' cortado); as linhas extras ficam marcadas com a classe
// "extra" pra ficar visualmente claro que passou do espaco oficial.
const TOTAL_LINHAS = { peca: 150, questao: 30 };
const LINE_HEIGHT_PX = 32;

let currentGutterLines = 0;

function setGutterLines(totalLines, baseLines) {
  if (totalLines === currentGutterLines) return;
  currentGutterLines = totalLines;
  const frag = document.createDocumentFragment();
  for (let n = 1; n <= totalLines; n++) {
    const span = document.createElement("span");
    span.textContent = String(n);
    if (n > baseLines) span.classList.add("extra");
    frag.appendChild(span);
  }
  els.lineGutter.innerHTML = "";
  els.lineGutter.appendChild(frag);
}

// Redimensiona a folha pro tamanho exato do conteudo atual (nunca menor que
// o oficial do item) e atualiza a régua + o contador "X / N linhas".
function refreshSheetSize() {
  const item = currentItens[activeIndex];
  if (!item) return;
  const totalOficial = TOTAL_LINHAS[item.tipo] || TOTAL_LINHAS.questao;
  const ta = els.itemResposta;

  // Reseta pra altura oficial ANTES de medir — senao um scrollHeight antigo
  // (de quando o texto era maior) prende a folha grande mesmo depois do
  // aluno apagar conteudo.
  ta.style.height = (totalOficial * LINE_HEIGHT_PX) + "px";
  const neededHeight = Math.max(totalOficial * LINE_HEIGHT_PX, ta.scrollHeight);
  ta.style.height = neededHeight + "px";

  const neededLines = Math.round(neededHeight / LINE_HEIGHT_PX);
  setGutterLines(neededLines, totalOficial);

  const usedLines = ta.value ? Math.round(ta.scrollHeight / LINE_HEIGHT_PX) : 0;
  els.itemLinhasInfo.textContent = `${usedLines} / ${totalOficial} linhas`;
  els.itemLinhasInfo.classList.toggle("over-limit", usedLines > totalOficial);
}

function renderItem() {
  const item = currentItens[activeIndex];

  Array.from(els.tabStrip.children).forEach((btn, idx) => {
    btn.classList.toggle("active", idx === activeIndex);
  });

  els.itemMeta.innerHTML = "";
  const badgeTipo = document.createElement("span");
  badgeTipo.className = "badge";
  badgeTipo.textContent = itemLabel(item);
  const badgeValor = document.createElement("span");
  badgeValor.className = "badge valor";
  badgeValor.textContent = `Valor: ${fmtValor(item.valor_total)}`;
  els.itemMeta.append(badgeTipo, badgeValor);

  els.itemEnunciado.innerHTML = "";
  els.itemEnunciado.appendChild(buildEnunciadoHTML(item));

  els.itemResposta.value = drafts.get(item.id) || "";
  updateAnswerLock();
  refreshSheetSize();
  updateContagem();
  els.itemSalvo.textContent = " ";

  els.btnPrevItem.disabled = activeIndex === 0;
  els.btnNextItem.disabled = activeIndex === currentItens.length - 1;
}

function flushCurrentDraft() {
  const item = currentItens[activeIndex];
  if (!item) return;
  const text = els.itemResposta.value;
  drafts.set(item.id, text);
  safeSetItem(DRAFT_KEY_PREFIX + currentProva.id + "_" + item.id, text);
  renderTabs();
}

async function syncDraftToSupabase(item, text) {
  try {
    els.itemSalvo.textContent = "Salvando...";
    // RPC em vez de .upsert() direto — mesmo motivo do findTentativa() lá
    // em cima (ver supabase/schema_security_hardening.sql).
    await client.rpc("oab2_upsert_resposta", {
      p_tentativa_id: currentTentativa.id,
      p_item_id: item.id,
      p_texto_resposta: text,
    });
    if (currentItens[activeIndex]?.id === item.id) {
      const now = new Date();
      els.itemSalvo.textContent = `Salvo às ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    }
  } catch {
    if (currentItens[activeIndex]?.id === item.id) {
      els.itemSalvo.textContent = "Não foi possível salvar no servidor (guardado neste navegador).";
    }
  }
}

els.itemResposta.addEventListener("input", () => {
  flushCurrentDraft();
  updateContagem();
  refreshSheetSize();
  clearTimeout(saveTimer);
  const item = currentItens[activeIndex];
  const text = els.itemResposta.value;
  saveTimer = setTimeout(() => syncDraftToSupabase(item, text), 1500);
});

function switchToItem(idx) {
  flushCurrentDraft();
  activeIndex = idx;
  renderItem();
  // Volta ao topo da pagina: sem isso, quem tivesse rolado bem fundo numa
  // folha de 150 linhas continuaria la' embaixo ao trocar de item, olhando
  // pro meio de uma folha nova (quase vazia).
  window.scrollTo({ top: 0, behavior: "smooth" });
}

els.btnPrevItem.addEventListener("click", () => {
  if (activeIndex > 0) switchToItem(activeIndex - 1);
});
els.btnNextItem.addEventListener("click", () => {
  if (activeIndex < currentItens.length - 1) switchToItem(activeIndex + 1);
});

window.addEventListener("beforeunload", () => {
  // Best-effort: grava so' no localStorage (sincrono) — a chamada ao
  // Supabase (assincrona) nao tem garantia de terminar antes do unload.
  flushCurrentDraft();
});

els.btnSairCaderno.addEventListener("click", () => {
  flushCurrentDraft();
  backToPicker();
});

els.btnReiniciarCaderno.addEventListener("click", async () => {
  if (!confirm("Isso apaga suas respostas atuais deste caderno e começa uma tentativa nova. Continuar?")) return;
  const provaId = currentProva.id;
  currentItens.forEach(item => safeRemoveItem(DRAFT_KEY_PREFIX + provaId + "_" + item.id));
  safeRemoveItem(TENTATIVA_PTR_PREFIX + provaId);
  await openCaderno(currentProva, currentModo);
});

// -------------------------------------------------------- 3. Finalizar

function buildItemPayload(item) {
  return {
    tipo: item.tipo,
    numero: item.numero,
    enunciado: item.enunciado,
    subitens: (item.oab2_subitens || []).map(s => ({ letra: s.letra, enunciado: s.enunciado, valor: s.valor })),
    observacao: item.observacao,
    valor_total: item.valor_total,
    gabarito_comentado: item.gabarito_comentado,
    criterios: (item.oab2_criterios || []).map(c => ({
      rotulo: c.rotulo, categoria: c.categoria, descricao: c.descricao,
      pontuacao_maxima: c.pontuacao_maxima, faixas_possiveis: c.faixas_possiveis,
    })),
    criterios_texto_bruto: item.criterios_texto_bruto,
  };
}

function setCorrigindoStatus(idx, status, notaTexto) {
  const li = els.corrigindoLista.children[idx];
  if (!li) return;
  li.className = status;
  li.querySelector(".sim2-corrigindo-status").textContent =
    status === "done" ? (notaTexto || "concluído") :
    status === "error" ? "falhou" : "corrigindo...";
}

async function correctItem(item, idx) {
  const text = (drafts.get(item.id) || "").trim();
  try {
    const { data, error } = await client.functions.invoke("corretor-2fase", {
      body: { item: buildItemPayload(item), resposta_aluno: text },
    });
    if (error) throw error;
    if (!data || typeof data.nota_total !== "number") throw new Error("Resposta inesperada da IA.");

    // RPC em vez de .upsert() direto — mesmo motivo do findTentativa() lá
    // em cima (ver supabase/schema_security_hardening.sql).
    await client.rpc("oab2_upsert_resposta", {
      p_tentativa_id: currentTentativa.id,
      p_item_id: item.id,
      p_texto_resposta: text,
      p_nota: data.nota_total,
      p_feedback_geral: data.feedback_geral,
      p_feedback_criterios: data.criterios || [],
      p_alertas_juridicos: data.alertas_juridicos || [],
      p_corrected: true,
    });

    setCorrigindoStatus(idx, "done", `${fmtValor(data.nota_total)} / ${fmtValor(item.valor_total)}`);
    return {
      item,
      ok: true,
      nota: data.nota_total,
      feedback_geral: data.feedback_geral,
      criterios: data.criterios || [],
      alertas_juridicos: data.alertas_juridicos || [],
    };
  } catch (err) {
    setCorrigindoStatus(idx, "error");
    // Este catch NUNCA pode deixar escapar uma excecao: correctItem() e
    // chamado dentro de um Promise.all() para todos os itens ao mesmo
    // tempo, entao uma rejeicao aqui (mesmo so' na tentativa de salvar o
    // fallback) travaria a tela de correcao dos OUTROS itens tambem.
    try {
      await client.rpc("oab2_upsert_resposta", {
        p_tentativa_id: currentTentativa.id,
        p_item_id: item.id,
        p_texto_resposta: text,
        p_nota: 0,
        p_feedback_geral: "Não foi possível corrigir este item automaticamente. Tente novamente mais tarde.",
        p_feedback_criterios: [],
        p_alertas_juridicos: [],
      });
    } catch { /* ja' esta' marcado como erro na tela; segue sem essa gravacao */ }
    return {
      item,
      ok: false,
      nota: 0,
      feedback_geral: "Falha ao corrigir este item: " + err.message,
      criterios: [],
      alertas_juridicos: [],
    };
  }
}

els.btnFinalizar.addEventListener("click", async () => {
  flushCurrentDraft();

  const vazios = currentItens.filter(item => (drafts.get(item.id) || "").trim().length === 0);
  if (vazios.length > 0) {
    const nomes = vazios.map(itemLabel).join(", ");
    if (!confirm(`Você deixou em branco: ${nomes}. Esses itens serão corrigidos com nota zero. Finalizar mesmo assim?`)) {
      return;
    }
  }

  showView("viewCorrigindo");
  els.corrigindoLista.innerHTML = "";
  currentItens.forEach(item => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = itemLabel(item);
    const status = document.createElement("span");
    status.className = "sim2-corrigindo-status";
    status.textContent = "aguardando...";
    li.append(label, status);
    els.corrigindoLista.appendChild(li);
  });

  try {
    // RPC em vez de .update() direto — mesmo motivo do findTentativa() lá em
    // cima (ver supabase/schema_security_hardening.sql).
    await client.rpc("oab2_update_tentativa_status", {
      p_tentativa_id: currentTentativa.id,
      p_status: "corrigindo",
    });
  } catch { /* segue mesmo se essa atualizacao de status falhar */ }

  currentItens.forEach((item, idx) => setCorrigindoStatus(idx, "pending"));
  const resultados = await Promise.all(currentItens.map((item, idx) => correctItem(item, idx)));

  const notaTotal = resultados.reduce((acc, r) => acc + (r.nota || 0), 0);

  try {
    await client.rpc("oab2_update_tentativa_status", {
      p_tentativa_id: currentTentativa.id,
      p_status: "corrigida",
      p_nota_total: Math.round(notaTotal * 100) / 100,
      p_mark_finished: true,
    });
  } catch { /* a tela de resultado ja tem os dados calculados no cliente */ }

  const provaId = currentProva.id;
  currentItens.forEach(item => safeRemoveItem(DRAFT_KEY_PREFIX + provaId + "_" + item.id));
  safeRemoveItem(TENTATIVA_PTR_PREFIX + provaId);

  renderResultado(notaTotal, resultados);
});

// -------------------------------------------------------- 4. Resultado

function notaClass(nota, valorMax) {
  if (nota <= 0) return "zero";
  if (valorMax != null && nota >= valorMax - 0.005) return "full";
  return "";
}

function findCriterioDescricao(item, rotulo) {
  const c = (item.oab2_criterios || []).find(c => c.rotulo === rotulo);
  return c ? c.descricao : null;
}

function renderResultado(notaTotal, resultados) {
  els.notaTotalNum.textContent = fmtValor(notaTotal);
  els.notaTotalDen.textContent = fmtValor(currentValorTotal);
  const modoSuffix = currentModo === "completo" ? "" : ` — ${MODO_LABELS[currentModo]}`;
  els.resultadoSub.textContent = `${currentProva.exam_number}º Exame — ${currentProva.area}${modoSuffix}`;

  els.resultadoItens.innerHTML = "";

  resultados.forEach(r => {
    const card = document.createElement("div");
    card.className = "sim2-resultado-item";

    const head = document.createElement("button");
    head.type = "button";
    head.className = "sim2-resultado-item-head";

    const label = document.createElement("span");
    label.textContent = itemLabel(r.item);

    const notaEl = document.createElement("span");
    notaEl.className = "sim2-resultado-item-nota " + notaClass(r.nota, r.item.valor_total);
    notaEl.innerHTML = `${fmtValor(r.nota)} <span class="den">/ ${fmtValor(r.item.valor_total)}</span>`;

    head.append(label, notaEl);
    head.addEventListener("click", () => card.classList.toggle("open"));

    const body = document.createElement("div");
    body.className = "sim2-resultado-item-body";

    const feedback = document.createElement("div");
    feedback.className = "sim2-feedback-geral";
    feedback.textContent = r.feedback_geral || "";
    body.appendChild(feedback);

    (r.criterios || []).forEach(c => {
      const row = document.createElement("div");
      row.className = "sim2-criterio";

      const desc = document.createElement("div");
      desc.className = "sim2-criterio-desc";
      const descricaoOficial = findCriterioDescricao(r.item, c.rotulo);
      desc.textContent = descricaoOficial ? `${c.rotulo}. ${descricaoOficial}` : `Critério ${c.rotulo}`;
      const just = document.createElement("span");
      just.className = "justificativa";
      just.textContent = c.justificativa || "";
      desc.appendChild(just);

      // Critério anulado pela Coordenação do Exame: pontuação máxima já foi
      // concedida (ver corretor-2fase/index.ts), mas mostrar isso como uma
      // nota "cheia" comum confundiria com um acerto normal — um rótulo
      // deixa claro que não teve avaliação de conteúdo nenhuma aqui.
      const nota = document.createElement("div");
      if (c.anulado) {
        nota.className = "sim2-criterio-nota anulado";
        nota.textContent = "Anulado";
      } else {
        nota.className = "sim2-criterio-nota " + notaClass(c.pontuacao_obtida, c.pontuacao_maxima);
        nota.textContent = `${fmtValor(c.pontuacao_obtida)} / ${fmtValor(c.pontuacao_maxima)}`;
      }

      row.append(desc, nota);
      body.appendChild(row);
    });

    // "Camada 2": observações jurídicas/formais que NÃO afetam a nota (ver
    // corretor-2fase/index.ts, campo alertas_juridicos) — separadas
    // visualmente dos critérios oficiais pra não parecer que tiraram ponto.
    if (r.alertas_juridicos && r.alertas_juridicos.length > 0) {
      const alertasBox = document.createElement("div");
      alertasBox.className = "sim2-alertas";
      const alertasTitulo = document.createElement("div");
      alertasTitulo.className = "sim2-alertas-titulo";
      alertasTitulo.textContent = "Observações adicionais (não afetam a nota)";
      alertasBox.appendChild(alertasTitulo);
      r.alertas_juridicos.forEach(texto => {
        const p = document.createElement("p");
        p.className = "sim2-alerta-item";
        p.textContent = texto;
        alertasBox.appendChild(p);
      });
      body.appendChild(alertasBox);
    }

    const toggleResposta = document.createElement("button");
    toggleResposta.type = "button";
    toggleResposta.className = "sim2-resposta-toggle";
    toggleResposta.textContent = "Ver sua resposta";
    const respostaBox = document.createElement("div");
    respostaBox.className = "sim2-resposta-aluno";
    respostaBox.textContent = drafts.get(r.item.id) || "(resposta em branco)";
    toggleResposta.addEventListener("click", () => {
      const showing = respostaBox.classList.toggle("show");
      toggleResposta.textContent = showing ? "Ocultar sua resposta" : "Ver sua resposta";
    });
    body.append(toggleResposta, respostaBox);

    card.append(head, body);
    els.resultadoItens.appendChild(card);
  });

  showView("viewResultado");
}

els.btnNovoSimulado.addEventListener("click", () => {
  els.btnNovoSimulado.textContent = "Novo simulado";
  backToPicker();
});

// ------------------------------------------------ Resultado de uma tentativa antiga
//
// Reabre a tela de resultado (mesmo renderResultado do fluxo normal) pra
// uma tentativa ja' corrigida, a partir do card "Últimos simulados" — usa
// oab2_get_respostas (agora com nota/feedback, ver schema_fase2_dashboard.sql)
// em vez do resultado em memoria de uma correcao recem-feita.
async function openResultadoHistorico(t) {
  try {
    const [todosItens, respRes] = await Promise.all([
      loadItens(t.prova_id),
      client.rpc("oab2_get_respostas", { p_tentativa_id: t.tentativa_id }),
    ]);
    if (respRes.error) throw respRes.error;
    const respostas = respRes.data || [];

    currentProva = { id: t.prova_id, exam_number: t.exam_number, area: t.area, valor_total: t.valor_total };
    currentModo = t.modo || "completo";
    currentItens = currentModo === "completo"
      ? todosItens
      : todosItens.filter(i => i.tipo === (currentModo === "peca" ? "peca" : "questao"));
    currentValorTotal = Number(t.valor_total) || currentItens.reduce((sum, i) => sum + (Number(i.valor_total) || 0), 0);
    drafts = new Map(respostas.map(r => [r.item_id, r.texto_resposta || ""]));

    const resultados = currentItens.map(item => {
      const r = respostas.find(x => x.item_id === item.id);
      return {
        item,
        ok: true,
        nota: r ? Number(r.nota) || 0 : 0,
        feedback_geral: r?.feedback_geral || "",
        criterios: r?.feedback_criterios || [],
        alertas_juridicos: r?.alertas_juridicos || [],
      };
    });

    els.btnNovoSimulado.textContent = "Voltar ao painel";
    const notaTotal = t.nota_total != null ? Number(t.nota_total) : resultados.reduce((acc, r) => acc + r.nota, 0);
    renderResultado(notaTotal, resultados);
  } catch (err) {
    alert(`Não foi possível abrir este resultado: ${err.message}`);
  }
}

// ---------------------------------------------------------------- Dashboard

// Erro de CARREGAMENTO (RPC ausente/indisponível) precisa ficar visualmente
// diferente de "aluno ainda sem dados" — sem essa distinção, uma função que
// falhou (ex.: schema_fase2_dashboard*.sql não rodado no projeto Supabase)
// mostra os MESMOS estados vazios de um aluno de verdade sem histórico, e
// ninguém percebe que é um erro sem abrir o console.
let dashboardLoadError = false;

async function loadMinhasTentativas() {
  try {
    const { data, error } = await client.rpc("oab2_minhas_tentativas", { p_aluno_id: currentSession.user.id });
    if (error) throw error;
    minhasTentativas = data || [];
  } catch (err) {
    console.error("Erro ao carregar histórico de simulados:", err.message);
    minhasTentativas = [];
    dashboardLoadError = true;
  }
}

// Nota por ITEM (peca ou questao) do aluno, nao por tentativa — precisa
// disso pra separar "desempenho na peça" de "desempenho nas questões" (ver
// oab2_minhas_respostas_corrigidas em schema_fase2_dashboard_v2.sql), o que
// oab2_minhas_tentativas() sozinha nao da', porque um simulado "completo"
// mistura peça e questões numa unica nota.
let minhasRespostas = [];

async function loadMinhasRespostas() {
  try {
    const { data, error } = await client.rpc("oab2_minhas_respostas_corrigidas", { p_aluno_id: currentSession.user.id });
    if (error) throw error;
    minhasRespostas = data || [];
  } catch (err) {
    console.error("Erro ao carregar desempenho por tipo de item:", err.message);
    minhasRespostas = [];
    dashboardLoadError = true;
  }
}

function computeTipoStats() {
  const porTipo = { peca: [], questao: [] };
  minhasRespostas.forEach(r => {
    if (porTipo[r.item_tipo]) porTipo[r.item_tipo].push(notaPct(r.nota, r.valor_total));
  });
  const media = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  return { peca: media(porTipo.peca), questao: media(porTipo.questao) };
}

// Dias consecutivos com pelo menos uma tentativa iniciada — conta a partir
// de hoje; se hoje ainda nao estudou, conta a partir de ontem (senao a
// sequencia "zeraria" as 00h mesmo pra quem estudou ontem a noite e ainda
// nao abriu o app hoje).
function computeStreak() {
  const dias = new Set(minhasTentativas.map(t => new Date(t.started_at).toDateString()));
  function contarSequencia(inicio) {
    let n = 0;
    const cursor = new Date(inicio);
    while (dias.has(cursor.toDateString())) {
      n++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return n;
  }
  let streak = contarSequencia(new Date());
  if (streak === 0 && dias.size > 0) {
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    streak = contarSequencia(ontem);
  }
  return streak;
}

function renderStreakPill() {
  const streak = computeStreak();
  if (streak <= 0) {
    els.streakPill.hidden = true;
    return;
  }
  els.streakPillText.textContent = `${streak} dia${streak === 1 ? "" : "s"} seguido${streak === 1 ? "" : "s"}`;
  els.streakPill.hidden = false;
}

// -------------------------------------------------------------- Hero card
//
// Dois cards lado a lado — "Continuar simulado" (progresso) só aparece
// quando existe uma tentativa em andamento; "Novo simulado" (form) fica
// sempre visível do lado, pra dar acesso direto a começar outra coisa sem
// precisar "sair" do card de continuar primeiro (pedido explícito de
// redesenho — antes era um único card trocando de estado, nunca os dois ao
// mesmo tempo).
async function renderHero() {
  const emAndamento = minhasTentativas.find(t => t.status === "em_andamento") || null;
  continueTentativa = emAndamento;
  els.heroContinueState.hidden = !emAndamento;

  if (!emAndamento) return;

  els.continueBadge.textContent = `${emAndamento.exam_number}º Exame`;
  els.continueSub.textContent = `${emAndamento.area} — ${MODO_LABELS[emAndamento.modo] || MODO_LABELS.completo}`;

  // O ponteiro local (localStorage) pode ter sido perdido (outro
  // navegador/limpou os dados) — como a tentativa ja veio filtrada pelo
  // proprio user.id (aluno_id, ver createTentativa), e' seguro reescreve-lo
  // aqui pra findTentativa() achar de primeira quando clicar "Continuar".
  safeSetItem(TENTATIVA_PTR_PREFIX + emAndamento.prova_id, emAndamento.tentativa_id);
  safeSetItem(MODO_KEY_PREFIX + emAndamento.prova_id, emAndamento.modo);

  els.continueProgressWrap.hidden = true;
  try {
    const [itensTodos, respRes] = await Promise.all([
      loadItens(emAndamento.prova_id),
      client.rpc("oab2_get_respostas", { p_tentativa_id: emAndamento.tentativa_id }),
    ]);
    const respostas = respRes.data || [];
    const itensModo = emAndamento.modo === "completo"
      ? itensTodos
      : itensTodos.filter(i => i.tipo === (emAndamento.modo === "peca" ? "peca" : "questao"));

    const respondidos = itensModo.filter(item => {
      const r = respostas.find(x => x.item_id === item.id);
      return r && (r.texto_resposta || "").trim().length > 0;
    }).length;
    const pct = itensModo.length ? Math.round((respondidos / itensModo.length) * 100) : 0;

    els.continueProgressText.textContent = `${respondidos} de ${itensModo.length} ${itensModo.length === 1 ? "item respondido" : "itens respondidos"}`;
    els.continueProgressPct.textContent = `${pct}%`;
    els.continueProgressFill.style.width = `${pct}%`;
    els.continueProgressWrap.hidden = false;
  } catch {
    // Sem progresso detalhado o card continua funcional, so' sem a barra.
  }
}

// Dicas fixas (sem IA, sem chamada de rede) — mesma logica/motivo de
// STUDY_TIPS em estudos.js (uma versao anterior recomendando via IA ja
// causou bugs de contradicao com o card em destaque; estatico e' mais
// simples e sem custo). So' aparecem no "Foco de hoje" antes do aluno ter
// dado nenhuma resposta corrigida — a partir dai', o foco vira dado real
// (ver renderFocusStrip).
const FASE2_TIPS = [
  "Estruture sua peça pelo endereçamento antes de escrever o mérito — é onde a banca mais fecha questão zero.",
  "Releia sua resposta procurando o fundamento legal: cada tese precisa estar amarrada a um artigo ou súmula, não só à sua conclusão.",
  "Escreva as questões discursivas como se estivesse explicando pra um colega que não sabe o caso — clareza pontua tanto quanto conteúdo.",
  "Treine no tempo real da prova: administrar as 5 horas entre a peça e as 4 questões também é habilidade que se pratica.",
  "Releia o padrão de resposta oficial depois de cada correção — entender por que perdeu ponto vale mais do que só ver a nota.",
];

// ------------------------------------------------------------ Foco de hoje
//
// Ponte entre "o que fazer agora" (hero) e "como estou" (desempenho) —
// compara o proprio desempenho do aluno na peça x nas questões (dado real,
// nunca inventado) e aponta o lado mais fraco.
function renderFocusStrip(tipoStats) {
  const { peca, questao } = tipoStats;

  if (peca == null && questao == null) {
    const idx = dayOfYear(new Date()) % FASE2_TIPS.length;
    els.focusText.textContent = FASE2_TIPS[idx];
  } else if (peca == null || questao == null) {
    els.focusText.textContent = "Pratique os dois formatos — peça e questões — pra descobrirmos onde focar.";
  } else if (Math.abs(peca - questao) < 0.5) {
    els.focusText.textContent = "Seu desempenho está equilibrado entre peça e questões — bom momento pra variar as áreas do Direito.";
  } else if (peca < questao) {
    els.focusText.textContent = `Você rende mais nas questões discursivas (${fmt1(questao)}/10) do que na peça (${fmt1(peca)}/10). Vale reforçar a peça profissional hoje.`;
  } else {
    els.focusText.textContent = `Você rende mais na peça profissional (${fmt1(peca)}/10) do que nas questões (${fmt1(questao)}/10). Vale reforçar as questões discursivas hoje.`;
  }
}

// -------------------------------------------------------------- Desempenho

function setMetricEmpty(valueEl, hintEl, hintText) {
  valueEl.textContent = "—";
  valueEl.className = "sim2-metric-value empty";
  hintEl.textContent = hintText;
  hintEl.hidden = false;
}

function setMetricValue(valueEl, hintEl, text, variant) {
  valueEl.textContent = text;
  valueEl.className = "sim2-metric-value" + (variant ? " " + variant : "");
  hintEl.hidden = true;
}

function renderPerfPanel(tipoStats) {
  const corrigidas = minhasTentativas.filter(t => t.status === "corrigida");

  els.perfPanelSub.hidden = corrigidas.length === 0;
  if (corrigidas.length > 0) {
    els.perfPanelSub.textContent =
      `com base em ${corrigidas.length} simulado${corrigidas.length === 1 ? "" : "s"} corrigido${corrigidas.length === 1 ? "" : "s"}`;
  }

  if (corrigidas.length === 0) {
    setMetricEmpty(els.notaMediaValue, els.notaMediaHint, "Faça seu primeiro simulado corrigido pra desbloquear.");
  } else {
    const notas = corrigidas.map(t => notaPct(t.nota_total, t.valor_total));
    const media = notas.reduce((a, b) => a + b, 0) / notas.length;
    setMetricValue(els.notaMediaValue, els.notaMediaHint, `${fmt1(media)} / 10`);
  }

  // Evolucao: media dos ultimos 30 dias vs media dos 30 dias anteriores.
  const DAY = 86400000;
  const now = Date.now();
  const idade = t => now - new Date(t.finished_at || t.started_at).getTime();
  const recentes = corrigidas.filter(t => idade(t) <= 30 * DAY);
  const anteriores = corrigidas.filter(t => idade(t) > 30 * DAY && idade(t) <= 60 * DAY);
  const mediaDe = lista => lista.length
    ? lista.reduce((a, t) => a + notaPct(t.nota_total, t.valor_total), 0) / lista.length
    : null;
  const mediaRecente = mediaDe(recentes);
  const mediaAnterior = mediaDe(anteriores);
  const evolucao = (mediaRecente != null && mediaAnterior != null && mediaAnterior > 0)
    ? ((mediaRecente - mediaAnterior) / mediaAnterior) * 100
    : null;

  if (evolucao == null) {
    setMetricEmpty(els.evolucaoValue, els.evolucaoHint, corrigidas.length === 0
      ? "Aparece depois de simulados em pelo menos 2 momentos diferentes."
      : "Continue praticando nos próximos dias pra vermos sua evolução.");
  } else {
    setMetricValue(els.evolucaoValue, els.evolucaoHint,
      `${evolucao >= 0 ? "+" : ""}${Math.round(evolucao)}%`, evolucao >= 0 ? "up" : "down");
  }

  if (tipoStats.peca == null) {
    setMetricEmpty(els.pecaValue, els.pecaHint, "Pratique uma peça pra ver sua média aqui.");
  } else {
    setMetricValue(els.pecaValue, els.pecaHint, `${fmt1(tipoStats.peca)} / 10`);
  }

  if (tipoStats.questao == null) {
    setMetricEmpty(els.questoesValue, els.questoesHint, "Pratique as questões discursivas pra ver sua média aqui.");
  } else {
    setMetricValue(els.questoesValue, els.questoesHint, `${fmt1(tipoStats.questao)} / 10`);
  }
}

// -------------------------------------------------------------- Histórico

function renderHistoryPanel() {
  const corrigidas = minhasTentativas.filter(t => t.status === "corrigida");

  if (corrigidas.length === 0) {
    els.historyEmpty.hidden = false;
    els.historyEmptyText.textContent = "Seu histórico aparece aqui depois do seu primeiro simulado corrigido.";
    els.chartWrap.hidden = true;
    els.lastList.hidden = true;
    return;
  }

  els.historyEmpty.hidden = true;

  const porDataDesc = corrigidas.slice()
    .sort((a, b) => new Date(b.finished_at || b.started_at) - new Date(a.finished_at || a.started_at));
  renderLastList(porDataDesc);

  const porDataAsc = corrigidas.slice()
    .sort((a, b) => new Date(a.finished_at || a.started_at) - new Date(b.finished_at || b.started_at))
    .slice(-8);
  renderChart(porDataAsc);
}

function renderLastList(corrigidasDesc) {
  els.lastList.hidden = false;
  const media = corrigidasDesc.reduce((a, t) => a + notaPct(t.nota_total, t.valor_total), 0) / corrigidasDesc.length;

  els.lastList.innerHTML = "";
  corrigidasDesc.slice(0, 5).forEach(t => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "sim2-last-item";

    const main = document.createElement("span");
    main.className = "sim2-last-item-main";
    const titleRow = document.createElement("span");
    titleRow.className = "sim2-last-item-title-row";
    const dot = document.createElement("span");
    dot.className = "sim2-last-item-dot";
    dot.style.setProperty("--dot-color", `var(${MODO_DOT_VAR[t.modo] || MODO_DOT_VAR.completo})`);
    const title = document.createElement("span");
    title.className = "sim2-last-item-title";
    title.textContent = `${t.exam_number}º Exame · ${t.area}`;
    titleRow.append(dot, title);
    const sub = document.createElement("span");
    sub.className = "sim2-last-item-sub";
    const dataStr = t.finished_at ? new Date(t.finished_at).toLocaleDateString("pt-BR") : "—";
    sub.textContent = `${MODO_LABELS[t.modo] || MODO_LABELS.completo} · ${dataStr}`;
    main.append(titleRow, sub);

    const side = document.createElement("span");
    side.className = "sim2-last-item-side";
    const nota = document.createElement("span");
    nota.className = "sim2-last-item-nota";
    nota.innerHTML = `${fmtValor(t.nota_total)} <span class="den">/ ${fmtValor(t.valor_total)}</span>`;
    const diff = notaPct(t.nota_total, t.valor_total) - media;
    const tag = document.createElement("span");
    tag.className = "sim2-last-item-tag " + (diff > 0.3 ? "up" : diff < -0.3 ? "down" : "mid");
    tag.textContent = diff > 0.3 ? "Acima da sua média" : diff < -0.3 ? "Abaixo da média" : "Na média";
    side.append(nota, tag);

    item.append(main, side);
    item.addEventListener("click", () => openResultadoHistorico(t));
    els.lastList.appendChild(item);
  });
}

// Grafico de linha em SVG puro (mesma filosofia do anel de progresso da 1a
// fase, ver buildProgressRingSVG em estudos.js — sem lib nenhuma).
function renderChart(corrigidasAsc) {
  if (corrigidasAsc.length < 2) {
    els.chartWrap.hidden = true;
    return;
  }
  els.chartWrap.hidden = false;

  const pts = corrigidasAsc.map(t => notaPct(t.nota_total, t.valor_total));
  const w = 260, h = 150;
  const padX = 18, padTop = 20, padBottom = 26;
  const plotTop = padTop, plotBottom = h - padBottom;
  const stepX = pts.length > 1 ? (w - padX * 2) / (pts.length - 1) : 0;

  const coords = pts.map((v, i) => {
    const x = padX + i * stepX;
    const clamped = Math.max(0, Math.min(10, v));
    const y = plotTop + (plotBottom - plotTop) * (1 - clamped / 10);
    return [x, y];
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c[0].toFixed(1)} ${c[1].toFixed(1)}`).join(" ");
  const lastX = coords[coords.length - 1][0].toFixed(1);
  const firstX = coords[0][0].toFixed(1);
  const areaPath = `${linePath} L ${lastX} ${plotBottom} L ${firstX} ${plotBottom} Z`;

  // Grade horizontal em 0/5/10 — antes o grafico nao tinha nenhuma
  // referencia de escala, so' a linha solta (dava pra ver a tendencia mas
  // nao "quao boa" e' a nota sem olhar os rotulos de cada ponto).
  const gridSvg = [0, 5, 10].map(v => {
    const y = (plotTop + (plotBottom - plotTop) * (1 - v / 10)).toFixed(1);
    return `<line class="sim2-chart-grid" x1="${padX}" y1="${y}" x2="${w - padX}" y2="${y}"></line>` +
      `<text class="sim2-chart-axis-label" x="0" y="${(Number(y) + 3).toFixed(1)}">${v}</text>`;
  }).join("");

  const marksSvg = coords.map((c, i) => {
    const t = corrigidasAsc[i];
    const dataLabel = new Date(t.finished_at || t.started_at)
      .toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const tooltip = `${t.exam_number}º Exame · ${t.area} — ${fmt1(pts[i])}/10 em ${dataLabel}`;
    return `<circle class="sim2-chart-dot" cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="3.5"><title>${tooltip}</title></circle>` +
      `<text class="sim2-chart-value" x="${c[0].toFixed(1)}" y="${(c[1] - 8).toFixed(1)}" text-anchor="middle">${fmt1(pts[i])}</text>` +
      `<text x="${c[0].toFixed(1)}" y="${h - 6}" text-anchor="middle">${dataLabel}</text>`;
  }).join("");

  els.chartWrap.innerHTML = `
    <svg class="sim2-chart-svg" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="sim2ChartGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style="stop-color:var(--primary);stop-opacity:0.28"></stop>
          <stop offset="100%" style="stop-color:var(--primary);stop-opacity:0"></stop>
        </linearGradient>
      </defs>
      ${gridSvg}
      <path class="sim2-chart-area" d="${areaPath}"></path>
      <path class="sim2-chart-line" d="${linePath}"></path>
      ${marksSvg}
    </svg>`;
}

// ------------------------------------------------- Próximo treino (IA)

function focarPickerNaArea(area) {
  const prova = provas.find(p => p.area === area);
  if (prova) {
    els.selExame.value = String(prova.exam_number);
    populateAreaSelect();
    els.selArea.value = prova.id;
  }
  els.heroFormState.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Recomendacao real (area com a pior media do proprio aluno, comparada as
// demais) — sem IA generativa, so' os dados que ja existem, com um nivel de
// prioridade calculado a partir da propria nota. So' aparece com pelo menos
// 2 areas distintas corrigidas (senao "a pior area" nao significa nada —
// seria so' a unica area praticada).
function renderRecommendation() {
  const corrigidas = minhasTentativas.filter(t => t.status === "corrigida");

  const porArea = new Map();
  corrigidas.forEach(t => {
    if (!porArea.has(t.area)) porArea.set(t.area, []);
    porArea.get(t.area).push(notaPct(t.nota_total, t.valor_total));
  });

  if (porArea.size < 2) {
    els.recommendEmpty.hidden = false;
    els.recommendBody.hidden = true;
    els.recommendEmptyText.textContent = corrigidas.length === 0
      ? "Faça alguns simulados pra IA identificar seu próximo treino recomendado."
      : "Pratique pelo menos 2 áreas do Direito pra recebermos uma recomendação.";
    return;
  }

  let pior = null;
  porArea.forEach((valores, area) => {
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    if (!pior || media < pior.media) pior = { area, media };
  });

  els.recommendEmpty.hidden = true;
  els.recommendBody.hidden = false;

  const priority = pior.media < 5 ? { label: "Alta prioridade", cls: "high" }
    : pior.media < 7 ? { label: "Prioridade média", cls: "medium" }
    : { label: "Reforço leve", cls: "low" };

  els.recommendPriority.textContent = priority.label;
  els.recommendPriority.className = "sim2-priority-badge " + priority.cls;
  els.recommendArea.textContent = pior.area;
  els.recommendText.textContent = priority.cls === "low"
    ? `Seu desempenho está sólido em todas as áreas praticadas — ${pior.area} (${fmt1(pior.media)} / 10) é a que mais pode subir. Treine pra manter o ritmo.`
    : `${pior.area} está com a nota média mais baixa entre suas áreas praticadas (${fmt1(pior.media)} / 10). Focar nela agora é o que mais eleva sua nota geral.`;
  els.recommendBtn.textContent = `Treinar ${pior.area} agora →`;
  els.recommendBtn.onclick = () => focarPickerNaArea(pior.area);
}

// -------------------------------------------------------- Como funciona

els.howToggle.addEventListener("click", () => {
  const expanded = els.howToggle.getAttribute("aria-expanded") === "true";
  els.howToggle.setAttribute("aria-expanded", String(!expanded));
  els.howContent.hidden = expanded;
});

async function refreshDashboard() {
  dashboardLoadError = false;
  await Promise.all([loadMinhasTentativas(), loadMinhasRespostas()]);
  const tipoStats = computeTipoStats();
  renderStreakPill();
  await renderHero();
  renderFocusStrip(tipoStats);
  renderPerfPanel(tipoStats);
  renderHistoryPanel();
  renderRecommendation();
  els.dashboardError.hidden = !dashboardLoadError;
}

els.dashboardRetryBtn.addEventListener("click", () => {
  els.dashboardRetryBtn.disabled = true;
  els.dashboardRetryBtn.textContent = "Atualizando...";
  refreshDashboard().finally(() => {
    els.dashboardRetryBtn.disabled = false;
    els.dashboardRetryBtn.textContent = "Tentar de novo";
  });
});

// ---------------------------------------------------------------- Init
//
// requireAuth() ANTES de tudo — sem sessão válida, redireciona pra' landing
// e nem chega a carregar cadernos/dashboard (mesmo formato de init() em
// estudos/estudos.js).
(async () => {
  const session = await requireAuth();
  if (!session) return; // requireAuth() já redirecionou pra' landing page

  currentSession = session;
  updateSessionUI();
  await applySegundaFaseLock();
  initPicker();
})();
