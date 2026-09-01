// supabase/functions/recomendacao-dashboard/index.ts
//
// Gera a dica do "Dr. Laureano recomenda" no dashboard da 1ª fase
// (estudos/index.html, tela de escolha de exame) — a partir dos dados JÁ
// AGREGADOS por exame (não respostas individuais) que o front-end calcula
// de oab_respostas + oab_questions (estudos/estudos.js, computeExamStats).
// Mesmo padrão de supabase/functions/estatisticas-ia/index.ts: QUAL exame
// recomendar é decidido aqui em código, de forma determinística — a IA
// nunca escolhe, só ESCREVE a frase final no tom do personagem (ver
// buildSystemPrompt em supabase/functions/dr-laureano/index.ts, mesmas
// regras de voz reaproveitadas abaixo).
//
// Secret necessario, ja configurado no projeto Supabase: API_DEEPSEEK_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// Mesmo motivo de estatisticas-ia/index.ts: exige sessão válida (não só a
// anon key, já pública no HTML) pra fechar a chamada direta que forçaria
// custo na API da DeepSeek sem controle nenhum. O único chamador de
// verdade (estudos/estudos.js, já logado por requireAuth) sempre manda o
// JWT automaticamente via client.functions.invoke(...).
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function requireAuthenticatedUser(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return false;
  const { data, error } = await authClient.auth.getUser(jwt);
  return !error && !!data?.user;
}

interface ExamStat {
  examNumber: number;
  year: number;
  total: number; // questões daquele exame no banco
  answered: number; // quantas o aluno já respondeu
  correct: number; // quantas dessas acertou
}

// Limites defensivos, mesmo raciocínio de estatisticas-ia/index.ts: mesmo
// exigindo login, nada garante que o payload é de fato o que
// computeExamStats() produziria — um usuário logado ainda poderia forjar
// uma lista gigante pra forçar uma chamada cara. O app real tem umas
// poucas dezenas de exames no banco todo.
const MAX_EXAMS = 80;
const MAX_COUNT = 100000;

function sanitizeExams(body: unknown): ExamStat[] | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.exams)) return null;

  const exams: ExamStat[] = b.exams.slice(0, MAX_EXAMS).map((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const examNumber = typeof row.examNumber === "number" ? Math.floor(row.examNumber) : 0;
    const year = typeof row.year === "number" ? Math.floor(row.year) : 0;
    const total = typeof row.total === "number" ? Math.min(Math.max(0, Math.floor(row.total)), MAX_COUNT) : 0;
    const answered =
      typeof row.answered === "number" ? Math.min(Math.max(0, Math.floor(row.answered)), total) : 0;
    const correct =
      typeof row.correct === "number" ? Math.min(Math.max(0, Math.floor(row.correct)), answered) : 0;
    return { examNumber, year, total, answered, correct };
  }).filter((e) => e.examNumber > 0);

  return exams;
}

type Reason = "recent" | "review" | "done";

interface Recommendation {
  reason: Reason;
  exam: ExamStat | null;
}

const MIN_ANSWERED_FOR_REVIEW = 5; // amostra mínima pra confiar no % de acerto de um exame já tentado

// Decide QUAL exame recomendar e POR QUÊ — determinístico, nunca a IA.
// 1) Prioridade ABSOLUTA: o exame de maior examNumber (o mais recente que
//    existe no banco), sempre que ele ainda não estiver 100% respondido —
//    não importa se o aluno nunca tocou nele ou já respondeu metade. Um bug
//    anterior aqui pulava pro "exame mais recente NÃO COMEÇADO" mesmo
//    quando um exame ainda mais novo já tinha respostas parciais, o que
//    fazia a dica chamar um exame mais VELHO de "o mais recente" — sempre
//    falso quando existe um exame de número maior. Com a regra "sempre o de
//    maior examNumber, se incompleto" isso nunca mais pode acontecer: o
//    exame escolhido aqui É por definição o de maior número entre os
//    incompletos.
// 2) Só quando o mais recente já estiver 100% respondido: entre os já
//    tentados com amostra suficiente, o de pior aproveitamento (tem o que
//    revisar).
// 3) Senão (tudo tentado e sem exame fraco o bastante) — sem recomendação
//    específica, só uma mensagem de incentivo geral.
function pickRecommendation(exams: ExamStat[]): Recommendation {
  const sorted = [...exams].sort((a, b) => b.examNumber - a.examNumber);
  const mostRecent = sorted[0];
  if (mostRecent && mostRecent.total > 0 && mostRecent.answered < mostRecent.total) {
    return { reason: "recent", exam: mostRecent };
  }

  const reviewable = exams.filter((e) => e.answered >= MIN_ANSWERED_FOR_REVIEW);
  if (reviewable.length > 0) {
    const worst = reviewable.reduce((acc, e) =>
      e.correct / e.answered < acc.correct / acc.answered ? e : acc
    );
    return { reason: "review", exam: worst };
  }

  return { reason: "done", exam: null };
}

// Regras de voz do Dr. Laureano copiadas de dr-laureano/index.ts
// (buildSystemPrompt) — segunda pessoa, direto, encorajador, sem markdown,
// sem vocativo de gênero. Aqui a IA só escreve UMA frase curta em cima do
// fato já decidido em pickRecommendation, nunca decide o exame sozinha.
function buildPrompt(rec: Recommendation): string {
  const factLine = (() => {
    if (rec.reason === "recent" && rec.exam) {
      const { examNumber, year, total, answered } = rec.exam;
      if (answered === 0) {
        return `O ${examNumber}º Exame (ano ${year}) é o exame MAIS RECENTE disponível no banco (nenhum outro exame tem número maior que ${examNumber}), e o aluno ainda não respondeu nenhuma das ${total} questões dele.`;
      }
      return `O ${examNumber}º Exame (ano ${year}) é o exame MAIS RECENTE disponível no banco (nenhum outro exame tem número maior que ${examNumber}). O aluno já respondeu ${answered} de ${total} questões dele, mas ainda não terminou.`;
    }
    if (rec.reason === "review" && rec.exam) {
      const pct = rec.exam.answered > 0 ? Math.round((rec.exam.correct / rec.exam.answered) * 100) : 0;
      return `O aluno já terminou o exame mais recente. Entre os exames que ele já tentou o bastante pra confiar no percentual, o ${rec.exam.examNumber}º Exame (ano ${rec.exam.year}) é o de desempenho mais fraco: acertou ${rec.exam.correct} de ${rec.exam.answered} questões (${pct}%). Este NÃO é o exame mais recente — é só o que precisa de mais revisão.`;
    }
    return "O aluno já tentou todos os exames disponíveis e não tem nenhum com desempenho claramente fraco no momento — está em dia com a prática.";
  })();

  return [
    "Você é o Dr. Laureano, tutor especialista em Direito dentro do NeuraOAB, plataforma de estudos",
    "para o Exame de Ordem (OAB). Seu tom é encorajador, direto e prático — você fala com o aluno",
    "em voz alta, como numa conversa curta, nunca como quem escreve um documento.",
    "",
    "Sua única tarefa aqui é escrever UMA dica curta pro card 'Dr. Laureano recomenda' no",
    "dashboard do aluno, a partir do FATO abaixo — que já foi decidido e não pode ser mudado,",
    "contestado ou substituído por outro exame.",
    "",
    "FATO:",
    factLine,
    "",
    "Devolva APENAS um JSON válido (sem markdown, sem crases, sem texto fora do JSON), no formato",
    'exato: {"message": string}',
    "",
    "REGRAS MUITO IMPORTANTES:",
    "- No máximo 2 frases curtas, até uns 35 palavras no total.",
    "- Fale diretamente com o aluno, em segunda pessoa (\"você\"), sem vocativo que presuma gênero",
    "  (nada de \"caro aluno\", \"cara aluna\", \"amigo\", \"amiga\").",
    "- Se o FATO for sobre um exame específico, cite o número dele por extenso (ex.: \"46º Exame\")",
    "  logo no início da frase — é isso que o aluno precisa saber primeiro.",
    "- Termine com uma frase curta de incentivo (ex.: \"Boa preparação!\", \"Você consegue!\"), só",
    "  quando fizer sentido de verdade, nunca forçado.",
    "- Nunca invente número, percentual ou exame que não esteja no FATO acima.",
    "- Só chame um exame de \"mais recente\" se o FATO disser EXPLICITAMENTE que ele é o mais",
    "  recente (\"MAIS RECENTE disponível no banco\"). Se o FATO for sobre desempenho fraco/revisão,",
    "  NUNCA diga que esse exame é o mais recente — ele pode ser bem mais antigo.",
    "- Texto corrido, sem nenhuma formatação markdown (nada de **negrito**, listas, títulos).",
  ].join("\n");
}

interface TipResult {
  message: string;
}

function parseTip(raw: string): TipResult | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return typeof parsed.message === "string" && parsed.message.trim() ? { message: parsed.message.trim() } : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  if (!(await requireAuthenticatedUser(req))) {
    return jsonResponse({ error: "É preciso estar logado para gerar essa recomendação." }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido." }, 400);
  }

  const exams = sanitizeExams(body);
  if (!exams || exams.length === 0) {
    return jsonResponse({ error: "Dados insuficientes para gerar uma recomendação." }, 400);
  }

  const rec = pickRecommendation(exams);

  const apiKey = Deno.env.get("API_DEEPSEEK_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "Chave da API da DeepSeek não configurada no servidor." }, 500);
  }

  const payload = {
    model: DEEPSEEK_MODEL,
    messages: [{ role: "system", content: buildPrompt(rec) }],
    temperature: 0.4,
    max_tokens: 200,
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
  const raw = data?.choices?.[0]?.message?.content ?? "";
  const tip = raw ? parseTip(raw) : null;

  if (!tip) {
    return jsonResponse({ error: "A IA não retornou uma recomendação válida." }, 502);
  }

  return jsonResponse({
    examNumber: rec.exam?.examNumber ?? null,
    year: rec.exam?.year ?? null,
    message: tip.message,
  });
});
