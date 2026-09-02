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

// Eventos que liberam o plano — tanto a confirmação "vai cair na conta" (PAYMENT_CONFIRMED,
// típico de cartão) quanto "já caiu" (PAYMENT_RECEIVED, típico de PIX/boleto)
// contam como pago pra nós: nenhum dos dois volta atrás sozinho.
const PAID_EVENTS = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);

// Vencida sem pagar — marca o status, mas NÃO revoga o plano na hora: dá
// uma carência (o aluno pode ter pago e o banco ainda não processou, ou
// vai pagar em alguns dias) em vez de cortar acesso no primeiro atraso.
// Se quiser revogar depois de X dias de atraso, precisaria de um job
// separado (cron) checando "atrasado desde" — não existe ainda.
const OVERDUE_EVENTS = new Set(["PAYMENT_OVERDUE"]);

// Cancela de vez — pagamento estornado/removido, ou a própria assinatura
// encerrada/inativada. Aqui sim revoga o plano (de volta pra 'gratuito').
const CANCEL_EVENTS = new Set([
  "PAYMENT_REFUNDED",
  "PAYMENT_DELETED",
  "SUBSCRIPTION_DELETED",
  "SUBSCRIPTION_INACTIVATED",
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

  const isSubscriptionEvent = event.startsWith("SUBSCRIPTION_");
  const subscriptionId = isSubscriptionEvent ? body.subscription?.id ?? null : body.payment?.subscription ?? null;
  const paymentId = isSubscriptionEvent ? null : body.payment?.id ?? null;

  const cobranca = await findCobranca(subscriptionId, paymentId);
  if (!cobranca) {
    // Não achamos a cobranca correspondente (ex.: veio de uma assinatura
    // criada fora deste fluxo, ou a linha falhou ao gravar em
    // criar-cobranca — ver comentário lá). Devolve 200 mesmo assim: um
    // erro nosso de correlação não é motivo pro Asaas ficar retentando
    // pra sempre, e logar aqui é o bastante pra investigar manualmente.
    console.error("webhook-asaas: cobranca não encontrada", { event, subscriptionId, paymentId });
    return jsonResponse({ ok: true, handled: false, reason: "cobranca não encontrada" });
  }

  if (PAID_EVENTS.has(event)) {
    const updates: Record<string, unknown> = { status: "pago" };
    if (paymentId) updates.asaas_payment_id = paymentId;
    if (body.payment?.invoiceUrl) updates.invoice_url = body.payment.invoiceUrl;
    if (body.payment?.bankSlipUrl) updates.boleto_url = body.payment.bankSlipUrl;

    await adminClient.from("cobrancas").update(updates).eq("id", cobranca.id);

    // Libera o plano de verdade — service_role ignora o gatilho
    // protect_profile_privileged_fields (schema_aluno_avulso.sql), que
    // travaria "plano" pra qualquer UPDATE que não fosse admin/service_role.
    const { error: planoError } = await adminClient
      .from("profiles")
      .update({ plano: cobranca.plano })
      .eq("id", cobranca.user_id);
    if (planoError) {
      console.error("webhook-asaas: falha ao atualizar plano", planoError.message, { userId: cobranca.user_id });
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
