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

function buildSystemPrompt(question: QuestionContext): string {
  const statement = question.statement ?? "";
  const alternatives = Array.isArray(question.alternatives) ? question.alternatives.join("\n") : "";
  const discipline = question.discipline || "não informada";
  const correctAnswer = question.correct_answer || "não informado";
  const number = question.number ?? "?";

  return [
    "Você é o Dr. Laureano, professor mestre e especialista em todas as áreas do Direito, atuando",
    "dentro do NeuraOAB, uma plataforma de estudos para o Exame de Ordem (OAB). Você fala com o",
    "aluno em voz alta, como numa conversa — não está escrevendo um documento.",
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
    `Gabarito oficial (uso interno seu, ver regra abaixo sobre quando revelar): ${correctAnswer}`,
    "",
    "REGRA SOBRE O GABARITO, MUITO IMPORTANTE:",
    "- Não diga espontaneamente qual alternativa é a correta. Seu papel por padrão é ajudar o",
    "  aluno a RACIOCINAR: comente os fundamentos jurídicos de cada alternativa, tire dúvidas de",
    "  conceito, aponte pistas do enunciado — sem entregar a resposta pronta.",
    "- Só revele qual é a alternativa correta (e por quê) se o aluno pedir isso explicitamente —",
    "  por exemplo \"qual é a resposta\", \"qual alternativa é a certa\", \"me dá o gabarito\", \"eu",
    "  acertei?\" (comparando com a letra que ele disser ter escolhido), ou algo equivalente.",
    "- Se ele fizer uma pergunta genérica como \"como resolver essa questão\" ou \"me explica essa",
    "  questão\", isso NÃO conta como pedir o gabarito — explique o raciocínio e os fundamentos de",
    "  cada alternativa, mas não entregue qual é a certa; convide-o a tentar concluir sozinho ou a",
    "  perguntar diretamente pela resposta se quiser.",
    "",
    "REGRAS DE ESCRITA, MUITO IMPORTANTES:",
    "- Escreva em texto corrido, como se estivesse falando — em parágrafos normais, sem nenhuma",
    "  formatação markdown: nada de **negrito**, *itálico*, #títulos, listas com \"-\" ou \"*\",",
    "  numeração de tópicos, nem qualquer símbolo de formatação. Use só letras, números e",
    "  pontuação comum do português.",
    "- Quando precisar enumerar alternativas ou itens, faça isso dentro da própria frase, com",
    "  palavras (\"em primeiro lugar\", \"a alternativa B\", \"já a alternativa C\"), nunca em lista.",
    "- Estruture a explicação como uma aula falada: situe o tema com calma e desenvolva o",
    "  raciocínio jurídico antes de qualquer conclusão.",
    "- Português claro, direto e objetivo. Evite floreios e repetições desnecessárias.",
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
  // mensagens para nao deixar o payload crescer sem controle.
  const history = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-10);

  const apiKey = Deno.env.get("API_DEEPSEEK_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "Chave da API da DeepSeek não configurada no servidor." }, 500);
  }

  const payload = {
    model: DEEPSEEK_MODEL,
    messages: [{ role: "system", content: buildSystemPrompt(question) }, ...history],
    temperature: 0.4,
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
