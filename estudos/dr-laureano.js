// Chat "Dr. Laureano" — painel lateral direito.
//
// `client` (o cliente Supabase) e' declarado em estudos.js, que carrega
// antes deste arquivo; scripts classicos na mesma pagina compartilham o
// mesmo escopo global, entao ele fica acessivel aqui sem reimportar nada.

const chatPanel = document.getElementById("chatPanel");
const chatToggle = document.getElementById("chatToggle");
const chatClose = document.getElementById("chatClose");
const chatMessagesEl = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatSendBtn = document.getElementById("chatSend");

let currentQuestion = null;
let chatHistory = []; // { role: "user" | "assistant", content } — so' para o contexto enviado a IA
let sending = false;

// -------------------------------------------------------------- Recolher

function setChatExpanded(expanded) {
  chatPanel.classList.toggle("expanded", expanded);
  chatToggle.setAttribute("aria-expanded", String(expanded));
  chatToggle.setAttribute("aria-label", expanded ? "Fechar chat com Dr. Laureano" : "Abrir chat com Dr. Laureano");
  const scrollArea = chatPanel.querySelector(".chat-scroll");
  if (expanded) scrollArea.removeAttribute("inert");
  else scrollArea.setAttribute("inert", "");
}

chatToggle.addEventListener("click", () => {
  setChatExpanded(!chatPanel.classList.contains("expanded"));
});

chatClose.addEventListener("click", () => setChatExpanded(false));

setChatExpanded(false);

// ------------------------------------------------------------- Mensagens
//
// Cada mensagem e' anexada uma vez (nao ha' um "re-render" da lista inteira
// a cada mudanca) — isso e' o que permite a resposta do Dr. Laureano
// "aparecer" progressivamente sem afetar as bolhas ja mostradas.

// A IA foi instruida a nao usar markdown, mas isso e' uma rede de
// seguranca: remove simbolos de formatacao (**negrito**, #titulos, listas
// com "-"/"*", `codigo`) caso ainda apareçam, para o texto nunca mostrar
// caracteres especiais soltos na tela.
function stripMarkdown(text) {
  return String(text)
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

// So' rola para o fim automaticamente se o usuario ja' estava perto do fim
// (deixa ele rolar livremente pra cima pra reler algo, mesmo com o Dr.
// Laureano ainda "falando" — a rolagem automatica nao briga com isso).
const AUTO_SCROLL_THRESHOLD = 48;

function isNearBottom() {
  return chatMessagesEl.scrollHeight - chatMessagesEl.scrollTop - chatMessagesEl.clientHeight < AUTO_SCROLL_THRESHOLD;
}

function appendMessageBubble(role) {
  const wasNearBottom = isNearBottom();
  const div = document.createElement("div");
  div.className = "chat-msg " + role;
  chatMessagesEl.appendChild(div);
  if (wasNearBottom) chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  return div;
}

// Efeito de "falando": revela o texto aos poucos em vez de tudo de uma vez.
// Velocidade em caracteres por segundo, independente da taxa de quadros.
const TYPING_CHARS_PER_SECOND = 40;

function typeIntoBubble(el, text) {
  return new Promise(resolve => {
    let shown = 0;
    let carry = 0;
    let lastTime = null;

    function step(time) {
      if (lastTime === null) lastTime = time;
      carry += ((time - lastTime) / 1000) * TYPING_CHARS_PER_SECOND;
      lastTime = time;

      const advance = Math.floor(carry);
      if (advance > 0) {
        carry -= advance;
        shown = Math.min(text.length, shown + advance);
        const wasNearBottom = isNearBottom();
        el.textContent = text.slice(0, shown);
        if (wasNearBottom) chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
      }

      if (shown < text.length) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    }

    requestAnimationFrame(step);
  });
}

async function sayAsLaureano(text) {
  const clean = stripMarkdown(text);
  const bubble = appendMessageBubble("assistant");
  await typeIntoBubble(bubble, clean);
  return clean;
}

function updateInputAvailability() {
  const disabled = !currentQuestion || sending;
  chatInput.disabled = disabled;
  chatSendBtn.disabled = disabled;
}

async function resetChatForQuestion(question) {
  currentQuestion = question;
  chatHistory = [];
  chatMessagesEl.innerHTML = "";
  updateInputAvailability();

  if (question) {
    const disciplinaTxt = question.discipline ? ` de ${question.discipline}` : "";
    const greeting = `Olá! Sou o Dr. Laureano. Estou vendo aqui a Questão ${question.number}${disciplinaTxt}. ` +
      "Pode perguntar sobre o enunciado ou as alternativas, e eu te ajudo a raciocinar. " +
      "Se quiser saber a resposta certa direto, é só pedir.";
    const shown = await sayAsLaureano(greeting);
    chatHistory.push({ role: "assistant", content: shown });
  } else {
    await sayAsLaureano("Selecione uma questão para eu poder ajudar.");
  }
}

document.addEventListener("question:changed", (ev) => {
  resetChatForQuestion(ev.detail);
});

// ----------------------------------------------------------------- Envio

async function sendChatMessage(text) {
  if (!currentQuestion || sending) return;
  sending = true;
  updateInputAvailability();

  chatHistory.push({ role: "user", content: text });
  appendMessageBubble("user").textContent = text;

  const pending = appendMessageBubble("assistant pending");
  pending.textContent = "Dr. Laureano está digitando...";

  let replyText = null;
  try {
    const { data, error } = await client.functions.invoke("dr-laureano", {
      body: {
        question: {
          number: currentQuestion.number,
          statement: currentQuestion.statement,
          alternatives: currentQuestion.alternatives,
          discipline: currentQuestion.discipline,
          correct_answer: currentQuestion.correct_answer,
        },
        messages: chatHistory,
      },
    });

    if (error || !data?.reply) throw error || new Error("Resposta vazia.");
    replyText = data.reply;
  } catch {
    replyText = null;
  }

  pending.remove();

  if (replyText === null) {
    const shown = await sayAsLaureano("Desculpe, não consegui responder agora. Tente novamente em instantes.");
    chatHistory.push({ role: "assistant", content: shown });
  } else {
    const shown = await sayAsLaureano(replyText);
    chatHistory.push({ role: "assistant", content: shown });
  }

  sending = false;
  updateInputAvailability();
}

function autoResizeChatInput() {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
}

chatForm.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = "";
  autoResizeChatInput();
  sendChatMessage(text);
});

chatInput.addEventListener("input", autoResizeChatInput);

chatInput.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && !ev.shiftKey) {
    ev.preventDefault();
    chatForm.requestSubmit();
  }
});

resetChatForQuestion(null);
