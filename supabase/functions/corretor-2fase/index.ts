// supabase/functions/corretor-2fase/index.ts
//
// Corretor automatico da 2a fase da OAB (NeuraOAB). Recebe UM item do
// caderno (a peca profissional OU uma das 4 questoes discursivas), com o
// gabarito oficial completo (enunciado, gabarito comentado e distribuicao
// dos pontos) e a resposta do aluno, e devolve nota + feedback item a item,
// usando a API da DeepSeek (compativel com o formato de chat completions da
// OpenAI) para simular a correcao de um examinador da banca.
//
// Esta funcao e' stateless (nao acessa o banco): o frontend busca o item em
// oab2_itens/oab2_subitens/oab2_criterios, chama esta funcao uma vez por
// item quando o aluno clica em "Finalizar", e grava o resultado em
// oab2_respostas usando o proprio client autenticado do aluno (RLS garante
// que ele so grava nas suas proprias tentativas). Mesmo padrao arquitetural
// do supabase/functions/dr-laureano.
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

interface SubItem {
  letra?: string;
  enunciado?: string;
  valor?: number | null;
}

interface Criterio {
  rotulo?: string | null;
  categoria?: string | null;
  descricao?: string;
  pontuacao_maxima?: number | null;
  faixas_possiveis?: number[];
}

interface ItemContext {
  tipo?: "peca" | "questao";
  numero?: number | null;
  enunciado?: string;
  subitens?: SubItem[];
  observacao?: string | null;
  valor_total?: number;
  gabarito_comentado?: string | null;
  criterios?: Criterio[];
  criterios_texto_bruto?: string | null;
}

interface CorrectionRequest {
  item?: ItemContext;
  resposta_aluno?: string;
}

interface CriterioResultado {
  rotulo: string;
  pontuacao_maxima: number | null;
  pontuacao_obtida: number;
  justificativa: string;
}

interface CorrectionResult {
  nota_total: number;
  criterios: CriterioResultado[];
  feedback_geral: string;
}

const MAX_RESPOSTA_CHARS = 12000;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function formatCriterios(criterios: Criterio[] | undefined): string {
  if (!criterios || criterios.length === 0) return "";
  return criterios
    .map((c, i) => {
      const rotulo = c.rotulo ?? String(i + 1);
      const categoria = c.categoria ? `[${c.categoria}] ` : "";
      const max = c.pontuacao_maxima != null ? ` (máx. ${c.pontuacao_maxima.toFixed(2)} pontos)` : "";
      const faixas = c.faixas_possiveis && c.faixas_possiveis.length
        ? ` — pontuações possíveis: ${c.faixas_possiveis.map((f) => f.toFixed(2)).join("/")}`
        : "";
      return `${rotulo}. ${categoria}${c.descricao ?? ""}${max}${faixas}`;
    })
    .join("\n");
}

function buildSystemPrompt(item: ItemContext): string {
  const tipo = item.tipo === "peca" ? "peça profissional" : `questão discursiva nº ${item.numero ?? "?"}`;
  const valorTotal = item.valor_total ?? 0;

  const subitensTexto = (item.subitens ?? [])
    .map((s) => `${s.letra}) ${s.enunciado ?? ""}${s.valor != null ? ` (Valor: ${s.valor.toFixed(2)})` : ""}`)
    .join("\n");

  const criteriosEstruturados = formatCriterios(item.criterios);
  const criteriosTexto = criteriosEstruturados || item.criterios_texto_bruto || "(critérios não disponíveis)";

  return [
    "Você é um examinador oficial da banca da FGV, corrigindo a 2ª fase do Exame de Ordem (OAB) com o rigor",
    "e a objetividade de um corretor real: só pontua o que está explicitamente atendido no texto do aluno,",
    "seguindo estritamente o padrão de resposta oficial abaixo. Você está corrigindo apenas UM item do",
    `caderno: a ${tipo}, no valor total de ${valorTotal.toFixed(2)} pontos.`,
    "",
    "ENUNCIADO:",
    item.enunciado ?? "",
    subitensTexto ? "\nITENS:\n" + subitensTexto : "",
    item.observacao ? `\nOBSERVAÇÃO DO ENUNCIADO: ${item.observacao}` : "",
    "",
    "GABARITO COMENTADO (padrão de resposta oficial):",
    item.gabarito_comentado ?? "(não disponível)",
    "",
    "DISTRIBUIÇÃO DOS PONTOS (critérios oficiais de correção, item a item):",
    criteriosTexto,
    "",
    "REGRAS DE CORREÇÃO, MUITO IMPORTANTES:",
    "- Avalie a resposta do aluno critério por critério, na mesma ordem e com os mesmos rótulos da",
    "  distribuição dos pontos oficial. Para cada critério, atribua a pontuação obtida dentre as",
    "  pontuações possíveis indicadas (quando informadas) — nunca invente um valor fora dessa faixa.",
    "  Quando as pontuações possíveis não estiverem explícitas, use seu julgamento entre 0 e a pontuação",
    "  máxima do critério, de forma proporcional ao quanto o aluno atendeu ao critério.",
    "- A mera citação ou transcrição de dispositivo legal, sem a devida fundamentação e conclusão exigidas",
    "  pelo critério, NÃO confere pontuação — assim como nas provas reais da OAB.",
    "- Não pontue argumentos que o aluno não desenvolveu de fato, mesmo que estejam implícitos ou sejam",
    "  \"quase\" o que se pede. Seja rigoroso, mas justo: reconheça formulações equivalentes em conteúdo",
    "  jurídico ainda que com palavras diferentes do gabarito.",
    "- Se a resposta do aluno estiver em branco ou não tiver relação alguma com o enunciado, zere todos os",
    "  critérios.",
    "- Justifique cada pontuação em 1 a 2 frases curtas e objetivas, indicando o que faltou ou o que foi",
    "  bem atendido.",
    "- Ao final, escreva um feedback geral (3 a 6 frases) explicando o desempenho do aluno nesse item,",
    "  destacando o principal ponto forte e o principal ponto a melhorar.",
    "- Português claro e direto, sem markdown (nada de **negrito**, listas com \"-\", ou #títulos) no",
    "  feedback_geral e nas justificativas — texto corrido normal.",
    "",
    "FORMATO DE SAÍDA, OBRIGATÓRIO: responda SOMENTE com um JSON válido, sem nenhum texto fora dele, no",
    "formato exato:",
    '{"nota_total": number, "criterios": [{"rotulo": string, "pontuacao_maxima": number, ' +
      '"pontuacao_obtida": number, "justificativa": string}], "feedback_geral": string}',
  ].join("\n");
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function validateAndNormalize(raw: unknown, item: ItemContext): CorrectionResult | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const rawCriterios = Array.isArray(obj.criterios) ? obj.criterios : [];
  const valorTotal = item.valor_total ?? 0;

  const criterios: CriterioResultado[] = rawCriterios
    .filter((c) => c && typeof c === "object")
    .map((c, i) => {
      const cc = c as Record<string, unknown>;
      const maxima = typeof cc.pontuacao_maxima === "number" ? cc.pontuacao_maxima : null;
      let obtida = typeof cc.pontuacao_obtida === "number" ? cc.pontuacao_obtida : 0;
      if (maxima != null) obtida = clamp(obtida, 0, maxima);
      return {
        rotulo: typeof cc.rotulo === "string" && cc.rotulo ? cc.rotulo : String(i + 1),
        pontuacao_maxima: maxima,
        pontuacao_obtida: round2(obtida),
        justificativa: typeof cc.justificativa === "string" ? cc.justificativa : "",
      };
    });

  // A nota final e' sempre RECALCULADA a partir da soma dos criterios (nunca
  // confiamos no nota_total que o modelo eventualmente reportar), e limitada
  // ao valor total oficial do item — evita erro de soma da IA e estouro de nota.
  const somaCriterios = criterios.reduce((acc, c) => acc + c.pontuacao_obtida, 0);
  const notaTotal = criterios.length > 0
    ? clamp(round2(somaCriterios), 0, valorTotal || somaCriterios)
    : clamp(round2(typeof obj.nota_total === "number" ? obj.nota_total : 0), 0, valorTotal || 999);

  const feedbackGeral = typeof obj.feedback_geral === "string" ? obj.feedback_geral : "";
  if (!feedbackGeral) return null;

  return { nota_total: notaTotal, criterios, feedback_geral: feedbackGeral };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  let body: CorrectionRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido." }, 400);
  }

  const { item, resposta_aluno } = body;

  if (!item || typeof item !== "object" || typeof resposta_aluno !== "string") {
    return jsonResponse({ error: "Requisição inválida: 'item' e 'resposta_aluno' são obrigatórios." }, 400);
  }

  if (!item.enunciado || item.valor_total == null) {
    return jsonResponse({ error: "'item' incompleto: 'enunciado' e 'valor_total' são obrigatórios." }, 400);
  }

  const respostaAluno = resposta_aluno.slice(0, MAX_RESPOSTA_CHARS).trim();

  // Resposta em branco: zera sem gastar chamada de IA.
  if (!respostaAluno) {
    const criterios: CriterioResultado[] = (item.criterios ?? []).map((c, i) => ({
      rotulo: c.rotulo ?? String(i + 1),
      pontuacao_maxima: c.pontuacao_maxima ?? null,
      pontuacao_obtida: 0,
      justificativa: "Resposta em branco.",
    }));
    return jsonResponse({
      nota_total: 0,
      criterios,
      feedback_geral: "Nenhuma resposta foi apresentada para este item, portanto a pontuação é zero.",
    });
  }

  const apiKey = Deno.env.get("API_DEEPSEEK_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "Chave da API da DeepSeek não configurada no servidor." }, 500);
  }

  const payload = {
    model: DEEPSEEK_MODEL,
    messages: [
      { role: "system", content: buildSystemPrompt(item) },
      { role: "user", content: `RESPOSTA DO ALUNO A SER CORRIGIDA:\n\n${respostaAluno}` },
    ],
    temperature: 0.2,
    max_tokens: 2000,
    response_format: { type: "json_object" },
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
  const content = data?.choices?.[0]?.message?.content ?? "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return jsonResponse({ error: "A IA não retornou um JSON válido.", detail: content }, 502);
  }

  const result = validateAndNormalize(parsed, item);
  if (!result) {
    return jsonResponse({ error: "A resposta da IA não teve o formato esperado.", detail: content }, 502);
  }

  return jsonResponse(result);
});
