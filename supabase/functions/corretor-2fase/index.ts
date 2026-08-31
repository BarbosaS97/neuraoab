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
  anulado?: boolean;
}

interface CorrectionResult {
  nota_total: number;
  criterios: CriterioResultado[];
  feedback_geral: string;
  // "Camada 2": problemas jurídicos/formais que a IA percebeu mas que NÃO
  // afetam a nota oficial (porque não correspondem a nenhum critério
  // específico do espelho) — ex.: instituto processual tecnicamente
  // inadequado mas que não é o foco de nenhum critério, pedido desnecessário
  // na peça, data de fechamento que não bate com o prazo real. Nunca deve
  // ser usado pra justificar perda de pontos — só pra dar um feedback mais
  // completo sem contaminar a correção oficial (ver seção 12 do relatório
  // de testes que motivou este campo).
  alertas_juridicos: string[];
}

const MAX_RESPOSTA_CHARS = 12000;

// Mesma logica de defesa do dr-laureano (ver comentario la): esta funcao so'
// exige a anon key, publica no HTML, entao um "item" forjado com textos
// gigantes poderia forcar chamadas caras na API da DeepSeek. Os tamanhos
// abaixo sao generosos o bastante pra qualquer peca/questao real (mesmo as
// mais longas ja extraidas das provas oficiais) — so' travam abuso.
const MAX_ENUNCIADO_CHARS = 10000;
const MAX_GABARITO_CHARS = 12000;
const MAX_CRITERIOS_BRUTO_CHARS = 12000;
const MAX_OBSERVACAO_CHARS = 1000;
const MAX_SUBITEM_CHARS = 3000;
const MAX_SUBITENS = 20;
const MAX_CRITERIO_TEXTO_CHARS = 1500;
const MAX_CRITERIO_LABEL_CHARS = 100;
const MAX_CRITERIOS = 60;

function cap(value: unknown, max: number): string {
  const s = typeof value === "string" ? value : "";
  return s.length > max ? s.slice(0, max) : s;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function formatCriterios(criterios: Criterio[] | undefined): string {
  if (!criterios || criterios.length === 0) return "";
  return criterios
    .slice(0, MAX_CRITERIOS)
    .map((c, i) => {
      const rotulo = cap(c.rotulo, MAX_CRITERIO_LABEL_CHARS) || String(i + 1);
      const categoriaTexto = cap(c.categoria, MAX_CRITERIO_LABEL_CHARS);
      const categoria = categoriaTexto ? `[${categoriaTexto}] ` : "";
      const max = c.pontuacao_maxima != null ? ` (máx. ${c.pontuacao_maxima.toFixed(2)} pontos)` : "";
      const faixas = c.faixas_possiveis && c.faixas_possiveis.length
        ? ` — pontuações possíveis: ${c.faixas_possiveis.map((f) => f.toFixed(2)).join("/")}`
        : "";
      return `${rotulo}. ${categoria}${cap(c.descricao, MAX_CRITERIO_TEXTO_CHARS)}${max}${faixas}`;
    })
    .join("\n");
}

function buildSystemPrompt(item: ItemContext): string {
  const tipo = item.tipo === "peca" ? "peça profissional" : `questão discursiva nº ${item.numero ?? "?"}`;
  const valorTotal = item.valor_total ?? 0;

  const subitensTexto = (item.subitens ?? [])
    .slice(0, MAX_SUBITENS)
    .map((s) => `${s.letra}) ${cap(s.enunciado, MAX_SUBITEM_CHARS)}${s.valor != null ? ` (Valor: ${s.valor.toFixed(2)})` : ""}`)
    .join("\n");

  const criteriosEstruturados = formatCriterios(item.criterios);
  const criteriosTexto = criteriosEstruturados || cap(item.criterios_texto_bruto, MAX_CRITERIOS_BRUTO_CHARS) || "(critérios não disponíveis)";

  return [
    "Você é um examinador oficial da banca da FGV, corrigindo a 2ª fase do Exame de Ordem (OAB) com o rigor",
    "e a objetividade de um corretor real: só pontua o que está explicitamente atendido no texto do aluno,",
    "seguindo estritamente o padrão de resposta oficial abaixo. Você está corrigindo apenas UM item do",
    `caderno: a ${tipo}, no valor total de ${valorTotal.toFixed(2)} pontos.`,
    "",
    "ENUNCIADO:",
    cap(item.enunciado, MAX_ENUNCIADO_CHARS),
    subitensTexto ? "\nITENS:\n" + subitensTexto : "",
    item.observacao ? `\nOBSERVAÇÃO DO ENUNCIADO: ${cap(item.observacao, MAX_OBSERVACAO_CHARS)}` : "",
    "",
    "GABARITO COMENTADO (padrão de resposta oficial):",
    cap(item.gabarito_comentado, MAX_GABARITO_CHARS) || "(não disponível)",
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
    "- Para cada critério, avalie separadamente quatro dimensões antes de decidir a nota: (1) a CONCLUSÃO",
    "  do aluno está juridicamente correta? (2) ele FUNDAMENTOU por que essa conclusão está correta, com",
    "  raciocínio jurídico de verdade (não só afirmação)? (3) ele indicou o dispositivo legal, súmula ou",
    "  precedente exigido, quando o critério pedir isso especificamente? (4) o fundamento apresentado se",
    "  aplica corretamente aos FATOS do caso concreto, e não só ao tema em abstrato? Uma resposta pode citar",
    "  o artigo certo e mesmo assim errar a aplicação ao caso — isso não deve receber pontuação integral.",
    "- A mera citação ou transcrição de dispositivo legal, sem a devida fundamentação e conclusão exigidas",
    "  pelo critério, NÃO confere pontuação — assim como nas provas reais da OAB. Mas o INVERSO também é",
    "  regra: se a fundamentação jurídica do aluno está correta e completa e só falta o número do artigo/",
    "  súmula, a perda de pontos fica restrita ESTRITAMENTE ao critério específico do espelho que pontua",
    "  essa indicação (quando ele existir) — nunca trate \"não citou o artigo\" como se fosse \"não",
    "  fundamentou\", e nunca deixe essa ausência contaminar a nota de outros critérios (conclusão,",
    "  fundamentação) que o aluno atendeu de fato.",
    "- Quando o espelho exigir um instituto jurídico ESPECÍFICO (ex.: denunciação da lide, embargos de",
    "  declaração, agravo de instrumento) e o aluno usar um instituto DIFERENTE, mesmo que da mesma",
    "  categoria geral (ex.: outra modalidade de intervenção de terceiros, outro recurso cabível em tese),",
    "  NÃO trate como equivalente só por pertencerem à mesma categoria. Pergunte-se: o instituto que o aluno",
    "  usou é ele mesmo juridicamente cabível e adequado para ESTE caso concreto, com a mesma consequência",
    "  prática exigida pelo gabarito? Só pontue integralmente se a resposta for sim; caso contrário, trate",
    "  como instituto incorreto para aquele critério.",
    "- Não pontue argumentos que o aluno não desenvolveu de fato, mesmo que estejam implícitos ou sejam",
    "  \"quase\" o que se pede. Seja rigoroso, mas justo: reconheça formulações equivalentes em conteúdo",
    "  jurídico ainda que com palavras diferentes, ordem diferente, ou fundamento legal diferente do",
    "  gabarito, desde que sustente a mesma tese com equivalência jurídica real — o espelho é uma referência",
    "  de conteúdo e critérios, não um texto-alvo para comparação literal.",
    "- Se a resposta do aluno estiver em branco ou não tiver relação alguma com o enunciado, zere todos os",
    "  critérios.",
    "- Se o gabarito comentado ou a distribuição de pontos indicar que este item (ou um critério específico",
    "  dele) foi ANULADO pela Coordenação do Exame (ou expressão equivalente, como \"questão anulada\" ou",
    "  \"sem resposta oficial\"), marque esse critério com \"anulado\": true e atribua a ele a PONTUAÇÃO MÁXIMA",
    "  (pontuacao_obtida = pontuacao_maxima) — prática padrão da própria banca: item anulado dá o ponto a",
    "  todos os candidatos, não retira nem deixa de pontuar. Nesse caso a justificativa deve apenas explicar",
    "  que o item foi anulado, sem avaliar o conteúdo da resposta do aluno para esse critério.",
    "- Justifique cada pontuação em 1 a 2 frases curtas e objetivas, indicando o que faltou ou o que foi",
    "  bem atendido. Quando a resposta for PARCIALMENTE correta, a justificativa deve deixar isso claro —",
    "  nunca escreva como se a resposta inteira estivesse errada quando só uma parte específica (ex.: só a",
    "  indicação do dispositivo) não foi atendida. Prefira algo como \"a conclusão e a fundamentação estão",
    "  corretas, mas faltou indicar o dispositivo legal exigido por este critério, por isso não foi atribuída",
    "  a pontuação correspondente\" em vez de \"a resposta está errada\".",
    "- Ao final, escreva um feedback geral (3 a 6 frases) explicando o desempenho do aluno nesse item,",
    "  destacando o principal ponto forte e o principal ponto a melhorar.",
    "- \"alertas_juridicos\": uma lista separada (pode ser vazia) de observações jurídicas ou formais que você",
    "  perceber na resposta do aluno mas que NÃO correspondem a nenhum critério específico do espelho — por",
    "  isso não devem afetar nota nenhuma. Exemplos: um instituto tecnicamente inadequado mencionado de",
    "  passagem mas que não é o foco de nenhum critério pontuável, um pedido desnecessário ou juridicamente",
    "  problemático na peça, uma data ou prazo que não bate mas que o critério de fechamento não avalia,",
    "  uma fragilidade argumentativa que prejudicaria o candidato numa prova real mesmo sem tirar pontos",
    "  aqui. NUNCA use esta lista para justificar uma nota mais baixa — ela é só um adicional pedagógico,",
    "  a nota já foi decidida pelos critérios acima. Se não houver nada relevante a apontar, devolva uma",
    "  lista vazia.",
    "- Português claro e direto, sem markdown (nada de **negrito**, listas com \"-\", ou #títulos) no",
    "  feedback_geral, nas justificativas e nos alertas_juridicos — texto corrido normal.",
    "",
    "FORMATO DE SAÍDA, OBRIGATÓRIO: responda SOMENTE com um JSON válido, sem nenhum texto fora dele, no",
    "formato exato:",
    '{"nota_total": number, "criterios": [{"rotulo": string, "pontuacao_maxima": number, ' +
      '"pontuacao_obtida": number, "justificativa": string, "anulado": boolean}], "feedback_geral": string, ' +
      '"alertas_juridicos": string[]}',
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
      const anulado = cc.anulado === true;
      let obtida = typeof cc.pontuacao_obtida === "number" ? cc.pontuacao_obtida : 0;
      // Critério anulado: pontuação máxima concedida SEMPRE, nunca confiando
      // no valor que a IA eventualmente devolver — mesma prática da própria
      // banca (item anulado pontua todo mundo, não é avaliado pelo conteúdo
      // da resposta). Ver instrução no prompt, buildSystemPrompt acima.
      if (anulado && maxima != null) {
        obtida = maxima;
      } else if (maxima != null) {
        obtida = clamp(obtida, 0, maxima);
      }
      return {
        rotulo: typeof cc.rotulo === "string" && cc.rotulo ? cc.rotulo : String(i + 1),
        pontuacao_maxima: maxima,
        pontuacao_obtida: round2(obtida),
        justificativa: typeof cc.justificativa === "string" ? cc.justificativa : "",
        anulado,
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

  const alertasJuridicos = Array.isArray(obj.alertas_juridicos)
    ? obj.alertas_juridicos.filter((a): a is string => typeof a === "string" && a.trim().length > 0)
    : [];

  return { nota_total: notaTotal, criterios, feedback_geral: feedbackGeral, alertas_juridicos: alertasJuridicos };
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

  // Resposta em branco: zera sem gastar chamada de IA — exceto um critério
  // marcado como anulado no próprio texto oficial (descricao), que continua
  // valendo pontuação máxima independente de o aluno ter respondido ou não
  // (mesma regra do prompt/validateAndNormalize pra quando a IA é chamada).
  if (!respostaAluno) {
    const criterios: CriterioResultado[] = (item.criterios ?? []).map((c, i) => {
      const anulado = (c.descricao ?? "").toLowerCase().includes("anulad");
      const maxima = c.pontuacao_maxima ?? null;
      return {
        rotulo: c.rotulo ?? String(i + 1),
        pontuacao_maxima: maxima,
        pontuacao_obtida: anulado && maxima != null ? maxima : 0,
        justificativa: anulado ? "Item anulado pela Coordenação do Exame — pontuação concedida integralmente." : "Resposta em branco.",
        anulado,
      };
    });
    const notaTotal = round2(criterios.reduce((acc, c) => acc + c.pontuacao_obtida, 0));
    return jsonResponse({
      nota_total: notaTotal,
      criterios,
      feedback_geral: notaTotal > 0
        ? "Nenhuma resposta foi apresentada para este item — a pontuação obtida se deve apenas a critério(s) anulado(s) pela Coordenação do Exame."
        : "Nenhuma resposta foi apresentada para este item, portanto a pontuação é zero.",
      alertas_juridicos: [],
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
    // 2000 -> 2600: a resposta agora inclui "alertas_juridicos" (lista extra
    // por item) e justificativas um pouco mais detalhadas (regras novas de
    // instituto/dispositivo/adequacao ao caso) — margem extra pra nao
    // truncar o JSON no meio (o que faria a correcao inteira falhar).
    max_tokens: 2600,
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
