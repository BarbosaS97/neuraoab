const SUPABASE_URL = "https://lgcphxncteqpbntnlzhe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnY3BoeG5jdGVxcGJudG5semhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NzI5NTIsImV4cCI6MjEwMzM0ODk1Mn0.gQltbgj-OPpDEPuyOSonM3G8h1ppwwez0Dwi3SOdx98";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const viewer = document.getElementById("viewer");
const scoreText = document.getElementById("scoreText");
const loadingSplash = document.getElementById("loadingSplash");
const loadingImage = document.getElementById("loadingImage");
const loadingMessage = document.getElementById("loadingMessage");
const loadingFeatures = document.getElementById("loadingFeatures");
const loadingStartBtn = document.getElementById("loadingStartBtn");
const helpBtn = document.getElementById("helpBtn");
const helpOverlay = document.getElementById("helpOverlay");
const helpCloseBtn = document.getElementById("helpCloseBtn");
const helpGotItBtn = document.getElementById("helpGotItBtn");
const phaseTab2fase = document.getElementById("phaseTab2fase");

const menuBtn = document.getElementById("menuBtn");
const menuCloseBtn = document.getElementById("menuCloseBtn");
const menuBackdrop = document.getElementById("menuBackdrop");
const menuPanel = document.getElementById("menuPanel");
const menuProfileBtn = document.getElementById("menuProfileBtn");
const menuStatsBtn = document.getElementById("menuStatsBtn");
const menuAvatar = document.getElementById("menuAvatar");
const menuUserLabel = document.getElementById("menuUserLabel");
const sessionLogoutBtn = document.getElementById("sessionLogoutBtn");

const menuConvitesBtn = document.getElementById("menuConvitesBtn");
const convitesBadge = document.getElementById("convitesBadge");
const conviteOverlay = document.getElementById("conviteOverlay");
const conviteCloseBtn = document.getElementById("conviteCloseBtn");
const conviteEmptyMsg = document.getElementById("conviteEmptyMsg");
const conviteList = document.getElementById("conviteList");
const conviteMsg = document.getElementById("conviteMsg");

const profileOverlay = document.getElementById("profileOverlay");
const profileCloseBtn = document.getElementById("profileCloseBtn");
const plansOverlay = document.getElementById("plansOverlay");
const plansCloseBtn = document.getElementById("plansCloseBtn");
const plansGrid = document.getElementById("plansGrid");
const plansModalNote = document.getElementById("plansModalNote");
const checkoutView = document.getElementById("checkoutView");
const checkoutBackBtn = document.getElementById("checkoutBackBtn");
const checkoutTitle = document.getElementById("checkoutTitle");
const checkoutSummaryAmount = document.getElementById("checkoutSummaryAmount");
const checkoutSummaryPeriod = document.getElementById("checkoutSummaryPeriod");
const checkoutCicloSegmented = document.getElementById("checkoutCicloSegmented");
const checkoutBillingSegmented = document.getElementById("checkoutBillingSegmented");
const checkoutForm = document.getElementById("checkoutForm");
const checkoutNome = document.getElementById("checkoutNome");
const checkoutCpf = document.getElementById("checkoutCpf");
const checkoutTelefoneField = document.getElementById("checkoutTelefoneField");
const checkoutTelefone = document.getElementById("checkoutTelefone");
const checkoutCepField = document.getElementById("checkoutCepField");
const checkoutCep = document.getElementById("checkoutCep");
const checkoutAddressNumber = document.getElementById("checkoutAddressNumber");
const checkoutAddressPreview = document.getElementById("checkoutAddressPreview");
const checkoutSubmitBtn = document.getElementById("checkoutSubmitBtn");
const checkoutMsg = document.getElementById("checkoutMsg");
const checkoutAlreadyOwned = document.getElementById("checkoutAlreadyOwned");
const checkoutAlreadyOwnedPlano = document.getElementById("checkoutAlreadyOwnedPlano");
const checkoutResult = document.getElementById("checkoutResult");
const checkoutPixResult = document.getElementById("checkoutPixResult");
const checkoutQrImage = document.getElementById("checkoutQrImage");
const checkoutCopyPixBtn = document.getElementById("checkoutCopyPixBtn");
const checkoutCopyPixLabel = document.getElementById("checkoutCopyPixLabel");
const checkoutBoletoResult = document.getElementById("checkoutBoletoResult");
const checkoutBoletoLink = document.getElementById("checkoutBoletoLink");
const checkoutCardResult = document.getElementById("checkoutCardResult");
const checkoutCardLink = document.getElementById("checkoutCardLink");
const checkoutStatus = document.getElementById("checkoutStatus");
const checkoutStatusSpinner = document.getElementById("checkoutStatusSpinner");
const profilePlanCard = document.getElementById("profilePlanCard");
const profilePlanBadge = document.getElementById("profilePlanBadge");
const profilePlanUpgrade = document.getElementById("profilePlanUpgrade");
const topbarPlanBadge = document.getElementById("topbarPlanBadge");
const topbarPlanBadgeLabel = document.getElementById("topbarPlanBadgeLabel");
const profilePlanUsage = document.getElementById("profilePlanUsage");
const profNome = document.getElementById("profNome");
const profEmail = document.getElementById("profEmail");
const profCursinho = document.getElementById("profCursinho");
const profTelefone = document.getElementById("profTelefone");
const profileMsg = document.getElementById("profileMsg");
const profileSaveBtn = document.getElementById("profileSaveBtn");
const deleteAccountSection = document.getElementById("deleteAccountSection");

const screenExams = document.getElementById("screenExams");
const screenSubjects = document.getElementById("screenSubjects");
const screenStudy = document.getElementById("screenStudy");
const screenStats = document.getElementById("screenStats");
const statsBody = document.getElementById("statsBody");
const backFromStatsBtn = document.getElementById("backFromStatsBtn");
const examGrid = document.getElementById("examGrid");
const subjectGrid = document.getElementById("subjectGrid");
const examSelCount = document.getElementById("examSelCount");
const subjectSelCount = document.getElementById("subjectSelCount");
const examSelectAllBtn = document.getElementById("examSelectAllBtn");
const examSelectAllBtnText = document.getElementById("examSelectAllBtnText");
const subjectSelectAllBtn = document.getElementById("subjectSelectAllBtn");
const subjectSelectAllBtnText = document.getElementById("subjectSelectAllBtnText");
const toSubjectsBtn = document.getElementById("toSubjectsBtn");
const toStudyBtn = document.getElementById("toStudyBtn");
const backToExamsBtn = document.getElementById("backToExamsBtn");
const backToSubjectsBtn = document.getElementById("backToSubjectsBtn");
const examPickFooter = document.getElementById("examPickFooter");
const subjectPickFooter = document.getElementById("subjectPickFooter");

// Dashboard da 1ª fase (Tela 1) — ver seção "Tela 1" mais abaixo.
const dashboardGreeting = document.getElementById("dashboardGreeting");
const laureanoTip = document.getElementById("laureanoTip");
const laureanoTipText = document.getElementById("laureanoTipText");
const laureanoTipBtn = document.getElementById("laureanoTipBtn");
const examFilterTabsEl = document.getElementById("examFilterTabs");
const examCountBadge = document.getElementById("examCountBadge");
const examShowMoreBtn = document.getElementById("examShowMoreBtn");
const progressRingWrap = document.getElementById("progressRingWrap");
const progressRingPct = document.getElementById("progressRingPct");
const progressTotalNum = document.getElementById("progressTotalNum");
const progressAcertosNum = document.getElementById("progressAcertosNum");
const progressErrosNum = document.getElementById("progressErrosNum");
const progressCtaBtn = document.getElementById("progressCtaBtn");
const lastActivityPanel = document.getElementById("lastActivityPanel");
const lastActivityExam = document.getElementById("lastActivityExam");
const lastActivityBadge = document.getElementById("lastActivityBadge");
const lastActivityRingWrap = document.getElementById("lastActivityRingWrap");
const lastActivityPctText = document.getElementById("lastActivityPctText");
const lastActivityDate = document.getElementById("lastActivityDate");
const lastActivityReviewBtn = document.getElementById("lastActivityReviewBtn");

let allQuestions = [];
let filtered = [];
let currentIndex = 0;
let selectedAnswer = null;
let results = new Map(); // question id -> { letter, correct }
let correctCount = 0;
let answeredCount = 0;

let selectedExams = new Set(); // chaves de exam_number (ou "__none__")
let selectedSubjects = new Set(); // disciplinas (ou "__none__")
let examPool = []; // allQuestions filtrado pelos exames selecionados

// ------------------------------------------------------------------- Menu
//
// Painel overlay (nao empurra o layout, ao contrario da antiga barra
// lateral) — abre por cima do conteudo, fecha clicando fora, no X ou com
// Escape.

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

// -------------------------------------------------------------------- Help

function openHelpModal() {
  helpOverlay.hidden = false;
}

function closeHelpModal() {
  helpOverlay.hidden = true;
}

helpBtn.addEventListener("click", openHelpModal);
helpCloseBtn.addEventListener("click", closeHelpModal);
helpGotItBtn.addEventListener("click", closeHelpModal);
helpOverlay.addEventListener("click", (ev) => {
  if (ev.target === helpOverlay) closeHelpModal();
});

// ------------------------------------------------------------------ Planos
//
// Modal "bloco grande" com os planos B2C (Grátis/Básico/Pro) direto no
// dashboard — aberto por qualquer "Fazer upgrade" do app (Meu Perfil, chat,
// cadeados de limite) em vez de navegar pra fora pra landing page. HTML em
// estudos/index.html (#plansOverlay) — os 3 cards já têm o preço/benefícios
// escritos direto lá (mesma copy de index.html, seção #planos); aqui só
// destacamos em qual card o aluno já está (renderPlansModalCurrent).
function renderPlansModalCurrent() {
  const plano = planStatus?.plano || "gratuito";
  document.querySelectorAll(".plan-card").forEach((card) => {
    const isCurrent = card.dataset.plano === plano;
    card.querySelector(".plan-card-current").hidden = !isCurrent;
    const cta = card.querySelector(".plan-card-cta");
    if (cta) cta.hidden = isCurrent;
  });
}

function openPlansModal() {
  renderPlansModalCurrent();
  plansOverlay.hidden = false;
  loadPlanStatus().then(renderPlansModalCurrent);
}

function closePlansModal() {
  plansOverlay.hidden = true;
  closeCheckout();
}

// -------------------------------------------------------------- Checkout
//
// Assinatura de verdade via Asaas (Edge Functions criar-cobranca/
// webhook-asaas, ver supabase/schema_asaas.sql) — PIX, boleto ou cartão de
// crédito. Cartão NUNCA é preenchido nesta tela: o botão leva pra página
// hospedada do próprio Asaas (ver comentário grande em criar-cobranca/
// index.ts sobre PCI-DSS SAQ-D — mandar dado de cartão cru pro nosso
// servidor exigiria uma certificação que este projeto não tem).
//
// Preços aqui são só pra EXIBIÇÃO — duplicados do mesmo mapa fixo que
// existe em criar-cobranca/index.ts (mesmo espírito de plans-grid acima:
// não há uma fonte única de preço compartilhada ainda); quem decide o
// valor cobrado de verdade é sempre o servidor, nunca o que esta tela manda.
const CHECKOUT_PRICES = {
  basico: { MONTHLY: "R$ 11,99", YEARLY: "R$ 119,90" },
  pro: { MONTHLY: "R$ 19,99", YEARLY: "R$ 199,90" },
};
const CHECKOUT_PERIOD_LABEL = { MONTHLY: "/mês", YEARLY: "/ano" };
const CHECKOUT_PLAN_LABELS = { basico: "Básico", pro: "Pro" };

let checkoutPlano = null;
let checkoutCiclo = "MONTHLY";
let checkoutBillingType = "PIX";
let checkoutPollTimer = null;

// Controle segmentado genérico (ver .checkout-segmented no CSS) — troca a
// classe "active" pro botão clicado dentro do MESMO grupo, lê o valor de
// volta de data-ciclo/data-billing. Usado tanto pro ciclo quanto pra forma
// de pagamento, único jeito de eles diferirem é o dataset lido.
function setupSegmented(container, datasetKey, onChange) {
  container.querySelectorAll(".checkout-seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".checkout-seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      onChange(btn.dataset[datasetKey]);
    });
  });
}

// Anual + cartão é a ÚNICA combinação parcelada (ver
// CREDIT_CARD_YEARLY_INSTALLMENTS em criar-cobranca/index.ts — a tela
// hospedada do Asaas, aberta via checkout.link, deixa o PRÓPRIO ALUNO
// escolher de 1x a esse número, recalculando o valor da parcela) — avisa
// aqui ANTES do clique em "Gerar cobrança", pra não ser surpresa só na
// hora de pagar.
const CREDIT_CARD_YEARLY_INSTALLMENTS = 10;

function isParceladoAnual() {
  return checkoutCiclo === "YEARLY" && checkoutBillingType === "CREDIT_CARD";
}

function updateCheckoutSummary() {
  checkoutTitle.textContent = `Plano ${CHECKOUT_PLAN_LABELS[checkoutPlano] ?? ""}`;
  checkoutSummaryAmount.textContent = CHECKOUT_PRICES[checkoutPlano]?.[checkoutCiclo] ?? "";
  checkoutSummaryPeriod.textContent = isParceladoAnual()
    ? `${CHECKOUT_PERIOD_LABEL[checkoutCiclo]} · em até ${CREDIT_CARD_YEARLY_INSTALLMENTS}x no cartão`
    : CHECKOUT_PERIOD_LABEL[checkoutCiclo];
}

// Telefone + endereço só são pedidos pra CREDIT_CARD + YEARLY — é o único
// caminho que usa o Asaas Checkout, que exige telefone e endereço completo
// em customerData (confirmado em produção, um campo obrigatório de cada
// vez: primeiro "phone", depois "address"/"addressNumber"/"postalCode"/
// "province"/"city" — ver comentário grande em criar-cobranca/index.ts).
// PIX/boleto/cartão mensal (assinatura de verdade) não passam por ali,
// então não faz sentido pedir isso de todo mundo.
function updateCreditCardExtrasVisibility() {
  const need = isParceladoAnual();
  checkoutTelefoneField.hidden = !need;
  checkoutTelefone.required = need;
  checkoutCepField.hidden = !need;
  checkoutAddressNumber.required = need;
}

setupSegmented(checkoutCicloSegmented, "ciclo", (value) => {
  checkoutCiclo = value;
  updateCheckoutSummary();
  updateCreditCardExtrasVisibility();
});

setupSegmented(checkoutBillingSegmented, "billing", (value) => {
  checkoutBillingType = value;
  updateCheckoutSummary();
  updateCreditCardExtrasVisibility();
});

// ---------------------------------------------------------- Endereço (CEP)
//
// Só rua/bairro/cidade — o resto (número, complemento) o aluno digita.
// ViaCEP é gratuito, sem chave/autenticação, e devolve o código IBGE do
// município direto ("ibge") — é exatamente o formato que customerData.city
// da Asaas espera (número, não nome da cidade, ver criar-cobranca/index.ts).
let checkoutAddressResolved = null; // { street, neighborhood, city, uf, ibge } | null

async function lookupCep(cepDigits) {
  checkoutAddressResolved = null;
  checkoutAddressPreview.hidden = true;
  checkoutAddressPreview.className = "checkout-address-preview";
  if (cepDigits.length !== 8) return;

  checkoutAddressPreview.hidden = false;
  checkoutAddressPreview.textContent = "Buscando endereço...";

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
    const data = await res.json();
    if (!res.ok || data.erro) {
      checkoutAddressPreview.textContent = "CEP não encontrado — confira e tente de novo.";
      checkoutAddressPreview.className = "checkout-address-preview error";
      return;
    }
    checkoutAddressResolved = {
      street: data.logradouro || "",
      neighborhood: data.bairro || "",
      city: data.localidade || "",
      uf: data.uf || "",
      ibge: data.ibge || "",
    };
    checkoutAddressPreview.textContent = checkoutAddressResolved.street
      ? `${checkoutAddressResolved.street}, ${checkoutAddressResolved.neighborhood} — ${checkoutAddressResolved.city}/${checkoutAddressResolved.uf}`
      : `${checkoutAddressResolved.neighborhood} — ${checkoutAddressResolved.city}/${checkoutAddressResolved.uf}`;
  } catch {
    checkoutAddressPreview.textContent = "Não foi possível buscar o endereço agora — confira o CEP e tente de novo.";
    checkoutAddressPreview.className = "checkout-address-preview error";
  }
}

checkoutCep.addEventListener("input", () => {
  const digits = checkoutCep.value.replace(/\D/g, "").slice(0, 8);
  checkoutCep.value = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
  if (digits.length === 8) lookupCep(digits);
  else {
    checkoutAddressResolved = null;
    checkoutAddressPreview.hidden = true;
  }
});

function stopCheckoutPolling() {
  if (checkoutPollTimer) {
    clearInterval(checkoutPollTimer);
    checkoutPollTimer = null;
  }
}

// Confere a cada poucos segundos se webhook-asaas já confirmou o pagamento
// e liberou o plano — só enquanto esta tela estiver aberta, por
// conveniência (ver o pagamento confirmar "na hora" sem precisar recarregar
// a página). Se o aluno fechar o modal antes de pagar, o plano é liberado
// de qualquer jeito assim que ele voltar (loadPlanStatus roda de novo no
// próximo init()) — este polling não é o mecanismo real de liberação, só
// um feedback mais rápido pra quem ficou esperando aqui.
function startCheckoutPolling(plano) {
  stopCheckoutPolling();
  let attempts = 0;
  const MAX_ATTEMPTS = 40; // ~4 minutos, a cada 6s — cobre bem o caso normal de PIX
  checkoutPollTimer = setInterval(async () => {
    attempts++;
    await loadPlanStatus();
    if (planStatus?.plano === plano) {
      stopCheckoutPolling();
      checkoutStatus.textContent = "Pagamento confirmado! Seu plano foi atualizado. 🎉";
      checkoutStatus.className = "checkout-status ok";
      checkoutStatusSpinner.hidden = true;
      renderPlansModalCurrent();
      renderProfilePlan();
    } else if (attempts >= MAX_ATTEMPTS) {
      stopCheckoutPolling();
    }
  }, 6000);
}

function resetSegmented(container, activeValue, datasetKey) {
  container.querySelectorAll(".checkout-seg-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset[datasetKey] === activeValue);
  });
}

function openCheckout(plano) {
  checkoutPlano = plano;
  checkoutCiclo = "MONTHLY";
  checkoutBillingType = "PIX";
  resetSegmented(checkoutCicloSegmented, "MONTHLY", "ciclo");
  resetSegmented(checkoutBillingSegmented, "PIX", "billing");

  checkoutForm.reset();
  checkoutForm.hidden = false;
  checkoutResult.hidden = true;
  checkoutPixResult.hidden = true;
  checkoutBoletoResult.hidden = true;
  checkoutCardResult.hidden = true;
  checkoutQrImage.src = "";
  checkoutBoletoLink.textContent = "Abrir boleto";
  checkoutMsg.className = "checkout-msg";
  checkoutStatus.className = "checkout-status";
  checkoutStatus.textContent =
    "Assim que o pagamento for confirmado, seu plano é liberado automaticamente — pode fechar esta janela e continuar estudando enquanto isso.";
  checkoutStatusSpinner.hidden = false;
  checkoutSubmitBtn.disabled = false;
  checkoutSubmitBtn.textContent = "Gerar cobrança";
  stopCheckoutPolling();

  updateCheckoutSummary();
  updateCreditCardExtrasVisibility();
  checkoutNome.value = profNome.value || currentSession?.user?.user_metadata?.nome || "";
  checkoutTelefone.value = profTelefone.value || "";
  checkoutCep.value = "";
  checkoutAddressNumber.value = "";
  checkoutAddressResolved = null;
  checkoutAddressPreview.hidden = true;

  plansGrid.hidden = true;
  plansModalNote.hidden = true;
  checkoutView.hidden = false;
  plansOverlay.classList.add("is-checkout");

  // Segunda barreira contra pagar de nova um plano já ativo — a primeira
  // (o botão "Assinar" some do card do plano atual, ver
  // renderPlansModalCurrent) só protege a GRADE; se openCheckout(plano) for
  // chamado mesmo assim pro plano corrente (ex.: planStatus desatualizado
  // no momento do clique), aqui a gente barra antes de mostrar o
  // formulário de pagamento.
  const jaTemEssePlano = planStatus?.plano === plano;
  checkoutForm.hidden = jaTemEssePlano;
  checkoutAlreadyOwned.hidden = !jaTemEssePlano;
  if (jaTemEssePlano) {
    checkoutAlreadyOwnedPlano.textContent = `Plano ${CHECKOUT_PLAN_LABELS[plano] ?? ""}`;
  }
}

function closeCheckout() {
  stopCheckoutPolling();
  checkoutView.hidden = true;
  plansOverlay.classList.remove("is-checkout");
  plansGrid.hidden = false;
  plansModalNote.hidden = false;
}

document.querySelectorAll("[data-checkout-plano]").forEach((btn) => {
  btn.addEventListener("click", () => openCheckout(btn.dataset.checkoutPlano));
});

checkoutBackBtn.addEventListener("click", closeCheckout);

function showCheckoutMsg(text) {
  checkoutMsg.textContent = text;
  checkoutMsg.className = "checkout-msg show";
}

// Máscara leve de CPF ao digitar — só cosmética; a validação de verdade
// (dígito verificador) acontece no servidor, ver isValidCpf em
// criar-cobranca/index.ts.
checkoutCpf.addEventListener("input", () => {
  const digits = checkoutCpf.value.replace(/\D/g, "").slice(0, 11);
  let formatted = digits;
  if (digits.length > 9) formatted = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  else if (digits.length > 6) formatted = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  else if (digits.length > 3) formatted = `${digits.slice(0, 3)}.${digits.slice(3)}`;
  checkoutCpf.value = formatted;
});

// Mesma máscara cosmética do CPF acima, pro telefone (só aparece pra
// CREDIT_CARD + YEARLY, ver updateCreditCardExtrasVisibility).
checkoutTelefone.addEventListener("input", () => {
  const digits = checkoutTelefone.value.replace(/\D/g, "").slice(0, 11);
  let formatted = digits;
  if (digits.length > 10) formatted = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  else if (digits.length > 6) formatted = `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  else if (digits.length > 2) formatted = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  checkoutTelefone.value = formatted;
});

checkoutForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  checkoutMsg.className = "checkout-msg";

  const nome = checkoutNome.value.trim();
  const cpfCnpj = checkoutCpf.value.replace(/\D/g, "");
  const telefone = checkoutTelefone.value.replace(/\D/g, "");
  const cep = checkoutCep.value.replace(/\D/g, "");
  const addressNumber = checkoutAddressNumber.value.trim();
  const ciclo = checkoutCiclo;
  const billingType = checkoutBillingType;

  if (!nome) {
    showCheckoutMsg("Informe seu nome completo.");
    return;
  }
  if (cpfCnpj.length !== 11) {
    showCheckoutMsg("CPF inválido.");
    return;
  }
  // Só CREDIT_CARD + YEARLY passa pelo Asaas Checkout, que exige telefone e
  // endereço completo (ver updateCreditCardExtrasVisibility) — os outros
  // caminhos nem mostram esses campos.
  if (isParceladoAnual()) {
    if (telefone.length < 10) {
      showCheckoutMsg("Informe um telefone válido, com DDD.");
      return;
    }
    if (cep.length !== 8 || !checkoutAddressResolved) {
      showCheckoutMsg("Informe um CEP válido — aguarde o endereço aparecer antes de continuar.");
      return;
    }
    if (!addressNumber) {
      showCheckoutMsg("Informe o número do endereço.");
      return;
    }
  }

  checkoutSubmitBtn.disabled = true;
  checkoutSubmitBtn.textContent = "Gerando cobrança...";

  // PIX vai pra Woovi (gateway de PIX do produto, ver supabase/schema_webhook_woovi.sql)
  // — boleto/cartão continuam no Asaas, que é quem sabe emitir os dois
  // (criar-cobranca-woovi só faz cobrança PIX avulsa, sem billingType no
  // corpo). As duas functions devolvem os MESMOS nomes de campo de
  // propósito (ver comentário em criar-cobranca-woovi/index.ts), então o
  // resto deste handler abaixo não precisa saber qual gateway respondeu —
  // só o formato de pixQrImage difere (ver bloco "PIX" logo adiante).
  const usingWoovi = billingType === "PIX";
  const { data, error } = await client.functions.invoke(
    usingWoovi ? "criar-cobranca-woovi" : "criar-cobranca",
    {
      body: usingWoovi
        ? { plano: checkoutPlano, ciclo, nome, cpfCnpj }
        : {
            plano: checkoutPlano,
            ciclo,
            billingType,
            nome,
            cpfCnpj,
            telefone,
            // Só preenchidos/relevantes no ramo parcelado — ver validação
            // acima (checkoutAddressResolved só existe depois de um lookup
            // de CEP bem-sucedido, ver lookupCep).
            cep,
            addressNumber,
            address: checkoutAddressResolved?.street ?? "",
            province: checkoutAddressResolved?.neighborhood ?? "",
            cityIbge: checkoutAddressResolved?.ibge ?? "",
          },
    },
  );

  if (error) {
    checkoutSubmitBtn.disabled = false;
    checkoutSubmitBtn.textContent = "Gerar cobrança";
    let detail = null;
    try {
      const errBody = await error.context?.json();
      detail = errBody?.error;
    } catch {
      // corpo não é JSON ou já foi consumido — segue sem mensagem específica
    }
    showCheckoutMsg(detail || "Não foi possível gerar a cobrança. Tente novamente.");
    return;
  }

  checkoutForm.hidden = true;
  checkoutResult.hidden = false;

  if (data.billingType === "PIX" && data.pixQrImage) {
    checkoutPixResult.hidden = false;
    // Woovi já devolve uma URL de imagem pronta (funciona direto num
    // src="..."); o Asaas devolve o PNG em base64 cru, sem o prefixo
    // "data:" — só este último precisa ser montado como data URI.
    checkoutQrImage.src = usingWoovi ? data.pixQrImage : `data:image/png;base64,${data.pixQrImage}`;
    checkoutCopyPixBtn.dataset.payload = data.pixPayload || "";
  } else if (data.billingType === "CREDIT_CARD" && data.invoiceUrl) {
    // Dados do cartão são preenchidos na página do próprio Asaas — ver
    // comentário grande em criar-cobranca/index.ts sobre PCI-DSS.
    checkoutCardResult.hidden = false;
    checkoutCardLink.href = data.invoiceUrl;
  } else if (data.boletoUrl) {
    checkoutBoletoResult.hidden = false;
    checkoutBoletoLink.href = data.boletoUrl;
  } else if (data.invoiceUrl) {
    // Sem QR/boleto por algum motivo (ex.: pixQrCode falhou do lado do
    // Asaas mesmo após as tentativas em criar-cobranca/index.ts) —
    // invoiceUrl sempre existe, é o link universal de fallback.
    checkoutBoletoResult.hidden = false;
    checkoutBoletoLink.href = data.invoiceUrl;
    checkoutBoletoLink.textContent = "Abrir cobrança";
  }

  startCheckoutPolling(checkoutPlano);
});

checkoutCopyPixBtn.addEventListener("click", async () => {
  const payload = checkoutCopyPixBtn.dataset.payload;
  if (!payload) return;
  try {
    await navigator.clipboard.writeText(payload);
  } catch {
    return;
  }
  const original = checkoutCopyPixLabel.textContent;
  checkoutCopyPixLabel.textContent = "Copiado!";
  setTimeout(() => { checkoutCopyPixLabel.textContent = original; }, 1500);
});

plansCloseBtn.addEventListener("click", closePlansModal);
plansOverlay.addEventListener("click", (ev) => {
  if (ev.target === plansOverlay) closePlansModal();
});

document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape") return;
  if (!conviteOverlay.hidden) closeConviteModal();
  else if (!plansOverlay.hidden) closePlansModal();
  else if (!helpOverlay.hidden) closeHelpModal();
  else if (!profileOverlay.hidden) closeProfileModal();
  else if (!menuPanel.hidden) closeMenu();
});

// ------------------------------------------------------------------ Mode
//
// Escopado por ".mode-switch" — hoje so' um grupo (tema), mas mantido
// generico pra qualquer outro switch parecido que venha a existir no menu.

document.querySelectorAll(".mode-switch").forEach(group => {
  const buttons = group.querySelectorAll(".mode-btn");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      buttons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      if (btn.dataset.themeBtn) applyTheme(btn.dataset.themeBtn);
      if (btn.dataset.period) setStatsPeriod(btn.dataset.period);
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

// ------------------------------------------------------------- Telas
//
// Fluxo linear: Tela 1 (exames) -> Tela 2 (materias, dentro dos exames
// escolhidos) -> Tela 3 (estudo, dentro dos exames+materias escolhidos).
// Sem menu lateral: so' um dos 3 <section> fica visivel por vez.

function showScreen(name) {
  screenExams.hidden = name !== "exams";
  screenSubjects.hidden = name !== "subjects";
  screenStudy.hidden = name !== "study";
  screenStats.hidden = name !== "stats";
}

// Tela atual ANTES de abrir Estatisticas (pelo menu, acessivel de qualquer
// uma das outras 3) — pra "Voltar" de la' devolver o aluno pra onde ele
// estava, em vez de sempre cair na tela de exames.
function currentScreenName() {
  if (!screenStudy.hidden) return "study";
  if (!screenSubjects.hidden) return "subjects";
  if (!screenStats.hidden) return "stats";
  return "exams";
}

function uniqueSorted(arr) {
  return [...new Set(arr)].sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
}

function buildCounts(rows, keyFn) {
  const counts = new Map();
  rows.forEach(q => {
    const key = keyFn(q);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}

// Cria um <button class="pick-card"> selecionavel (toggle), com o check
// visual controlado so' por CSS (.selected) a partir da classe aplicada
// aqui — sem nenhum <input> escondido, o proprio botao e' o alvo do clique.
function buildPickCard({ title, sub, count, selected, onToggle }) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "pick-card" + (selected ? " selected" : "");

  const check = document.createElement("span");
  check.className = "pick-card-check";
  check.setAttribute("aria-hidden", "true");
  card.appendChild(check);

  const titleEl = document.createElement("span");
  titleEl.className = "pick-card-title";
  titleEl.textContent = title;
  card.appendChild(titleEl);

  if (sub) {
    const subEl = document.createElement("span");
    subEl.className = "pick-card-sub";
    subEl.textContent = sub;
    card.appendChild(subEl);
  }

  const countEl = document.createElement("span");
  countEl.className = "pick-card-count";
  countEl.textContent = `${count} questão(ões)`;
  card.appendChild(countEl);

  card.setAttribute("aria-pressed", String(selected));
  card.addEventListener("click", () => onToggle(card));

  return card;
}

// ------------------------------------------------------------- Tela 1
//
// Dashboard da 1ª fase: grade de exames com seleção múltipla (igual sempre
// existiu — checkboxes, "Selecionar todos", "Ver matérias", ver
// updateExamFooter/toSubjectsBtn) + camada nova de acompanhamento (progresso
// por exame, favoritos, recomendação do Dr. Laureano) que só ACRESCENTA
// atalhos, sem mudar esse fluxo original.

function examKey(q) {
  return q.exam_number != null ? String(q.exam_number) : "__none__";
}

// Metadados (ano, total de questões) por exame — derivado só de
// allQuestions, sem rede, mesma fonte que counts já usava.
function examMetaMap() {
  const meta = new Map();
  allQuestions.forEach(q => {
    const key = examKey(q);
    if (!meta.has(key)) meta.set(key, { year: q.year, count: 0 });
    meta.get(key).count++;
  });
  return meta;
}

// Progresso do aluno por exame, a partir de statsAnswersCache (já carregado
// no init(), ver hoisting da busca de oab_respostas). Uma questão pode ter
// mais de uma linha em oab_respostas (o aluno pode praticar de novo) —
// aqui conta-se por QUESTÃO DISTINTA respondida (não por linha bruta), com
// o acerto da tentativa MAIS RECENTE de cada uma, pra "X/Y respondidas"
// nunca passar de Y nem "misturar" um erro antigo já corrigido depois.
// (O painel "Seu progresso" é diferente: reaproveita a MESMA agregação
// poolada que a tela de Estatísticas sempre usou, ver renderSidePanels.)
function computeExamStats() {
  const byId = new Map(allQuestions.map(q => [q.id, q]));
  const groups = new Map(); // examKey -> Map(question_id -> {correct, answered_at})

  (statsAnswersCache || []).forEach(a => {
    const q = byId.get(a.question_id);
    if (!q) return;
    const key = examKey(q);
    let g = groups.get(key);
    if (!g) { g = new Map(); groups.set(key, g); }
    const prev = g.get(a.question_id);
    if (!prev || a.answered_at > prev.answered_at) {
      g.set(a.question_id, { correct: a.correct, answered_at: a.answered_at });
    }
  });

  const result = new Map();
  groups.forEach((g, key) => {
    const entries = [...g.values()];
    const answered = entries.length;
    const correct = entries.filter(e => e.correct).length;
    const lastAnsweredAt = entries.reduce((max, e) => (e.answered_at > max ? e.answered_at : max), "");
    result.set(key, { answered, correct, lastAnsweredAt });
  });
  return result;
}

// "Hoje"/"Ontem"/"Há N dias" pra' data relativa de última atividade — sem
// hora exata (o app não mede tempo de sessão na 1ª fase, só o timestamp de
// cada resposta gravada).
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

const STAR_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
  <polygon points="12 2.5 15.09 8.76 22 9.77 17 14.64 18.18 21.52 12 18.27 5.82 21.52 7 14.64 2 9.77 8.91 8.76"></polygon>
</svg>`;

// Anel de progresso em SVG puro (sem lib) — usado no card em destaque e nos
// dois paineis da barra lateral. stroke-dashoffset calculado aqui a partir
// do %; a cor do preenchimento fica pra CSS (.progress-ring-fill).
function buildProgressRingSVG(pct, size = 84, stroke = 8) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = c * (1 - clamped / 100);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="progress-ring-svg">
    <circle class="progress-ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" fill="none"></circle>
    <circle class="progress-ring-fill" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" fill="none"
      stroke-dasharray="${c}" stroke-dashoffset="${offset}"
      transform="rotate(-90 ${size / 2} ${size / 2})"></circle>
  </svg>`;
}

// ------------------------------------------------------- Favoritos (estrela)

let favoritedExams = new Set(); // chaves de examKey (nunca "__none__")

async function loadFavoritos() {
  if (!currentSession?.user) return;
  const { data, error } = await client
    .from("oab_favoritos")
    .select("exam_number")
    .eq("user_id", currentSession.user.id);
  if (error) {
    console.error("Falha ao carregar favoritos:", error.message);
    return;
  }
  favoritedExams = new Set((data || []).map(r => String(r.exam_number)));
}

async function toggleFavorito(key, btn) {
  if (!currentSession?.user || key === "__none__") return;
  const isFav = favoritedExams.has(key);
  btn.disabled = true;
  try {
    if (isFav) {
      const { error } = await client
        .from("oab_favoritos")
        .delete()
        .eq("user_id", currentSession.user.id)
        .eq("exam_number", Number(key));
      if (error) throw error;
      favoritedExams.delete(key);
    } else {
      const { error } = await client
        .from("oab_favoritos")
        .insert({ user_id: currentSession.user.id, exam_number: Number(key) });
      if (error) throw error;
      favoritedExams.add(key);
    }
    btn.classList.toggle("active", favoritedExams.has(key));
    btn.setAttribute("aria-label", favoritedExams.has(key) ? "Remover dos favoritos" : "Favoritar");
  } catch (err) {
    console.error("Falha ao favoritar:", err.message);
  } finally {
    btn.disabled = false;
  }
}

// ---------------------------------------------------------- Cards de exame

// Separado de buildPickCard (que continua servindo só a Tela 2, intocado):
// mesma base de botão selecionável (.pick-card/.pick-card-check/selected),
// mais estrela de favorito e — só no card em destaque (hero) — o atalho
// "Começar simulado".
function buildFavoriteBtn(key) {
  const favBtn = document.createElement("button");
  favBtn.type = "button";
  const isFav = favoritedExams.has(key);
  favBtn.className = "pick-card-favorite" + (isFav ? " active" : "");
  favBtn.innerHTML = STAR_ICON;
  favBtn.setAttribute("aria-label", isFav ? "Remover dos favoritos" : "Favoritar");
  favBtn.addEventListener("click", ev => {
    ev.stopPropagation();
    toggleFavorito(key, favBtn);
  });
  return favBtn;
}

function buildCountBadge(started, answered, count, stat) {
  const countEl = document.createElement("span");
  countEl.className = "pick-card-count";
  countEl.textContent = started
    ? `${answered}/${count} respondidas (${pctOf(stat.correct, answered)}%)`
    : `${count} questão(ões)`;
  return countEl;
}

// Card em destaque (hero, ver .exam-hero no CSS): layout de DUAS colunas —
// painel esquerdo com a identidade do exame (número/ano/quantidade) e um
// painel direito só de ação (favoritar, status, "Começar simulado"), em vez
// de tudo espremido numa linha só. Cards normais continuam numa coluna só.
function buildExamCard({ key, year, count, stat, hero, selected, onToggle }) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "pick-card exam-card" + (hero ? " exam-hero" : "") + (selected ? " selected" : "");
  card.dataset.examKey = key;

  const answered = stat?.answered || 0;
  const started = answered > 0;

  if (hero) {
    const main = document.createElement("div");
    main.className = "exam-hero-main";

    const badge = document.createElement("span");
    badge.className = "exam-hero-badge";
    badge.textContent = "MAIS RECENTE";
    main.appendChild(badge);

    const titleRow = document.createElement("div");
    titleRow.className = "exam-hero-title-row";
    const numEl = document.createElement("span");
    numEl.className = "exam-hero-number";
    numEl.textContent = key === "__none__" ? "—" : `${key}º`;
    const labelEl = document.createElement("span");
    labelEl.className = "exam-hero-label";
    labelEl.textContent = "Exame da OAB";
    titleRow.append(numEl, labelEl);
    main.appendChild(titleRow);

    const metaRow = document.createElement("div");
    metaRow.className = "exam-hero-meta";
    if (year) {
      const subEl = document.createElement("span");
      subEl.className = "pick-card-sub";
      subEl.textContent = `Ano ${year}`;
      metaRow.appendChild(subEl);
    }
    metaRow.appendChild(buildCountBadge(started, answered, count, stat));
    main.appendChild(metaRow);

    card.appendChild(main);

    const action = document.createElement("div");
    action.className = "exam-hero-action";
    if (key !== "__none__") action.appendChild(buildFavoriteBtn(key));

    const statusTitle = document.createElement("strong");
    statusTitle.className = "exam-hero-action-title";
    statusTitle.textContent = started ? "Continue de onde parou" : "Ainda não realizado";
    action.appendChild(statusTitle);

    const statusSub = document.createElement("p");
    statusSub.className = "exam-hero-action-sub";
    statusSub.textContent = started
      ? `Faltam ${count - answered} questões pra terminar.`
      : "Esta é a prova mais recente da OAB.";
    action.appendChild(statusSub);

    const startBtn = document.createElement("button");
    startBtn.type = "button";
    startBtn.className = "btn-primary exam-hero-cta";
    startBtn.textContent = "Começar simulado";
    startBtn.addEventListener("click", ev => {
      ev.stopPropagation();
      startSimulado(key);
    });
    action.appendChild(startBtn);

    card.appendChild(action);

    const check = document.createElement("span");
    check.className = "pick-card-check";
    check.setAttribute("aria-hidden", "true");
    card.appendChild(check);
  } else {
    if (key !== "__none__") card.appendChild(buildFavoriteBtn(key));

    const check = document.createElement("span");
    check.className = "pick-card-check";
    check.setAttribute("aria-hidden", "true");
    card.appendChild(check);

    const titleEl = document.createElement("span");
    titleEl.className = "pick-card-title";
    titleEl.textContent = key === "__none__" ? "Sem exame" : `${key}º Exame`;
    card.appendChild(titleEl);

    if (year) {
      const subEl = document.createElement("span");
      subEl.className = "pick-card-sub";
      subEl.textContent = `Ano ${year}`;
      card.appendChild(subEl);
    }

    card.appendChild(buildCountBadge(started, answered, count, stat));
  }

  card.setAttribute("aria-pressed", String(selected));
  card.addEventListener("click", () => onToggle(card));

  return card;
}

// -------------------------------------------------- Atalho "Começar simulado"

// Faz de uma vez só o que o fluxo manual faz em 2 passos (Ver matérias ->
// selecionar todas -> Estudar): seleciona só este exame, TODAS as matérias
// dele, e já abre a Tela 3. Reaproveita exatamente as mesmas variáveis/telas
// de toSubjectsBtn/toStudyBtn (linhas acima) — nenhuma lógica nova de
// filtragem. Sem limite de plano nenhum: "simulado" aqui é só um atalho de
// navegação sobre a MESMA 1ª fase que já é limitada por questão/dia
// (handleAnswer) — não é um recurso à parte que faça sentido cobrar
// separado, então nunca teve um limite de verdade pra ele valer a pena.
function startSimulado(key) {
  selectedExams = new Set([key]);
  examPool = allQuestions.filter(q => examKey(q) === key);
  selectedSubjects = new Set(allSubjectKeys());
  filtered = examPool;
  currentIndex = 0;
  selectedAnswer = null;
  showScreen("study");
  renderQuestion();
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

// Mesma ideia do atalho acima, mas só com as questões que o aluno já
// respondeu ERRADO nesse exame (usado pelo botão "Revisar erros" do painel
// "Última atividade") — quando não sobra nenhuma questão errada nesse
// exame, cai no simulado completo dele mesmo.
function reviewMistakes(key) {
  const stats = computeExamStats().get(key);
  const byId = new Map(allQuestions.map(q => [q.id, q]));
  const wrongIds = new Set(
    (statsAnswersCache || [])
      .filter(a => !a.correct && byId.has(a.question_id) && examKey(byId.get(a.question_id)) === key)
      .map(a => a.question_id),
  );
  if (!stats || wrongIds.size === 0) {
    startSimulado(key);
    return;
  }
  selectedExams = new Set([key]);
  examPool = allQuestions.filter(q => examKey(q) === key);
  selectedSubjects = new Set(allSubjectKeys());
  filtered = examPool.filter(q => wrongIds.has(q.id));
  currentIndex = 0;
  selectedAnswer = null;
  showScreen("study");
  renderQuestion();
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

// --------------------------------------------------- Abas de filtro + grade

let examFilterTab = "todos"; // "todos" | "recentes" | "antigos" | "realizados"
let examsVisibleCount = 12; // "Mostrar mais provas" soma mais 12 por clique

function filteredSortedExamKeys() {
  const stats = computeExamStats();
  let keys = allExamKeys();

  if (examFilterTab === "realizados") {
    keys = keys.filter(k => (stats.get(k)?.answered || 0) > 0);
  }

  const sorted = [...keys].sort((a, b) => (a === "__none__" ? 1 : b === "__none__" ? -1 : Number(b) - Number(a)));
  if (examFilterTab === "antigos") sorted.reverse();
  return sorted;
}

examFilterTabsEl.querySelectorAll(".exam-filter-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.classList.contains("active")) return;
    examFilterTabsEl.querySelectorAll(".exam-filter-tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    examFilterTab = btn.dataset.filter;
    examsVisibleCount = 12;
    renderExamGrid();
  });
});

examShowMoreBtn.addEventListener("click", () => {
  examsVisibleCount += 12;
  renderExamGrid();
});

function renderExamGrid() {
  const counts = buildCounts(allQuestions, examKey);
  const meta = examMetaMap();
  const stats = computeExamStats();
  const keys = filteredSortedExamKeys();

  examCountBadge.textContent = `${keys.filter(k => k !== "__none__").length} prova(s) disponíveis`;

  // O card em destaque só faz sentido quando a ordenação da aba realmente
  // começa pelo exame mais recente (Todos/Mais recentes) — em "Mais
  // antigos"/"Já realizados" a grade inteira vira cards normais.
  const heroEligible = (examFilterTab === "todos" || examFilterTab === "recentes") && keys[0] && keys[0] !== "__none__";
  const heroKey = heroEligible ? keys[0] : null;
  const restKeys = heroKey ? keys.slice(1) : keys;
  const visibleRest = restKeys.slice(0, examsVisibleCount);

  examGrid.innerHTML = "";

  function toggleSelection(key, cardEl) {
    if (selectedExams.has(key)) selectedExams.delete(key);
    else selectedExams.add(key);
    cardEl.classList.toggle("selected", selectedExams.has(key));
    cardEl.setAttribute("aria-pressed", String(selectedExams.has(key)));
    updateExamFooter();
  }

  if (heroKey) {
    examGrid.appendChild(buildExamCard({
      key: heroKey,
      year: meta.get(heroKey)?.year,
      count: counts.get(heroKey) || 0,
      stat: stats.get(heroKey),
      hero: true,
      selected: selectedExams.has(heroKey),
      onToggle: cardEl => toggleSelection(heroKey, cardEl),
    }));
  }

  visibleRest.forEach(key => {
    examGrid.appendChild(buildExamCard({
      key,
      year: meta.get(key)?.year,
      count: counts.get(key) || 0,
      stat: stats.get(key),
      hero: false,
      selected: selectedExams.has(key),
      onToggle: cardEl => toggleSelection(key, cardEl),
    }));
  });

  examShowMoreBtn.hidden = visibleRest.length >= restKeys.length;

  updateExamFooter();
}

function allExamKeys() {
  return uniqueSorted(allQuestions.map(examKey));
}

function updateExamFooter() {
  examSelCount.textContent = `${selectedExams.size} selecionado(s)`;
  toSubjectsBtn.disabled = selectedExams.size === 0;
  // Barra fixa (ver .pick-footer.visible no CSS) só aparece com pelo menos
  // 1 exame selecionado — pedido explícito, pra sempre ficar alcançável
  // sem rolar a página até o fim da grade, principalmente no mobile.
  examPickFooter.classList.toggle("visible", selectedExams.size > 0);

  const keys = allExamKeys();
  examSelectAllBtnText.textContent = keys.length > 0 && keys.every(k => selectedExams.has(k))
    ? "Desmarcar todos"
    : "Selecionar todos";
}

// Alterna entre marcar TODOS os exames (mesmo os fora do filtro/paginação
// atual) e limpar a selecao inteira — um so' botao faz as duas coisas (ver
// texto trocado em updateExamFooter), em vez de dois botoes separados (uma
// "Selecionar todos" e outra "Nenhum").
examSelectAllBtn.addEventListener("click", () => {
  const keys = allExamKeys();
  const allSelected = keys.length > 0 && keys.every(k => selectedExams.has(k));
  if (allSelected) selectedExams.clear();
  else keys.forEach(k => selectedExams.add(k));
  renderExamGrid();
});

// ------------------------------------------------------- Barra lateral

function openStatsScreen() {
  screenBeforeStats = currentScreenName();
  showScreen("stats");
  loadAndRenderStats();
}

progressCtaBtn.addEventListener("click", openStatsScreen);

function renderSidePanels() {
  // "Seu progresso": MESMA agregação (pooled, todo o histórico) que a tela
  // de Estatísticas sempre usou pro número "Aproveitamento geral" — não é
  // uma conta nova, só é mostrada aqui também.
  const answers = statsAnswersCache || [];
  const total = answers.length;
  const correct = answers.filter(a => a.correct).length;
  const pct = pctOf(correct, total);

  progressRingWrap.innerHTML = buildProgressRingSVG(pct);
  progressRingPct.textContent = total > 0 ? `${pct}%` : "—";
  progressTotalNum.textContent = total;
  progressAcertosNum.textContent = correct;
  progressErrosNum.textContent = total - correct;

  // "Última atividade": exame com o answered_at mais recente entre todos os
  // grupos calculados em computeExamStats.
  const stats = computeExamStats();
  const counts = buildCounts(allQuestions, examKey);

  let lastKey = null;
  let lastAt = "";
  stats.forEach((s, key) => {
    if (s.lastAnsweredAt > lastAt) {
      lastAt = s.lastAnsweredAt;
      lastKey = key;
    }
  });

  if (!lastKey) {
    lastActivityPanel.hidden = true;
    return;
  }

  const s = stats.get(lastKey);
  const examTotal = counts.get(lastKey) || 0;
  const done = s.answered >= examTotal && examTotal > 0;
  const pctExam = pctOf(s.correct, s.answered);

  lastActivityPanel.hidden = false;
  lastActivityExam.textContent = lastKey === "__none__" ? "Sem exame" : `${lastKey}º Exame`;
  lastActivityBadge.textContent = done ? "Concluído" : "Em andamento";
  lastActivityBadge.className = "badge " + (done ? "badge-done" : "badge-progress");
  lastActivityRingWrap.innerHTML = buildProgressRingSVG(pctExam, 48, 5);
  lastActivityPctText.textContent = `${pctExam}% de acerto`;
  lastActivityDate.textContent = fmtRelativeDate(s.lastAnsweredAt);

  const hasWrong = s.correct < s.answered;
  lastActivityReviewBtn.hidden = !hasWrong;
  lastActivityReviewBtn.onclick = () => reviewMistakes(lastKey);
}

// ------------------------------------------------------- Dica do dia

// Dicas fixas de bons estudos/prova, na voz do Dr. Laureano (mesmo tom
// encorajador e direto de supabase/functions/dr-laureano/index.ts) — sem
// IA, sem chamada de rede: uma dica genérica de estudo não depende do
// progresso de ninguém pra fazer sentido, e a versão anterior (recomendar
// UM exame específico via IA, ver supabase/functions/recomendacao-
// dashboard/index.ts) já causou dois bugs de contradição com o card em
// destaque — mais simples e sem custo assim.
const STUDY_TIPS = [
  "Revise seus erros antes de encarar questões novas — é ali que mora o maior ganho de nota.",
  "Estudar 40 minutos com foco total vale mais que 3 horas distraído. Respeite suas pausas.",
  "Leia o enunciado duas vezes antes de marcar uma alternativa — muita pegadinha mora nos detalhes.",
  "Refaça um simulado antigo de vez em quando: você vai se surpreender com o quanto já evoluiu.",
  "Direito não se decora, se entende. Prefira compreender o porquê da regra a só memorizar o texto.",
  "Durma bem na noite anterior à prova — o cérebro cansado erra até o que já sabia.",
  "Na dúvida entre duas alternativas, elimine primeiro as que você tem certeza que estão erradas.",
  "Constância vence intensidade: um pouco todo dia bate um dia inteiro só na véspera.",
  "Anote os erros que mais se repetem — esse padrão é o próximo ponto que você vai garantir.",
  "Ética profissional rende pontos fáceis: vale a pena reler o Código de Ética antes da prova.",
  "Treine pelo menos um simulado no tempo real da prova — administrar o relógio também é nota.",
  "Comemore os acertos, não só os erros. Reconhecer o progresso mantém o ânimo em alta.",
  "Fundamente sempre a resposta na lei ou na jurisprudência, nunca só na sua intuição.",
];

// Dia do ano (1 a ~365) — a mesma dica pra todo mundo o dia inteiro, e ela
// muda sozinha à meia-noite. "Nova dica" (ver listener mais abaixo) soma
// um deslocamento por cima disso só na sessão atual, sem mexer na dica do
// dia de verdade.
function dayOfYear(date) {
  return Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
}

let dashboardTipOffset = 0;

function renderDashboardTip() {
  const idx = (dayOfYear(new Date()) + dashboardTipOffset) % STUDY_TIPS.length;
  laureanoTipText.textContent = STUDY_TIPS[idx];
  laureanoTip.hidden = false;
}

laureanoTipBtn.addEventListener("click", () => {
  dashboardTipOffset++;
  renderDashboardTip();
});

toSubjectsBtn.addEventListener("click", () => {
  if (selectedExams.size === 0) return;
  examPool = allQuestions.filter(q => selectedExams.has(examKey(q)));
  selectedSubjects.clear();
  renderSubjectGrid();
  showScreen("subjects");
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
});

// ------------------------------------------------------------- Tela 2

function subjectKey(q) {
  return q.discipline || "__none__";
}

function renderSubjectGrid() {
  const counts = buildCounts(examPool, subjectKey);
  const keys = uniqueSorted(examPool.map(subjectKey))
    .sort((a, b) => (a === "__none__" ? 1 : b === "__none__" ? -1 : 0));

  subjectGrid.innerHTML = "";

  if (keys.length === 0) {
    const empty = document.createElement("p");
    empty.className = "pick-empty";
    empty.textContent = "Nenhuma matéria encontrada para os exames selecionados.";
    subjectGrid.appendChild(empty);
  }

  keys.forEach(key => {
    const title = key === "__none__" ? "Sem disciplina" : key;
    const card = buildPickCard({
      title,
      sub: null,
      count: counts.get(key) || 0,
      selected: selectedSubjects.has(key),
      onToggle: (cardEl) => {
        if (selectedSubjects.has(key)) selectedSubjects.delete(key);
        else selectedSubjects.add(key);
        cardEl.classList.toggle("selected", selectedSubjects.has(key));
        cardEl.setAttribute("aria-pressed", String(selectedSubjects.has(key)));
        updateSubjectFooter();
      },
    });
    subjectGrid.appendChild(card);
  });

  updateSubjectFooter();
}

function allSubjectKeys() {
  return uniqueSorted(examPool.map(subjectKey));
}

function updateSubjectFooter() {
  subjectSelCount.textContent = `${selectedSubjects.size} selecionado(s)`;
  toStudyBtn.disabled = selectedSubjects.size === 0;
  // Mesma barra fixa da Tela 1 (ver updateExamFooter) — só aparece com
  // pelo menos 1 matéria selecionada.
  subjectPickFooter.classList.toggle("visible", selectedSubjects.size > 0);

  const keys = allSubjectKeys();
  subjectSelectAllBtnText.textContent = keys.length > 0 && keys.every(k => selectedSubjects.has(k))
    ? "Desmarcar todos"
    : "Selecionar todos";
}

subjectSelectAllBtn.addEventListener("click", () => {
  const keys = allSubjectKeys();
  const allSelected = keys.length > 0 && keys.every(k => selectedSubjects.has(k));
  if (allSelected) selectedSubjects.clear();
  else keys.forEach(k => selectedSubjects.add(k));
  renderSubjectGrid();
});

backToExamsBtn.addEventListener("click", () => {
  showScreen("exams");
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
});

toStudyBtn.addEventListener("click", () => {
  if (selectedSubjects.size === 0) return;
  filtered = examPool.filter(q => selectedSubjects.has(subjectKey(q)));
  currentIndex = 0;
  selectedAnswer = null;
  showScreen("study");
  renderQuestion();
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
});

backToSubjectsBtn.addEventListener("click", () => {
  showScreen("subjects");
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
});

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

function goToIndex(idx) {
  currentIndex = idx;
  selectedAnswer = null;
  renderQuestion();
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
  } else if (planStatus?.questoes_por_dia != null && planStatus.questoes_hoje >= planStatus.questoes_por_dia) {
    // Já sabemos, ANTES de qualquer clique, que a cota diária acabou (ver
    // handleAnswer) — evita o vaivém de deixar clicar numa alternativa só
    // pra descobrir depois que não podia. planStatus pode estar desatualizado
    // (outra aba, outro dispositivo); a checagem de verdade continua sendo
    // increment_plan_usage em handleAnswer, isto aqui é só antecipação de UI.
    altButtons.forEach(({ btn, eliminateBtn }) => {
      btn.disabled = true;
      eliminateBtn.disabled = true;
    });
    showLockedFeedback(feedbackEl, `Você atingiu o limite de ${planStatus.questoes_por_dia} questões gratuitas hoje.`);
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
    empty.append("Nenhuma questão encontrada para a seleção atual. ");
    const backLink = document.createElement("button");
    backLink.type = "button";
    backLink.className = "btn-link";
    backLink.textContent = "Voltar";
    backLink.addEventListener("click", () => showScreen("subjects"));
    empty.appendChild(backLink);
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

// ------------------------------------------------------ Sessão do aluno
//
// A area do aluno agora EXIGE login — so' se chega aqui com uma conta de
// verdade (avulsa, ou vinculada a um professor via convite — ver seção
// "Convite de turma" logo abaixo) ja' autenticada pela landing page (ver
// index.html, ROLE_DESTINATIONS). Ver
// requireAuth() logo abaixo, chamado antes de qualquer outra coisa em
// init(). Cada resposta de 1ª fase e' gravada em oab_respostas (ver
// handleAnswer abaixo) pra aparecer no Portal do Professor, e "Meu Perfil"
// (ver mais abaixo) mostra/edita os dados de cadastro (tabela "profiles").

let currentSession = null;

function updateSessionUI() {
  if (!currentSession?.user) return;
  const label = currentSession.user.user_metadata?.nome || currentSession.user.email || "?";
  menuAvatar.textContent = label.trim().charAt(0).toUpperCase() || "?";
  menuUserLabel.textContent = label;
}

// Confere autenticacao ANTES de mostrar qualquer coisa da area do aluno.
// Sem sessao valida, manda de volta pra' landing page (onde fica o login de
// verdade) em vez de liberar o uso anonimo de antes.
async function requireAuth() {
  const { data } = await client.auth.getSession();
  if (!data.session?.user) {
    window.location.replace("../index.html");
    return null;
  }
  return data.session;
}

sessionLogoutBtn.addEventListener("click", () => handleSessionLogout());

// Faz o signOut de fato e redireciona na hora — antes disso, a UI só mudava
// se o evento onAuthStateChange do Supabase chegasse a disparar; quando ele
// falhava (sessão já expirada, rede instável, etc.) o clique parecia não
// fazer nada.
async function handleSessionLogout() {
  currentSession = null;
  closeMenu();
  try {
    await client.auth.signOut();
  } catch (err) {
    console.error("Erro ao encerrar sessão:", err);
  }
  window.location.href = "../index.html";
}

// Se a sessao cair enquanto o aluno esta' navegando (token expirado, logout
// em outra aba etc.), manda de volta pra' landing page em vez de deixar a
// pagina "meio logada" — o resto do JS (handleAnswer, Meu Perfil) assume
// currentSession sempre presente.
client.auth.onAuthStateChange((_event, session) => {
  currentSession = session;
  if (session?.user) updateSessionUI();
  else window.location.replace("../index.html");
});

// ------------------------------------------------------ Meus convites
//
// O link do e-mail de convite (ver supabase/functions/professor-portal/
// index.ts, STUDENT_INVITE_BASE_URL) aponta direto pra cá com
// "?convite=1" — só um SINAL de "acabei de clicar um link de convite, abra
// a lista sozinha", nunca o conteúdo em si: o que aparece no modal vem
// sempre de uma consulta fresca ao banco (loadConvites/listar-convites),
// nunca de um valor guardado na URL/sessionStorage — assim o aluno vê TODO
// convite pendente (não só o que ele acabou de clicar), inclusive se tiver
// mais de um professor te convidando. O item "Meus convites" no menu (ver
// index.html) chama a MESMA lista a qualquer momento, sem precisar de link
// nenhum — é o caminho permanente pra aceitar um convite perdido/atrasado.
//
// Se o aluno não estava logado quando clicou o link, requireAuth() (chamado
// em init(), logo abaixo) manda ele pra landing pra entrar/criar conta
// ANTES de qualquer coisa daqui rodar — por isso o sinal precisa ir pro
// sessionStorage já na carga do script, não só dentro de init(): assim
// sobrevive à ida-e-volta pela landing (sessionStorage é do domínio
// inteiro, não da aba/URL específica) e o modal ainda abre sozinho quando
// ele volta logado pra este mesmo dashboard.
const PENDING_CONVITE_KEY = "neuraoab-pending-convite";
{
  const temConviteNaUrl = new URLSearchParams(window.location.search).has("convite");
  if (temConviteNaUrl) sessionStorage.setItem(PENDING_CONVITE_KEY, "1");
}

async function callAlunoPortal(payload) {
  const { data, error } = await client.functions.invoke("aluno-portal", { body: payload });
  if (error) {
    let detail = error.message;
    try {
      const body = await error.context?.json?.();
      if (body?.error) detail = body.error;
    } catch {
      // mantém a mensagem genérica
    }
    throw new Error(detail);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

let latestConvites = [];

function showConviteMsg(text) {
  conviteMsg.textContent = text || "";
  conviteMsg.className = text ? "profile-msg show" : "profile-msg";
}

// Ícone padrão (capelo — mesma linguagem do resto do app pra "estudo/
// turma") e ícone de sucesso (check), trocados via icon.innerHTML no
// próprio elemento .convite-row-icon (ver acceptConvite abaixo), pra não
// precisar recriar a linha inteira só pra mostrar a comemoração.
const CONVITE_ICON_CAP =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5Z"></path><path d="M6 12.5V17c0 1.1 2.7 3 6 3s6-1.9 6-3v-4.5"></path></svg>';
const CONVITE_ICON_CHECK =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
// Estrelinha do selo "Libera acesso Pro" — ícone, não emoji, pra ficar no
// mesmo estilo (stroke/fill controlado por CSS) do resto do app.
const CONVITE_ICON_SPARK =
  '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M12 2.5l1.8 6.2 6.2 1.8-6.2 1.8-1.8 6.2-1.8-6.2-6.2-1.8 6.2-1.8L12 2.5z"></path></svg>';
const CONVITE_BTN_SPINNER = '<span class="convite-btn-spinner"></span>';

// Tempo que a linha fica mostrando o check verde antes de encolher e sumir
// — dá pro aluno REGISTRAR que aconteceu, em vez da linha só desaparecer na
// hora (ver CSS ".convite-row.accepted"/".convite-row.leaving").
const CONVITE_CELEBRATE_MS = 1100;
const CONVITE_COLLAPSE_MS = 450; // um pouco mais que a transição de 0.4s no CSS, margem de sobra

async function acceptConvite(codigo, row, btn) {
  btn.disabled = true;
  btn.innerHTML = `${CONVITE_BTN_SPINNER}Ativando...`;
  showConviteMsg(""); // limpa erro de uma tentativa anterior (em OUTRO convite da mesma lista)
  try {
    const result = await callAlunoPortal({ action: "ativar-convite", codigo });
    latestConvites = latestConvites.filter((c) => c.codigo !== codigo);

    // Comemoração inline: troca o ícone pra check verde (com o "ping" duplo
    // ao redor, ver CSS ".convite-row.accepted .convite-row-icon::before/
    // ::after") e o texto pra confirmação, com o botão saindo — só depois
    // de um tempinho é que a linha encolhe e some de vez.
    row.classList.add("accepted");
    row.querySelector(".convite-row-icon").innerHTML = CONVITE_ICON_CHECK;
    const info = row.querySelector(".convite-row-info");
    info.innerHTML = "";
    const doneStrong = document.createElement("strong");
    doneStrong.textContent = `Você entrou em "${result.turma_nome}"`;
    const doneSpan = document.createElement("span");
    doneSpan.textContent = "Acesso Pro liberado";
    info.append(doneStrong, doneSpan);
    btn.remove();

    setTimeout(() => {
      row.classList.add("leaving");
      conviteEmptyMsg.hidden = latestConvites.length > 0;
      convitesBadge.hidden = latestConvites.every((c) => c.expirado);
      setTimeout(() => row.remove(), CONVITE_COLLAPSE_MS);
    }, CONVITE_CELEBRATE_MS);

    // Reflete o novo plano na hora em "Meu Perfil"/cadeados de limite, sem
    // esperar o aluno reabrir nada.
    loadPlanStatus().then(renderProfilePlan);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Aceitar";
    showConviteMsg(err.message || "Não foi possível aceitar o convite.");
  }
}

function renderConvites() {
  conviteList.innerHTML = "";
  convitesBadge.hidden = latestConvites.every((c) => c.expirado);

  if (latestConvites.length === 0) {
    conviteEmptyMsg.hidden = false;
    return;
  }
  conviteEmptyMsg.hidden = true;

  latestConvites.forEach((c) => {
    const row = document.createElement("div");
    row.className = "convite-row";

    const icon = document.createElement("div");
    icon.className = "convite-row-icon";
    icon.innerHTML = CONVITE_ICON_CAP;
    row.appendChild(icon);

    const info = document.createElement("div");
    info.className = "convite-row-info";
    const turmaEl = document.createElement("strong");
    turmaEl.textContent = c.turma_nome;
    const profEl = document.createElement("span");
    profEl.textContent = c.expirado
      ? `Convite de ${c.professor_nome} — expirado, peça um novo`
      : `Convite de ${c.professor_nome}`;
    info.append(turmaEl, profEl);
    if (!c.expirado) {
      const perk = document.createElement("span");
      perk.className = "convite-row-perk";
      perk.innerHTML = `${CONVITE_ICON_SPARK}Libera acesso Pro`;
      info.appendChild(perk);
    }
    row.appendChild(info);

    if (!c.expirado) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-primary";
      btn.textContent = "Aceitar";
      btn.addEventListener("click", () => acceptConvite(c.codigo, row, btn));
      row.appendChild(btn);
    }

    conviteList.appendChild(row);
  });
}

// Busca a lista fresca no banco — chamada tanto em segundo plano (init(),
// só pra manter a bolinha do menu certa) quanto ao abrir o modal (menu ou
// automático). Nunca lança: uma falha de rede aqui não pode travar o resto
// do dashboard, só deixa a lista/bolinha desatualizada até a próxima chamada.
async function loadConvites() {
  try {
    const { convites } = await callAlunoPortal({ action: "listar-convites" });
    latestConvites = convites || [];
  } catch (err) {
    console.error("Falha ao carregar convites:", err);
    latestConvites = [];
  }
  renderConvites();
}

function openConviteModal() {
  closeMenu();
  showConviteMsg("");
  conviteOverlay.hidden = false;
  loadConvites(); // sempre recarrega na hora de abrir, nunca mostra dado velho
}
function closeConviteModal() {
  conviteOverlay.hidden = true;
}

menuConvitesBtn.addEventListener("click", openConviteModal);
conviteCloseBtn.addEventListener("click", closeConviteModal);
conviteOverlay.addEventListener("click", (ev) => {
  if (ev.target === conviteOverlay) closeConviteModal();
});

// Chamado uma vez, depois que requireAuth() já garantiu sessão válida (ver
// init()) — nunca bloqueia o resto do dashboard: roda em paralelo com o
// carregamento de questões/estatísticas. Só ABRE o modal se veio de um link
// de convite recém-clicado (PENDING_CONVITE_KEY); do contrário só atualiza
// a bolinha do menu em segundo plano, sem interromper o aluno.
async function checkPendingConvite() {
  const veioDeLink = sessionStorage.getItem(PENDING_CONVITE_KEY);
  sessionStorage.removeItem(PENDING_CONVITE_KEY);
  await loadConvites();
  if (veioDeLink && latestConvites.length > 0) {
    showConviteMsg("");
    conviteOverlay.hidden = false;
  }
}

// --------------------------------------------------------- Plano (limites)
//
// planStatus reflete supabase/schema_planos.sql: quantas questões/dia,
// simulados/mês e mensagens de chat/mês o plano do aluno permite (null =
// ilimitado), e se ele libera análise por IA / 2ª fase. Recarregado no
// init() e depois de qualquer ação que consome cota, pra UI nunca mostrar
// um número desatualizado. A fonte de verdade de "quanto já usei" é sempre
// o banco (increment_plan_usage), nunca um contador só no navegador — isso
// aqui só existe pra refletir esse resultado na tela.
let planStatus = null;

async function loadPlanStatus() {
  const { data, error } = await client.rpc("get_my_plan_status");
  if (error || !data || data.length === 0) {
    planStatus = null;
    return;
  }
  planStatus = data[0];
}

// Aba "2ª Fase" pro plano grátis: NÃO bloqueia mais a navegação — deixa
// abrir simulado2fase.html normalmente, só com um selo visual (🔒 + tooltip)
// avisando que é limitado. O bloqueio de verdade (deixar ver o enunciado,
// mas nunca escrever/corrigir) acontece dentro de simulado2fase.js
// (applySegundaFaseLock) — é lá que faz sentido, porque essa página também
// é usada sem login nenhum (uso anônimo, ver corretor-2fase/index.ts), e só
// ela sabe se quem chegou é logado-gratuito ou anônimo.
function applyPhaseTabLock() {
  if (!phaseTab2fase || !planStatus || planStatus.segunda_fase) return;
  phaseTab2fase.classList.add("locked");
  phaseTab2fase.title = "Prévia no plano grátis — escrever e receber correção é dos planos Básico e Pro";
}

// Botão embutido nas mensagens de "limite atingido" (ver showLockedFeedback/
// requestStatsAnalysis) — onclick inline de propósito: esse HTML é inserido
// via innerHTML em mais de um lugar, então reanexar addEventListener depois
// de cada inserção só pra isto seria mais código pra o mesmo resultado.
// openPlansModal (ver seção "Planos" mais abaixo) já é uma função global
// (function declarada no escopo do script, não módulo), acessível daqui.
const UPGRADE_LINK_HTML = '<button type="button" class="upgrade-link" onclick="openPlansModal()">Fazer upgrade</button>';

function showLockedFeedback(feedbackEl, message) {
  feedbackEl.className = "feedback locked";
  feedbackEl.innerHTML = `<span>${message} ${UPGRADE_LINK_HTML}</span>`;
}

// answering (não só selectedAnswer !== null) evita que dois cliques em
// alternativas diferentes, antes da checagem de cota abaixo terminar,
// consumam a cota duas vezes ou revelem a resposta duas vezes — selectedAnswer
// só é setado DEPOIS da checagem passar, então sozinho ele não bastaria pra
// bloquear o segundo clique enquanto o primeiro ainda está em andamento.
let answering = false;

async function handleAnswer(q, letter, correctLetter, altButtons, feedbackEl) {
  if (selectedAnswer !== null || answering) return;
  answering = true;

  try {
    // Consome 1 questão da cota diária ANTES de revelar — increment_plan_usage
    // (supabase/schema_planos.sql) é quem decide de verdade, nunca um
    // contador local; se a chamada falhar (rede etc.), deixa passar em vez
    // de travar quem está estudando por um problema de infra.
    const { data: quotaData, error: quotaError } = await client.rpc("increment_plan_usage", { p_kind: "questoes" });
    const quota = !quotaError && quotaData?.[0] ? quotaData[0] : { allowed: true };

    if (planStatus) planStatus.questoes_hoje = quota.used_count ?? planStatus.questoes_hoje;

    if (!quota.allowed) {
      altButtons.forEach(({ btn, eliminateBtn }) => {
        btn.disabled = true;
        eliminateBtn.disabled = true;
      });
      showLockedFeedback(feedbackEl, `Você atingiu o limite de ${quota.max_count} questões gratuitas hoje.`);
      return;
    }

    selectedAnswer = letter;
    const isCorrect = letter === correctLetter;
    revealAnswer(altButtons, correctLetter, isCorrect ? null : letter, feedbackEl);

    if (!results.has(q.id)) {
      results.set(q.id, { letter, correct: isCorrect });
      answeredCount++;
      if (isCorrect) correctCount++;
      updateScoreUI();

      // Só grava quando logado (aluno convidado por um professor) — fire-
      // and-forget, nunca bloqueia nem altera o feedback já mostrado acima;
      // uma falha aqui (rede, RLS etc.) não deve incomodar quem só está
      // estudando. Ver oab_respostas em supabase/schema_professor_portal.sql.
      if (currentSession?.user) {
        client.from("oab_respostas").insert({
          user_id: currentSession.user.id,
          question_id: q.id,
          letter,
          correct: isCorrect,
        }).then(({ error }) => {
          if (error) console.error("Falha ao registrar resposta:", error.message);
        });
      }
    }
  } finally {
    answering = false;
  }
}

// -------------------------------------------------------------- Meu Perfil
//
// Pega os dados ja preenchidos no cadastro (tabela "profiles" — nome,
// email, cursinho, telefone; ver index.html — cadastro/login — e
// supabase/schema_portal_mestre.sql) e permite editar a propria linha
// (RLS "profiles_update_self" libera qualquer autenticado a editar so' a
// propria, ver schema_portal_mestre.sql — role_id/ativo/professor_id
// continuam travados por um gatilho, mas nome/email/cursinho/telefone nao).

const PLAN_LABELS = { gratuito: "Grátis", basico: "Básico", pro: "Pro" };

// Mostra o plano atual + quanto já foi usado este mês/hoje, a partir de
// planStatus (ver loadPlanStatus acima) — nunca escondido atrás de outra
// navegação: quem quer saber "em que plano eu tô" ou "quanto falta pra
// acabar minha cota" encontra isso direto em "Meu Perfil".
// Selo do plano SEMPRE visível no topbar (não só dentro de "Meu Perfil") —
// mesmas 3 cores de PLAN_LABELS/profilePlanBadge, pra reforçar de relance em
// que plano o aluno está. Chamado toda vez que renderProfilePlan roda (mesmo
// dado, dois lugares) e uma vez no init(), já que o topbar aparece muito
// antes do aluno abrir "Meu Perfil" pela primeira vez.
function renderTopbarPlanBadge() {
  const plano = planStatus?.plano || "gratuito";
  topbarPlanBadgeLabel.textContent = PLAN_LABELS[plano] || plano;
  topbarPlanBadge.classList.toggle("gratuito", plano === "gratuito");
  topbarPlanBadge.classList.toggle("pro", plano === "pro");
}

topbarPlanBadge.addEventListener("click", () => openPlansModal());

function renderProfilePlan() {
  const plano = planStatus?.plano || "gratuito";
  profilePlanBadge.textContent = PLAN_LABELS[plano] || plano;
  profilePlanCard.classList.toggle("gratuito", plano === "gratuito");
  profilePlanCard.classList.toggle("pro", plano === "pro");
  profilePlanUpgrade.hidden = plano === "pro";
  renderTopbarPlanBadge();

  if (!planStatus) {
    profilePlanUsage.textContent = "";
    return;
  }

  const parts = [];
  if (planStatus.questoes_por_dia != null) {
    parts.push(`${planStatus.questoes_hoje}/${planStatus.questoes_por_dia} questões hoje`);
  }
  if (planStatus.simulados_por_mes != null) {
    parts.push(`${planStatus.simulados_mes_atual}/${planStatus.simulados_por_mes} simulado(s) este mês`);
  }
  if (planStatus.chat_mensagens_por_mes != null) {
    parts.push(`${planStatus.chat_mes_atual}/${planStatus.chat_mensagens_por_mes} mensagens do chat este mês`);
  }
  profilePlanUsage.textContent = parts.length > 0 ? parts.join(" · ") : "Uso ilimitado no seu plano.";
}

function openProfileModal() {
  if (!currentSession?.user) return;
  closeMenu();
  profileMsg.className = "profile-msg";
  profileOverlay.hidden = false;
  // Mostra o que já tem em cache na hora (sem tela em branco) e atualiza
  // assim que o dado mais fresco chegar — mesmo espírito de qualquer outra
  // tela deste app que já tem algo pra mostrar antes da rede responder.
  renderProfilePlan();
  loadPlanStatus().then(renderProfilePlan);
  loadProfile();
  resetDeleteAccountSection(); // sempre volta pro botão inicial, nunca reabre já no "tem certeza?"
}

function closeProfileModal() {
  profileOverlay.hidden = true;
}

menuProfileBtn.addEventListener("click", openProfileModal);
profileCloseBtn.addEventListener("click", closeProfileModal);
profileOverlay.addEventListener("click", (ev) => {
  if (ev.target === profileOverlay) closeProfileModal();
});
profilePlanUpgrade.addEventListener("click", () => {
  closeProfileModal();
  openPlansModal();
});

function showProfileMsg(text, ok) {
  profileMsg.textContent = text;
  profileMsg.className = "profile-msg show" + (ok ? " ok" : "");
}

async function loadProfile() {
  const user = currentSession.user;
  profEmail.value = user.email || "";
  profNome.value = "";
  profCursinho.value = "";
  profTelefone.value = "";
  profileSaveBtn.disabled = true;

  const { data, error } = await client
    .from("profiles")
    .select("nome, email, telefone, professor_id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    profileSaveBtn.disabled = false;
    showProfileMsg(`Erro ao carregar perfil: ${error.message}`, false);
    return;
  }

  profNome.value = data?.nome || "";
  profEmail.value = data?.email || user.email || "";
  profTelefone.value = data?.telefone || "";
  profileSaveBtn.disabled = false;

  // "Cursinho" nao e' um campo do proprio aluno — e' o nome do cursinho
  // cadastrado no PROFESSOR que o convidou (profiles.professor_id), definido
  // pelo admin no Portal Mestre (ver portal-mestre/js/admin.js). Precisa da
  // policy "profiles_select_own_professor" (ver
  // supabase/schema_aluno_ve_professor.sql) pra' essa segunda consulta nao
  // voltar vazia por causa do RLS.
  profCursinho.value = "Carregando...";
  if (!data?.professor_id) {
    profCursinho.value = "Não informado";
    return;
  }
  const { data: prof, error: profError } = await client
    .from("profiles")
    .select("cursinho")
    .eq("id", data.professor_id)
    .maybeSingle();
  profCursinho.value = profError ? "Não foi possível carregar" : (prof?.cursinho || "Não informado");
}

profileSaveBtn.addEventListener("click", async () => {
  if (!currentSession?.user) return;

  profileSaveBtn.disabled = true;
  const { error } = await client
    .from("profiles")
    .update({
      nome: profNome.value.trim(),
      telefone: profTelefone.value.trim(),
    })
    .eq("id", currentSession.user.id);
  profileSaveBtn.disabled = false;

  if (error) {
    showProfileMsg(`Erro ao salvar: ${error.message}`, false);
    return;
  }
  showProfileMsg("Perfil atualizado!", true);
});

// ------------------------------------------------------- Excluir conta
//
// Apaga a conta de verdade (histórico de respostas, plano, cadastro — tudo
// via aluno-portal, ação "excluir-conta", que usa service_role pra chamar
// auth.admin.deleteUser: o cliente nunca consegue apagar a própria conta de
// autenticação sozinho). Se a pessoa se cadastrar de novo com o mesmo
// e-mail depois, é uma conta 100% nova (mesmo trigger handle_new_auth_user
// de qualquer primeiro cadastro, ver schema_aluno_avulso.sql) — não sobra
// nada da anterior. Mesmo fluxo de duas etapas de "Zerar estatísticas" (ver
// buildStatsResetSection), só que bem mais sério — por isso mora dentro de
// "Meu Perfil", não solto em algum canto.
function buildDeleteAccountSection() {
  const section = document.createElement("div");
  section.className = "stats-reset-section";

  const title = document.createElement("h2");
  title.className = "stats-section-title";
  title.textContent = "Excluir conta";
  section.appendChild(title);

  const intro = document.createElement("p");
  intro.className = "stats-ai-intro";
  intro.textContent =
    "Apaga sua conta e todo o seu histórico (respostas, simulados, plano) permanentemente. Se você se cadastrar de novo depois, começa do zero, como se fosse a primeira vez.";
  section.appendChild(intro);

  const actionWrap = document.createElement("div");
  section.appendChild(actionWrap);

  function showInitial() {
    actionWrap.innerHTML = "";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-danger stats-reset-btn";
    btn.textContent = "Excluir conta";
    btn.addEventListener("click", showConfirm);
    actionWrap.appendChild(btn);
  }

  function showConfirm() {
    actionWrap.innerHTML = "";

    const warn = document.createElement("p");
    warn.className = "stats-reset-warning";
    warn.textContent =
      "Tem certeza? Sua conta e todo o seu histórico serão apagados permanentemente — não é possível desfazer.";
    actionWrap.appendChild(warn);

    const row = document.createElement("div");
    row.className = "stats-reset-confirm-row";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn-ghost";
    cancelBtn.textContent = "Cancelar";
    cancelBtn.addEventListener("click", showInitial);

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "btn-danger";
    confirmBtn.textContent = "Sim, excluir minha conta";
    confirmBtn.addEventListener("click", () => doDeleteAccount(actionWrap, confirmBtn, cancelBtn));

    row.append(cancelBtn, confirmBtn);
    actionWrap.appendChild(row);
  }

  async function doDeleteAccount(wrap, confirmBtn, cancelBtn) {
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    confirmBtn.textContent = "Excluindo...";

    try {
      await callAlunoPortal({ action: "excluir-conta" });
    } catch (err) {
      wrap.innerHTML = "";
      const errEl = document.createElement("p");
      errEl.className = "stats-ai-error";
      errEl.textContent = `Erro ao excluir conta: ${err.message || "erro inesperado"}`;
      wrap.appendChild(errEl);
      const retryBtn = document.createElement("button");
      retryBtn.type = "button";
      retryBtn.className = "btn-ghost";
      retryBtn.textContent = "Voltar";
      retryBtn.addEventListener("click", showInitial);
      wrap.appendChild(retryBtn);
      return;
    }

    wrap.innerHTML = "";
    const doneEl = document.createElement("p");
    doneEl.className = "stats-reset-warning ok";
    doneEl.textContent = "Conta excluída. Redirecionando...";
    wrap.appendChild(doneEl);

    // signOut limpa a sessão local antes de sair — a conta já não existe
    // mais no servidor, então o token guardado no navegador não serve mais
    // pra nada (mas continuaria "parecendo" válido pro cliente até expirar
    // sozinho se não fosse limpo agora). Em try/catch de propósito (mesmo
    // padrão de handleSessionLogout acima): a conta acabou de ser apagada,
    // então a própria API de signOut pode falhar tentando revogar um
    // token cujo usuário não existe mais — sem isso, o redirect abaixo
    // nunca rodaria e a pessoa ficaria presa em "Redirecionando...".
    try {
      await client.auth.signOut();
    } catch (err) {
      console.error("Erro ao encerrar sessão após excluir conta:", err);
    }
    setTimeout(() => window.location.replace("../index.html"), 1500);
  }

  showInitial();
  return section;
}

function resetDeleteAccountSection() {
  deleteAccountSection.innerHTML = "";
  deleteAccountSection.appendChild(buildDeleteAccountSection());
}

// --------------------------------------------------------- Estatísticas
//
// Ao contrario do placar da sessao atual (scoreText, so' conta o que foi
// respondido NESTA visita), aqui e' o HISTORICO COMPLETO do aluno — busca
// todas as respostas ja' registradas em oab_respostas (RLS garante que so'
// as do proprio aluno voltam, ver policy "oab_respostas_select" em
// supabase/schema_professor_portal.sql) e cruza com allQuestions (ja' em
// memoria, ver init()) pra' saber a disciplina de cada uma.

// Tela onde o aluno estava ANTES de abrir Estatisticas pelo menu (acessivel
// de qualquer uma das outras 3) — "Voltar" devolve pra' la', em vez de
// sempre cair na tela de exames.
let screenBeforeStats = "exams";

// Busca UMA vez todo o historico (ver loadAndRenderStats) e guarda aqui —
// trocar o filtro de periodo (ver statsPeriod) so' refiltra esse cache em
// memoria e re-renderiza, sem nova consulta ao banco a cada clique.
let statsAnswersCache = null;
let statsPeriod = "all"; // "today" | "7d" | "30d" | "all"

menuStatsBtn.addEventListener("click", () => {
  closeMenu();
  openStatsScreen();
});

backFromStatsBtn.addEventListener("click", () => {
  showScreen(screenBeforeStats);
  // Estatísticas pode ter acabado de buscar dados mais novos (ou zerado
  // tudo, ver "Zerar estatísticas" abaixo) — sem isso, o dashboard da Tela
  // 1 (progresso por exame, painel lateral) ficaria mostrando o estado de
  // antes de abrir Estatísticas até a página ser recarregada.
  if (screenBeforeStats === "exams") {
    renderExamGrid();
    renderSidePanels();
  }
});

function pctOf(correct, total) {
  return total === 0 ? 0 : Math.round((correct / total) * 100);
}

// Ponto de corte (ISO) pra' cada opcao do filtro — null significa "sem
// corte" (todo o historico). "Hoje" usa meia-noite local, nao "24h atras",
// pra' bater com a expectativa intuitiva de "o que respondi hoje".
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
  return answers.filter(a => a.answered_at >= cutoff);
}

// Chamado pelo listener generico de ".mode-switch" (ver secao Mode, no topo
// do arquivo) quando um botao com "data-period" e' clicado.
function setStatsPeriod(period) {
  statsPeriod = period;
  if (statsAnswersCache === null) return; // ainda carregando o historico — nada pra filtrar ainda
  renderFilteredStats();
}

function renderStatsLoading() {
  statsBody.innerHTML = "";
  const p = document.createElement("p");
  p.className = "stats-loading";
  p.textContent = "Carregando suas estatísticas...";
  statsBody.appendChild(p);
}

function renderStatsError(message) {
  statsBody.innerHTML = "";
  const p = document.createElement("p");
  p.className = "stats-error";
  p.textContent = message;
  statsBody.appendChild(p);
}

function renderStatsEmpty() {
  statsBody.innerHTML = "";
  const p = document.createElement("p");
  p.className = "stats-empty";
  p.textContent = statsPeriod === "all"
    ? "Você ainda não respondeu nenhuma questão. Vá estudar para começar a acompanhar seu desempenho aqui."
    : "Nenhuma questão respondida nesse período. Tente outro período no filtro acima.";
  statsBody.appendChild(p);
}

async function loadAndRenderStats() {
  renderStatsLoading();

  const { data, error } = await client
    .from("oab_respostas")
    .select("question_id, correct, answered_at")
    .eq("user_id", currentSession.user.id);

  if (error) {
    statsAnswersCache = null;
    renderStatsError(`Erro ao carregar estatísticas: ${error.message}`);
    return;
  }

  statsAnswersCache = data || [];
  renderFilteredStats();
}

function renderFilteredStats() {
  const answers = filterAnswersByPeriod(statsAnswersCache || [], statsPeriod);

  if (answers.length === 0) {
    renderStatsEmpty();
    return;
  }

  const byId = new Map(allQuestions.map(q => [q.id, q]));
  let total = 0;
  let correct = 0;
  const bySubject = new Map(); // discipline -> { total, correct }

  answers.forEach(a => {
    const q = byId.get(a.question_id);
    const disc = q?.discipline || "Sem disciplina";
    total++;
    if (a.correct) correct++;
    const s = bySubject.get(disc) || { total: 0, correct: 0 };
    s.total++;
    if (a.correct) s.correct++;
    bySubject.set(disc, s);
  });

  const bySubjectList = Array.from(bySubject.entries())
    .map(([discipline, s]) => ({ discipline, total: s.total, correct: s.correct }))
    .sort((a, b) => b.total - a.total);

  renderStats({ overall: { total, correct }, bySubject: bySubjectList });
}

function buildStatsSubjectRow({ discipline, total, correct }) {
  const row = document.createElement("div");
  row.className = "stats-subject-row";

  const name = document.createElement("div");
  name.className = "stats-subject-name";
  name.textContent = discipline;
  row.appendChild(name);

  const pct = pctOf(correct, total);
  const bar = document.createElement("div");
  bar.className = "stats-subject-bar";
  const fill = document.createElement("div");
  fill.className = "stats-subject-bar-fill" + (pct < 50 ? " low" : pct >= 75 ? " high" : "");
  fill.style.width = `${pct}%`;
  bar.appendChild(fill);
  row.appendChild(bar);

  const frac = document.createElement("div");
  frac.className = "stats-subject-frac";
  frac.textContent = `${correct}/${total} (${pct}%)`;
  row.appendChild(frac);

  return row;
}

function renderStats(stats) {
  statsBody.innerHTML = "";

  const overall = document.createElement("div");
  overall.className = "stats-overall";
  const pctEl = document.createElement("div");
  pctEl.className = "stats-overall-pct";
  pctEl.textContent = `${pctOf(stats.overall.correct, stats.overall.total)}%`;
  overall.appendChild(pctEl);
  const labelEl = document.createElement("div");
  labelEl.className = "stats-overall-label";
  const b = document.createElement("b");
  b.textContent = `${stats.overall.correct} de ${stats.overall.total}`;
  labelEl.append(b, " questões respondidas corretamente, no total.");
  overall.appendChild(labelEl);
  statsBody.appendChild(overall);

  const subjectsSection = document.createElement("div");
  const subjectsTitle = document.createElement("h2");
  subjectsTitle.className = "stats-section-title";
  subjectsTitle.textContent = "Desempenho por matéria";
  subjectsSection.appendChild(subjectsTitle);
  const subjectsList = document.createElement("div");
  subjectsList.className = "stats-subjects";
  stats.bySubject.forEach(s => subjectsList.appendChild(buildStatsSubjectRow(s)));
  subjectsSection.appendChild(subjectsList);
  statsBody.appendChild(subjectsSection);

  const aiSection = document.createElement("div");
  const aiTitle = document.createElement("h2");
  aiTitle.className = "stats-section-title";
  aiTitle.textContent = "Análise por IA";
  aiSection.appendChild(aiTitle);
  statsBody.appendChild(aiSection);

  // Roda automaticamente ao entrar na tela (nao precisa mais pedir com um
  // clique) — o link "Atualizar analise" (ver appendStatsAiRefreshLink)
  // continua disponivel depois, caso o aluno responda mais questoes e
  // volte aqui na mesma visita sem recarregar a pagina.
  requestStatsAnalysis(stats, aiSection);

  statsBody.appendChild(buildStatsResetSection());
}

function appendStatsAiRefreshLink(stats, aiSection, label) {
  const link = document.createElement("button");
  link.type = "button";
  link.className = "select-all-btn stats-ai-refresh";
  link.textContent = label;
  link.addEventListener("click", () => requestStatsAnalysis(stats, aiSection));
  aiSection.appendChild(link);
}

// Chama a Edge Function "estatisticas-ia" (mesmo padrao de dr-laureano, ver
// supabase/functions/estatisticas-ia/index.ts) com os dados JA' agregados
// (nenhuma resposta individual e' enviada, so' totais por materia) — a IA
// devolve 3 campos (pontosFracos/precisaEstudar/pontosFortes), cada um null
// quando ainda nao ha' dados suficientes pra aquela analise especifica.
async function requestStatsAnalysis(stats, aiSection) {
  aiSection.querySelectorAll(".stats-ai-loading, .stats-ai-error, .stats-ai-cards, .stats-ai-refresh, .stats-ai-locked")
    .forEach(el => el.remove());

  // Recurso do plano Básico/Pro (plan_limits.estatisticas_ia) — plano
  // grátis nem chega a chamar a Edge Function (que também recusaria, ver
  // supabase/functions/estatisticas-ia/index.ts — esta checagem aqui é só
  // pra não gastar uma chamada de rede à toa e mostrar o aviso na hora).
  if (planStatus && planStatus.estatisticas_ia === false) {
    const locked = document.createElement("div");
    locked.className = "stats-ai-locked";
    locked.innerHTML = `Análise por IA é um recurso dos planos Básico e Pro. ${UPGRADE_LINK_HTML} pra desbloquear.`;
    aiSection.appendChild(locked);
    return;
  }

  const loading = document.createElement("p");
  loading.className = "stats-ai-loading";
  loading.textContent = "Analisando seu desempenho...";
  aiSection.appendChild(loading);

  const { data, error } = await client.functions.invoke("estatisticas-ia", { body: stats });

  loading.remove();

  if (error || !data) {
    const errEl = document.createElement("p");
    errEl.className = "stats-ai-error";
    errEl.textContent = "Não foi possível gerar a análise agora. Tente novamente em instantes.";
    aiSection.appendChild(errEl);
    appendStatsAiRefreshLink(stats, aiSection, "Tentar novamente");
    return;
  }

  const cards = document.createElement("div");
  cards.className = "stats-ai-cards";

  [
    { key: "pontosFracos", cls: "weak", title: "Pontos fracos" },
    { key: "precisaEstudar", cls: "focus", title: "Precisa estudar mais" },
    { key: "pontosFortes", cls: "strong", title: "Pontos fortes" },
  ].forEach(({ key, cls, title }) => {
    const card = document.createElement("div");
    card.className = `stats-ai-card ${cls}`;
    const h3 = document.createElement("h3");
    h3.textContent = title;
    card.appendChild(h3);
    const p = document.createElement("p");
    p.textContent = data[key] || "Ainda não há dados suficientes para essa análise — continue respondendo questões.";
    card.appendChild(p);
    cards.appendChild(card);
  });

  aiSection.appendChild(cards);
  appendStatsAiRefreshLink(stats, aiSection, "Atualizar análise");
}

// ------------------------------------------------- Zerar estatísticas
//
// Apaga TODO o historico de respostas do aluno (oab_respostas) — precisa da
// policy "oab_respostas_delete_self" (ver
// supabase/schema_aluno_zera_respostas.sql), que nao existia ate' agora
// (oab_respostas foi criada de proposito so' com SELECT/INSERT). Fluxo em
// dois passos (botao inicial -> aviso + confirmar/cancelar) pra' nao deixar
// uma acao destrutiva a um clique de distancia.
function buildStatsResetSection() {
  const section = document.createElement("div");
  section.className = "stats-reset-section";

  const title = document.createElement("h2");
  title.className = "stats-section-title";
  title.textContent = "Zerar estatísticas";
  section.appendChild(title);

  const intro = document.createElement("p");
  intro.className = "stats-ai-intro";
  intro.textContent = "Apaga todo o seu histórico de respostas da 1ª fase (acertos e erros). Essa ação não pode ser desfeita.";
  section.appendChild(intro);

  const actionWrap = document.createElement("div");
  section.appendChild(actionWrap);

  function showInitial() {
    actionWrap.innerHTML = "";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-danger stats-reset-btn";
    btn.textContent = "Zerar estatísticas";
    btn.addEventListener("click", showConfirm);
    actionWrap.appendChild(btn);
  }

  function showConfirm() {
    actionWrap.innerHTML = "";

    const warn = document.createElement("p");
    warn.className = "stats-reset-warning";
    warn.textContent = "Tem certeza? Todas as suas respostas registradas serão apagadas permanentemente.";
    actionWrap.appendChild(warn);

    const row = document.createElement("div");
    row.className = "stats-reset-confirm-row";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn-ghost";
    cancelBtn.textContent = "Cancelar";
    cancelBtn.addEventListener("click", showInitial);

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "btn-danger";
    confirmBtn.textContent = "Confirmar";
    confirmBtn.addEventListener("click", () => doResetStats(actionWrap, confirmBtn, cancelBtn));

    row.append(cancelBtn, confirmBtn);
    actionWrap.appendChild(row);
  }

  async function doResetStats(wrap, confirmBtn, cancelBtn) {
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    confirmBtn.textContent = "Apagando...";

    const { error } = await client
      .from("oab_respostas")
      .delete()
      .eq("user_id", currentSession.user.id);

    if (error) {
      wrap.innerHTML = "";
      const errEl = document.createElement("p");
      errEl.className = "stats-ai-error";
      errEl.textContent = `Erro ao zerar estatísticas: ${error.message}`;
      wrap.appendChild(errEl);
      return;
    }

    // Tambem limpa o placar da sessao atual e as respostas ja' reveladas —
    // senao uma questao respondida NESTA visita continuaria mostrando o
    // resultado antigo mesmo com o registro apagado do banco.
    results.clear();
    correctCount = 0;
    answeredCount = 0;
    updateScoreUI();

    // Zerou TUDO — o cache local e o filtro de periodo tambem voltam ao
    // estado inicial ("Sempre"), senao um filtro estreito (ex.: "Hoje")
    // continuaria escondendo o fato de que o historico inteiro sumiu.
    statsAnswersCache = [];
    statsPeriod = "all";
    document.querySelectorAll("#statsPeriodSwitch .mode-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.period === "all");
    });

    renderStatsEmpty();
  }

  showInitial();
  return section;
}

// -------------------------------------------------------------- Keyboard

document.addEventListener("keydown", (ev) => {
  if (ev.target.tagName === "INPUT" || ev.target.tagName === "TEXTAREA") return;
  if (screenStudy.hidden) return;
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
// para a animacao de pulso, mostra a lista de funcionalidades (so' texto e
// icones, nada clicavel ali) e revela o botao "Comecar" — o UNICO controle
// da tela. So' desaparece de fato quando o aluno clica nele (nao sozinha),
// pra dar tempo de ver o que o app oferece antes de entrar. A explicacao
// detalhada (modal "Como funciona") fica disponivel depois, pelo "?" do
// topo — ver openHelpModal.
//
// So' na PRIMEIRA vez dentro da mesma aba/sessao: cada navegacao entre
// "estudos/index.html" (1a Fase) e "simulado2fase.html" (2a Fase) e' uma
// troca de pagina de verdade (nao SPA), entao o JS reinicia do zero e as
// questoes precisam ser buscadas de novo a cada ida-e-volta — mas ja' vimos
// a introducao (mascote, lista de funcionalidades, "Comecar") uma vez, e
// repeti-la a cada volta da 2a Fase seria cansativo. sessionStorage
// persiste entre paginas na mesma aba (e some quando a aba/navegador
// fecha), exatamente o escopo certo aqui — nao e' "lembrar pra sempre",
// so' "nao repetir dentro desta visita".
const INTRO_SEEN_KEY = "neuraoab-intro-seen";

function hasSeenIntro() {
  try {
    return sessionStorage.getItem(INTRO_SEEN_KEY) === "1";
  } catch {
    return false; // sessionStorage indisponivel (ex.: aba anonima) -> mostra a introducao normalmente
  }
}

function markIntroSeen() {
  try {
    sessionStorage.setItem(INTRO_SEEN_KEY, "1");
  } catch {
    // sem persistencia -> a introducao volta a aparecer na proxima pagina, sem quebrar nada
  }
}

let loadingMode = "loading"; // "loading" | "ready" | "error"

function showLoadingReady() {
  loadingMode = "ready";

  if (hasSeenIntro()) {
    // Ja' viu a introducao nesta aba (ex.: voltando da 2a Fase) — pula
    // direto pra tela de escolha de exame, sem repetir a lista de
    // funcionalidades nem exigir um clique em "Comecar" de novo.
    loadingSplash.remove();
    return;
  }

  loadingSplash.classList.add("ready");
  loadingMessage.textContent = `${allQuestions.length} questões carregadas. Veja o que você pode fazer:`;
  loadingFeatures.hidden = false;
  loadingStartBtn.hidden = false;
  loadingStartBtn.textContent = "Começar";
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
  if (loadingMode === "error") {
    location.reload();
    return;
  }
  markIntroSeen();
  loadingSplash.remove();
});

// Mesma busca que loadAndRenderStats() já fazia (linha ~1360), só que
// chamada mais cedo — em paralelo com fetchAllQuestions() no init() — pra
// o dashboard da Tela 1 (progresso por exame, painel lateral, recomendação)
// já nascer com dado real, sem esperar o aluno abrir Estatísticas primeiro.
// Nunca lança: uma falha aqui não deve impedir a Tela 1 de aparecer, só
// deixa o progresso "zerado" até o aluno tentar de novo em Estatísticas.
async function fetchStudentAnswers(userId) {
  const { data, error } = await client
    .from("oab_respostas")
    .select("question_id, correct, answered_at")
    .eq("user_id", userId);
  if (error) {
    console.error("Falha ao carregar respostas do aluno:", error.message);
    return [];
  }
  return data || [];
}

// A saudacao busca "profiles.nome" direto (em vez de reaproveitar
// currentSession.user.user_metadata?.nome, como o resto do app faz) porque
// nem toda conta passa por ali com nome preenchido no metadata (ex.: login
// com Google sem nome, ou conta que so' aceitou um convite sem nunca ter
// passado pelo formulario de cadastro) — "profiles.nome" e' a mesma coluna
// que "Meu Perfil"/profileSaveBtn edita, entao e' sempre a fonte mais
// atualizada.
async function fetchStudentFirstName(userId) {
  const { data, error } = await client
    .from("profiles")
    .select("nome")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data?.nome) return null;
  return data.nome.trim().split(/\s+/)[0] || null;
}

// Sem nome cadastrado ainda (aluno convidado que nunca preencheu "Meu
// Perfil"), o título cai de volta pro texto estático já escrito no HTML
// (ver <h1 id="dashboardGreeting"> em estudos/index.html) — nunca um
// "Olá, ! Escolha sua prova." com o nome faltando.
function renderDashboardGreeting(firstName) {
  if (!firstName) return;
  dashboardGreeting.textContent = `Olá, ${firstName}! Escolha sua prova.`;
}

async function init() {
  const session = await requireAuth();
  if (!session) return; // requireAuth ja' redirecionou pra' landing page

  currentSession = session;
  updateSessionUI();
  checkPendingConvite(); // não bloqueia o resto do carregamento — ver comentário na definição

  let data;
  let answers;
  let firstName;
  try {
    [data, answers, , firstName] = await Promise.all([
      fetchAllQuestions(),
      fetchStudentAnswers(session.user.id),
      loadFavoritos(),
      fetchStudentFirstName(session.user.id),
      loadPlanStatus(),
    ]);
  } catch (error) {
    showLoadingError(`Erro ao carregar questões: ${error.message}`);
    return;
  }

  allQuestions = data || [];
  statsAnswersCache = answers || [];
  renderDashboardGreeting(firstName);
  applyPhaseTabLock();
  renderTopbarPlanBadge();

  if (allQuestions.length === 0) {
    showLoadingError("Nenhuma questão no banco ainda. Importe um JSON na aba Admin.");
    return;
  }

  renderExamGrid();
  renderSidePanels();
  renderDashboardTip();
  showScreen("exams");
  showLoadingReady();

  // Chegou aqui com "#upgrade" na URL (ex.: link de upgrade em
  // simulado2fase.js, que não tem o modal de planos na própria página) —
  // abre o modal direto, sem o aluno precisar achar "Meu Perfil" sozinho.
  if (window.location.hash === "#upgrade") {
    history.replaceState({}, document.title, window.location.pathname);
    openPlansModal();
  }
}

init();
