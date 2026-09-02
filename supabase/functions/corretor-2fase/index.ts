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
//
// Rate limit: esta funcao e' publica de proposito (uso anonimo da 2a fase,
// ver estudos/simulado2fase.js) e cada chamada custa dinheiro de verdade
// (API paga da DeepSeek) — sem exigir login (isso quebraria o fluxo
// anonimo), o unico jeito de conter abuso e' limitar por IP, via
// check_rate_limit() no banco (ver supabase/schema_security_hardening.sql).
//
// Limite de PLANO (ver planAllowsSegundaFase, supabase/schema_planos.sql):
// quem nao esta logado continua sem nenhuma restricao de plano (uso
// anonimo, ver acima). Quem esta logado no plano gratuito (sem
// segunda_fase) e' recusado aqui mesmo que consiga chamar esta function
// direto — a trava "de verdade" pra esse aluno e' nunca deixar clicar em
// "Iniciar" em simulado2fase.js (applySegundaFaseLock), isto aqui e' so'
// defesa em profundidade.

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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const rateLimitClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Client privilegiado (service_role) usado SÓ pra checar o plano de quem
// chamou, se estiver logado (ver planAllowsSegundaFase abaixo) — mesmo
// padrão/mesmo motivo de supabase/functions/dr-laureano/index.ts e
// estatisticas-ia/index.ts (get_plan_status_for exige service_role de
// propósito, ver supabase/schema_planos.sql). Nada mais nesta function usa
// a service_role key.
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Uso anônimo continua 100% livre (mesmo motivo de sempre, ver comentário
// no topo do arquivo) — quem não está logado não tem "plano" nenhum, então
// esta checagem só entra em ação pra quem manda um JWT válido no header
// Authorization. É a mesma trava de simulado2fase.js (applySegundaFaseLock,
// que já impede o aluno logado no grátis de sequer clicar "Iniciar") — isto
// aqui é defesa em profundidade, caso alguém contorne aquela trava do lado
// do cliente e chame esta function direto com uma tentativa criada na mão.
async function planAllowsSegundaFase(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return true;

  const { data: userData, error: userError } = await adminClient.auth.getUser(jwt);
  if (userError || !userData?.user) return true;

  const { data, error } = await adminClient.rpc("get_plan_status_for", { p_user_id: userData.user.id });
  if (error || !data || data.length === 0) return true;

  return (data[0] as { segunda_fase: boolean }).segunda_fase !== false;
}

// Ate' 5 itens (peca + 4 questoes) sao corrigidos de uma vez ao clicar
// "Finalizar" (Promise.all em simulado2fase.js) — o limite precisa acomodar
// varios cadernos numa sessao de estudo normal sem incomodar ninguem, so'
// bloqueando um script automatizado martelando chamadas.
const RATE_LIMIT_MAX = 40;
const RATE_LIMIT_WINDOW_SECONDS = 600;

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? "unknown";
}

async function checkRateLimit(req: Request): Promise<boolean> {
  const key = `corretor-2fase:${getClientIp(req)}`;
  const { data, error } = await rateLimitClient.rpc("check_rate_limit", {
    p_key: key,
    p_max_count: RATE_LIMIT_MAX,
    p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
  });
  // Se a checagem em si falhar (RPC indisponivel etc.), deixa passar — um
  // erro de infra aqui nao pode travar a correcao pra todo mundo.
  if (error) return true;
  return data === true;
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
    "- O array \"criterios\" da resposta deve ter EXATAMENTE um item pra cada critério da distribuição de",
    "  pontos oficial acima, NUNCA mais nem menos — mesma quantidade, mesma ordem, mesmo \"rotulo\" EXATO",
    "  (ex.: se o rótulo oficial é \"A\", devolva \"rotulo\": \"A\", nunca \"A. Conclusão...\" ou algo mais longo).",
    "  Mesmo que um critério tenha várias partes internas (conclusão, fundamentação, dispositivo), avalie",
    "  todas elas e devolva UM ÚNICO pontuacao_obtida pra aquele critério — nunca separe em vários itens",
    "  do array. Para cada critério, atribua a pontuação obtida dentre as pontuações possíveis indicadas",
    "  (quando informadas) — o valor tem que ser exatamente um daqueles números, nunca um valor fora dessa",
    "  lista nem uma soma parcial inventada por você.",
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
    "  fundamentação) que o aluno atendeu de fato. IMPORTANTE: restringir a perda ao critério específico do",
    "  dispositivo NÃO significa ignorar essa perda — se as pontuações possíveis distinguem \"conteúdo\" de",
    "  \"conteúdo + dispositivo\" (ex.: [0, 0.50, 0.60], em que 0.50 é só o conteúdo e 0.60 inclui o",
    "  dispositivo), e o aluno não citou o dispositivo, o valor correto é o intermediário (0.50), NUNCA o",
    "  mais alto (0.60) só porque o conteúdo estava certo. Antes de decidir o número final de cada critério,",
    "  releia a sua própria justificativa: se nela você escreveu que algo específico faltou (o dispositivo,",
    "  por exemplo), o pontuacao_obtida TEM que refletir essa perda pontual — nunca a pontuação máxima do",
    "  critério. Justificativa e nota têm que ser sempre consistentes entre si.",
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

// Detecta, na propria justificativa da IA, uma admissao de que o
// dispositivo/artigo/sumula nao foi citado pelo aluno — usado como rede de
// seguranca contra a IA dar a faixa mais alta mesmo reconhecendo essa
// falta (ver uso logo abaixo, dentro de validateAndNormalize). Cobre voz
// ativa ("não citou"), passiva ("não foi indicado") e subjuntivo ("não
// tenha citado") — ate' 2 palavras de folga entre "não" e o verbo, pra
// pegar auxiliares tipo "foi"/"tenha"/"teria" sem precisar listar cada
// conjugacao possivel.
const NAO_CITOU_DISPOSITIVO_RE =
  /(não|nao)\s+(?:\w+\s+){0,2}?(citou|citado|citados|indicou|indicado|indicados|mencionou|mencionado|mencionados|apontou|apontado|apontados|constou|fez\s+men[cç][aã]o)[^.]{0,80}(dispositivo|artigo|art\.|s[uú]mula|preceito legal)/i;

// Chave de agrupamento a partir de um rotulo devolvido pela IA: pega o
// primeiro "token" antes de um ponto ou espaço. Cobre tanto o caso normal
// ("A" -> "A") quanto o caso em que a IA (apesar da instrucao) fatia um
// criterio oficial em varias linhas ("A. Conclusao..." e "A. Indicacao..."
// ambos viram "A") — usado pra remontar isso num unico criterio depois.
function extractGroupKey(rotulo: string): string {
  const token = rotulo.trim().split(/[.\s]/)[0] || rotulo.trim();
  return token.toUpperCase();
}

// Maior valor da lista de pontuacoes possiveis que nao ultrapassa "value" —
// NUNCA arredonda pra cima. Existe pra neutralizar dois jeitos da IA
// inflar nota apesar das instrucoes do prompt: (a) devolver um numero fora
// da lista oficial (ex.: 0.55 quando so' 0/0.5/0.6 sao validos), ou (b)
// fatiar um criterio em partes cuja soma nao corresponde a nenhum degrau
// real do espelho (ex.: 0.20 quando os degraus sao 0/0.3/0.4/0.5/0.6).
function snapToFaixa(value: number, faixas: number[] | null | undefined): number {
  if (!faixas || faixas.length === 0) return value;
  const sorted = [...faixas].sort((a, b) => a - b);
  let best = sorted[0];
  for (const f of sorted) {
    if (f <= value + 0.001) best = f;
    else break;
  }
  return best;
}

function validateAndNormalize(raw: unknown, item: ItemContext): CorrectionResult | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const rawCriterios = Array.isArray(obj.criterios) ? obj.criterios : [];
  const valorTotal = item.valor_total ?? 0;
  const officialCriterios = item.criterios ?? [];

  interface RawNorm {
    key: string;
    obtida: number;
    maxima: number | null;
    justificativa: string;
    anulado: boolean;
  }

  const rawNorm: RawNorm[] = rawCriterios
    .filter((c) => c && typeof c === "object")
    .map((c, i) => {
      const cc = c as Record<string, unknown>;
      const rotuloBruto = typeof cc.rotulo === "string" && cc.rotulo ? cc.rotulo : String(i + 1);
      const maxima = typeof cc.pontuacao_maxima === "number" ? cc.pontuacao_maxima : null;
      const anulado = cc.anulado === true;
      let obtida = typeof cc.pontuacao_obtida === "number" ? cc.pontuacao_obtida : 0;
      if (maxima != null) obtida = clamp(obtida, 0, maxima);
      return {
        key: extractGroupKey(rotuloBruto),
        obtida,
        maxima,
        justificativa: typeof cc.justificativa === "string" ? cc.justificativa : "",
        anulado,
      };
    });

  // Agrupa por rotulo oficial (ver extractGroupKey) — cobre o caso normal
  // (1 pra 1) e o caso em que a IA fatiou um criterio oficial em varias
  // linhas apesar da instrucao pra nao fazer isso.
  const groups = new Map<string, RawNorm[]>();
  rawNorm.forEach((r) => {
    groups.set(r.key, [...(groups.get(r.key) ?? []), r]);
  });

  // A fonte de verdade pra rotulo/pontuacao_maxima/faixas_possiveis de cada
  // criterio e' SEMPRE item.criterios (o que veio do banco, oab2_criterios)
  // — nunca o que a IA devolveu, que pode estar fatiado ou com maxima
  // errada. Se o item nao tiver criterios estruturados (fallback pra
  // criterios_texto_bruto), usa os grupos da propria IA como estao.
  const baseParaCriterios: Criterio[] = officialCriterios.length > 0
    ? officialCriterios
    : Array.from(groups.keys()).map((key): Criterio => ({ rotulo: key }));

  // Peças com muitos critérios numerados (ex.: 17 itens "1".."16" + "7.1")
  // mostraram, na prática, a IA trocando o rotulo por uma descrição própria
  // ("Endereçamento: petição endereçada..." em vez de "1") mesmo mantendo
  // ORDEM e QUANTIDADE corretas — o casamento por chave falha pra quase
  // todos os critérios oficiais nesse caso, mesmo com os dados certos ali
  // do lado. Quando isso é detectado (maioria dos critérios oficiais sem
  // nenhum grupo casado, mas a IA devolveu uma quantidade de itens
  // parecida), casa por POSIÇÃO em vez de por nome — a ordem se mostrou
  // mais confiável que o rotulo nesse cenário.
  const oficiaisSemMatch = officialCriterios.filter((oc) => !groups.has(extractGroupKey(oc.rotulo ?? ""))).length;
  const usaCasamentoPosicional = officialCriterios.length > 0 &&
    rawNorm.length > 0 &&
    oficiaisSemMatch > officialCriterios.length / 2;

  const criterios: CriterioResultado[] = baseParaCriterios.map((oc, i) => {
    const rotuloOficial = oc.rotulo ?? String(i + 1);
    const key = extractGroupKey(rotuloOficial);
    const group = usaCasamentoPosicional
      ? (rawNorm[i] ? [rawNorm[i]] : [])
      : (groups.get(key) ?? []);
    const maxima = oc.pontuacao_maxima ?? group[0]?.maxima ?? null;
    // Critério anulado: pontuação máxima concedida SEMPRE, nunca confiando
    // no valor que a IA eventualmente devolver — mesma prática da própria
    // banca (item anulado pontua todo mundo, não é avaliado pelo conteúdo
    // da resposta). Ver instrução no prompt, buildSystemPrompt acima.
    const anulado = group.some((g) => g.anulado);
    const somaGrupo = group.reduce((acc, g) => acc + g.obtida, 0);
    const justificativa = group.length > 0
      ? group.map((g) => g.justificativa).filter(Boolean).join(" ")
      : "Critério não avaliado pela IA.";
    let obtida = anulado && maxima != null
      ? maxima
      : snapToFaixa(clamp(somaGrupo, 0, maxima ?? somaGrupo), oc.faixas_possiveis);
    // Rede de seguranca pra um caso especifico testado e reproduzido varias
    // vezes: mesmo com instrucao explicita no prompt (+ exemplo numerico),
    // a IA as vezes reconhece na propria justificativa que o dispositivo/
    // artigo nao foi citado mas ainda assim escolhe o degrau mais alto da
    // faixa (que inclui esse ponto) — inconsistencia entre texto e numero.
    // Se a justificativa admite isso e o valor bate com o maior degrau,
    // rebaixa pro segundo maior degrau disponivel (nunca pra zero: o resto
    // do conteudo pode estar certo, so' o dispositivo que faltou).
    if (!anulado && oc.faixas_possiveis && oc.faixas_possiveis.length >= 2) {
      const sortedFaixas = [...oc.faixas_possiveis].sort((a, b) => a - b);
      const maiorFaixa = sortedFaixas[sortedFaixas.length - 1];
      const segundaMaiorFaixa = sortedFaixas[sortedFaixas.length - 2];
      const admiteFaltaDispositivo = NAO_CITOU_DISPOSITIVO_RE.test(justificativa);
      if (admiteFaltaDispositivo && Math.abs(obtida - maiorFaixa) < 0.001) {
        obtida = segundaMaiorFaixa;
      }
    }
    return {
      rotulo: rotuloOficial,
      pontuacao_maxima: maxima,
      pontuacao_obtida: round2(obtida),
      justificativa,
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

  if (!(await checkRateLimit(req))) {
    return jsonResponse({ error: "Muitas correções em pouco tempo. Aguarde alguns minutos e tente novamente." }, 429);
  }

  if (!(await planAllowsSegundaFase(req))) {
    return jsonResponse(
      { error: "A 2ª fase completa (correção por IA) é um recurso dos planos Básico e Pro.", planLocked: true },
      403,
    );
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
