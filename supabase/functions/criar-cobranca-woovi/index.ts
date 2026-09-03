// supabase/functions/criar-cobranca-woovi/index.ts
//
// Cria uma cobrança PIX na Woovi (ex-OpenPix) pro plano Básico/Pro
// escolhido, e devolve o suficiente pro front-end mostrar o QR code —
// contraparte Woovi de criar-cobranca/index.ts (Asaas). A API key (AppID)
// da Woovi nunca chega ao navegador — só esta function e webhook-woovi
// falam com a Woovi, sempre com a service_role key do lado do Supabase
// também (grava em profiles.cpf_cnpj e cobrancas).
//
// DIFERENÇA IMPORTANTE em relação ao criar-cobranca (Asaas): a Woovi aqui é
// usada só como emissor de PIX avulso (POST /charge), NÃO uma assinatura
// recorrente — a API de "assinatura" da Woovi é outro produto (parcelamento/
// juros e multa, pensado pra cobrança vencida, não pra recorrência tipo
// SaaS) e não foi o que foi pedido. Isso significa: "ciclo" (MONTHLY/YEARLY)
// aqui só registra o QUE o aluno escolheu pagar (mensal ou anual), mas não
// existe cobrança automática da próxima parcela como no Asaas — a renovação
// precisaria de um fluxo separado (ex.: lembrete por e-mail perto do
// vencimento, mandando o aluno gerar uma cobrança nova). Sinalizando isso
// aqui pra não vazar a suposição errada de "é recorrente que nem o Asaas".
//
// "userId" NUNCA vem do corpo da requisição — vem sempre do JWT verificado
// (requireUser abaixo), mesmo motivo de segurança do criar-cobranca (ver
// comentário lá): confiar num userId mandado pelo cliente deixaria
// qualquer um comprar um plano "pra" outra pessoa.
//
// Secrets necessários (Project Settings > Edge Functions > Secrets):
// WOOVI_APP_ID (a "AppID" da Woovi — vai crua no header Authorization, SEM
// prefixo "Bearer", formato diferente do resto deste projeto — confirmado
// na documentação oficial da Woovi) e, opcionalmente, WOOVI_ENV
// ("production" ou "sandbox", controla a base URL abaixo — default
// "sandbox" por segurança, igual ao ASAAS_ENV do criar-cobranca).
// WOOVI_WEBHOOK_TOKEN não é usado aqui (só em webhook-woovi).

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

// ------------------------------------------------------------------ Woovi

const WOOVI_APP_ID = Deno.env.get("WOOVI_APP_ID")!;
const WOOVI_ENV = Deno.env.get("WOOVI_ENV") ?? "sandbox";
const WOOVI_BASE_URL =
  WOOVI_ENV === "production" ? "https://api.woovi.com/api/v1" : "https://api.woovi-sandbox.com/api/v1";

interface WooviResult {
  ok: boolean;
  status: number;
  // deno-lint-ignore no-explicit-any
  data: any;
}

// Authorization: <AppID> CRU, sem "Bearer " — confirmado na documentação
// oficial da Woovi ("Não utilize o prefixo Bearer. Envie o valor bruto do
// AppID no header."), diferente do access_token do Asaas e do "Bearer" que
// este projeto usa em toda outra API (DeepSeek, Supabase).
async function wooviFetch(path: string, init: RequestInit = {}): Promise<WooviResult> {
  const res = await fetch(`${WOOVI_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: WOOVI_APP_ID,
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

function wooviErrorMessage(result: WooviResult, fallback: string): string {
  return result.data?.error || result.data?.message || fallback;
}

// Preço fixo por plano/ciclo — mesma tabela do criar-cobranca (Asaas) e da
// copy estática da landing page/modal de planos (ver comentário idêntico
// lá sobre não existir uma fonte única de preço compartilhada).
const PRICES: Record<string, Record<string, number>> = {
  basico: { MONTHLY: 11.99, YEARLY: 119.90 },
  pro: { MONTHLY: 19.99, YEARLY: 199.90 },
};

const PLAN_DESCRIPTIONS: Record<string, string> = {
  basico: "NeuraOAB — Plano Básico",
  pro: "NeuraOAB — Plano Pro",
};

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

// Validação de dígito verificador de CPF — mesma lógica do criar-cobranca,
// recusa uma sequência óbvia ou matematicamente inválida antes de gastar
// uma chamada de API com a Woovi.
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
  nome?: string;
  cpfCnpj?: string;
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

  // Mesmo limite do criar-cobranca (Asaas) — só pra conter clique
  // repetido/script, não uso legítimo.
  const { data: withinLimit } = await adminClient.rpc("check_rate_limit", {
    p_key: `criar-cobranca-woovi:${user.id}`,
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

  const { plano, ciclo } = body;
  const nome = (body.nome ?? "").trim().slice(0, 200);
  const cpfCnpj = onlyDigits(body.cpfCnpj ?? "");

  if (plano !== "basico" && plano !== "pro") {
    return jsonResponse({ error: "\"plano\" precisa ser 'basico' ou 'pro'." }, 400);
  }
  if (ciclo !== "MONTHLY" && ciclo !== "YEARLY") {
    return jsonResponse({ error: "\"ciclo\" precisa ser 'MONTHLY' ou 'YEARLY'." }, 400);
  }
  if (!nome) {
    return jsonResponse({ error: "Informe seu nome completo." }, 400);
  }
  if (!isValidCpf(cpfCnpj)) {
    return jsonResponse({ error: "CPF inválido." }, 400);
  }

  const valor = PRICES[plano][ciclo];
  const valorCentavos = Math.round(valor * 100); // Woovi trabalha em centavos, não reais

  // Grava nome/CPF no perfil, mesmo motivo do criar-cobranca (Asaas): pra
  // próxima cobrança (upgrade, nova tentativa) nem precisar perguntar de novo.
  await adminClient.from("profiles").update({ cpf_cnpj: cpfCnpj }).eq("id", user.id);

  // Gera o id da cobranca ANTES de chamar a Woovi e usa o MESMO valor como
  // correlationID da cobrança — a Woovi foi desenhada pra correlationID ser
  // o id do SEU sistema (não um id que ela gera), então isso faz
  // webhook-woovi casar a confirmação de pagamento com esta linha sem
  // precisar de nenhum passo extra depois (ver findCobranca em
  // webhook-woovi/index.ts, que busca por woovi_correlation_id).
  const cobrancaId = crypto.randomUUID();

  const chargeResult = await wooviFetch("/charge", {
    method: "POST",
    body: JSON.stringify({
      correlationID: cobrancaId,
      value: valorCentavos,
      comment: PLAN_DESCRIPTIONS[plano],
      customer: {
        name: nome,
        taxID: cpfCnpj,
        email: user.email,
      },
    }),
  });

  if (!chargeResult.ok || !chargeResult.data?.charge) {
    return jsonResponse({ error: wooviErrorMessage(chargeResult, "Falha ao criar cobrança na Woovi.") }, 502);
  }
  const charge = chargeResult.data.charge;

  const { error: cobrancaError } = await adminClient.from("cobrancas").insert({
    id: cobrancaId,
    user_id: user.id,
    plano,
    ciclo,
    billing_type: "PIX",
    valor,
    gateway: "woovi",
    woovi_correlation_id: cobrancaId,
    woovi_charge_id: charge.identifier ?? null,
    status: "pendente",
    pix_payload: charge.brCode ?? null,
    pix_expiration: charge.expiresDate ?? null,
    invoice_url: charge.paymentLinkUrl ?? null,
  });

  if (cobrancaError) {
    // A cobrança já existe DE VERDADE na Woovi mesmo se isto falhar —
    // devolve os dados pro aluno conseguir pagar mesmo assim; só o
    // registro local fica incompleto. Diferente do Asaas (que casa por
    // asaas_subscription_id gerado DEPOIS), aqui o correlationID já foi
    // decidido por nós ANTES da chamada — então isto só falharia por um
    // problema de banco (não por corrida), e merece atenção se aparecer
    // nos logs, já que sem esta linha webhook-woovi não vai achar pra
    // liberar o plano quando o pagamento cair.
    console.error("Falha ao salvar cobranca:", cobrancaError.message, { cobrancaId, userId: user.id });
  }

  return jsonResponse({
    cobrancaId,
    billingType: "PIX",
    pixPayload: charge.brCode ?? null,
    pixQrImage: charge.qrCodeImage ?? null, // URL de imagem (não base64, ao contrário do Asaas) — funciona igual num <img src="...">
    pixExpiration: charge.expiresDate ?? null,
    boletoUrl: null,
    invoiceUrl: charge.paymentLinkUrl ?? null,
    valor,
  });
});
