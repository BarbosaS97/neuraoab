const SUPABASE_URL = "https://lgcphxncteqpbntnlzhe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnY3BoeG5jdGVxcGJudG5semhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NzI5NTIsImV4cCI6MjEwMzM0ODk1Mn0.gQltbgj-OPpDEPuyOSonM3G8h1ppwwez0Dwi3SOdx98";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebarToggle");
const brandLogo = document.getElementById("brandLogo");
const viewer = document.getElementById("viewer");
const qlistEl = document.getElementById("qlist");
const qlistCountEl = document.getElementById("qlistCount");
const filterCountEl = document.getElementById("filterCount");
const fYear = document.getElementById("fYear");
const fExam = document.getElementById("fExam");
const fDisc = document.getElementById("fDisc");
const clearFiltersBtn = document.getElementById("clearFilters");
const scoreText = document.getElementById("scoreText");
const resetScoreBtn = document.getElementById("resetScore");
const loadingSplash = document.getElementById("loadingSplash");
const loadingImage = document.getElementById("loadingImage");
const loadingMessage = document.getElementById("loadingMessage");
const loadingStartBtn = document.getElementById("loadingStartBtn");

let allQuestions = [];
let filtered = [];
let currentIndex = 0;
let selectedAnswer = null;
let results = new Map(); // question id -> { letter, correct }
let correctCount = 0;
let answeredCount = 0;

// ---------------------------------------------------------------- Sidebar
//
// O menu comeca sempre recolhido (so a faixa fina encostada na borda
// esquerda, com a alca pequena para abrir) e so expande quando o usuario
// clica na alca — tanto no mobile quanto no desktop. Como o layout usa
// flexbox normal (sem position: fixed), o conteudo principal e "empurrado"
// automaticamente quando a largura do menu muda, sem precisar de JS
// adicional para isso.

function setSidebarExpanded(expanded) {
  sidebar.classList.toggle("expanded", expanded);
  brandLogo.classList.toggle("expanded", expanded);
  sidebarToggle.setAttribute("aria-expanded", String(expanded));
  sidebarToggle.setAttribute("aria-label", expanded ? "Recolher menu" : "Expandir menu");
  // Impede foco/tab em campos que estao visualmente cortados quando recolhido.
  const scrollArea = sidebar.querySelector(".sidebar-scroll");
  if (expanded) scrollArea.removeAttribute("inert");
  else scrollArea.setAttribute("inert", "");
}

sidebarToggle.addEventListener("click", () => {
  setSidebarExpanded(!sidebar.classList.contains("expanded"));
});

// A logo fica bem perto da alca de abrir o menu quando ele esta recolhido —
// clicando ali, o usuario pode achar que vai expandir o menu e, em vez
// disso, ser levado pra landing page sem querer. Com o menu recolhido, o
// clique na logo nao faz nada; expandido, funciona normalmente como link
// pra landing page (nao ha mais essa ambiguidade de proposito).
brandLogo.addEventListener("click", (ev) => {
  if (!sidebar.classList.contains("expanded")) {
    ev.preventDefault();
  }
});

setSidebarExpanded(false);

// ------------------------------------------------------------------ Mode
//
// Escopado por ".mode-switch" (nao por todos os ".mode-btn" da pagina de
// uma vez) — sao dois grupos independentes (Pratica/Simulado e
// Escuro/Claro), cada um com sua propria selecao unica.

document.querySelectorAll(".mode-switch").forEach(group => {
  const buttons = group.querySelectorAll(".mode-btn");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      buttons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      if (btn.dataset.themeBtn) applyTheme(btn.dataset.themeBtn);
    });
  });
});

// ------------------------------------------------------------------ Tema

const THEME_STORAGE_KEY = "neuraoab-theme";

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.querySelectorAll("[data-theme-btn]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.themeBtn === theme);
  });
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // localStorage indisponivel (modo privado, etc.) — o tema so' nao
    // persiste entre sessoes, mas continua funcionando na atual.
  }
}

(function initTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // idem — segue com o padrao (escuro).
  }
  applyTheme(saved === "light" ? "light" : "dark");
})();

// ----------------------------------------------------------------- Score

function updateScoreUI() {
  scoreText.textContent = `${correctCount} / ${answeredCount}`;
}

resetScoreBtn.addEventListener("click", () => {
  results = new Map();
  correctCount = 0;
  answeredCount = 0;
  updateScoreUI();
  renderList();
});

// --------------------------------------------------------------- Filters
//
// Os 4 filtros sao mutuamente dependentes (nao so' Ano -> Exame): mudar
// qualquer um deles recalcula as opcoes disponiveis nos OUTROS 3 com base
// no que sobra depois da combinacao atual — assim nunca da' pra escolher
// uma combinacao impossivel (ex.: um exame que nao existe naquele ano) sem
// perceber, e cada opcao mostra quantas questoes ela de fato tem.

function uniqueSorted(arr) {
  return [...new Set(arr)].sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
}

function getFilterCriteria() {
  return {
    year: fYear.value,
    exam: fExam.value,
    disc: fDisc.value,
  };
}

// `excludeKey` deixa de fora um dos 3 criterios — usado para calcular, para
// cada select, quais opcoes fazem sentido dada a combinacao dos OUTROS 2
// (nao faria sentido o proprio filtro se restringir com base nele mesmo).
function matchesCriteria(q, criteria, excludeKey) {
  if (excludeKey !== "year" && criteria.year !== "all" && String(q.year) !== criteria.year) return false;
  if (excludeKey !== "exam" && criteria.exam !== "all" && String(q.exam_number ?? "__none__") !== criteria.exam) return false;
  if (excludeKey !== "disc" && criteria.disc !== "all" && (q.discipline || "__none__") !== criteria.disc) return false;
  return true;
}

function buildCounts(rows, keyFn) {
  const counts = new Map();
  rows.forEach(q => {
    const key = keyFn(q);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}

// Reconstroi um <select>: opcao "Todos" (com o total), depois uma opcao por
// chave valida com sua contagem. Preserva a selecao atual quando a chave
// ainda esta disponivel; caso contrario, volta para "Todos".
function rebuildSelect(selectEl, keys, counts, totalCount, allLabel, formatLabel) {
  const previous = selectEl.value;
  selectEl.innerHTML = "";
  selectEl.appendChild(new Option(`${allLabel} (${totalCount})`, "all"));
  keys.forEach(key => {
    selectEl.appendChild(new Option(formatLabel(key, counts.get(key) || 0), key));
  });
  selectEl.value = keys.some(k => String(k) === previous) ? previous : "all";
}

const FILTER_SELECTS = { year: fYear, exam: fExam, disc: fDisc };

// Quando o usuario muda um filtro (changedKey) para um valor que, combinado
// com os OUTROS 2 ja' selecionados, nao tem nenhuma questao, alguem tem que
// ceder. A escolha que o usuario acabou de fazer e' sempre a que vale —
// entao so' os outros campos sao candidatos a voltar para "Todos", nunca o
// changedKey. Cada outro campo e' testado par-a-par contra o changedKey
// (ignorando o demais), pra nao ficar preso a uma combinacao desatualizada:
// se aquele par sozinho ja' nao existe, esse campo cede.
function settleFilterConflicts(changedKey) {
  if (!changedKey) return;

  const criteria = getFilterCriteria();
  const changedValue = criteria[changedKey];
  if (changedValue === "all") return;

  Object.keys(FILTER_SELECTS).forEach(key => {
    if (key === changedKey) return;
    const el = FILTER_SELECTS[key];
    if (el.value === "all") return;

    const pair = { year: "all", exam: "all", disc: "all" };
    pair[changedKey] = changedValue;
    pair[key] = criteria[key];

    const stillCompatible = allQuestions.some(q => matchesCriteria(q, pair, null));
    if (!stillCompatible) el.value = "all";
  });
}

// Recalcula as opcoes (e contagens) dos 3 selects com base na combinacao
// atual dos outros — assim nunca da' pra escolher, sem perceber, uma
// combinacao que não existe (ex.: um exame que nao teve questao daquela
// disciplina). `changedKey` (o filtro que o usuario acabou de mexer, se for
// o caso) e' protegido de ser resetado — ver settleFilterConflicts.
function refreshFilterOptions(changedKey) {
  settleFilterConflicts(changedKey);

  const criteria = getFilterCriteria();

  const rowsForYear = allQuestions.filter(q => matchesCriteria(q, criteria, "year"));
  const years = uniqueSorted(rowsForYear.map(q => q.year)).sort((a, b) => b - a);
  rebuildSelect(fYear, years, buildCounts(rowsForYear, q => q.year), rowsForYear.length,
    "Todos", (y, c) => `${y} (${c})`);

  const rowsForExam = allQuestions.filter(q => matchesCriteria(q, criteria, "exam"));
  const exams = uniqueSorted(rowsForExam.map(q => q.exam_number ?? "__none__"))
    .sort((a, b) => (a === "__none__" ? 1 : b === "__none__" ? -1 : b - a));
  rebuildSelect(fExam, exams, buildCounts(rowsForExam, q => q.exam_number ?? "__none__"), rowsForExam.length,
    "Todos", (e, c) => (e === "__none__" ? `(sem exame) (${c})` : `${e}º Exame (${c})`));

  const rowsForDisc = allQuestions.filter(q => matchesCriteria(q, criteria, "disc"));
  const discs = uniqueSorted(rowsForDisc.map(q => q.discipline || "__none__"))
    .sort((a, b) => (a === "__none__" ? 1 : b === "__none__" ? -1 : 0));
  rebuildSelect(fDisc, discs, buildCounts(rowsForDisc, q => q.discipline || "__none__"), rowsForDisc.length,
    "Todas", (d, c) => (d === "__none__" ? `(sem disciplina) (${c})` : `${d} (${c})`));
}

function applyFilters() {
  const criteria = getFilterCriteria();
  filtered = allQuestions.filter(q => matchesCriteria(q, criteria, null));

  filterCountEl.textContent = `${filtered.length} questão(ões) encontrada(s)`;
  qlistCountEl.textContent = filtered.length;
  clearFiltersBtn.hidden = criteria.year === "all" && criteria.exam === "all" && criteria.disc === "all";
  currentIndex = 0;
  selectedAnswer = null;
  renderList();
  renderQuestion();
}

function clearFilters() {
  fYear.value = "all";
  fExam.value = "all";
  fDisc.value = "all";
  refreshFilterOptions(null);
  applyFilters();
}

Object.keys(FILTER_SELECTS).forEach(key => {
  FILTER_SELECTS[key].addEventListener("change", () => {
    refreshFilterOptions(key);
    applyFilters();
  });
});

clearFiltersBtn.addEventListener("click", clearFilters);

// ------------------------------------------------------------- Question list

function renderList() {
  qlistEl.innerHTML = "";
  filtered.forEach((q, idx) => {
    const btn = document.createElement("button");
    btn.className = "qitem" + (idx === currentIndex ? " active" : "");
    btn.type = "button";

    const dot = document.createElement("span");
    const outcome = results.get(q.id);
    dot.className = "status-dot" + (outcome ? (outcome.correct ? " correct" : " wrong") : "");

    const num = document.createElement("span");
    num.className = "num";
    num.textContent = `#${q.number}`;

    btn.append(dot, num);
    btn.addEventListener("click", () => goToIndex(idx));
    qlistEl.appendChild(btn);
  });
}

function goToIndex(idx) {
  currentIndex = idx;
  selectedAnswer = null;
  renderList();
  renderQuestion();
}

// ---------------------------------------------------------------- Question

const SCISSORS_ICON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="6" cy="6" r="3"></circle>
  <circle cx="6" cy="18" r="3"></circle>
  <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
  <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
  <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
</svg>`;

function parseLetter(altString) {
  const m = String(altString).match(/^\s*([A-Da-d])\)/);
  return m ? m[1].toUpperCase() : null;
}

function stripLetter(altString) {
  return String(altString).replace(/^\s*[A-Da-d]\)\s*/, "");
}

function buildMetaBadges(q) {
  const meta = document.createElement("div");
  meta.className = "meta";
  [
    q.exam_number ? `${q.exam_number}º Exame` : "Exame não informado",
    `Ano ${q.year}`,
    q.exam_type,
    `Questão ${q.number}`
  ].forEach(txt => {
    const b = document.createElement("span");
    b.className = "badge";
    b.textContent = txt;
    meta.appendChild(b);
  });
  if (q.discipline) {
    const b = document.createElement("span");
    b.className = "badge discipline";
    b.textContent = q.discipline;
    meta.appendChild(b);
  }
  return meta;
}

function buildNavButtons() {
  const navButtons = document.createElement("div");
  navButtons.className = "nav-buttons";

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.textContent = "Anterior";
  prevBtn.disabled = currentIndex === 0;
  prevBtn.addEventListener("click", () => goToIndex(currentIndex - 1));

  const pos = document.createElement("span");
  pos.className = "pos";
  pos.textContent = `Questão ${currentIndex + 1} de ${filtered.length}`;

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.textContent = "Próxima";
  nextBtn.disabled = currentIndex === filtered.length - 1;
  nextBtn.addEventListener("click", () => goToIndex(currentIndex + 1));

  navButtons.append(prevBtn, pos, nextBtn);
  return navButtons;
}

// Preenche `body` com enunciado + alternativas de uma questao ja com os
// dados completos carregados (q.statement / q.alternatives definidos).
function renderQuestionBody(q, body) {
  body.innerHTML = "";
  body.className = "question-body";

  const correctLetter = String(q.correct_answer).trim().toUpperCase();
  const previous = results.get(q.id);

  const statement = document.createElement("div");
  statement.className = "statement";
  statement.textContent = q.statement;
  body.appendChild(statement);

  const alternatives = Array.isArray(q.alternatives) ? q.alternatives : [];
  const altList = document.createElement("div");
  altList.className = "alternatives";
  body.appendChild(altList);

  const feedbackEl = document.createElement("div");

  const altButtons = alternatives.map(altStr => {
    const letter = parseLetter(altStr);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "alt";

    const letterEl = document.createElement("span");
    letterEl.className = "letter";
    letterEl.textContent = letter || "?";

    const textEl = document.createElement("span");
    textEl.textContent = stripLetter(altStr);

    btn.append(letterEl, textEl);
    btn.addEventListener("click", () => handleAnswer(q, letter, correctLetter, altButtons, feedbackEl));

    // Tesoura: risca a alternativa pra ajudar no raciocinio ("elimina" ela
    // visualmente), sem interferir na resposta em si — e' so' um rascunho,
    // o aluno pode riscar quantas quiser e desfazer clicando de novo.
    const eliminateBtn = document.createElement("button");
    eliminateBtn.type = "button";
    eliminateBtn.className = "alt-eliminate";
    eliminateBtn.setAttribute("aria-label", `Eliminar alternativa ${letter || ""}`.trim());
    eliminateBtn.innerHTML = SCISSORS_ICON;
    eliminateBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const eliminated = btn.classList.toggle("eliminated");
      eliminateBtn.classList.toggle("active", eliminated);
      eliminateBtn.setAttribute("aria-pressed", String(eliminated));
    });

    const row = document.createElement("div");
    row.className = "alt-row";
    row.append(btn, eliminateBtn);
    altList.appendChild(row);
    return { btn, letter, eliminateBtn };
  });

  body.appendChild(feedbackEl);

  if (previous) {
    selectedAnswer = previous.letter;
    revealAnswer(altButtons, correctLetter, previous.correct ? null : previous.letter, feedbackEl);
  }
}

// Todas as questoes (enunciado e alternativas incluidos) ja' foram
// carregadas de uma vez so' na tela de carregamento (ver init(), mais
// abaixo) — entao renderizar uma questao aqui e' sempre sincrono, sem
// nenhuma busca de rede no meio.
function renderQuestion() {
  if (filtered.length === 0) {
    viewer.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.append("Nenhuma questão encontrada para os filtros selecionados. ");
    const clearLink = document.createElement("button");
    clearLink.type = "button";
    clearLink.className = "btn-link";
    clearLink.textContent = "Limpar filtros";
    clearLink.addEventListener("click", clearFilters);
    empty.appendChild(clearLink);
    viewer.appendChild(empty);
    document.dispatchEvent(new CustomEvent("question:changed", { detail: null }));
    return;
  }

  const q = filtered[currentIndex];

  // Reinicia a animacao de entrada do card (definida via CSS em
  // .question-card) a cada troca de questao — sem isso, ela so tocaria
  // uma vez, na primeira vez que a pagina carrega, ja' que o #viewer
  // nunca e' recriado, so' o conteudo dele muda.
  viewer.style.animation = "none";
  void viewer.offsetWidth;
  viewer.style.animation = "";

  viewer.innerHTML = "";
  viewer.appendChild(buildMetaBadges(q));

  const body = document.createElement("div");
  viewer.appendChild(body);
  viewer.appendChild(buildNavButtons());

  renderQuestionBody(q, body);
  document.dispatchEvent(new CustomEvent("question:changed", { detail: q }));
}

function revealAnswer(altButtons, correctLetter, wrongLetter, feedbackEl) {
  altButtons.forEach(({ btn, letter, eliminateBtn }) => {
    btn.disabled = true;
    btn.classList.remove("eliminated");
    eliminateBtn.disabled = true;
    eliminateBtn.classList.remove("active");
    if (letter === correctLetter) btn.classList.add("correct");
    else if (letter === wrongLetter) btn.classList.add("wrong");
  });

  feedbackEl.className = "feedback " + (wrongLetter ? "wrong" : "correct");
  feedbackEl.textContent = wrongLetter
    ? `Incorreto. Gabarito: ${correctLetter}`
    : "Correto!";
}

function handleAnswer(q, letter, correctLetter, altButtons, feedbackEl) {
  if (selectedAnswer !== null) return;
  selectedAnswer = letter;

  const isCorrect = letter === correctLetter;
  revealAnswer(altButtons, correctLetter, isCorrect ? null : letter, feedbackEl);

  if (!results.has(q.id)) {
    results.set(q.id, { letter, correct: isCorrect });
    answeredCount++;
    if (isCorrect) correctCount++;
    updateScoreUI();
    renderList();
  }
}

// -------------------------------------------------------------- Keyboard

document.addEventListener("keydown", (ev) => {
  if (ev.target.tagName === "SELECT") return;
  if (filtered.length === 0) return;
  if (ev.key === "ArrowRight" && currentIndex < filtered.length - 1) goToIndex(currentIndex + 1);
  if (ev.key === "ArrowLeft" && currentIndex > 0) goToIndex(currentIndex - 1);
});

// ------------------------------------------------------------------- Init

// O PostgREST (Supabase) limita cada resposta a 1000 linhas por padrao,
// mesmo sem um .limit() explicito — sem paginar, o banco parece ter so
// 1000 questoes mesmo quando tem mais. Buscamos em paginas ate a API
// devolver menos que o tamanho da pagina (ou nada), sinal de que chegamos
// ao fim.
const PAGE_SIZE = 1000;

// Busca TODAS as colunas de TODAS as questoes de uma vez (enunciado e
// alternativas incluidos) — de proposito, mesmo sendo mais pesado que so'
// os campos leves: e' isso que permite, depois da tela de carregamento,
// navegar entre questoes sem nenhuma espera nem busca de rede no meio.
const QUESTION_COLUMNS = "id, year, exam_number, exam_type, number, discipline, correct_answer, statement, alternatives";

async function fetchAllQuestions() {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await client
      .from("oab_questions")
      .select(QUESTION_COLUMNS)
      .order("year", { ascending: false })
      .order("exam_number", { ascending: false })
      .order("exam_type", { ascending: true })
      .order("number", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

// Troca a tela de carregamento de "carregando" pra "pronto pra comecar":
// para a animacao de pulso, atualiza a mensagem e revela o botao. So'
// desaparece de fato quando o aluno clica nele (nao sozinha), pra dar
// tempo de ler a orientacao sobre o menu e o chat.
let loadingMode = "loading"; // "loading" | "ready" | "error"

function showLoadingReady() {
  loadingMode = "ready";
  loadingSplash.classList.add("ready");
  loadingMessage.textContent = "Questões carregadas. Abra o menu no lado esquerdo para configurar os " +
    "parâmetros e abra o chat com Dr. Laureano do lado direito para tirar dúvidas sobre as questões.";
  loadingStartBtn.hidden = false;
  loadingStartBtn.focus();
}

function showLoadingError(message) {
  loadingMode = "error";
  loadingSplash.classList.add("ready");
  loadingMessage.textContent = message;
  loadingMessage.classList.add("loading-error");
  loadingStartBtn.hidden = false;
  loadingStartBtn.textContent = "Tentar novamente";
}

loadingStartBtn.addEventListener("click", () => {
  if (loadingMode === "error") location.reload();
  else loadingSplash.remove();
});

async function init() {
  let data;
  try {
    data = await fetchAllQuestions();
  } catch (error) {
    showLoadingError(`Erro ao carregar questões: ${error.message}`);
    filterCountEl.textContent = "Erro ao carregar.";
    return;
  }

  allQuestions = data || [];

  if (allQuestions.length === 0) {
    showLoadingError("Nenhuma questão no banco ainda. Importe um JSON na aba Admin.");
    filterCountEl.textContent = "0 questão(ões) encontrada(s)";
    return;
  }

  refreshFilterOptions(null);
  applyFilters();
  showLoadingReady();
}

init();
