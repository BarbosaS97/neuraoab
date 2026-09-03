// supabase/functions/aluno-portal/index.ts
//
// Backend do aceite de convite do aluno (modal de convite dentro do próprio
// dashboard, ver "Convite de turma" em estudos/estudos.js): valida um
// código de convite (tabela "convites", ver schema_convites_turma.sql) e,
// se tudo bater, vincula o aluno logado à turma do convite e sobe o plano
// pra "pro". Usa a service_role key pelo mesmo motivo de professor-portal/
// index.ts — precisa reavaliar as 5 checagens (existe/usado/expirado/
// e-mail bate/turma tem vaga) contra o banco, sem confiar em nada vindo do
// cliente, e mexer em profiles.professor_id/turma_id/plano, que o gatilho
// protect_profile_privileged_fields (schema_aluno_avulso.sql) trava pra
// qualquer UPDATE que não seja admin/service_role.
//
// Diferente de professor-portal (que exige role "professor"/"admin"), aqui
// qualquer usuário autenticado pode chamar — é o PRÓPRIO aluno aceitando o
// próprio convite (conta nova, criada na hora pra isso, ou avulsa já
// existente, tanto faz — o dashboard exige login antes de mostrar o modal,
// ver requireAuth() em estudos.js).

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
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface Caller {
  id: string;
  email: string;
}

async function requireCaller(req: Request): Promise<Caller | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return null;

  const { data, error } = await adminClient.auth.getUser(jwt);
  if (error || !data?.user?.email) return null;
  return { id: data.user.id, email: data.user.email };
}

// Só usado por "excluir-conta" abaixo: apagar a PRÓPRIA conta é uma ação de
// aluno (botão fica só em "Meu Perfil", estudos/index.html) — trava por
// role, não só por autenticação, pra uma conta de professor/admin nunca
// conseguir se autoexcluir por aqui e levar junto turmas/alunos inteiros
// (turmas.professor_id é "on delete cascade" — o blast radius de apagar um
// PROFESSOR é bem maior que o de um aluno).
async function isAluno(userId: string): Promise<boolean> {
  const { data: profile } = await adminClient.from("profiles").select("role_id").eq("id", userId).maybeSingle();
  if (!profile?.role_id) return false;
  const { data: role } = await adminClient.from("roles").select("name").eq("id", profile.role_id).maybeSingle();
  return role?.name === "aluno";
}

// ---------------------------------------------------------------------------
// E-mails transacionais (boas-vindas no cadastro, parabéns ao subir de
// plano) via Resend — mesmo padrão de professor-portal/index.ts (RESEND_API_KEY
// já configurado, ver supabase/schema_portal_mestre.sql). Duplicado (não
// importado de um módulo compartilhado) pelo mesmo motivo de sempre: o
// deploy é colar o código direto no editor do Dashboard do Supabase, que só
// enxerga o conteúdo desta function.
// ---------------------------------------------------------------------------

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const NOTIFY_FROM_EMAIL = "NeuraOAB <ola@neuraoab.com.br>";
const APP_URL = "https://neuraoab.com.br/estudos/index.html";

function primeiroNome(nome: string | null | undefined): string {
  return nome?.trim().split(/\s+/)[0] || "";
}

// Mesmos benefícios listados no modal "Planos" do app (estudos/index.html)
// e na landing — repetidos aqui de propósito (nenhum módulo compartilhado
// possível nesse tipo de deploy, ver comentário no topo do arquivo), mas
// PRECISAM continuar batendo se um dia mudarem lá.
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

// Envelope HTML compartilhado pelos dois e-mails abaixo — mesma identidade
// visual dos convites (professor-portal/index.ts), só o miolo muda.
function buildNotificationHtml(opts: {
  subject: string;
  heading: string;
  bodyText: string;
  benefits?: string[];
  ctaLabel: string;
  ctaLink: string;
}): string {
  const benefitsBlock = opts.benefits?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; margin: 4px 0 26px;">${buildBenefitsListHtml(opts.benefits)}</table>`
    : "";
  return `
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${opts.subject}</title>
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
                <h1 style="margin: 0 0 12px; font-size: 19px; color: #0f172a;">${opts.heading}</h1>
                <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #52606d;">${opts.bodyText}</p>
                ${benefitsBlock}
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                  <tr>
                    <td style="border-radius: 8px; background: #4f7cff;">
                      <a href="${opts.ctaLink}" style="display: inline-block; padding: 13px 32px; font-size: 14px; font-weight: bold; color: #ffffff; text-decoration: none;">
                        ${opts.ctaLabel}
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

function buildNotificationText(opts: { heading: string; bodyText: string; benefits?: string[]; ctaLink: string }): string {
  const benefitsText = opts.benefits?.length ? `\n\n${opts.benefits.map((b) => `- ${b}`).join("\n")}` : "";
  return `${opts.heading}\n\n${opts.bodyText}${benefitsText}\n\n${opts.ctaLink}`;
}

async function sendNotificationEmail(email: string, subject: string, html: string, text: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.error("Falha ao enviar e-mail:", "RESEND_API_KEY não configurado no servidor.");
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: NOTIFY_FROM_EMAIL, to: email, subject, html, text }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`Falha ao enviar e-mail para ${email}: Resend respondeu ${res.status}: ${detail}`);
    }
  } catch (err) {
    console.error(`Falha ao enviar e-mail para ${email}:`, String(err));
  }
}

// Disparado uma vez, logo depois do cadastro (ver ação "boas-vindas"
// abaixo) — mostra o que já dá pra usar no plano grátis, sem prometer nada
// que só vem com upgrade (isso é o e-mail de "parabéns", ver
// sendPlanUpgradeEmail).
async function sendWelcomeEmail(email: string, nome: string | null): Promise<void> {
  const saudacao = primeiroNome(nome) ? `, ${primeiroNome(nome)}` : "";
  const html = buildNotificationHtml({
    subject: "Bem-vindo ao NeuraOAB!",
    heading: `Bem-vindo ao NeuraOAB${saudacao}!`,
    bodyText:
      "Sua conta foi criada com sucesso. Você já pode começar a estudar pra 1ª fase da OAB agora mesmo — resolva questões, acompanhe seu desempenho e converse com o Dr. Laureano, nosso assistente de estudos. No seu plano grátis, você já tem:",
    benefits: ["10 questões por dia na 1ª fase", "Estatísticas do seu desempenho", "5 mensagens por mês com o Dr. Laureano"],
    ctaLabel: "Começar a estudar",
    ctaLink: APP_URL,
  });
  const text = buildNotificationText({
    heading: `Bem-vindo ao NeuraOAB${saudacao}!`,
    bodyText: "Sua conta foi criada com sucesso. Você já pode começar a estudar pra 1ª fase da OAB agora mesmo.",
    benefits: ["10 questões por dia na 1ª fase", "Estatísticas do seu desempenho", "5 mensagens por mês com o Dr. Laureano"],
    ctaLink: APP_URL,
  });
  await sendNotificationEmail(email, "Bem-vindo ao NeuraOAB!", html, text);
}

// Disparado toda vez que profiles.plano sobe pra "basico" ou "pro" de
// verdade (nunca em renovação do MESMO plano — ver checagem em
// webhook-asaas/index.ts — nem aqui em ativar-convite, que só roda uma vez
// por convite). "gratuito" nunca chama isso (downgrade não é comemoração).
async function sendPlanUpgradeEmail(email: string, nome: string | null, plano: string): Promise<void> {
  const label = PLANO_LABELS[plano];
  const benefits = PLANO_BENEFICIOS[plano];
  if (!label || !benefits) return; // plano desconhecido ou "gratuito" — nada a comemorar

  const saudacao = primeiroNome(nome) ? `, ${primeiroNome(nome)}` : "";
  const subject = `Parabéns! Seu plano agora é ${label}`;
  const bodyText = `Seu plano no NeuraOAB agora é <strong>${label}</strong>. Veja o que você já pode aproveitar:`;
  const html = buildNotificationHtml({
    subject,
    heading: `Parabéns${saudacao}!`,
    bodyText,
    benefits,
    ctaLabel: "Aproveitar agora",
    ctaLink: APP_URL,
  });
  const text = buildNotificationText({
    heading: `Parabéns${saudacao}!`,
    bodyText: `Seu plano no NeuraOAB agora é ${label}. Veja o que você já pode aproveitar:`,
    benefits,
    ctaLink: APP_URL,
  });
  await sendNotificationEmail(email, subject, html, text);
}

interface ValidarConvitePayload {
  action: "validar-convite";
  codigo: string;
}
interface AtivarConvitePayload {
  action: "ativar-convite";
  codigo: string;
}
interface ListarConvitesPayload {
  action: "listar-convites";
}
interface BoasVindasPayload {
  action: "boas-vindas";
}
interface ExcluirContaPayload {
  action: "excluir-conta";
}
type RequestBody =
  | ValidarConvitePayload
  | AtivarConvitePayload
  | ListarConvitesPayload
  | BoasVindasPayload
  | ExcluirContaPayload;

interface ConviteRow {
  id: string;
  turma_id: string | null;
  professor_id: string;
  email: string;
  status: string;
  expires_at: string;
}

interface ValidationResult {
  ok: boolean;
  error?: string;
  convite?: ConviteRow;
  turmaNome?: string;
  professorNome?: string;
}

// As 5 checagens da tela de aceite, sempre nesta ordem — mesma redação nos
// dois pontos de entrada (validar-convite, só pra desenhar a tela, e
// ativar-convite, que SEMPRE reavalia do zero antes de gravar nada, nunca
// confia num validar-convite anterior: entre as duas chamadas o código pode
// ter expirado, sido usado em outra aba, ou a turma ter enchido).
async function validateConvite(codigo: string, callerEmail: string): Promise<ValidationResult> {
  if (!codigo) return { ok: false, error: "Código inválido. Verifique e tente novamente." };

  const { data: convite } = await adminClient
    .from("convites")
    .select("id, turma_id, professor_id, email, status, expires_at")
    .eq("codigo", codigo)
    .maybeSingle();

  // "cancelado" cai na mesma mensagem de "não existe" — do ponto de vista
  // de quem está tentando ativar, não faz diferença nenhuma saber que
  // existiu e foi revogado.
  if (!convite || convite.status === "cancelado") {
    return { ok: false, error: "Código inválido. Verifique e tente novamente." };
  }
  if (convite.status === "usado") {
    return { ok: false, error: "Este código já foi utilizado." };
  }
  if (new Date(convite.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "Este código expirou. Solicite um novo ao seu professor." };
  }
  if (convite.email.toLowerCase() !== callerEmail.toLowerCase()) {
    return { ok: false, error: "Este código foi enviado para outro e-mail." };
  }

  let turmaNome = "Sem turma";
  if (convite.turma_id) {
    const { data: turma } = await adminClient
      .from("turmas")
      .select("nome, limite_alunos")
      .eq("id", convite.turma_id)
      .maybeSingle();
    if (!turma) {
      // Turma foi excluída depois do convite ser gerado — convites.turma_id
      // vira null em cascata (on delete set null), então isso só aconteceria
      // por uma corrida bem estreita; trata como "sem turma" em vez de erro.
      turmaNome = "Sem turma";
    } else {
      turmaNome = turma.nome;
      if (turma.limite_alunos != null) {
        const { count } = await adminClient
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("turma_id", convite.turma_id)
          .is("excluido_em", null);
        if ((count ?? 0) >= turma.limite_alunos) {
          return { ok: false, error: "A turma já atingiu o limite de alunos." };
        }
      }
    }
  }

  const { data: professor } = await adminClient
    .from("profiles")
    .select("nome, email")
    .eq("id", convite.professor_id)
    .maybeSingle();

  return {
    ok: true,
    convite,
    turmaNome,
    professorNome: professor?.nome || professor?.email || "seu professor",
  };
}

interface ConviteListItem {
  codigo: string;
  turma_nome: string;
  professor_nome: string;
  expirado: boolean;
}

// Lista TODO convite pendente do e-mail de quem chamou — o que preenche
// "Meus convites" no dashboard (estudos/estudos.js, loadConvites) e também
// o que decide se o modal abre sozinho ao clicar um link de e-mail (o link
// só manda um SINAL "?convite=1" pra abrir a lista, o conteúdo em si vem
// sempre daqui, nunca de um único código específico — assim o aluno vê
// qualquer outro convite pendente também, não só o que acabou de clicar).
// Inclui convite JÁ EXPIRADO (mas ainda "pendente", nunca aceito) com
// expirado:true, pra o aluno saber que precisa pedir um novo em vez de a
// lista simplesmente parecer vazia sem explicação.
async function listarConvites(callerEmail: string): Promise<ConviteListItem[]> {
  const { data: convites } = await adminClient
    .from("convites")
    .select("codigo, turma_id, professor_id, expires_at")
    .eq("email", callerEmail.toLowerCase())
    .eq("status", "pendente")
    .order("created_at", { ascending: false });

  if (!convites || convites.length === 0) return [];

  const result: ConviteListItem[] = [];
  for (const c of convites) {
    let turmaNome = "Sem turma";
    if (c.turma_id) {
      const { data: turma } = await adminClient.from("turmas").select("nome").eq("id", c.turma_id).maybeSingle();
      if (turma) turmaNome = turma.nome;
    }
    const { data: professor } = await adminClient
      .from("profiles")
      .select("nome, email")
      .eq("id", c.professor_id)
      .maybeSingle();

    result.push({
      codigo: c.codigo,
      turma_nome: turmaNome,
      professor_nome: professor?.nome || professor?.email || "seu professor",
      expirado: new Date(c.expires_at).getTime() < Date.now(),
    });
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

  const caller = await requireCaller(req);
  if (!caller) {
    return jsonResponse({ error: "Acesso negado: é preciso estar logado." }, 403);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido." }, 400);
  }

  if (body.action === "listar-convites") {
    const convites = await listarConvites(caller.email);
    return jsonResponse({ convites });
  }

  // Chamada uma vez pelo index.html, logo depois de client.auth.signUp()
  // resolver com sucesso (ver credsForm.submit lá) — nunca automática por
  // trigger de banco: enviar e-mail de dentro de um trigger Postgres
  // exigiria expor a RESEND_API_KEY fora das Edge Functions (Vault), um
  // mecanismo novo que este projeto não usa em nenhum outro lugar.
  if (body.action === "boas-vindas") {
    const { data: profile } = await adminClient.from("profiles").select("nome").eq("id", caller.id).maybeSingle();
    await sendWelcomeEmail(caller.email, profile?.nome ?? null);
    return jsonResponse({ ok: true });
  }

  // Apaga a conta de verdade — "Meu Perfil" > "Excluir conta"
  // (estudos/estudos.js, buildDeleteAccountSection). Ordem importa: primeiro
  // o que NÃO cascade automaticamente (oab2_tentativas/oab_respostas são
  // "on delete SET NULL" de propósito, pra continuar valendo pro uso
  // anônimo — ver schema_professor_portal.sql — mas aqui o pedido é apagar
  // de verdade) e o que bloquearia o delete por FK sem isso (convites.
  // used_by, ver schema_aluno_exclui_conta.sql); só depois disso
  // auth.admin.deleteUser, que cascade-apaga profiles (schema_portal_
  // mestre.sql) e, por tabela, cobrancas/oab_favoritos/plan_usage_monthly
  // (todas "on delete cascade" desde auth.users).
  if (body.action === "excluir-conta") {
    if (!(await isAluno(caller.id))) {
      return jsonResponse({ error: "Esta ação só está disponível pra contas de aluno." }, 403);
    }

    await adminClient.from("oab2_tentativas").delete().eq("user_id", caller.id); // cascade -> oab2_respostas
    await adminClient.from("oab_respostas").delete().eq("user_id", caller.id);
    await adminClient.from("convites").update({ used_by: null }).eq("used_by", caller.id);

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(caller.id);
    if (deleteError) {
      return jsonResponse({ error: deleteError.message }, 400);
    }
    return jsonResponse({ ok: true });
  }

  if (body.action === "validar-convite") {
    const result = await validateConvite(body.codigo, caller.email);
    if (!result.ok) return jsonResponse({ error: result.error }, 400);
    return jsonResponse({ ok: true, turma_nome: result.turmaNome, professor_nome: result.professorNome });
  }

  if (body.action === "ativar-convite") {
    const result = await validateConvite(body.codigo, caller.email);
    if (!result.ok || !result.convite) return jsonResponse({ error: result.error }, 400);

    // Flipa o convite pra "usado" PRIMEIRO, com "status = 'pendente'" ainda
    // no WHERE — se duas abas chegarem aqui ao mesmo tempo pro mesmo
    // código, só uma linha é afetada (a segunda chamada recebe "data: null"
    // e para aqui, sem tocar em profiles nem contar 2x numa vaga limitada).
    const { data: updatedConvite, error: conviteError } = await adminClient
      .from("convites")
      .update({ status: "usado", used_at: new Date().toISOString(), used_by: caller.id })
      .eq("id", result.convite.id)
      .eq("status", "pendente")
      .select("id")
      .maybeSingle();
    if (conviteError) return jsonResponse({ error: conviteError.message }, 400);
    if (!updatedConvite) {
      return jsonResponse({ error: "Este código já foi utilizado." }, 400);
    }

    // Pega o plano/nome ANTES de atualizar — precisa dos dois: o plano pra
    // só mandar o e-mail de "parabéns" se isso for uma subida de verdade
    // (aluno pode já estar em "pro" por outro convite/assinatura, ver
    // sendPlanUpgradeEmail), e o nome pra saudação do e-mail.
    const { data: profileBefore } = await adminClient
      .from("profiles")
      .select("plano, nome")
      .eq("id", caller.id)
      .maybeSingle();

    const { error: profileError } = await adminClient
      .from("profiles")
      .update({
        professor_id: result.convite.professor_id,
        turma_id: result.convite.turma_id,
        plano: "pro",
      })
      .eq("id", caller.id);
    if (profileError) {
      // Desfaz o "usado" pra não perder o convite por uma falha do lado de
      // "profiles" (raro — a validação já passou por tudo antes disso).
      await adminClient
        .from("convites")
        .update({ status: "pendente", used_at: null, used_by: null })
        .eq("id", result.convite.id);
      return jsonResponse({ error: profileError.message }, 400);
    }

    if (profileBefore?.plano !== "pro") {
      await sendPlanUpgradeEmail(caller.email, profileBefore?.nome ?? null, "pro");
    }

    return jsonResponse({ ok: true, turma_nome: result.turmaNome });
  }

  return jsonResponse({ error: "Ação desconhecida." }, 400);
});
