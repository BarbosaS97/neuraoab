// Chat "Dr. Laureano" — painel lateral direito.
//
// `client` (o cliente Supabase) e' declarado em estudos.js, que carrega
// antes deste arquivo; scripts classicos na mesma pagina compartilham o
// mesmo escopo global, entao ele fica acessivel aqui sem reimportar nada.

const chatPanel = document.getElementById("chatPanel");
const chatToggle = document.getElementById("chatToggle");
const chatToggleAvatar = document.getElementById("chatToggleAvatar");
const chatClose = document.getElementById("chatClose");
const chatClearBtn = document.getElementById("chatClearBtn");
const chatClearConfirm = document.getElementById("chatClearConfirm");
const chatClearCancel = document.getElementById("chatClearCancel");
const chatClearConfirmBtn = document.getElementById("chatClearConfirmBtn");
const chatMessagesEl = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatSendBtn = document.getElementById("chatSend");

let currentQuestion = null;
let chatHistory = []; // { role: "user" | "assistant", content } — so' para o contexto enviado a IA
let sending = false;
let stopRequested = false;
let suggestionsEl = null;

// Incrementado a cada troca de questao — usado pra uma chamada assincrona
// antiga (resetChatForQuestion ou sendChatMessage de uma questao anterior)
// perceber que foi superada e desistir, em vez de escrever por cima do
// chat da questao atual (ex.: duplicar as sugestoes, ou uma resposta
// chegar depois do aluno ja' ter trocado de questao).
let chatGeneration = 0;

const SEND_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
  <line x1="4" y1="12" x2="20" y2="12"></line>
  <polyline points="13 5 20 12 13 19"></polyline>
</svg>`;

const STOP_ICON = `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
  <rect x="5" y="5" width="14" height="14" rx="2.5"></rect>
</svg>`;

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

// O retrato do Dr. Laureano (acima do botao "IA") e' um alvo de clique
// obvio pro aluno, mesmo sem ser o controle com o aria-label — abre o chat
// exatamente como o botao ao lado.
chatToggleAvatar.addEventListener("click", () => {
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
//
// "stickToBottom" (nao um "isNearBottom()" recalculado bem em cima de cada
// atualizacao) e' o que faz isso funcionar de verdade: durante o efeito de
// "digitando", o texto cresce a ~40 caracteres/segundo, uma checagem por
// quadro — se a decisao de rolar dependesse so' de reler a posicao atual
// bem no instante de cada letra nova, um scroll leve (uma rodinha de mouse
// suave, ou o comeco de um arrasto de dedo no mobile) nunca teria chance de
// "grudar": antes do gesto passar dos 48px de limiar, o proximo quadro ja'
// forcava a rolagem de volta pro fundo, cancelando o gesto no meio. Aqui a
// flag so' muda quando o PROPRIO usuario rola (evento "scroll" real do
// navegador), entao um arrasto ou uma rodinha leve desliga a rolagem
// automatica de vez, sem disputa — ela so' volta a seguir o fundo se o
// usuario mesmo rolar de volta pra perto dele.
const AUTO_SCROLL_THRESHOLD = 48;
let stickToBottom = true;

function isNearBottom() {
  return chatMessagesEl.scrollHeight - chatMessagesEl.scrollTop - chatMessagesEl.clientHeight < AUTO_SCROLL_THRESHOLD;
}

chatMessagesEl.addEventListener("scroll", () => {
  stickToBottom = isNearBottom();
});

function appendMessageBubble(role) {
  const div = document.createElement("div");
  div.className = "chat-msg " + role;
  chatMessagesEl.appendChild(div);
  if (stickToBottom) chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  return div;
}

// Efeito de "falando": revela o texto aos poucos em vez de tudo de uma vez.
// Velocidade em caracteres por segundo, independente da taxa de quadros.
const TYPING_CHARS_PER_SECOND = 40;

// Devolve { interrupted, shownText }: se o botao "parar" for clicado no
// meio da digitacao, congela exatamente onde estava (NAO pula pro texto
// inteiro) — o resto da resposta e' descartado de verdade, nao so'
// escondido visualmente.
function typeIntoBubble(el, text) {
  return new Promise(resolve => {
    let shown = 0;
    let carry = 0;
    let lastTime = null;

    function step(time) {
      if (stopRequested) {
        resolve({ interrupted: true, shownText: el.textContent });
        return;
      }

      if (lastTime === null) lastTime = time;
      carry += ((time - lastTime) / 1000) * TYPING_CHARS_PER_SECOND;
      lastTime = time;

      const advance = Math.floor(carry);
      if (advance > 0) {
        carry -= advance;
        shown = Math.min(text.length, shown + advance);
        el.textContent = text.slice(0, shown);
        if (stickToBottom) chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
      }

      if (shown < text.length) {
        requestAnimationFrame(step);
      } else {
        resolve({ interrupted: false, shownText: text });
      }
    }

    requestAnimationFrame(step);
  });
}

function appendInterruptedNote() {
  const note = document.createElement("div");
  note.className = "chat-interrupted-note";
  note.textContent = "Resposta interrompida.";
  chatMessagesEl.appendChild(note);
  if (stickToBottom) chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

async function sayAsLaureano(text) {
  const clean = stripMarkdown(text);
  const bubble = appendMessageBubble("assistant");
  const result = await typeIntoBubble(bubble, clean);
  if (result.interrupted) {
    appendInterruptedNote();
    return result.shownText;
  }
  return clean;
}

// `planStatus` e' declarado em estudos.js (script classico carregado antes
// deste — mesmo escopo global, ver comentario no topo do arquivo) e mantido
// atualizado por loadPlanStatus() ali. Le direto daqui em vez de duplicar
// esse estado: se o aluno ja' gastou as mensagens do mes, nem deixa tentar
// mandar mais uma (increment_plan_usage_for, no servidor, e' quem decide de
// verdade — isto aqui e' so' pra' nao deixar a pessoa digitar a toa).
function isChatLimitReached() {
  return !!(
    planStatus &&
    planStatus.chat_mensagens_por_mes != null &&
    planStatus.chat_mes_atual >= planStatus.chat_mensagens_por_mes
  );
}

function appendUpgradeCta() {
  const wrap = document.createElement("div");
  wrap.className = "chat-upgrade-cta";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Ver planos e fazer upgrade →";
  // openPlansModal e' declarada em estudos.js (mesmo escopo global, ver
  // comentario no topo deste arquivo) — abre o modal de planos direto no
  // dashboard, sem sair da tela de estudo.
  btn.addEventListener("click", () => openPlansModal());
  wrap.appendChild(btn);
  chatMessagesEl.appendChild(wrap);
  if (stickToBottom) chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function updateInputAvailability() {
  // O textarea trava enquanto o Dr. Laureano esta' respondendo (nao da'
  // pra mandar outra pergunta em cima) ou depois que a cota mensal do plano
  // acabou (isChatLimitReached) — nesse ultimo caso o botao tambem trava
  // (nao vira' "parar", nao ha' nada rodando).
  const limitReached = isChatLimitReached();
  chatInput.disabled = !currentQuestion || sending || limitReached;
  chatInput.placeholder = limitReached ? "Limite mensal atingido — faça upgrade pra continuar" : "Pergunte sobre esta questão...";
  chatSendBtn.disabled = !currentQuestion || limitReached;
  // Limpar no meio de uma resposta sendo gerada não faz sentido (ela ainda
  // ia terminar de "digitar" e recriar a bolha) — mesma trava de sending.
  chatClearBtn.disabled = !currentQuestion || sending;
}

function setSendButtonMode(mode) {
  const isStop = mode === "stop";
  chatSendBtn.innerHTML = isStop ? STOP_ICON : SEND_ICON;
  chatSendBtn.classList.toggle("stop-mode", isStop);
  chatSendBtn.setAttribute("aria-label", isStop ? "Parar resposta" : "Enviar pergunta");
}

// Perguntas prontas mostradas logo apos a saudacao, pra dar um ponto de
// partida claro em vez de uma caixa de texto vazia — somem assim que o
// aluno manda a primeira pergunta (dele ou clicando numa sugestao).
const STARTER_SUGGESTIONS = [
  "Me ajuda a entender o enunciado?",
  "Como devo pensar sobre as alternativas?",
  "Qual é a resposta certa?",
];

function showSuggestions() {
  const wrap = document.createElement("div");
  wrap.className = "chat-suggestions";
  STARTER_SUGGESTIONS.forEach(text => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chat-suggestion";
    chip.textContent = text;
    chip.addEventListener("click", () => sendChatMessage(text));
    wrap.appendChild(chip);
  });
  chatMessagesEl.appendChild(wrap);
  if (stickToBottom) chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  suggestionsEl = wrap;
}

function clearSuggestions() {
  if (suggestionsEl) {
    suggestionsEl.remove();
    suggestionsEl = null;
  }
}

// --------------------------------------------------------- Conversa salva
//
// Uma linha por (aluno, questão) — ver supabase/schema_chat_conversas.sql
// pro porquê dessa chave (o chat é por questão, não um único fio contínuo).
// Só funciona logado (currentSession vem de estudos.js, mesmo script
// classico/escopo global do topo do arquivo) — uso anônimo do chat
// continua exatamente como sempre foi, só sem sincronizar entre visitas.

async function loadSavedConversation(questionId) {
  if (!currentSession?.user || !questionId) return null;
  const { data, error } = await client
    .from("chat_conversas")
    .select("messages")
    .eq("user_id", currentSession.user.id)
    .eq("question_id", questionId)
    .maybeSingle();
  if (error || !data || !Array.isArray(data.messages) || data.messages.length === 0) return null;
  return data.messages;
}

// Dispara e esquece de propósito (nunca await no chamador) — salvar a
// conversa é um "nice to have" em paralelo, não pode travar a digitação do
// Dr. Laureano nem virar um erro visível pro aluno se a rede falhar.
function saveConversation(questionId, messages) {
  if (!currentSession?.user || !questionId) return;
  client
    .from("chat_conversas")
    .upsert(
      { user_id: currentSession.user.id, question_id: questionId, messages },
      { onConflict: "user_id,question_id" },
    )
    .then(({ error }) => {
      if (error) console.error("dr-laureano: falha ao salvar conversa", error.message);
    });
}

function deleteSavedConversation(questionId) {
  if (!currentSession?.user || !questionId) return Promise.resolve();
  return client
    .from("chat_conversas")
    .delete()
    .eq("user_id", currentSession.user.id)
    .eq("question_id", questionId)
    .then(({ error }) => {
      if (error) console.error("dr-laureano: falha ao apagar conversa", error.message);
    });
}

// Todo lugar que adicionava direto em chatHistory.push(...) passa a usar
// isto — grava a mensagem E persiste o array inteiro de uma vez (ver
// saveConversation), sem precisar lembrar de chamar as duas coisas em cada
// call site.
function recordMessage(role, content) {
  chatHistory.push({ role, content });
  saveConversation(currentQuestion?.id, chatHistory);
}

// Mostra uma mensagem já concluída de uma vez (sem o efeito de "digitando"
// de sayAsLaureano) — usado só pra repor uma conversa salva, que o aluno já
// leu antes; "tocar" ela de novo, letra por letra, seria estranho.
function appendStaticMessage(role, content) {
  const bubble = appendMessageBubble(role);
  bubble.textContent = role === "assistant" ? stripMarkdown(content) : content;
}

async function resetChatForQuestion(question) {
  const myGeneration = ++chatGeneration;
  currentQuestion = question;
  chatHistory = [];
  chatMessagesEl.innerHTML = "";
  suggestionsEl = null;
  stopRequested = false;
  stickToBottom = true; // chat novo/vazio — volta a seguir o fundo por padrao
  sending = false; // abandona qualquer resposta pendente da questao anterior
  setSendButtonMode("send");
  updateInputAvailability();
  chatClearConfirm.hidden = true; // confirmacao de limpar era da questao anterior

  if (!question) {
    appendStaticMessage("assistant", "Selecione uma questão para eu poder ajudar.");
    return;
  }

  // Retoma a conversa salva desta questao, se existir — continua de onde
  // parou (em qualquer dispositivo), sem saudacao nova nem sugestoes, como
  // reabrir um chat de verdade em vez de comecar tudo de novo.
  const saved = await loadSavedConversation(question.id);
  if (myGeneration !== chatGeneration) return; // aluno ja' trocou de questao de novo

  if (saved) {
    chatHistory = saved;
    saved.forEach((m) => appendStaticMessage(m.role, m.content));
    updateInputAvailability();
    return;
  }

  const disciplinaTxt = question.discipline ? ` de ${question.discipline}` : "";
  const greeting = `Olá! Sou o Dr. Laureano. Estou vendo aqui a Questão ${question.number}${disciplinaTxt}. ` +
    "Pode perguntar sobre o enunciado ou as alternativas, e eu te ajudo a raciocinar. " +
    "Se quiser saber a resposta certa direto, é só pedir.";
  // Fixa, sem efeito de "digitando" — é a PRIMEIRA coisa que aparece no
  // chat, antes de qualquer interação do aluno (pedido explícito: só as
  // respostas de verdade do Dr. Laureano, depois de uma pergunta, "falam"
  // aos poucos; a saudação inicial só aparece pronta).
  appendStaticMessage("assistant", greeting);
  recordMessage("assistant", greeting);

  if (isChatLimitReached()) {
    // Cota do mes ja' esgotada (ver isChatLimitReached) — nem oferece as
    // sugestoes de pergunta, ja' avisa de cara em vez de deixar o aluno
    // clicar numa delas so' pra' descobrir que esta' bloqueado. Tambem
    // fixa, mesmo motivo da saudacao acima — ainda antes de qualquer
    // interacao do aluno.
    const limitMsg = `Você atingiu o limite de ${planStatus.chat_mensagens_por_mes} mensagens do plano grátis este mês.`;
    appendStaticMessage("assistant", limitMsg);
    recordMessage("assistant", limitMsg);
    appendUpgradeCta();
    updateInputAvailability();
  } else {
    showSuggestions();
  }
}

// ------------------------------------------------------------ Limpar tudo
//
// Confirmação de duas etapas (mesmo espírito de "Zerar estatísticas"/
// "Excluir conta" em Meu Perfil, ver estudos.js) — apaga a conversa salva
// desta questão (se logado) e recomeça do zero (saudação + sugestões).
chatClearBtn.addEventListener("click", () => {
  if (chatClearBtn.disabled) return;
  chatClearConfirm.hidden = false;
});

chatClearCancel.addEventListener("click", () => {
  chatClearConfirm.hidden = true;
});

chatClearConfirmBtn.addEventListener("click", async () => {
  const question = currentQuestion;
  if (!question) return;
  chatClearConfirmBtn.disabled = true;
  chatClearCancel.disabled = true;
  try {
    await deleteSavedConversation(question.id);
  } finally {
    chatClearConfirmBtn.disabled = false;
    chatClearCancel.disabled = false;
    chatClearConfirm.hidden = true;
  }
  // O proprio question ja' e' o currentQuestion — resetChatForQuestion tenta
  // recarregar uma conversa salva, mas acabou de ser apagada, entao cai
  // direto na saudacao nova.
  resetChatForQuestion(question);
});

document.addEventListener("question:changed", (ev) => {
  resetChatForQuestion(ev.detail);
});

// ----------------------------------------------------------------- Envio

// Cancelamento "suave": a biblioteca do Supabase nao expoe um jeito
// confiavel de abortar o fetch em andamento, entao em vez disso corremos a
// chamada de rede contra uma promise que resolve assim que stopRequested
// vira true. A chamada real continua rodando em segundo plano ate' chegar
// (inofensivo — so' ignoramos o resultado), mas o aluno nao fica esperando.
function waitForStopRequest() {
  return new Promise(resolve => {
    const check = () => {
      if (stopRequested) { resolve("__STOPPED__"); return; }
      if (sending) requestAnimationFrame(check);
    };
    check();
  });
}

function stopGenerating() {
  if (!sending) return;
  stopRequested = true;
}

async function sendChatMessage(text) {
  if (!currentQuestion || sending) return;
  const myGeneration = chatGeneration;
  sending = true;
  stopRequested = false;
  clearSuggestions();
  updateInputAvailability();
  setSendButtonMode("stop");

  // Mandar uma pergunta nova e' um sinal claro de que o aluno quer ver o
  // que vem a seguir — volta a seguir o fundo mesmo se ele tivesse rolado
  // pra cima antes (mesmo comportamento de qualquer chat comum).
  stickToBottom = true;

  recordMessage("user", text);
  appendMessageBubble("user").textContent = text;

  const pending = appendMessageBubble("assistant pending");
  pending.textContent = "Dr. Laureano está digitando...";

  const invokePromise = client.functions.invoke("dr-laureano", {
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
  }).then(async ({ data, error }) => {
    if (error) {
      // Erro HTTP (ex.: limite de mensagens do plano, 403 — ver
      // checkPlanChatQuota em supabase/functions/dr-laureano/index.ts) traz
      // uma mensagem específica no corpo da resposta; sem ela, cai no aviso
      // genérico de "não consegui responder" logo abaixo.
      let friendlyMessage = null;
      let limitReached = false;
      try {
        const body = await error.context?.json();
        if (body?.error) friendlyMessage = body.error;
        if (body?.limitReached) limitReached = true;
      } catch {
        // corpo não é JSON ou já foi consumido — segue sem mensagem específica
      }
      const wrapped = new Error(friendlyMessage || "Falha ao chamar o Dr. Laureano.");
      wrapped.friendlyMessage = friendlyMessage;
      wrapped.limitReached = limitReached;
      throw wrapped;
    }
    if (!data?.reply) throw new Error("Resposta vazia.");
    return data.reply;
  });

  let replyText = null;
  let friendlyError = null;
  let limitReached = false;
  let stoppedBeforeReply = false;
  try {
    const result = await Promise.race([invokePromise, waitForStopRequest()]);
    if (result === "__STOPPED__") stoppedBeforeReply = true;
    else replyText = result;
  } catch (err) {
    replyText = null;
    friendlyError = err?.friendlyMessage || null;
    limitReached = err?.limitReached === true;
  }

  // O aluno pode ter trocado de questao enquanto isso estava em andamento
  // — resetChatForQuestion ja' limpou o chat e resetou sending/botao/input
  // pra questao nova, entao so' descarta essa resposta atrasada em
  // silencio (nao mexe em mais nada global, que ja' pertence a outra
  // questao agora).
  if (myGeneration !== chatGeneration) {
    pending.remove();
    return;
  }

  pending.remove();

  if (stoppedBeforeReply) {
    // Cancelado antes da resposta chegar — nao ha' texto nenhum pra
    // mostrar, so' o aviso (nao entra no historico, pra IA nao "achar" que
    // respondeu algo que na verdade foi interrompido).
    appendInterruptedNote();
  } else if (replyText === null) {
    const shown = await sayAsLaureano(friendlyError || "Desculpe, não consegui responder agora. Tente novamente em instantes.");
    recordMessage("assistant", shown);
    if (limitReached) {
      appendUpgradeCta();
      // Recarrega planStatus (estudos.js) pra refletir o consumo que a
      // Edge Function acabou de contabilizar no servidor — é o que faz
      // updateInputAvailability(), logo abaixo, travar a caixa de digitar
      // de vez (ver isChatLimitReached).
      await loadPlanStatus();
    }
  } else {
    const shown = await sayAsLaureano(replyText);
    recordMessage("assistant", shown);
  }

  sending = false;
  setSendButtonMode("send");
  updateInputAvailability();
}

function autoResizeChatInput() {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
}

chatForm.addEventListener("submit", (ev) => {
  ev.preventDefault();
  if (sending) {
    stopGenerating();
    return;
  }
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

setSendButtonMode("send");
resetChatForQuestion(null);
