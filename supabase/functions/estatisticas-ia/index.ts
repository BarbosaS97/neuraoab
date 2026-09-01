// supabase/functions/estatisticas-ia/index.ts
//
// Gera uma analise textual (IA) do desempenho do aluno na 1a fase, a partir
// dos dados JA' AGREGADOS (nao respostas individuais) que o front-end
// calcula a partir de oab_respostas (estudos/estudos.js, loadAndRenderStats)
// — a RLS de oab_respostas ja' garante que so' as respostas do proprio
// aluno entram nesse calculo, entao os totais que chegam aqui sao sempre
// dele mesmo. Mesma API (DeepSeek) e mesmo padrao de function usado em
// dr-laureano/index.ts.
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

// Antes esta funcao so' exigia a anon key (comentario original acima) —
// qualquer um com a anon key (ja' publica no HTML) podia chamar direto e
// forcar chamadas pagas na API da DeepSeek, sem limite nenhum por usuario.
// Os dois chamadores de verdade (estudos/estudos.js, ja' logado por
// requireAuth; professor-portal/js/aluno-detail.js, ja' logado por
// requireProfessorSession) sempre tem uma sessao valida quando chamam —
// o supabase-js anexa o JWT dela automaticamente em
// client.functions.invoke(...), entao exigir "qualquer usuario autenticado"
// aqui nao quebra nenhum dos dois e fecha a chamada direta so' com a anon
// key. Nao precisa ser professor/admin (aluno analisando a propria
// estatistica tambem e' uso legitimo) — so' precisa ser alguem logado.
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

interface SubjectStat {
  discipline: string;
  total: number;
  correct: number;
}

interface StatsPayload {
  overall: { total: number; correct: number };
  bySubject: SubjectStat[];
}

// Limites defensivos: mesmo exigindo login agora (requireAuthenticatedUser
// acima), nada garante que quem chama e' de fato o front-end mandando dados
// reais — qualquer usuario logado ainda poderia forjar um payload gigante
// pra forcar chamadas caras e repetidas na API da DeepSeek. Nenhum aluno
// real chega perto desses tamanhos (o app tem umas poucas dezenas de
// materias no banco todo).
const MAX_SUBJECTS = 60;
const MAX_DISCIPLINE_CHARS = 120;
const MAX_COUNT = 100000;

function sanitizeStats(body: unknown): StatsPayload | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const overall = b.overall as Record<string, unknown> | undefined;
  if (!overall || typeof overall.total !== "number" || typeof overall.correct !== "number") return null;

  const bySubjectRaw = Array.isArray(b.bySubject) ? b.bySubject : [];
  const bySubject: SubjectStat[] = bySubjectRaw.slice(0, MAX_SUBJECTS).map((s) => {
    const row = (s ?? {}) as Record<string, unknown>;
    const discipline = typeof row.discipline === "string" ? row.discipline.slice(0, MAX_DISCIPLINE_CHARS) : "Sem disciplina";
    const total = typeof row.total === "number" ? Math.min(Math.max(0, Math.floor(row.total)), MAX_COUNT) : 0;
    const correct = typeof row.correct === "number" ? Math.min(Math.max(0, Math.floor(row.correct)), total) : 0;
    return { discipline, total, correct };
  });

  const total = Math.min(Math.max(0, Math.floor(overall.total)), MAX_COUNT);
  const correct = Math.min(Math.max(0, Math.floor(overall.correct)), total);

  return { overall: { total, correct }, bySubject };
}

// Limiares que definem "fraco"/"bom"/"pouco praticado" — calculados aqui em
// código (deterministico), NAO deixados pra IA decidir sozinha a partir da
// lista crua de materias. Pedir pra IA tambem ranquear/classificar os
// numeros e' o que causava respostas imprecisas e redundantes entre os 3
// campos (ex.: pontosFracos e precisaEstudar repetindo a mesma materia com
// quase as mesmas palavras) — aqui ela so' EXPLICA fatos ja' prontos.
const MIN_SAMPLE = 3; // minimo de questoes numa materia pra' confiar no percentual dela
const WEAK_THRESHOLD = 60;
const STRONG_THRESHOLD = 75;
const MIN_TOTAL_FOR_STUDY_TIP = 5;

interface RankedSubject extends SubjectStat {
  pct: number;
}

function fmtSubject(s: RankedSubject): string {
  return `${s.discipline}: ${s.correct}/${s.total} (${s.pct}%)`;
}

function buildPrompt(stats: StatsPayload): string {
  const overallPct = stats.overall.total > 0 ? Math.round((stats.overall.correct / stats.overall.total) * 100) : 0;

  const ranked: RankedSubject[] = stats.bySubject
    .map((s) => ({ ...s, pct: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0 }));

  const eligible = ranked.filter((s) => s.total >= MIN_SAMPLE);
  const weakSubjects = eligible.filter((s) => s.pct < WEAK_THRESHOLD).sort((a, b) => a.pct - b.pct);
  const strongSubjects = eligible.filter((s) => s.pct >= STRONG_THRESHOLD).sort((a, b) => b.pct - a.pct);
  const underPracticed = ranked.filter((s) => s.total < MIN_SAMPLE);

  const factLines = [
    `Total geral: ${stats.overall.correct}/${stats.overall.total} acertos (${overallPct}%).`,
    weakSubjects.length > 0
      ? `Matérias com desempenho fraco (${MIN_SAMPLE}+ questões, abaixo de ${WEAK_THRESHOLD}% de acerto), da pior pra melhor: ${weakSubjects.map(fmtSubject).join("; ")}.`
      : `Nenhuma matéria com ${MIN_SAMPLE}+ questões respondidas ficou abaixo de ${WEAK_THRESHOLD}% de acerto.`,
    strongSubjects.length > 0
      ? `Matérias com bom desempenho (${MIN_SAMPLE}+ questões, ${STRONG_THRESHOLD}%+ de acerto), da melhor pra pior: ${strongSubjects.map(fmtSubject).join("; ")}.`
      : `Nenhuma matéria com ${MIN_SAMPLE}+ questões respondidas atingiu ${STRONG_THRESHOLD}% de acerto ainda.`,
    underPracticed.length > 0
      ? `Matérias com poucas questões respondidas até agora (menos de ${MIN_SAMPLE}, percentual ainda pouco confiável): ${underPracticed.map(fmtSubject).join("; ")}.`
      : `Todas as matérias já respondidas têm pelo menos ${MIN_SAMPLE} questões.`,
  ];

  return [
    "Você é um tutor de Direito analisando o desempenho de um aluno que estuda para o Exame de Ordem (OAB).",
    "Os FATOS abaixo (questões objetivas de 1ª fase que ele já respondeu) já foram calculados e",
    "classificados por código — sua única tarefa é EXPLICAR esses fatos com clareza e recomendar o que",
    "fazer. Nunca recalcule, reclassifique ou contradiga os números e classificações abaixo.",
    "",
    "Este texto pode ser lido tanto pelo PRÓPRIO ALUNO quanto pelo PROFESSOR dele (no Portal do",
    "Professor) — o mesmo texto, sem saber de antemão qual dos dois vai ler. Por isso ele precisa ser",
    "escrito de forma IMPESSOAL, em terceira pessoa, como um relatório objetivo — nunca se dirigindo a",
    "ninguém diretamente.",
    "",
    "FATOS:",
    ...factLines,
    "",
    "Devolva APENAS um JSON válido (sem markdown, sem crases, sem nenhum texto fora do JSON), no formato",
    "exato:",
    '{"pontosFracos": string ou null, "precisaEstudar": string ou null, "pontosFortes": string ou null}',
    "",
    "REGRAS MUITO IMPORTANTES PRA CADA CAMPO — cada um tem um papel DIFERENTE, evite repetir a mesma frase",
    "ou os mesmos números entre eles:",
    "",
    `- pontosFracos: use SOMENTE se os FATOS listarem 'Matérias com desempenho fraco'; caso contrário, use`,
    "  null. Diagnóstico do que já saiu errado: cite a PIOR matéria com número exato (fração e percentual);",
    "  se houver mais de uma matéria fraca, pode citar até 2, sempre da pior pra melhor. 1 a 2 frases.",
    `- precisaEstudar: use SOMENTE se o total geral de questões respondidas for ${MIN_TOTAL_FOR_STUDY_TIP} ou mais; caso contrário,`,
    "  use null. Estratégia de estudo daqui pra frente, NÃO um resumo de pontosFracos — siga esta ordem de",
    "  prioridade: (1) se os FATOS listarem 'matérias com poucas questões respondidas', recomende praticar",
    "  mais questões delas antes de tirar conclusões (cite os nomes, sem repetir números de outro campo);",
    "  (2) só se não houver nenhuma matéria pouco praticada, oriente COMO estudar as matérias fracas já",
    "  citadas em pontosFracos (dê uma recomendação prática nova, não repita a frase de pontosFracos). 1 a",
    "  2 frases.",
    "- pontosFortes: use SOMENTE se os FATOS listarem 'Matérias com bom desempenho'; caso contrário, use",
    "  null. Reconhecimento genuíno (sem exagero): cite a MELHOR matéria com número exato (fração e",
    "  percentual). 1 a 2 frases.",
    "- NUNCA cite uma matéria, fração ou percentual que não esteja explicitamente nos FATOS acima.",
    "- Português claro e objetivo, em texto corrido, sem nenhuma formatação markdown dentro dos textos",
    "  (nada de **negrito**, listas, títulos).",
    "- NUNCA use segunda pessoa — nem \"você\", \"seu\", \"sua\", \"teu\", \"tua\", nem vocativos como \"caro",
    "  aluno\" ou \"cara aluna\". Escreva em terceira pessoa impessoal, como um relatório: prefira o",
    "  desempenho/a matéria como sujeito da frase (\"O desempenho em Direito Civil ficou abaixo do",
    "  esperado\", \"Recomenda-se reforçar...\", \"O aluno apresentou bom domínio de...\") em vez de se",
    "  dirigir a alguém (\"Você foi mal em...\", \"Seu desempenho...\", \"Reforce...\").",
  ].join("\n");
}

interface StatsAnalysis {
  pontosFracos: string | null;
  precisaEstudar: string | null;
  pontosFortes: string | null;
}

function parseAnalysis(raw: string): StatsAnalysis | null {
  // A IA foi instruida a devolver so' JSON, mas modelos de chat as vezes
  // embrulham a resposta em ```json ... ``` mesmo assim — removido aqui
  // antes do parse, na mesma linha de defesa usada em outras partes do
  // projeto (ver stripMarkdown em estudos/dr-laureano.js).
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      pontosFracos: typeof parsed.pontosFracos === "string" ? parsed.pontosFracos : null,
      precisaEstudar: typeof parsed.precisaEstudar === "string" ? parsed.precisaEstudar : null,
      pontosFortes: typeof parsed.pontosFortes === "string" ? parsed.pontosFortes : null,
    };
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
    return jsonResponse({ error: "É preciso estar logado para gerar essa análise." }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido." }, 400);
  }

  const stats = sanitizeStats(body);
  if (!stats || stats.overall.total === 0) {
    return jsonResponse({ error: "Dados insuficientes para gerar uma análise." }, 400);
  }

  const apiKey = Deno.env.get("API_DEEPSEEK_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "Chave da API da DeepSeek não configurada no servidor." }, 500);
  }

  const payload = {
    model: DEEPSEEK_MODEL,
    messages: [{ role: "system", content: buildPrompt(stats) }],
    temperature: 0.2,
    max_tokens: 500,
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
  const analysis = raw ? parseAnalysis(raw) : null;

  if (!analysis) {
    return jsonResponse({ error: "A IA não retornou uma análise válida." }, 502);
  }

  return jsonResponse(analysis);
});
