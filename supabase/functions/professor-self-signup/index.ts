// supabase/functions/professor-self-signup/index.ts
//
// Portal do Professor — fluxo de autoatendimento (ver professor-portal/
// js/auth.js): a pessoa digita o e-mail, o front-end confirma que está na
// allowlist (tabela "professores_autorizados", gerenciada pelo admin no
// Portal Mestre) ANTES de liberar o botão "Criar conta". Público (sem
// sessão) de propósito, já que roda ANTES do login — nenhuma das duas ações
// abaixo mexe em nada que exija ser professor/admin, só validam contra a
// allowlist e (na criação) chamam a API administrativa do Supabase Auth com
// a service_role key.
//
// POR QUE ISSO SUBSTITUI client.auth.signUp() (o jeito antigo, ver git
// blame de professor-portal/js/auth.js): signUp() manda o e-mail de
// confirmação pelo mailer PADRÃO do Supabase (GoTrue), que é limitado e não
// tem SMTP customizado configurado neste projeto — na prática, o e-mail
// nunca chegava. As outras 3 Edge Functions do projeto (portal-admin,
// professor-portal, aluno-portal) já resolvem isso pra convite de professor/
// aluno com generateLink() + Resend (remetente/domínio verificado, já
// funcionando); esta function usa exatamente o mesmo mecanismo, só que
// disparado pela PRÓPRIA pessoa em vez de um admin/professor.
//
// AUDITORIA DE SEGURANÇA (2026-09-09) — "create" NÃO recebe mais senha
// nenhuma, de propósito: a versão anterior deixava QUALQUER chamador
// (a ação é pública, sem sessão) escolher a senha de uma conta pra um
// e-mail allowlisted ainda não confirmado — um ataque de "pre-hijacking"
// clássico (ver pesquisa de Paverd/Sudhodanan sobre account pre-hijacking):
// um atacante que soubesse (ou adivinhasse) um e-mail já autorizado no
// Portal Mestre podia chamar "create" primeiro, definir uma senha própria,
// e só esperar a vítima clicar no link de confirmação que chegou por
// e-mail — nesse momento ela seria logada numa conta cuja senha o
// atacante já conhecia. O fallback "confirmLink" (devolvido no corpo da
// resposta pra QUALQUER chamador quando o Resend falhava) piorava isso:
// virava um link de login funcional entregue direto pra quem chamou a
// function, sem nunca precisar ler o e-mail de verdade.
//
// Correção: "create" agora só gera um convite (generateLink type "invite",
// sem senha nenhuma) — exatamente o mesmo mecanismo que portal-admin usa
// pro convite feito pelo admin — e manda a pessoa pra professor/definir-
// senha.html, onde ELA escolhe a própria senha só DEPOIS de provar que
// controla a caixa de entrada (clicando no link único que só chega lá).
// Ninguém mais pode "reservar" uma senha antes da confirmação. O link
// nunca é devolvido no corpo da resposta pra ninguém — nem como fallback —
// só é logado no console da function (visível só nos logs do Supabase, não
// pro chamador HTTP) se o envio pelo Resend falhar.

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

// Rate limit genérico via check_rate_limit() no banco (ver supabase/
// schema_security_hardening.sql) — mesmo padrão de professor-portal/
// index.ts. Chave por IP (x-forwarded-for, presente nas Edge Functions do
// Supabase/Deno Deploy) quando disponível; cai pra chave por e-mail se não
// vier (ainda limita alguém martelando o MESMO e-mail repetidamente, só não
// protege contra IP variando — aceitável aqui, risco baixo: só revela se um
// e-mail está autorizado, não vaza senha nem dado sensível).
async function checkRateLimit(key: string, maxCount: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await adminClient.rpc("check_rate_limit", {
    p_key: key,
    p_max_count: maxCount,
    p_window_seconds: windowSeconds,
  });
  if (error) return true;
  return data === true;
}

function rateLimitKey(req: Request, email: string): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return ip || `email:${email}`;
}

// Pra onde o link de convite leva depois que a pessoa clica — a MESMA
// página que o convite feito pelo admin usa (PROFESSOR_INVITE_REDIRECT_URL
// em portal-admin/index.ts): ela escolhe nome+senha lá, só depois de a
// sessão já vir confirmada pelo clique no link. Fixo no servidor (não vem
// mais do corpo da requisição): sem isso um chamador poderia apontar
// "redirectTo" pra qualquer URL da allowlist de Redirect URLs do Supabase —
// baixo risco de qualquer forma (o Supabase já rejeita URLs fora da
// allowlist), mas não há motivo pra aceitar isso do cliente já que só existe
// um destino de verdade. Precisa estar cadastrada em Authentication > URL
// Configuration > Redirect URLs no painel do Supabase.
const PROFESSOR_INVITE_REDIRECT_URL = "https://neuraoab.com.br/professor/definir-senha.html";

function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

// profiles.email não passa por um gatilho de normalização (diferente de
// professores_autorizados.email, ver schema_professores_autorizados.sql) —
// usa ilike (funciona como "=" só que sem diferenciar maiúscula/minúscula)
// em vez de eq() pra não depender de como o e-mail foi gravado originalmente.
// "%" e "_" são escapados antes: "_" é um caractere válido em e-mail (ex.:
// "foo_bar@x.com") mas tem significado especial de wildcard no ilike — sem
// escapar, "foo_bar@x.com" combinaria (errado) com "fooXbar@x.com" também.
function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

async function findProfileByEmail(email: string): Promise<{ id: string; role_id: string | null } | null> {
  const { data } = await adminClient
    .from("profiles")
    .select("id, role_id")
    .ilike("email", escapeIlike(email))
    .maybeSingle();
  return data ?? null;
}

async function roleName(roleId: string | null): Promise<string | null> {
  if (!roleId) return null;
  const { data } = await adminClient.from("roles").select("name").eq("id", roleId).maybeSingle();
  return data?.name ?? null;
}

async function isEmailAllowlisted(email: string): Promise<boolean> {
  const { data } = await adminClient.from("professores_autorizados").select("email").eq("email", email).maybeSingle();
  return !!data;
}

async function getRoleId(name: string): Promise<string | null> {
  const { data } = await adminClient.from("roles").select("id").eq("name", name).maybeSingle();
  return data?.id ?? null;
}

// -----------------------------------------------------------------------
// Envio do e-mail de confirmação via Resend — mesmo mecanismo (e mesma
// cópia duplicada de propósito, ver comentário equivalente em portal-admin/
// index.ts) das outras 3 Edge Functions do projeto.
// -----------------------------------------------------------------------

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const INVITE_FROM_EMAIL = "NeuraOAB <convites@neuraoab.com.br>";

const SIGNUP_EMAIL_COPY = {
  subject: "Confirme seu cadastro no Portal do Professor — NeuraOAB",
  heading: "Confirme seu e-mail",
  bodyText:
    "Recebemos seu cadastro no Portal do Professor da NeuraOAB. Clique no botão abaixo pra confirmar seu e-mail e escolher sua senha.",
};

function buildEmailHtml(link: string, copy: typeof SIGNUP_EMAIL_COPY): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${copy.subject}</title>
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
                <h1 style="margin: 0 0 12px; font-size: 19px; color: #0f172a;">${copy.heading}</h1>
                <p style="margin: 0 0 28px; font-size: 14px; line-height: 1.6; color: #52606d;">
                  ${copy.bodyText}
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                  <tr>
                    <td style="border-radius: 8px; background: #4f7cff;">
                      <a href="${link}" style="display: inline-block; padding: 13px 32px; font-size: 14px; font-weight: bold; color: #ffffff; text-decoration: none;">
                        Confirmar e-mail
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin: 28px 0 0; font-size: 12.5px; line-height: 1.5; color: #8b93a7;">
                  Se você não pediu este cadastro, pode ignorar este e-mail.
                </p>
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

function buildEmailText(link: string, copy: typeof SIGNUP_EMAIL_COPY): string {
  return `${copy.heading}\n\n${copy.bodyText}\n\n${link}\n\nSe você não pediu este cadastro, pode ignorar este e-mail.`;
}

async function sendConfirmationEmail(email: string, link: string): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    return { ok: false, error: "RESEND_API_KEY não configurado no servidor." };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: INVITE_FROM_EMAIL,
        to: email,
        subject: SIGNUP_EMAIL_COPY.subject,
        html: buildEmailHtml(link, SIGNUP_EMAIL_COPY),
        text: buildEmailText(link, SIGNUP_EMAIL_COPY),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `Resend respondeu ${res.status}: ${detail}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

interface CheckEmailPayload {
  action: "check-email";
  email: string;
}
interface CreatePayload {
  action: "create";
  email: string;
}
type RequestBody = CheckEmailPayload | CreatePayload;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido." }, 400);
  }

  const email = normalizeEmail((body as { email?: unknown }).email);
  if (!email || !email.includes("@")) {
    return jsonResponse({ error: "E-mail inválido." }, 400);
  }

  if (body.action === "check-email") {
    if (!(await checkRateLimit(`professor-signup-check:${rateLimitKey(req, email)}`, 30, 600))) {
      return jsonResponse({ error: "Muitas tentativas em pouco tempo. Aguarde um instante." }, 429);
    }

    const profile = await findProfileByEmail(email);
    const existingRole = await roleName(profile?.role_id ?? null);
    // Já professor/admin (fluxo antigo de convite, ou autoatendimento
    // concluído antes) conta como autorizado mesmo que tenha saído da
    // allowlist depois — sair da allowlist só impede um cadastro NOVO, não
    // revoga quem já tem acesso (mesma regra de checkIsProfessor).
    const authorized = existingRole === "professor" || existingRole === "admin" || (await isEmailAllowlisted(email));

    // "hasAccount" só conta contas CONFIRMADAS — uma tentativa antiga que
    // nunca confirmou o e-mail (o próprio bug que esta function corrige)
    // não deve travar um novo cadastro; a ação "create" abaixo limpa esse
    // lixo sozinha antes de gerar um link novo.
    let hasAccount = false;
    if (profile) {
      const { data: userData } = await adminClient.auth.admin.getUserById(profile.id);
      hasAccount = !!userData?.user?.email_confirmed_at;
    }

    return jsonResponse({ authorized, hasAccount });
  }

  if (body.action === "create") {
    if (!(await checkRateLimit(`professor-signup-create:${rateLimitKey(req, email)}`, 5, 3600))) {
      return jsonResponse({ error: "Muitas tentativas em pouco tempo. Aguarde um pouco e tente de novo." }, 429);
    }

    // Nunca confia na checagem que o front-end já fez em "check-email" —
    // revalida do zero aqui, é a única coisa que realmente decide se a
    // conta é criada.
    const profile = await findProfileByEmail(email);
    const existingRole = await roleName(profile?.role_id ?? null);
    const authorized = existingRole === "professor" || existingRole === "admin" || (await isEmailAllowlisted(email));
    if (!authorized) {
      return jsonResponse({ error: "Esse e-mail ainda não foi autorizado. Peça pro administrador liberar no Portal Mestre." }, 403);
    }

    if (profile) {
      const { data: userData } = await adminClient.auth.admin.getUserById(profile.id);
      if (userData?.user?.email_confirmed_at) {
        return jsonResponse({ error: 'Este e-mail já tem conta. Clique em "Já tem conta? Entrar".' }, 400);
      }
      // Conta travada de uma tentativa anterior que nunca confirmou o
      // e-mail (exatamente o bug que motivou esta function) — remove pra
      // poder gerar um convite novo e limpo. "on delete cascade" em
      // profiles.id (ver schema_portal_mestre.sql) já leva a profile row
      // junto.
      await adminClient.auth.admin.deleteUser(profile.id);
    }

    const professorRoleId = await getRoleId("professor");
    if (!professorRoleId) {
      return jsonResponse(
        { error: "Papel 'professor' não encontrado no banco — rode o schema_portal_mestre.sql primeiro." },
        500,
      );
    }

    // type "invite" (não "signup", nem senha nenhuma no payload) — mesmo
    // mecanismo do convite feito pelo admin (portal-admin/index.ts): ninguém
    // escolhe senha antes de provar que controla a caixa de entrada. A
    // pessoa só define a própria senha em professor/definir-senha.html,
    // DEPOIS de clicar no link único que só chega lá. invited_at fica
    // preenchido nesse tipo, então o gatilho handle_new_auth_user
    // (schema_aluno_avulso.sql) NÃO cria a profiles row sozinho — por isso o
    // INSERT explícito logo abaixo, já com role "professor" (a autorização
    // já foi validada acima, não precisa esperar um primeiro login pra
    // promover via professor-auth-check como no fluxo antigo).
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: PROFESSOR_INVITE_REDIRECT_URL },
    });
    if (linkError || !linkData?.user || !linkData?.properties?.action_link) {
      return jsonResponse({ error: linkError?.message || "Não foi possível criar a conta." }, 400);
    }

    const { error: profileError } = await adminClient.from("profiles").insert({
      id: linkData.user.id,
      role_id: professorRoleId,
      nome: null, // a própria pessoa preenche isso em definir-senha.html
      email,
    });
    if (profileError) {
      // Sem o perfil, a conta de auth ficaria órfã — desfaz a criação em vez
      // de deixar esse lixo pra trás (mesmo padrão de portal-admin/index.ts).
      await adminClient.auth.admin.deleteUser(linkData.user.id);
      return jsonResponse({ error: `Falha ao salvar o perfil: ${profileError.message}` }, 500);
    }

    const link = linkData.properties.action_link;
    const emailResult = await sendConfirmationEmail(email, link);
    if (!emailResult.ok) {
      // O link NUNCA volta no corpo da resposta (nem como fallback) — só no
      // log do servidor, visível só pra quem tem acesso aos logs da Edge
      // Function, nunca pro chamador HTTP. Ver comentário no topo do arquivo
      // sobre por que devolver esse link pra "quem chamou create" (que pode
      // não ser o dono do e-mail, já que a ação é pública) é o próprio
      // buraco de pre-hijacking que esta versão corrige.
      console.error(`Falha ao enviar confirmação de cadastro para ${email}: ${emailResult.error} — link: ${link}`);
    }

    return jsonResponse({
      ok: true,
      emailSent: emailResult.ok,
    });
  }

  return jsonResponse({ error: "Ação desconhecida." }, 400);
});
