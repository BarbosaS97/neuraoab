// supabase/functions/professor-self-signup/index.ts
//
// Portal do Professor — fluxo de autoatendimento (ver professor-portal/
// js/auth.js): a pessoa digita o e-mail, o front-end confirma que está na
// allowlist (tabela "professores_autorizados", gerenciada pelo admin no
// Portal Mestre) ANTES de liberar o campo de senha, e só então cria a
// conta. Público (sem sessão) de propósito, já que roda ANTES do login —
// nenhuma das duas ações abaixo mexe em nada que exija ser professor/admin,
// só validam contra a allowlist e (na criação) chamam a API administrativa
// do Supabase Auth com a service_role key.
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

// Volta pro próprio Portal do Professor se o front-end não mandar
// "redirectTo" (nunca deveria acontecer — é sempre enviado por js/auth.js —
// mas evita um link quebrado se acontecer). Precisa estar cadastrada em
// Authentication > URL Configuration > Redirect URLs no painel do Supabase,
// senão o GoTrue ignora e volta pro Site URL padrão do projeto.
const DEFAULT_REDIRECT_URL = "https://neuraoab.com.br/professor-portal/index.html";

const MIN_PASSWORD_LENGTH = 8;

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
    "Recebemos seu cadastro no Portal do Professor da NeuraOAB. Clique no botão abaixo pra confirmar seu e-mail e ativar sua conta.",
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
  password: string;
  redirectTo?: string;
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
    const { password } = body as CreatePayload;
    const redirectTo = (body as CreatePayload).redirectTo || DEFAULT_REDIRECT_URL;

    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return jsonResponse({ error: `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` }, 400);
    }

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

    // type "signup" (não "invite"): cria a conta JÁ com a senha escolhida
    // agora — a pessoa só precisa clicar no link pra confirmar o e-mail e
    // ficar logada, sem precisar escolher senha de novo depois (diferente
    // do convite de admin, que manda pra professor/definir-senha.html).
    // invited_at fica null nesse tipo, então o gatilho handle_new_auth_user
    // (schema_aluno_avulso.sql) cria a profiles row normal (role "aluno")
    // — profiles.role_id só vira "professor" depois, quando a pessoa loga
    // de fato e o Portal do Professor chama a Edge Function
    // professor-auth-check (ver resolveAccess em professor-portal/js/
    // auth.js), exatamente como já acontecia no fluxo antigo.
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: { redirectTo },
    });
    if (linkError || !linkData?.properties?.action_link) {
      return jsonResponse({ error: linkError?.message || "Não foi possível criar a conta." }, 400);
    }

    const link = linkData.properties.action_link;
    const emailResult = await sendConfirmationEmail(email, link);
    if (!emailResult.ok) {
      console.error(`Falha ao enviar confirmação de cadastro para ${email}: ${emailResult.error}`);
    }

    return jsonResponse({
      ok: true,
      emailSent: emailResult.ok,
      emailError: emailResult.ok ? undefined : emailResult.error,
      // Fallback pro front-end mostrar um link clicável se o Resend falhar
      // (RESEND_API_KEY ausente, domínio não verificado etc.) — mesmo
      // espírito de showInviteResult em portal-mestre/js/admin.js.
      confirmLink: emailResult.ok ? undefined : link,
    });
  }

  return jsonResponse({ error: "Ação desconhecida." }, 400);
});
