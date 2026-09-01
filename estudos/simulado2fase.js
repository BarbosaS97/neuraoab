// Simulado de Prática — 2ª Fase (NeuraOAB)
//
// Fluxo: aluno escolhe exame + área -> responde a peça profissional e as 4
// questões discursivas -> "Finalizar" dispara uma correção por IA por item
// (Edge Function corretor-2fase) -> nota + feedback item a item.
//
// Sem login (so' a anon key do Supabase) continua sendo o modo padrao do
// site inteiro — por isso identificamos o aluno por um UUID anonimo gerado
// no primeiro acesso e guardado no localStorage (ALUNO_ID_KEY). Isso nao
// protege as respostas de um aluno contra outro que tenha a anon key (ver
// nota grande em supabase/schema_fase2.sql); e' so' uma identidade de
// conveniencia para retomar o progresso no mesmo navegador. Login (opcional,
// ver currentSession abaixo) so' existe pra quem foi convidado por um
// professor (ver professor-portal/) — quando logado, a tentativa tambem
// grava user_id, alem do aluno_id anonimo, pra aparecer no Portal do
// Professor (ver supabase/schema_professor_portal.sql).

const SUPABASE_URL = "https://lgcphxncteqpbntnlzhe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnY3BoeG5jdGVxcGJudG5semhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NzI5NTIsImV4cCI6MjEwMzM0ODk1Mn0.gQltbgj-OPpDEPuyOSonM3G8h1ppwwez0Dwi3SOdx98";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ALUNO_ID_KEY = "neuraoab_aluno_id";
const DRAFT_KEY_PREFIX = "sim2_draft_"; // + provaId + "_" + itemId
const TENTATIVA_PTR_PREFIX = "sim2_tentativa_ptr_"; // + provaId -> tentativa id

function getAlunoId() {
  try {
    let id = localStorage.getItem(ALUNO_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ALUNO_ID_KEY, id);
    }
    return id;
  } catch {
    // localStorage indisponivel — usa um id so' desta sessao (nao retoma
    // entre visitas, mas o simulado continua funcionando).
    return crypto.randomUUID();
  }
}

const ALUNO_ID = getAlunoId();

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

// -------------------------------------------------------------- Elementos

const els = {
  viewPicker: document.getElementById("viewPicker"),
  viewCaderno: document.getElementById("viewCaderno"),
  viewCorrigindo: document.getElementById("viewCorrigindo"),
  viewResultado: document.getElementById("viewResultado"),

  pickerLoading: document.getElementById("pickerLoading"),
  pickerForm: document.getElementById("pickerForm"),
  pickerEmpty: document.getElementById("pickerEmpty"),
  pickerError: document.getElementById("pickerError"),
  selExame: document.getElementById("selExame"),
  selArea: document.getElementById("selArea"),
  btnStart: document.getElementById("btnStart"),

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

  menuSessionLoggedOut: document.getElementById("menuSessionLoggedOut"),
  menuSessionLoggedIn: document.getElementById("menuSessionLoggedIn"),
  sessionEmail: document.getElementById("sessionEmail"),
  sessionPassword: document.getElementById("sessionPassword"),
  sessionLoginBtn: document.getElementById("sessionLoginBtn"),
  sessionLoginMsg: document.getElementById("sessionLoginMsg"),
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
// Mesmo mecanismo opcional de estudos/estudos.js (ver comentário lá) — sem
// login, currentSession fica null pra sempre e o simulado funciona
// exatamente como antes (só aluno_id anônimo). Logado, a tentativa criada
// em createTentativa (abaixo) também grava user_id, pra aparecer no
// Portal do Professor. Ao contrário da 1ª fase (login obrigatório), aqui o
// menu tem os dois estados — ver comentário no HTML sobre
// menuSessionLoggedOut/menuSessionLoggedIn.

let currentSession = null;

function updateSessionUI() {
  if (currentSession?.user) {
    const label = currentSession.user.user_metadata?.nome || currentSession.user.email || "?";
    els.menuAvatar.textContent = label.trim().charAt(0).toUpperCase() || "?";
    els.menuUserLabel.textContent = currentSession.user.email;
    els.menuSessionLoggedOut.hidden = true;
    els.menuSessionLoggedIn.hidden = false;
  } else {
    els.menuSessionLoggedOut.hidden = false;
    els.menuSessionLoggedIn.hidden = true;
  }
}

function showSessionLoginMsg(text) {
  els.sessionLoginMsg.textContent = text;
  els.sessionLoginMsg.className = "session-popover-msg show";
}

async function handleSessionLogin() {
  const email = els.sessionEmail.value.trim();
  const password = els.sessionPassword.value;
  if (!email || !password) {
    showSessionLoginMsg("Preencha e-mail e senha.");
    return;
  }

  els.sessionLoginBtn.disabled = true;
  const { error } = await client.auth.signInWithPassword({ email, password });
  els.sessionLoginBtn.disabled = false;

  if (error) {
    showSessionLoginMsg("E-mail ou senha inválidos.");
    return;
  }
  els.sessionPassword.value = "";
  els.sessionLoginMsg.className = "session-popover-msg";
  closeMenu();
}

els.sessionLoginBtn.addEventListener("click", handleSessionLogin);
els.sessionPassword.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter") handleSessionLogin();
});

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

client.auth.onAuthStateChange((_event, session) => {
  currentSession = session;
  updateSessionUI();
});

client.auth.getSession().then(({ data }) => {
  currentSession = data.session;
  updateSessionUI();
});

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
let currentItens = [];        // itens (peca + 4 questoes), com oab2_subitens/oab2_criterios embutidos
let currentTentativa = null;  // {id, status, ...}
let drafts = new Map();       // item_id -> texto
let activeIndex = 0;
let saveTimer = null;

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

els.btnStart.addEventListener("click", () => {
  const provaId = els.selArea.value;
  const prova = provas.find(p => p.id === provaId);
  if (!prova) return;
  els.btnStart.disabled = true;
  els.btnStart.textContent = "Abrindo...";
  openCaderno(prova).finally(() => {
    els.btnStart.disabled = false;
    els.btnStart.textContent = "Abrir caderno";
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
    return;
  }

  populateExameSelect();
  populateAreaSelect();
  els.pickerForm.hidden = false;
}

function backToPicker() {
  currentProva = null;
  currentItens = [];
  currentTentativa = null;
  drafts = new Map();
  showView("viewPicker");
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
    const { data } = await client
      .from("oab2_tentativas")
      .select("*")
      .eq("id", ptr)
      .eq("status", "em_andamento")
      .maybeSingle();
    if (data) return data;
    safeRemoveItem(ptrKey);
  }

  // Segundo caminho de retomada, só pra quem está logado: o ponteiro acima
  // é por navegador (localStorage), então trocar de dispositivo/navegador
  // logado perderia a tentativa em andamento sem isso — busca por
  // user_id+prova_id+status em vez de confiar só no ponteiro local.
  if (currentSession?.user) {
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
  }

  return null;
}

// Cria a tentativa de fato — started_at grava o momento do clique em
// "Iniciar", que é o que o Portal do Professor mostra como "Iniciado em"
// (ver professor-portal/js/aluno-detail.js, loadFase2).
async function createTentativa(provaId) {
  const { data, error } = await client
    .from("oab2_tentativas")
    .insert({
      aluno_id: ALUNO_ID,
      user_id: currentSession?.user?.id ?? null,
      prova_id: provaId,
      status: "em_andamento",
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
  const locked = !currentTentativa;
  els.itemResposta.disabled = locked;
  els.answerSheet.classList.toggle("locked", locked);
  els.startGate.hidden = !locked;
  els.btnFinalizar.disabled = locked;
}

els.btnIniciarCaderno.addEventListener("click", async () => {
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
  // sessoes/abas diferentes do mesmo navegador)
  const { data } = await client
    .from("oab2_respostas")
    .select("item_id, texto_resposta")
    .eq("tentativa_id", tentativaId);

  (data || []).forEach(r => {
    if (r.texto_resposta) drafts.set(r.item_id, r.texto_resposta);
  });
}

async function openCaderno(prova) {
  els.pickerError.hidden = true;
  try {
    currentProva = prova;
    currentItens = await loadItens(prova.id);
    if (currentItens.length === 0) {
      els.pickerError.hidden = false;
      els.pickerError.textContent = "Este caderno não tem itens importados ainda.";
      return;
    }
    currentTentativa = await findTentativa(prova.id);
    if (currentTentativa) {
      await loadDrafts(prova.id, currentTentativa.id, currentItens);
    } else {
      drafts = new Map();
    }

    activeIndex = 0;
    els.cadernoTitulo.textContent = `${prova.exam_number}º Exame — ${prova.area}`;

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

  els.cadernoSub.textContent = `Valor total: ${fmtValor(currentProva.valor_total)} pontos · ` +
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
    await client.from("oab2_respostas").upsert({
      tentativa_id: currentTentativa.id,
      item_id: item.id,
      texto_resposta: text,
    }, { onConflict: "tentativa_id,item_id" });
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
  await openCaderno(currentProva);
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

    await client.from("oab2_respostas").upsert({
      tentativa_id: currentTentativa.id,
      item_id: item.id,
      texto_resposta: text,
      nota: data.nota_total,
      feedback_geral: data.feedback_geral,
      feedback_criterios: data.criterios || [],
      alertas_juridicos: data.alertas_juridicos || [],
      corrected_at: new Date().toISOString(),
    }, { onConflict: "tentativa_id,item_id" });

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
      await client.from("oab2_respostas").upsert({
        tentativa_id: currentTentativa.id,
        item_id: item.id,
        texto_resposta: text,
        nota: 0,
        feedback_geral: "Não foi possível corrigir este item automaticamente. Tente novamente mais tarde.",
        feedback_criterios: [],
        alertas_juridicos: [],
      }, { onConflict: "tentativa_id,item_id" });
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
    await client.from("oab2_tentativas").update({ status: "corrigindo" }).eq("id", currentTentativa.id);
  } catch { /* segue mesmo se essa atualizacao de status falhar */ }

  currentItens.forEach((item, idx) => setCorrigindoStatus(idx, "pending"));
  const resultados = await Promise.all(currentItens.map((item, idx) => correctItem(item, idx)));

  const notaTotal = resultados.reduce((acc, r) => acc + (r.nota || 0), 0);

  try {
    await client.from("oab2_tentativas").update({
      status: "corrigida",
      nota_total: Math.round(notaTotal * 100) / 100,
      finished_at: new Date().toISOString(),
      corrected_at: new Date().toISOString(),
    }).eq("id", currentTentativa.id);
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
  els.notaTotalDen.textContent = fmtValor(currentProva.valor_total);
  els.resultadoSub.textContent = `${currentProva.exam_number}º Exame — ${currentProva.area}`;

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

els.btnNovoSimulado.addEventListener("click", backToPicker);

// ---------------------------------------------------------------- Init

initPicker();
