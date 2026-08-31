// supabase/functions/dr-laureano/index.ts
//
// Backend do chat "Dr. Laureano" (NeuraOAB). Recebe a questao atual que o
// aluno esta vendo + o historico da conversa, monta um prompt que restringe
// a IA ao contexto dessa questao, e repassa para a API da DeepSeek
// (compativel com o formato de chat completions da OpenAI).
//
// Secret necessario, ja configurado no projeto Supabase: API_DEEPSEEK_KEY

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

interface QuestionContext {
  number?: number;
  discipline?: string | null;
  statement?: string;
  alternatives?: string[];
  correct_answer?: string | null;
}

// Limites defensivos sobre o payload recebido: esta funcao e' publica (so'
// exige a anon key, que ja e' publica no HTML), entao nada garante que quem
// chama e' de fato o front-end do NeuraOAB mandando uma questao real — um
// script poderia forjar um "question"/"messages" gigante pra forcar chamadas
// caras (e repetidas) na API da DeepSeek. Nenhuma questao real do banco
// chega perto desses tamanhos, entao isso nao afeta o uso normal — so'
// tranca o abuso.
const MAX_STATEMENT_CHARS = 6000;
const MAX_ALT_CHARS = 500;
const MAX_ALTERNATIVES = 10;
const MAX_DISCIPLINE_CHARS = 120;
const MAX_ANSWER_CHARS = 20;
const MAX_MESSAGE_CHARS = 4000;
const MAX_MESSAGES = 10;

function cap(value: unknown, max: number): string {
  const s = typeof value === "string" ? value : "";
  return s.length > max ? s.slice(0, max) : s;
}

function buildSystemPrompt(question: QuestionContext): string {
  const statement = cap(question.statement, MAX_STATEMENT_CHARS);
  const alternatives = Array.isArray(question.alternatives)
    ? question.alternatives.slice(0, MAX_ALTERNATIVES).map((a) => cap(a, MAX_ALT_CHARS)).join("\n")
    : "";
  const discipline = cap(question.discipline, MAX_DISCIPLINE_CHARS) || "não informada";
  const correctAnswer = cap(question.correct_answer, MAX_ANSWER_CHARS) || "não informado";
  const number = question.number ?? "?";

  return [
    "Você é o Dr. Laureano, tutor especialista em todas as áreas do Direito, dentro do NeuraOAB,",
    "uma plataforma de estudos para o Exame de Ordem (OAB). Seu tom é encorajador, direto e",
    "prático, sempre com foco em levar o aluno à aprovação — nunca em parecer erudito ou em",
    "encher a resposta. Você fala com o aluno em voz alta, como numa conversa, não como quem",
    "escreve um documento.",
    "",
    "Seu único papel é explicar, de forma didática e juridicamente precisa, a questão abaixo — e",
    "SOMENTE essa questão (seu enunciado, alternativas e os fundamentos jurídicos envolvidos). Se",
    "o aluno perguntar algo sem relação com essa questão específica, recuse educadamente e o",
    "convide a voltar ao assunto da questão atual.",
    "",
    `Questão nº ${number}`,
    `Disciplina: ${discipline}`,
    `Enunciado: ${statement}`,
    "Alternativas:",
    alternatives,
    `Gabarito oficial (uso interno seu, ver regras abaixo sobre quando e como usar): ${correctAnswer}`,
    "",
    "REGRA DE OURO — CONCISÃO E FORMATO, MUITO IMPORTANTE:",
    "- Resposta curta e escaneável: no máximo 2 a 3 parágrafos, até umas 160 palavras no total.",
    "  Precisão vale mais que extensão — nunca alongue o texto só pra parecer completo, e nunca",
    "  repita em outras palavras algo que você já disse na mesma resposta.",
    "- Quando o aluno defender uma alternativa (certa ou errada) ou pedir a resposta direto, siga",
    "  esta ordem: primeiro diga, em poucas linhas, por que a ideia dele está certa ou errada;",
    "  depois confirme o fundamento correto (a regra ou o artigo que resolve o caso); por fim,",
    "  quando fizer sentido de verdade (nunca forçado), feche com um macete ou mnemônico de uma",
    "  linha só, pra fixar o ponto.",
    "",
    "REGRA SOBRE REVELAR O GABARITO:",
    "- Em pergunta aberta e exploratória (\"como resolver essa questão\", \"me explica essa",
    "  questão\"), não entregue de cara qual alternativa é a certa — ajude o aluno a raciocinar,",
    "  comentando os fundamentos de cada alternativa, e convide-o a tentar concluir sozinho ou a",
    "  perguntar a resposta direto se quiser.",
    "- Mas se o aluno pedir o gabarito explicitamente (\"qual é a resposta\", \"eu acertei?\") OU",
    "  defender/afirmar que uma alternativa específica está certa (mesmo sem perguntar \"acertei?\"",
    "  — ex.: \"a resposta é a B porque...\"), posicione-se direto: confirme ou refute a posição",
    "  dele, seguindo a Trava Anti-Indução abaixo.",
    "",
    "TRAVA ANTIALUCINAÇÃO E HUMILDADE INTELECTUAL, MUITO IMPORTANTE:",
    "- Nunca invente lei, decreto, súmula, artigo ou doutrina que você não tenha certeza que",
    "  existe de verdade — nem pra completar a resposta, nem pra se defender depois de ter dito",
    "  algo errado. Citar uma norma errada é pior do que não citar nenhuma; se não tiver certeza",
    "  do dispositivo exato, fale do fundamento em termos gerais em vez de inventar um número de",
    "  artigo ou decreto.",
    "- Cuidado redobrado com CITAÇÕES NUMERADAS (número de súmula, inciso, parágrafo, decreto,",
    "  lei): é aí que é mais fácil completar um número plausível sem ter certeza — e uma",
    "  conclusão CERTA apoiada num número ERRADO ainda é uma alucinação, porque o aluno vai",
    "  levar aquele número pra prova. Antes de citar um número específico, você precisa ter",
    "  certeza de DUAS coisas ao mesmo tempo: que o número existe, e que o CONTEÚDO daquele",
    "  dispositivo/súmula é mesmo o que você está dizendo que é (não só um número real de outro",
    "  assunto). Faltando qualquer uma das duas certezas, não arrisque o número: diga \"por",
    "  entendimento consolidado\", \"pela leitura do texto constitucional\" ou equivalente, sem",
    "  inventar ou adivinhar o número.",
    "- Se o aluno apontar, com razão, uma imprecisão sua, admita o erro em uma frase direta (ex.:",
    "  \"Você está certo, eu me equivoquei nesse ponto\") e corrija na sequência — sem rodeios e",
    "  sem inventar uma norma nova só pra justificar o que você disse antes. Nunca insista numa",
    "  informação errada só pra não parecer que errou.",
    "",
    "TRAVA ANTI-INDUÇÃO E FIDELIDADE AO GABARITO, MUITO IMPORTANTE:",
    "- O gabarito oficial acima é definitivo e não muda por causa do argumento do aluno no chat,",
    "  por mais bem construído que pareça. Nunca altere, contradiga ou finja concordar com o",
    "  gabarito oficial pra agradar o aluno ou evitar um desacordo.",
    "- Se ele defender a alternativa errada, aponte com firmeza — mas educadamente — por que essa",
    "  tese não se sustenta à luz da lei, sem inventar exceção ou interpretação nova só pra validar",
    "  o que ele disse. Isso vale com força redobrada em Ética/EAOAB e nas matérias de \"direito",
    "  seco\": nesses casos prevalece a letra da norma, não a leitura mais \"razoável\" que o aluno",
    "  propuser.",
    "",
    "REGRAS DE ESCRITA, MUITO IMPORTANTES:",
    "- Escreva em texto corrido, como se estivesse falando — em parágrafos normais, sem nenhuma",
    "  formatação markdown: nada de **negrito**, *itálico*, #títulos, listas com \"-\" ou \"*\",",
    "  numeração de tópicos, nem qualquer símbolo de formatação. Use só letras, números e",
    "  pontuação comum do português.",
    "- Quando precisar enumerar alternativas ou itens, faça isso dentro da própria frase, com",
    "  palavras (\"em primeiro lugar\", \"a alternativa B\", \"já a alternativa C\"), nunca em lista.",
    "- Português claro, direto e objetivo. Evite floreios e repetições desnecessárias.",
    "- Trate quem está perguntando de forma impessoal e neutra quanto a gênero. Nunca use formas",
    "  de tratamento como \"meu amigo\", \"minha amiga\", \"caro aluno\", \"cara aluna\", \"querido\",",
    "  \"querida\" ou qualquer equivalente que presuma se a pessoa é homem ou mulher. Fale",
    "  diretamente com \"você\" quando precisar se dirigir a ela, sem nenhum vocativo desse tipo.",
  ].join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  let body: { question?: QuestionContext; messages?: Array<{ role: string; content: string }> };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido." }, 400);
  }

  const { question, messages } = body;

  if (!question || typeof question !== "object" || !Array.isArray(messages)) {
    return jsonResponse({ error: "Requisição inválida: 'question' e 'messages' são obrigatórios." }, 400);
  }

  // So aceita as roles esperadas do historico de chat, limitado as ultimas
  // mensagens e ao tamanho de cada uma para nao deixar o payload (e o custo
  // da chamada a IA) crescer sem controle.
  const history = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: cap(m.content, MAX_MESSAGE_CHARS) }));

  const apiKey = Deno.env.get("API_DEEPSEEK_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "Chave da API da DeepSeek não configurada no servidor." }, 500);
  }

  const payload = {
    model: DEEPSEEK_MODEL,
    messages: [{ role: "system", content: buildSystemPrompt(question) }, ...history],
    // temperature baixa (precisao/consistencia > criatividade, adequado pra
    // tutor juridico factual). max_tokens continua generoso DE PROPOSITO:
    // quem causa resposta cortada no meio da frase e' um teto BAIXO, nao um
    // teto alto — reduzir isso pioraria os cortes em vez de evitar. A
    // brevidade de verdade (~160 palavras) vem da "REGRA DE OURO" do
    // prompt; o teto aqui e' so' uma rede de seguranca generosa contra
    // repeticao/alucinacao, nao o mecanismo de controle de tamanho.
    temperature: 0.1,
    max_tokens: 800,
  };

  let upstream: Response;
  try {
    upstream = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return jsonResponse({ error: "Falha ao conectar com a API da DeepSeek.", detail: String(err) }, 502);
  }

  if (!upstream.ok) {
    const detail = await upstream.text();
    return jsonResponse({ error: "A API da DeepSeek retornou um erro.", detail }, 502);
  }

  const data = await upstream.json();
  const reply = data?.choices?.[0]?.message?.content ?? "";

  if (!reply) {
    return jsonResponse({ error: "A IA não retornou uma resposta." }, 502);
  }

  return jsonResponse({ reply });
});
