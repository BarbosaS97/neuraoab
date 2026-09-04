// NeuraOAB — Portal do Professor — card de planos pra cursinho, mostrado na
// tela "Acesso Restrito" (index.html) pra quem loga com um e-mail que ainda
// não está na allowlist (ver professores_autorizados, js/auth.js). Só
// monta o card e liga os botões — não depende de sessão nem faz nenhuma
// chamada de rede, então roda direto no carregamento da página, mesmo que
// o card comece escondido (dentro de #restrictedView, hidden por padrão).

const PLANOS_CURSINHO = [
  { id: "curso20", label: "Curso 20", alunos: "até 20 alunos", preco: "R$ 239,80" },
  { id: "curso50", label: "Curso 50", alunos: "até 50 alunos", preco: "R$ 549,50" },
  { id: "curso100", label: "Curso 100", alunos: "até 100 alunos", preco: "R$ 989,00" },
];

const BENEFICIOS_CURSINHO = [
  "Tudo do Pro",
  "Gestão de turmas",
  "Relatórios por aluno",
  "Convite em lote",
  "Dashboard do professor",
];

const WHATSAPP_NUMERO = "5561982395208"; // (61) 98239-5208
const WHATSAPP_NUMERO_FORMATADO = "(61) 98239-5208";

function whatsappLink(mensagem) {
  return `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensagem)}`;
}

const CHECK_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

function buildPlansCard() {
  const container = document.getElementById("plansCard");
  const contactLine = document.getElementById("whatsappContactLine");
  if (!container) return; // esta página não tem o card (não é index.html)

  let activeId = PLANOS_CURSINHO[0].id;

  const tabsEl = document.createElement("div");
  tabsEl.className = "plans-tabs";

  const panelEl = document.createElement("div");
  panelEl.className = "plan-panel";

  function renderPanel() {
    const plano = PLANOS_CURSINHO.find((p) => p.id === activeId);
    panelEl.innerHTML = "";

    const alunosEl = document.createElement("p");
    alunosEl.className = "plan-alunos";
    alunosEl.textContent = plano.alunos;
    panelEl.appendChild(alunosEl);

    const priceEl = document.createElement("div");
    priceEl.className = "plan-price";
    const priceValue = document.createElement("span");
    priceValue.className = "plan-price-value";
    priceValue.textContent = plano.preco;
    const pricePeriod = document.createElement("span");
    pricePeriod.className = "plan-price-period";
    pricePeriod.textContent = "por mês";
    priceEl.append(priceValue, pricePeriod);
    panelEl.appendChild(priceEl);

    const featuresEl = document.createElement("ul");
    featuresEl.className = "plan-features";
    BENEFICIOS_CURSINHO.forEach((beneficio) => {
      const item = document.createElement("li");
      item.className = "plan-feature-item";
      item.innerHTML = CHECK_ICON;
      item.appendChild(document.createTextNode(beneficio));
      featuresEl.appendChild(item);
    });
    panelEl.appendChild(featuresEl);

    const ctaBtn = document.createElement("a");
    ctaBtn.className = "btn-accent plan-cta";
    ctaBtn.target = "_blank";
    ctaBtn.rel = "noopener noreferrer";
    ctaBtn.textContent = "Contratar via WhatsApp";
    ctaBtn.href = whatsappLink(
      `Olá! Tenho interesse no plano ${plano.label} (${plano.alunos}) do Portal do Professor NeuraOAB.`,
    );
    panelEl.appendChild(ctaBtn);
  }

  PLANOS_CURSINHO.forEach((plano) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "plan-tab" + (plano.id === activeId ? " active" : "");
    tab.textContent = plano.label;
    tab.addEventListener("click", () => {
      activeId = plano.id;
      tabsEl.querySelectorAll(".plan-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      renderPanel();
    });
    tabsEl.appendChild(tab);
  });

  renderPanel();
  container.append(tabsEl, panelEl);

  if (contactLine) {
    contactLine.innerHTML = "";
    contactLine.appendChild(document.createTextNode("💬 Entre em contato: "));
    const link = document.createElement("a");
    link.href = whatsappLink("Olá! Gostaria de saber mais sobre os planos pra cursinho do NeuraOAB.");
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = WHATSAPP_NUMERO_FORMATADO;
    contactLine.appendChild(link);
  }
}

buildPlansCard();
