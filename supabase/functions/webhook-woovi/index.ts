// supabase/functions/webhook-woovi/index.ts
//
// Recebe a confirmação de pagamento PIX da Woovi (ex-OpenPix) e mantém
// "cobrancas"/profiles.plano sincronizados com a realidade — mesmo papel de
// webhook-asaas/index.ts pro outro gateway: criar-cobranca-woovi (ainda não
// existe, ver supabase/schema_webhook_woovi.sql) só GERA a cobrança, é
// AQUI que o plano do aluno é liberado de verdade, quando a Woovi avisa que
// ela foi paga.
//
// URL real desta function (a Woovi precisa apontar pra cá, ver roteiro em
// supabase/schema_webhook_woovi.sql — NÃO existe nenhum servidor por trás
// de "neuraoab.com.br/api/webhook-woovi", esse caminho não funciona sem um
// proxy configurado por fora deste projeto):
//   https://lgcphxncteqpbntnlzhe.supabase.co/functions/v1/webhook-woovi
//
// Autenticação: header "Authorization: Bearer <token>", conferido contra o
// secret WOOVI_WEBHOOK_TOKEN — é um header CUSTOM que você mesmo cadastra
// no painel da Woovi ao criar o webhook (ela deixa anexar qualquer header
// à escolha em toda chamada; não é uma assinatura própria dela). A Woovi
// também oferece "x-webhook-signature" (assinatura RSA com a chave privada
// dela) como alternativa mais forte — não implementada aqui, ver nota de
// segurança em schema_webhook_woovi.sql pra trocar depois se quiser.
//
// Formato do corpo (confirmado na documentação oficial da Woovi, evento
// OPENPIX:CHARGE_COMPLETED): objeto "charge" com "correlationID" (o id que
// NÓS escolhemos ao criar a cobrança — chave primária de busca, equivalente
// ao externalReference do Asaas) e "identifier"/"transactionID" (o id que a
// WOOVI escolhe — fallback de busca), "value" em CENTAVOS (não reais) e
// "status". Sempre devolve HTTP 200 quando o token bate, MESMO pra evento
// que não tratamos ou cobrança que não achamos — a Woovi só considera
// "entregue com sucesso" uma resposta 200, e uma falha aqui entra na fila
// de retentativa dela; um evento/correlação que não é erro NOSSO não deve
// virar retentativa infinita do lado dela.

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

const WOOVI_WEBHOOK_TOKEN = Deno.env.get("WOOVI_WEBHOOK_TOKEN")!;

// ---------------------------------------------------------------------------
// E-mail de "parabéns" ao subir de plano — MESMO template de
// webhook-asaas/index.ts, duplicado de propósito (sem módulo compartilhado
// porque o deploy é colar direto no editor do Dashboard do Supabase; ver
// comentário equivalente lá). Se um dia os dois textos precisarem divergir,
// já estão em arquivos separados — se não, mudar um sem lembrar do outro é
// o risco real de manter isto duplicado.
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
    console.error("webhook-woovi: falha ao enviar e-mail de upgrade — RESEND_API_KEY não configurado.");
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
      console.error(`webhook-woovi: falha ao enviar e-mail de upgrade pra ${email}: Resend respondeu ${res.status}: ${detail}`);
    }
  } catch (err) {
    console.error(`webhook-woovi: falha ao enviar e-mail de upgrade pra ${email}:`, String(err));
  }
}

// ---------------------------------------------------------------------------
// Webhook em si
// ---------------------------------------------------------------------------

// Só o evento de cobrança PIX confirmada foi pedido — CHARGE_EXPIRED/
// CHARGE_REFUNDED (equivalentes ao OVERDUE_EVENTS/CANCEL_EVENTS de
// webhook-asaas) ficam de fora de propósito, não fazem parte deste pedido.
// Qualquer evento fora deste conjunto devolve 200 sem mexer em nada, pra
// não acumular retentativa do lado da Woovi por um evento que não tratamos.
const PAID_EVENT = "OPENPIX:CHARGE_COMPLETED";

interface WooviCharge {
  correlationID?: string;
  identifier?: string;
  transactionID?: string;
  globalID?: string;
  status?: string;
  value?: number; // centavos, não reais
  paidAt?: string;
}

interface WebhookBody {
  event?: string;
  charge?: WooviCharge;
  pix?: { endToEndId?: string };
  // Payload de teste que a própria Woovi manda ao clicar "salvar" no
  // cadastro do webhook no painel dela — não tem "charge" nenhum (só
  // confirma que a URL responde), então precisa ser detectado ANTES de
  // qualquer código que assuma "charge" existindo (ver Deno.serve abaixo).
  evento?: string;
  data_criacao?: string;
}

// Acha a cobranca correspondente — prioriza correlationID (o id que NÓS
// escolhemos ao criar a cobrança, desenhado pela própria Woovi pra
// correlação com sistemas externos) e só cai pro id que a WOOVI escolheu
// (identifier/transactionID) se o correlationID não vier ou não bater
// (mesmo formato de fallback de webhook-asaas com subscriptionId/paymentId).
async function findCobranca(correlationId: string | null, chargeId: string | null) {
  if (correlationId) {
    const { data } = await adminClient
      .from("cobrancas")
      .select("id, user_id, plano")
      .eq("woovi_correlation_id", correlationId)
      .maybeSingle();
    if (data) return data;
  }
  if (chargeId) {
    const { data } = await adminClient
      .from("cobrancas")
      .select("id, user_id, plano")
      .eq("woovi_charge_id", chargeId)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

// Uma linha por notificação recebida (nunca sobrescrita, ao contrário de
// "cobrancas.status") — grava mesmo quando não achou a cobranca
// correspondente, pra dar visibilidade no banco de webhooks que chegaram
// sem casar com nada (esperado até criar-cobranca-woovi existir, ver
// schema_webhook_woovi.sql). Nunca lança — um erro ao logar não pode
// impedir a resposta 200 pra Woovi.
async function registrarHistorico(params: {
  cobrancaId: string | null;
  userId: string | null;
  status: string;
  valor: number | null;
  chargeId: string | null;
  correlationId: string | null;
  rawPayload: unknown;
}): Promise<void> {
  const { error } = await adminClient.from("historico_pagamentos").insert({
    cobranca_id: params.cobrancaId,
    user_id: params.userId,
    gateway: "woovi",
    evento: PAID_EVENT,
    status: params.status,
    valor: params.valor,
    charge_id: params.chargeId,
    correlation_id: params.correlationId,
    raw_payload: params.rawPayload,
  });
  if (error) {
    console.error("webhook-woovi: falha ao gravar historico_pagamentos", error.message);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  let body: WebhookBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido." }, 400);
  }

  // Teste de conexão do painel da Woovi (ao salvar o cadastro do webhook) —
  // ANTES de qualquer outra validação (inclusive o token) porque essa
  // chamada de teste não necessariamente carrega o header Authorization
  // configurado, e não tem "charge" nenhum pra validação nenhuma fazer
  // sentido em cima dele. Não toca em nada (sem acesso a "cobrancas"/
  // "profiles"), então responder 200 sem exigir o token aqui não abre
  // brecha nenhuma — só confirma "a URL está no ar".
  if (body.evento === "teste_webhook") {
    console.log("webhook-woovi: teste de conexão recebido do painel da Woovi, respondendo 200");
    return jsonResponse({ success: true, message: "Webhook configurado com sucesso!" });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const receivedToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!WOOVI_WEBHOOK_TOKEN || receivedToken !== WOOVI_WEBHOOK_TOKEN) {
    return jsonResponse({ error: "Token inválido." }, 401);
  }

  const event = body.event ?? "";
  if (event !== PAID_EVENT) {
    return jsonResponse({ ok: true, handled: false });
  }

  const charge = body.charge ?? {};
  const correlationId = charge.correlationID ?? null;
  const chargeId = charge.identifier ?? charge.transactionID ?? null;
  // "value" da Woovi vem em CENTAVOS — todo o resto do projeto (cobrancas.valor,
  // PRICES em criar-cobranca/index.ts) trabalha em reais.
  const valor = typeof charge.value === "number" ? charge.value / 100 : null;

  const cobranca = await findCobranca(correlationId, chargeId);

  if (!cobranca) {
    // Não achamos a cobranca correspondente — ainda assim devolve 200: um
    // erro nosso de correlação não é motivo pra Woovi ficar retentando pra
    // sempre. Fica registrado em historico_pagamentos (cobranca_id nulo)
    // pra investigar manualmente.
    console.error("webhook-woovi: cobranca não encontrada", { correlationId, chargeId });
    await registrarHistorico({
      cobrancaId: null,
      userId: null,
      status: "nao_encontrado",
      valor,
      chargeId,
      correlationId,
      rawPayload: body,
    });
    return jsonResponse({ ok: true, handled: false, reason: "cobranca não encontrada" });
  }

  const endToEndId = body.pix?.endToEndId ?? null;
  await adminClient
    .from("cobrancas")
    .update({
      status: "pago",
      ...(chargeId ? { woovi_charge_id: chargeId } : {}),
      ...(endToEndId ? { woovi_end_to_end_id: endToEndId } : {}),
    })
    .eq("id", cobranca.id);

  // Pega o plano/e-mail/nome ANTES de atualizar — precisa do plano ANTERIOR
  // pra só mandar o e-mail de "parabéns" numa subida de verdade, nunca numa
  // renovação do MESMO plano (mesmo motivo de webhook-asaas).
  const { data: profileBefore } = await adminClient
    .from("profiles")
    .select("plano, email, nome")
    .eq("id", cobranca.user_id)
    .maybeSingle();

  // Libera o plano de verdade — dinâmico a partir de cobrancas.plano (NÃO
  // fixo em 'pro'): uma cobrança do plano Básico paga via Woovi precisa
  // liberar Básico, não Pro, senão todo pagamento vira upgrade pra Pro
  // independente do valor pago. service_role ignora o gatilho
  // protect_profile_privileged_fields (schema_aluno_avulso.sql), que
  // travaria "plano" pra qualquer UPDATE que não fosse admin/service_role.
  const { error: planoError } = await adminClient
    .from("profiles")
    .update({ plano: cobranca.plano })
    .eq("id", cobranca.user_id);
  if (planoError) {
    console.error("webhook-woovi: falha ao atualizar plano", planoError.message, { userId: cobranca.user_id });
  } else if (profileBefore?.plano !== cobranca.plano) {
    await sendPlanUpgradeEmail(profileBefore?.email ?? null, profileBefore?.nome ?? null, cobranca.plano);
  }

  await registrarHistorico({
    cobrancaId: cobranca.id,
    userId: cobranca.user_id,
    status: "pago",
    valor,
    chargeId,
    correlationId,
    rawPayload: body,
  });

  return jsonResponse({ ok: true, handled: true });
});
