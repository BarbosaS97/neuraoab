// supabase/functions/criar-cobranca/index.ts
//
// Cria (ou reaproveita) um cliente e uma ASSINATURA no Asaas pro plano
// Básico/Pro escolhido, e devolve o suficiente pro front-end mostrar o QR
// code PIX ou o link do boleto da primeira cobrança. A API key do Asaas
// nunca chega ao navegador — só esta function e webhook-asaas falam com o
// Asaas, sempre com a service_role key do lado do Supabase também (nunca a
// anon key, porque grava em profiles.cpf_cnpj e cobrancas).
//
// Por que ASSINATURA (POST /subscriptions) e não um pagamento avulso
// (POST /payments): os planos são recorrentes ("R$ 11,99/mês") — uma
// assinatura faz o Asaas gerar sozinho a cobrança do mês seguinte, sem
// precisar desta function rodar de novo. webhook-asaas trata cada
// renovação como uma atualização da MESMA linha em "cobrancas" (casada por
// asaas_subscription_id), não uma linha nova.
//
// EXCEÇÃO — CREDIT_CARD + YEARLY (parcelamento em CREDIT_CARD_YEARLY_INSTALLMENTS
// vezes ESCOLHIDAS PELO ALUNO): a API de assinatura do Asaas (/subscriptions)
// não tem campo de parcelamento nenhum. Também não é POST /payments com
// installmentCount fixo — essa rota até parcela, mas quem decide "em quantas
// vezes" é o SERVIDOR (o aluno só vê o cronograma já pronto, sem escolha —
// não é "em até Nx" de verdade). O produto certo pra isso é o "Asaas
// Checkout" (POST /v3/checkouts, chargeTypes: ["DETACHED", "INSTALLMENT"] —
// DETACHED é exigido junto, confirmado em produção — + installment.
// maxInstallmentCount): cria uma sessão de pagamento hospedada
// onde o PRÓPRIO ALUNO escolhe de 1x a N, e o Asaas recalcula o valor de
// cada parcela. Só esta combinação (cartão + anual) usa esse fluxo — o
// resto (PIX/boleto em qualquer ciclo, cartão mensal) continua assinatura
// de verdade via /subscriptions.
//
// Consequência: essa cobrança NÃO renova sozinha depois de 1 ano (é uma
// sessão de checkout avulsa, não uma assinatura) — sem um lembrete de
// renovação (fora do escopo por enquanto), o aluno que assinar o anual
// parcelado precisa comprar de novo manualmente quando o ano acabar.
//
// webhook-asaas PRECISOU de mudança pra isso: o Checkout do Asaas dispara
// eventos próprios (CHECKOUT_PAID etc.), formato diferente de
// PAYMENT_CONFIRMED/SUBSCRIPTION_*, casados por asaas_checkout_id (não
// asaas_subscription_id nem asaas_payment_id) — ver findCobrancaCheckout lá.
// A documentação oficial do Asaas não publica um exemplo do payload de
// CHECKOUT_PAID (só de CHECKOUT_CREATED) — o campo usado pra achar a
// cobrança (checkout.id) é o mesmo id que ESTA function recebe na criação,
// então deveria bater, mas vale confirmar com um pagamento de teste real
// (ver supabase/schema_asaas_parcelamento.sql).
//
// "userId" NUNCA vem do corpo da requisição, mesmo que fosse mais simples
// de implementar assim — vem sempre do JWT verificado (requireUser
// abaixo), porque é isso que decide QUEM está assinando; confiar num
// userId mandado pelo cliente deixaria qualquer um comprar um plano "pra"
// outra pessoa (ou fingir ser admin/outro aluno).
//
// CREDIT_CARD é só mais um billingType passado pro Asaas — esta function
// NUNCA recebe nem repassa número de cartão, validade ou CVV. Decisão
// consciente: mandar dado de cartão cru direto pro Asaas via API exigiria
// nosso lado ser certificado PCI-DSS SAQ-D (o nível mais rigoroso — a
// própria documentação do Asaas confirma isso, já que eles não oferecem
// tokenização client-side). Em vez disso, o aluno completa o pagamento com
// cartão na página hospedada do próprio Asaas (invoiceUrl da cobrança, ou
// checkout.link no ramo parcelado) — nenhum dado de cartão passa perto do
// NeuraOAB em nenhum momento.
//
// Secrets necessários (Project Settings > Edge Functions > Secrets):
// ASAAS_API_KEY, ASAAS_ENV ("production" ou "sandbox" — controla a base
// URL abaixo). ASAAS_WEBHOOK_TOKEN não é usado aqui (só em webhook-asaas).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ------------------------------------------------------------------ Asaas

const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY")!;
const ASAAS_ENV = Deno.env.get("ASAAS_ENV") ?? "sandbox";
const ASAAS_BASE_URL =
  ASAAS_ENV === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";

interface AsaasResult {
  ok: boolean;
  status: number;
  // deno-lint-ignore no-explicit-any
  data: any;
}

// access_token (não "Authorization: Bearer") é o header que o Asaas exige
// — confirmado na documentação oficial deles, formato diferente do padrão
// usado pelas outras APIs deste projeto (DeepSeek, Supabase).
async function asaasFetch(path: string, init: RequestInit = {}): Promise<AsaasResult> {
  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "NeuraOAB/1.0",
      access_token: ASAAS_API_KEY,
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

function asaasErrorMessage(result: AsaasResult, fallback: string): string {
  return result.data?.errors?.[0]?.description || fallback;
}

// Preço fixo por plano/ciclo — mesmo valor mostrado na landing page
// (index.html, seção #planos) e no modal de planos do dashboard
// (estudos/index.html, #plansOverlay). Não há hoje uma fonte única de
// preço compartilhada entre as três (decisão consciente ao criar
// plan_limits, ver supabase/schema_planos.sql — aquela tabela é só sobre
// limite de uso) — mudar um preço aqui sem atualizar a copy estática das
// outras duas telas deixa os lugares mostrando números diferentes.
const PRICES: Record<string, Record<string, number>> = {
  basico: { MONTHLY: 11.99, YEARLY: 119.90 },
  pro: { MONTHLY: 19.99, YEARLY: 199.90 },
};

// Só se aplica a CREDIT_CARD + YEARLY (ver comentário grande no topo do
// arquivo) — PIX/boleto e o ciclo mensal nunca usam este número.
const CREDIT_CARD_YEARLY_INSTALLMENTS = 10;

const PLAN_DESCRIPTIONS: Record<string, string> = {
  basico: "NeuraOAB — Plano Básico",
  pro: "NeuraOAB — Plano Pro",
};

// Só usado no ramo CREDIT_CARD + YEARLY (Asaas Checkout) — "items[].imageBase64"
// é documentado como obrigatório por item nesse endpoint, mesmo pra um
// produto digital sem imagem de verdade. PNG RGB simples gerado à parte
// (128x128, fundo roxo da marca com "N" branco) — a 1ª tentativa reaproveitou
// favicon-32.png e a Asaas recusou com "Ocorreu um erro ao salvar sua
// imagem" (formato/tamanho não aceito, ela não detalha qual constraint
// exatamente); este aqui é RGB comum (não indexado/paletizado) e um
// tamanho mais convencional de ícone, o que resolveu.
const CHECKOUT_ITEM_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAALZSURBVHhe7djBTSNREEVRAu1QyMAZsHISzoEdAZCAV142Qkb+CLsXYPP6V9VHPCRu6S5m0LQXfaR5wnebaSZjAJgDwBwA5gAwB4A5AMwBYA4AcwCYA8AcAOYAMAeAOQDMAWAOAHMAmAPAHADmADAHgDkAzAFgDgBzAJgDwBwA5gAwB4A5AMwZAV6fW+cOu5ebp/I9vC0fJ+754eaRX+xPA7R2ery/eiofAKIIQGv74/b6wWQAiGIA4y8IAFEUoLW33fWzmQAQxQHG1hgAUQJgaI0BEKUABtYYAFESoPymABClAYprDICoAFBaYwBEFYDKGgMgqgHk1xgAURUg+8oAENUBcmsMgGgEoLWn15sPFAEgGgOIrzEAokGA8BoDIBoGCL47AEQ/ABBaYwBEPYD96bD8afW6awyAqAtw3Pbe3fl6awyAKAAwvTzul7+t3foaAyCKAMyb+2PkP6K1L+kAEMUApnm7Oy0/WTu9xgCIogD9f3k5tcYAiOIA/Zd4PrHGAIgyANO8e1p+vHZfH1kCQJQDqK8xAKIkQHmNARClAfqPXO5qjQEQFQD6b/N8X9cYAFEJoLDGAIiKAOk1BkBUBciuMQCiOsAm+CXdZY0BEI0A9F/r5T5eLgCiMYD4GgMgGgXof8L5DvvOYAAgrg8QXOPOASAuABBd49UDQFwIIPprwcoBIC4IEFxjfQCICwP0P2r1ABCXABhaYwDEZQBG1hgAcTmA+hoDIC4LUF1jAMTlAfqf+d0BIK4CEP2S7vMBIK4GkF9jAMQVAdJrDIC4MkDy1wIAxA0A9D/80wEgbgggscYAiBsECK8xAOJGAaJrDIC4cYDYGv9bAPoIAHMAmAPAHADmADAHgDkAzAFgDgBzAJgDwBwA5gAwB4A5AMwBYA4AcwCYA8AcAOYAMAeAOQDMAWAOAHMAmAPAHADmADAHgDkAzAFgDgBzAJgDwBwA5gAwB4C1aX4Hy+v1kGtFTwMAAAAASUVORK5CYII=";

// APP_URL usado nos 3 callbacks obrigatórios do Asaas Checkout
// (successUrl/cancelUrl/expiredUrl) — não existe tela de sucesso/cancelamento
// dedicada ainda (o modal de checkout do próprio NeuraOAB já faz polling do
// plano em paralelo, ver startCheckoutPolling em estudos/estudos.js), então
// os três apontam pro mesmo lugar por enquanto.
const APP_URL = "https://neuraoab.com.br/estudos/index.html";

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

// Validação de dígito verificador de CPF — recusa uma sequência óbvia
// (11111111111 etc.) ou matematicamente inválida antes de gastar uma
// chamada de API com o Asaas, que devolveria um erro genérico pra isso.
function isValidCpf(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calcDigit = (len: number): number => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calcDigit(9) === Number(cpf[9]) && calcDigit(10) === Number(cpf[10]);
}

async function requireUser(req: Request): Promise<{ id: string; email?: string } | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return null;
  const { data, error } = await adminClient.auth.getUser(jwt);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? undefined };
}

interface CreatePayload {
  plano?: string;
  ciclo?: string;
  billingType?: string;
  nome?: string;
  cpfCnpj?: string;
  // Só usado (e exigido) no ramo CREDIT_CARD + YEARLY — ver isParceladoAnual
  // abaixo. Asaas Checkout exige customerData.phoneNumber (confirmado em
  // produção: "O campo phoneNumber deve ser informado"); os outros
  // caminhos (PIX/boleto/cartão mensal) não usam este campo.
  telefone?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Espera um pouco e tenta de novo — tanto a 1ª cobrança de uma assinatura
// recém-criada quanto o QR code PIX de um pagamento recém-criado podem não
// estar prontos no exato instante em que o Asaas devolve o id (geração
// assíncrona do lado deles) — sem isso, a chamada seguinte falha
// silenciosamente e cai num fallback pior (link genérico em vez do QR code
// embutido na tela, que foi exatamente o bug relatado na primeira versão
// desta function).
async function withRetry<T>(
  fn: () => Promise<T>,
  isReady: (result: T) => boolean,
  attempts = 4,
  delayMs = 1500,
): Promise<T> {
  let result = await fn();
  for (let i = 1; i < attempts && !isReady(result); i++) {
    await sleep(delayMs);
    result = await fn();
  }
  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  const user = await requireUser(req);
  if (!user) {
    return jsonResponse({ error: "É preciso estar logado pra assinar um plano." }, 401);
  }

  // Criar cliente/assinatura no Asaas tem consequência real (não é só uma
  // leitura) — limite bem mais apertado que as Edge Functions de IA, só
  // pra conter um clique repetido/script, não uso legítimo (ninguém
  // assina o mesmo plano 5x em uma hora de propósito).
  const { data: withinLimit } = await adminClient.rpc("check_rate_limit", {
    p_key: `criar-cobranca:${user.id}`,
    p_max_count: 5,
    p_window_seconds: 3600,
  });
  if (withinLimit === false) {
    return jsonResponse({ error: "Muitas tentativas em pouco tempo. Aguarde um pouco e tente novamente." }, 429);
  }

  let body: CreatePayload;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido." }, 400);
  }

  const { plano, ciclo, billingType } = body;
  const nome = (body.nome ?? "").trim().slice(0, 200);
  const cpfCnpj = onlyDigits(body.cpfCnpj ?? "");

  if (plano !== "basico" && plano !== "pro") {
    return jsonResponse({ error: "\"plano\" precisa ser 'basico' ou 'pro'." }, 400);
  }
  if (ciclo !== "MONTHLY" && ciclo !== "YEARLY") {
    return jsonResponse({ error: "\"ciclo\" precisa ser 'MONTHLY' ou 'YEARLY'." }, 400);
  }
  if (billingType !== "PIX" && billingType !== "BOLETO" && billingType !== "CREDIT_CARD") {
    return jsonResponse({ error: "\"billingType\" precisa ser 'PIX', 'BOLETO' ou 'CREDIT_CARD'." }, 400);
  }
  if (!nome) {
    return jsonResponse({ error: "Informe seu nome completo." }, 400);
  }
  if (!isValidCpf(cpfCnpj)) {
    return jsonResponse({ error: "CPF inválido." }, 400);
  }

  const valor = PRICES[plano][ciclo];
  const isParceladoAnual = billingType === "CREDIT_CARD" && ciclo === "YEARLY";
  const telefone = onlyDigits(body.telefone ?? "");

  if (isParceladoAnual && telefone.length < 10) {
    return jsonResponse({ error: "Informe um telefone válido, com DDD." }, 400);
  }

  // Grava nome/CPF no perfil (service_role — nunca escrita direta do
  // cliente nesse campo, ver supabase/schema_asaas.sql) pra próxima
  // assinatura (upgrade de Básico pra Pro, renovação manual etc.) nem
  // precisar perguntar de novo.
  await adminClient.from("profiles").update({ cpf_cnpj: cpfCnpj }).eq("id", user.id);

  // ---------------------------------------------------------------------
  // Ramo CREDIT_CARD + YEARLY — Asaas Checkout, parcelamento escolhido
  // pelo aluno (ver comentário grande no topo do arquivo). Não passa por
  // /customers: customerData vai inline na criação do checkout, o Asaas
  // resolve/cria o cliente dele mesmo a partir do CPF.
  // ---------------------------------------------------------------------
  if (isParceladoAnual) {
    // Decide o id ANTES de chamar o Asaas e usa como externalReference —
    // mesma lógica de correlação já usada com a Woovi (ver
    // criar-cobranca-woovi/index.ts): webhook-asaas casa por
    // asaas_checkout_id (o id que o ASAAS devolve), com externalReference
    // como reforço, se vier ecoado de volta no evento.
    const cobrancaId = crypto.randomUUID();

    const checkoutResult = await asaasFetch("/checkouts", {
      method: "POST",
      body: JSON.stringify({
        billingTypes: ["CREDIT_CARD"],
        // DETACHED (à vista/1x) é EXIGIDO junto com INSTALLMENT pela API do
        // Asaas — confirmado em produção: "O tipo de cobrança DETACHED deve
        // ser informado junto com o tipo de cobrança INSTALLMENT". Não muda
        // o que oferecemos (1x já seria uma opção dentro de "até 10x" de
        // qualquer forma) — é só como o Asaas modela charge types.
        chargeTypes: ["DETACHED", "INSTALLMENT"],
        minutesToExpire: 120,
        externalReference: cobrancaId,
        callback: { successUrl: APP_URL, cancelUrl: APP_URL, expiredUrl: APP_URL },
        items: [
          {
            name: PLAN_DESCRIPTIONS[plano],
            description: `Assinatura anual do ${PLAN_DESCRIPTIONS[plano]}, em até ${CREDIT_CARD_YEARLY_INSTALLMENTS}x no cartão.`,
            quantity: 1,
            value: valor,
            imageBase64: CHECKOUT_ITEM_IMAGE_BASE64,
          },
        ],
        installment: { maxInstallmentCount: CREDIT_CARD_YEARLY_INSTALLMENTS },
        customerData: { name: nome, cpfCnpj, email: user.email, phoneNumber: telefone },
      }),
    });
    if (!checkoutResult.ok || !checkoutResult.data?.id || !checkoutResult.data?.link) {
      return jsonResponse(
        { error: asaasErrorMessage(checkoutResult, "Falha ao criar checkout parcelado no Asaas.") },
        502,
      );
    }
    const checkout = checkoutResult.data;

    const { error: cobrancaError } = await adminClient.from("cobrancas").insert({
      id: cobrancaId,
      user_id: user.id,
      plano,
      ciclo,
      billing_type: billingType,
      valor,
      asaas_checkout_id: checkout.id,
      status: "pendente",
      invoice_url: checkout.link,
    });
    if (cobrancaError) {
      // O checkout já existe DE VERDADE no Asaas mesmo se isto falhar —
      // devolve o link pro aluno conseguir pagar mesmo assim; só o
      // registro local fica incompleto (webhook-asaas não vai achar essa
      // linha pra liberar o plano quando o CHECKOUT_PAID chegar — merece
      // atenção se aparecer nos logs).
      console.error("Falha ao salvar cobranca (checkout parcelado):", cobrancaError.message, {
        checkoutId: checkout.id,
        userId: user.id,
      });
    }

    return jsonResponse({
      cobrancaId,
      billingType,
      pixPayload: null,
      pixQrImage: null,
      pixExpiration: null,
      boletoUrl: null,
      invoiceUrl: checkout.link,
      valor,
    });
  }

  // ---------------------------------------------------------------------
  // Todo o resto (PIX/boleto em qualquer ciclo, cartão mensal) —
  // assinatura de verdade via /subscriptions, como sempre foi.
  // ---------------------------------------------------------------------

  // 1. Cliente Asaas — reaproveita se já existir um pra este CPF. O Asaas
  // permite clientes duplicados (não valida isso pra você), então quem
  // evita duplicar somos nós, buscando antes de criar.
  let customerId: string;
  const searchResult = await asaasFetch(`/customers?cpfCnpj=${cpfCnpj}`);
  const existingCustomer =
    searchResult.ok && Array.isArray(searchResult.data?.data) ? searchResult.data.data[0] : null;

  if (existingCustomer) {
    customerId = existingCustomer.id;
  } else {
    const createCustomerResult = await asaasFetch("/customers", {
      method: "POST",
      body: JSON.stringify({ name: nome, cpfCnpj, email: user.email, externalReference: user.id }),
    });
    if (!createCustomerResult.ok || !createCustomerResult.data?.id) {
      return jsonResponse({ error: asaasErrorMessage(createCustomerResult, "Falha ao criar cliente no Asaas.") }, 502);
    }
    customerId = createCustomerResult.data.id;
  }

  // 2. Assinatura — nextDueDate = hoje, pra gerar a primeira cobrança já
  // pronta pra pagar na hora (é assim que o Asaas decide a data de
  // vencimento da 1ª parcela; as próximas seguem o ciclo a partir dela).
  const today = new Date().toISOString().slice(0, 10);
  const subscriptionResult = await asaasFetch("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      customer: customerId,
      billingType,
      value: valor,
      nextDueDate: today,
      cycle: ciclo,
      description: PLAN_DESCRIPTIONS[plano],
      externalReference: user.id,
    }),
  });
  if (!subscriptionResult.ok || !subscriptionResult.data?.id) {
    return jsonResponse({ error: asaasErrorMessage(subscriptionResult, "Falha ao criar assinatura no Asaas.") }, 502);
  }
  const subscriptionId = subscriptionResult.data.id;

  // 3. Primeira cobrança gerada pela assinatura — criar a assinatura não
  // devolve o pagamento em si (a API do Asaas não junta os dois na mesma
  // resposta), então busca à parte.
  const paymentsResult = await withRetry(
    () => asaasFetch(`/subscriptions/${subscriptionId}/payments`),
    (r) => r.ok && Array.isArray(r.data?.data) && r.data.data.length > 0,
  );
  const firstPayment =
    paymentsResult.ok && Array.isArray(paymentsResult.data?.data) ? paymentsResult.data.data[0] : null;
  if (!firstPayment) {
    return jsonResponse(
      { error: "Assinatura criada, mas não foi possível obter a cobrança inicial. Tente novamente em instantes." },
      502,
    );
  }

  let pixPayload: string | null = null;
  let pixQrImage: string | null = null;
  let pixExpiration: string | null = null;
  let boletoUrl: string | null = null;

  if (billingType === "PIX") {
    const pixResult = await withRetry(
      () => asaasFetch(`/payments/${firstPayment.id}/pixQrCode`),
      (r) => r.ok && !!r.data?.encodedImage,
    );
    if (pixResult.ok) {
      pixPayload = pixResult.data?.payload ?? null;
      pixQrImage = pixResult.data?.encodedImage ?? null;
      pixExpiration = pixResult.data?.expirationDate ?? null;
    } else {
      console.error("Falha ao buscar QR code PIX após retries:", pixResult.status, pixResult.data);
    }
  } else if (billingType === "BOLETO") {
    boletoUrl = firstPayment.bankSlipUrl ?? null;
  }
  // CREDIT_CARD (mensal — o anual parcelado já retornou acima): nenhum
  // campo específico aqui de propósito — os dados do cartão NUNCA passam
  // por este servidor (decisão consciente, ver comentário no topo do
  // arquivo sobre PCI-DSS SAQ-D). O aluno completa o pagamento na própria
  // página hospedada do Asaas (firstPayment.invoiceUrl, sempre presente em
  // qualquer billingType), preenchendo o cartão lá.

  const { data: cobranca, error: cobrancaError } = await adminClient
    .from("cobrancas")
    .insert({
      user_id: user.id,
      plano,
      ciclo,
      billing_type: billingType,
      valor,
      asaas_customer_id: customerId,
      asaas_subscription_id: subscriptionId,
      asaas_payment_id: firstPayment.id,
      status: "pendente",
      pix_payload: pixPayload,
      pix_expiration: pixExpiration,
      boleto_url: boletoUrl,
      invoice_url: firstPayment.invoiceUrl ?? null,
    })
    .select("id")
    .single();

  if (cobrancaError) {
    // A assinatura já existe DE VERDADE no Asaas mesmo se isto falhar —
    // devolve os dados pro aluno conseguir pagar mesmo assim; só o
    // registro local fica incompleto (webhook-asaas ainda vai encontrar a
    // cobranca certa quando/se ela existir, casando por
    // asaas_subscription_id — sem essa linha, o webhook não vai saber qual
    // aluno liberar, então isto aqui merece atenção se aparecer nos logs).
    console.error("Falha ao salvar cobranca:", cobrancaError.message, { subscriptionId, userId: user.id });
  }

  return jsonResponse({
    cobrancaId: cobranca?.id ?? null,
    billingType,
    pixPayload,
    pixQrImage,
    pixExpiration,
    boletoUrl,
    invoiceUrl: firstPayment.invoiceUrl ?? null,
    valor,
  });
});
