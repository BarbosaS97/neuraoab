// supabase/functions/webhook-asaas/index.ts
//
// Recebe as notificações de evento do Asaas (pagamento confirmado, atrasado,
// estornado etc.) e mantém "cobrancas"/profiles.plano sincronizados com a
// realidade — é aqui, não em criar-cobranca/index.ts, que o plano do aluno
// é liberado de verdade: criar a assinatura só GERA a cobrança, quem
// avisa que ela foi PAGA é este webhook.
//
// URL real desta function (o Asaas precisa apontar pra cá, ver roteiro em
// supabase/schema_asaas.sql — NÃO existe nenhum servidor por trás de
// "neuraoab.com.br/api/webhook-asaas", esse caminho não funciona sem um
// proxy configurado por fora deste projeto):
//   https://lgcphxncteqpbntnlzhe.supabase.co/functions/v1/webhook-asaas
//
// Autenticação: o Asaas manda de volta, em TODA chamada, o header
// "asaas-access-token" com o mesmo valor configurado como "Token de
// autenticação" ao cadastrar o webhook no painel deles — precisa ser
// EXATAMENTE o valor salvo no secret ASAAS_WEBHOOK_TOKEN. Sem isso batendo,
// a chamada é recusada antes de tocar em qualquer dado (nunca confiamos
// que "veio de asaas.com" só pelo IP ou pelo formato do corpo).
//
// Formato do corpo varia por tipo de evento (documentação oficial do
// Asaas): eventos "PAYMENT_*" trazem um objeto "payment"; eventos
// "SUBSCRIPTION_*" trazem um objeto "subscription" — tratados
// separadamente abaixo. Sempre devolve HTTP 200 quando o token bate, MESMO
// pra evento que não fazemos nada com — o Asaas só considera "entregue com
// sucesso" uma resposta 200 exata, e uma falha aqui entra na fila de
// retentativa dele (que pausa depois de várias falhas seguidas); um evento
// desconhecido não é uma falha nossa, só não precisa de ação.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ASAAS_WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN")!;

// ---------------------------------------------------------------------------
// E-mail de "parabéns" ao subir de plano — mesmo padrão duplicado de
// professor-portal/index.ts e aluno-portal/index.ts (RESEND_API_KEY, sem
// módulo compartilhado porque o deploy é colar direto no editor do
// Dashboard do Supabase). Só dispara numa subida DE VERDADE (ver checagem
// de profiles.plano ANTES do update, no handler principal abaixo) — sem
// isso, toda renovação mensal/anual do MESMO plano mandaria "parabéns" de
// novo, o que é ruído, não celebração.
// ---------------------------------------------------------------------------

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const NOTIFY_FROM_EMAIL = "NeuraOAB <ola@neuraoab.com.br>";
const APP_URL = "https://neuraoab.com.br/estudos/index.html";

const PLANO_LABELS: Record<string, string> = { basico: "Básico", pro: "Pro" };
const PLANO_BENEFICIOS: Record<string, string[]> = {
  basico: [
    "Questões ilimitadas por dia na 1ª fase",
    "Chat ilimitado com o Dr. Laureano, nosso assistente de estudos",
    "Estatísticas completas, com análise de desempenho por IA",
    "Simulados ilimitados da 1ª fase",
  ],
  pro: [
    "Tudo do plano Básico",
    "Simulado completo da 2ª fase (peça + questões discursivas)",
    "Correção automática pelos critérios oficiais da FGV",
    "Relatórios detalhados de desempenho na 2ª fase",
  ],
};

function buildBenefitsListHtml(items: string[]): string {
  return items
    .map(
      (item) => `
        <tr>
          <td style="padding: 0 0 10px; vertical-align: top; width: 22px;">
            <span style="display: inline-block; width: 18px; height: 18px; border-radius: 50%; background: #35c78a; text-align: center; line-height: 18px; font-size: 12px; color: #ffffff;">&#10003;</span>
          </td>
          <td style="padding: 0 0 10px; font-size: 13.5px; line-height: 1.5; color: #334155;">${item}</td>
        </tr>`,
    )
    .join("");
}

function buildPlanUpgradeHtml(nome: string | null, label: string, benefits: string[]): string {
  const primeiro = nome?.trim().split(/\s+/)[0];
  const saudacao = primeiro ? `, ${primeiro}` : "";
  const subject = `Parabéns! Seu plano agora é ${label}`;
  return `
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
  </head>
  <body style="margin: 0; padding: 0; background: #f4f5f7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f4f5f7; padding: 32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width: 480px; width: 100%; background: #ffffff; border-radius: 14px; overflow: hidden; font-family: Arial, Helvetica, sans-serif;">
            <tr>
              <td style="background: #0f1420; padding: 28px 32px; text-align: center;">
                <img src="https://neuraoab.com.br/images/logotipo.png" alt="NeuraOAB" height="36" style="display: inline-block;">
              </td>
            </tr>
            <tr>
              <td style="padding: 32px;">
                <h1 style="margin: 0 0 12px; font-size: 19px; color: #0f172a;">Parabéns${saudacao}!</h1>
                <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #52606d;">
                  Seu plano no NeuraOAB agora é <strong>${label}</strong>. Veja o que você já pode aproveitar:
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; margin: 4px 0 26px;">
                  ${buildBenefitsListHtml(benefits)}
                </table>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                  <tr>
                    <td style="border-radius: 8px; background: #4f7cff;">
                      <a href="${APP_URL}" style="display: inline-block; padding: 13px 32px; font-size: 14px; font-weight: bold; color: #ffffff; text-decoration: none;">
                        Aproveitar agora
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
}

function buildPlanUpgradeText(nome: string | null, label: string, benefits: string[]): string {
  const primeiro = nome?.trim().split(/\s+/)[0];
  const saudacao = primeiro ? `, ${primeiro}` : "";
  return `Parabéns${saudacao}!\n\nSeu plano no NeuraOAB agora é ${label}. Veja o que você já pode aproveitar:\n\n${benefits.map((b) => `- ${b}`).join("\n")}\n\n${APP_URL}`;
}

// Nunca lança — uma falha de e-mail aqui não pode derrubar o resto do
// webhook (o plano já foi liberado de verdade antes desta chamada, ver
// handler principal abaixo).
async function sendPlanUpgradeEmail(email: string | null, nome: string | null, plano: string): Promise<void> {
  const label = PLANO_LABELS[plano];
  const benefits = PLANO_BENEFICIOS[plano];
  if (!email || !label || !benefits) return; // "gratuito" (downgrade) ou plano desconhecido — nada a comemorar

  if (!RESEND_API_KEY) {
    console.error("webhook-asaas: falha ao enviar e-mail de upgrade — RESEND_API_KEY não configurado.");
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: NOTIFY_FROM_EMAIL,
        to: email,
        subject: `Parabéns! Seu plano agora é ${label}`,
        html: buildPlanUpgradeHtml(nome, label, benefits),
        text: buildPlanUpgradeText(nome, label, benefits),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`webhook-asaas: falha ao enviar e-mail de upgrade pra ${email}: Resend respondeu ${res.status}: ${detail}`);
    }
  } catch (err) {
    console.error(`webhook-asaas: falha ao enviar e-mail de upgrade pra ${email}:`, String(err));
  }
}

// Eventos que liberam o plano — tanto a confirmação "vai cair na conta" (PAYMENT_CONFIRMED,
// típico de cartão) quanto "já caiu" (PAYMENT_RECEIVED, típico de PIX/boleto)
// contam como pago pra nós: nenhum dos dois volta atrás sozinho.
//
// CHECKOUT_PAID: evento do "Asaas Checkout" (POST /v3/checkouts), usado só
// pelo ramo CREDIT_CARD + YEARLY parcelado de criar-cobranca/index.ts (ver
// comentário grande lá). Corpo diferente dos eventos PAYMENT_*/SUBSCRIPTION_*
// acima — vem um objeto "checkout", não "payment"/"subscription" — por isso
// citado separado do resto da lógica abaixo (isCheckoutEvent).
const PAID_EVENTS = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "CHECKOUT_PAID"]);

// Vencida sem pagar — marca o status, mas NÃO revoga o plano na hora: dá
// uma carência (o aluno pode ter pago e o banco ainda não processou, ou
// vai pagar em alguns dias) em vez de cortar acesso no primeiro atraso.
// Se quiser revogar depois de X dias de atraso, precisaria de um job
// separado (cron) checando "atrasado desde" — não existe ainda.
const OVERDUE_EVENTS = new Set(["PAYMENT_OVERDUE"]);

// Cancela de vez — pagamento estornado/removido, a própria assinatura
// encerrada/inativada, ou o checkout parcelado expirado/cancelado sem
// pagar (nesses dois últimos o plano nem chegou a ser liberado, então a
// tentativa de "rebaixar pra gratuito" abaixo não faz efeito nenhum — só
// deixa "cobrancas.status" refletindo a realidade).
const CANCEL_EVENTS = new Set([
  "PAYMENT_REFUNDED",
  "PAYMENT_DELETED",
  "SUBSCRIPTION_DELETED",
  "SUBSCRIPTION_INACTIVATED",
  "CHECKOUT_EXPIRED",
  "CHECKOUT_CANCELED",
]);

interface WebhookBody {
  event?: string;
  payment?: {
    id?: string;
    subscription?: string;
    customer?: string;
    invoiceUrl?: string;
    bankSlipUrl?: string;
  };
  subscription?: {
    id?: string;
  };
  // Formato não 100% confirmado pela documentação oficial (que só publica
  // exemplo de CHECKOUT_CREATED, não de CHECKOUT_PAID) — ver comentário
  // grande em criar-cobranca/index.ts. externalReference é o campo que ESTA
  // function manda na criação do checkout; pode ou não vir ecoado de volta
  // aqui, por isso é só reforço, nunca a chave primária de busca.
  checkout?: {
    id?: string;
    externalReference?: string;
  };
}

// Acha a cobranca correspondente — prioriza o id da ASSINATURA (estável
// entre renovações) e só cai pro id do pagamento específico se a
// assinatura não vier no payload (não deveria acontecer no nosso fluxo,
// que sempre cria por assinatura, nunca pagamento avulso — ver
// criar-cobranca/index.ts — mas o formato exato do webhook não é 100%
// documentado pra todo campo, então mantém esse fallback por segurança).
async function findCobranca(subscriptionId: string | null, paymentId: string | null) {
  if (subscriptionId) {
    const { data } = await adminClient
      .from("cobrancas")
      .select("id, user_id, plano")
      .eq("asaas_subscription_id", subscriptionId)
      .maybeSingle();
    if (data) return data;
  }
  if (paymentId) {
    const { data } = await adminClient
      .from("cobrancas")
      .select("id, user_id, plano")
      .eq("asaas_payment_id", paymentId)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

// Contraparte de findCobranca só pra eventos CHECKOUT_* (colunas/campos
// diferentes, ver comentário na interface WebhookBody acima). checkout.id é
// o id que o PRÓPRIO ASAAS devolveu quando criar-cobranca/index.ts criou o
// checkout (gravado em cobrancas.asaas_checkout_id) — deveria estar sempre
// presente e é a busca primária; externalReference (o cobrancaId que NÓS
// escolhemos, ver criar-cobranca/index.ts) é só reforço, contra
// cobrancas.id, caso o payload real inclua esse campo.
async function findCobrancaCheckout(checkoutId: string | null, externalReference: string | null) {
  if (checkoutId) {
    const { data } = await adminClient
      .from("cobrancas")
      .select("id, user_id, plano")
      .eq("asaas_checkout_id", checkoutId)
      .maybeSingle();
    if (data) return data;
  }
  if (externalReference) {
    const { data } = await adminClient
      .from("cobrancas")
      .select("id, user_id, plano")
      .eq("id", externalReference)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  const receivedToken = req.headers.get("asaas-access-token") ?? "";
  if (!ASAAS_WEBHOOK_TOKEN || receivedToken !== ASAAS_WEBHOOK_TOKEN) {
    return jsonResponse({ error: "Token inválido." }, 401);
  }

  let body: WebhookBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido." }, 400);
  }

  const event = body.event ?? "";

  // Evento que não mexe em plano nenhum (ex.: PAYMENT_CREATED,
  // PAYMENT_UPDATED, PAYMENT_BANK_SLIP_VIEWED etc.) — confirma recebimento
  // sem fazer nada, pra não acumular retentativa do lado do Asaas por um
  // evento que nunca vamos tratar.
  if (!PAID_EVENTS.has(event) && !OVERDUE_EVENTS.has(event) && !CANCEL_EVENTS.has(event)) {
    return jsonResponse({ ok: true, handled: false });
  }

  const isCheckoutEvent = event.startsWith("CHECKOUT_");
  const isSubscriptionEvent = event.startsWith("SUBSCRIPTION_");
  const subscriptionId = isSubscriptionEvent ? body.subscription?.id ?? null : body.payment?.subscription ?? null;
  const paymentId = isCheckoutEvent || isSubscriptionEvent ? null : body.payment?.id ?? null;
  const checkoutId = isCheckoutEvent ? body.checkout?.id ?? null : null;
  const checkoutExternalReference = isCheckoutEvent ? body.checkout?.externalReference ?? null : null;

  const cobranca = isCheckoutEvent
    ? await findCobrancaCheckout(checkoutId, checkoutExternalReference)
    : await findCobranca(subscriptionId, paymentId);
  if (!cobranca) {
    // Não achamos a cobranca correspondente (ex.: veio de uma assinatura
    // criada fora deste fluxo, ou a linha falhou ao gravar em
    // criar-cobranca — ver comentário lá). Devolve 200 mesmo assim: um
    // erro nosso de correlação não é motivo pro Asaas ficar retentando
    // pra sempre, e logar aqui é o bastante pra investigar manualmente.
    // Pra eventos CHECKOUT_* especificamente (formato ainda não confirmado
    // contra um pagamento real, ver comentário grande em
    // criar-cobranca/index.ts) loga o corpo INTEIRO — é o que permite
    // ajustar findCobrancaCheckout pro campo certo sem precisar adivinhar.
    console.error("webhook-asaas: cobranca não encontrada", {
      event,
      subscriptionId,
      paymentId,
      checkoutId,
      checkoutExternalReference,
      ...(isCheckoutEvent ? { rawBody: body } : {}),
    });
    return jsonResponse({ ok: true, handled: false, reason: "cobranca não encontrada" });
  }

  if (PAID_EVENTS.has(event)) {
    const updates: Record<string, unknown> = { status: "pago" };
    if (paymentId) updates.asaas_payment_id = paymentId;
    if (body.payment?.invoiceUrl) updates.invoice_url = body.payment.invoiceUrl;
    if (body.payment?.bankSlipUrl) updates.boleto_url = body.payment.bankSlipUrl;

    await adminClient.from("cobrancas").update(updates).eq("id", cobranca.id);

    // Pega o plano/e-mail/nome ANTES de atualizar — precisa do plano
    // ANTERIOR pra só mandar o e-mail de "parabéns" numa subida de
    // verdade, nunca numa renovação do MESMO plano (ver PAID_EVENTS
    // disparando em toda renovação, não só na primeira assinatura).
    const { data: profileBefore } = await adminClient
      .from("profiles")
      .select("plano, email, nome")
      .eq("id", cobranca.user_id)
      .maybeSingle();

    // Libera o plano de verdade — service_role ignora o gatilho
    // protect_profile_privileged_fields (schema_aluno_avulso.sql), que
    // travaria "plano" pra qualquer UPDATE que não fosse admin/service_role.
    const { error: planoError } = await adminClient
      .from("profiles")
      .update({ plano: cobranca.plano })
      .eq("id", cobranca.user_id);
    if (planoError) {
      console.error("webhook-asaas: falha ao atualizar plano", planoError.message, { userId: cobranca.user_id });
    } else if (profileBefore?.plano !== cobranca.plano) {
      await sendPlanUpgradeEmail(profileBefore?.email ?? null, profileBefore?.nome ?? null, cobranca.plano);
    }
  } else if (OVERDUE_EVENTS.has(event)) {
    await adminClient.from("cobrancas").update({ status: "atrasado" }).eq("id", cobranca.id);
  } else if (CANCEL_EVENTS.has(event)) {
    await adminClient.from("cobrancas").update({ status: "cancelado" }).eq("id", cobranca.id);

    // Só rebaixa pro grátis se o aluno ainda estiver no MESMO plano desta
    // cobranca — evita derrubar um upgrade que já tenha acontecido nesse
    // meio tempo (ex.: cancelou o Básico depois de já ter migrado pro Pro
    // por uma assinatura diferente).
    const { data: profile } = await adminClient.from("profiles").select("plano").eq("id", cobranca.user_id).maybeSingle();
    if (profile?.plano === cobranca.plano) {
      await adminClient.from("profiles").update({ plano: "gratuito" }).eq("id", cobranca.user_id);
    }
  }

  return jsonResponse({ ok: true, handled: true });
});
