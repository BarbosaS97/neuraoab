// supabase/functions/portal-admin/index.ts
//
// Backend do Portal Mestre: unico ponto do sistema que usa a service_role
// key (nunca exposta ao navegador) pra criar, excluir ou redefinir a senha
// de contas de professor via API administrativa do Supabase Auth. A anon
// key (a unica disponivel no cliente) so permite que alguem crie a PROPRIA
// conta — criar/excluir a conta de outra pessoa exige service_role, por
// isso essas tres acoes passam por aqui em vez de um INSERT/DELETE direto
// do navegador (que e' como o resto de "editar professor" funciona, ver
// portal-mestre/js/admin.js).
//
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao injetados automaticamente
// pelo Supabase em toda Edge Function — nao precisa configurar secret
// nenhum a mais pra isso (mesmo padrao de acesso "de fabrica" do projeto,
// diferente do API_DEEPSEEK_KEY das outras functions, que e' um secret
// proprio nosso).

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

// Client "admin": usa a service_role key, ignora RLS e tem acesso a
// supabase.auth.admin.*. So' e' usado DEPOIS de confirmar (requireAdmin,
// abaixo) que quem chamou e' de fato um admin logado — nunca a partir de
// um "sou admin" que o proprio cliente afirme no corpo da requisicao.
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Pra onde o link de convite do professor leva depois que ele clica —
// precisa estar cadastrada em Authentication > URL Configuration > Redirect
// URLs no projeto Supabase, senao o link falha ao ser aberto. AJUSTE aqui
// se o dominio final for outro.
const PROFESSOR_INVITE_REDIRECT_URL = "https://neuraoab.com.br/professor/definir-senha.html";

// Envio do convite por e-mail via Resend (https://resend.com). Secret
// RESEND_API_KEY precisa estar configurado no projeto (Project Settings >
// Edge Functions > Secrets, ou "supabase secrets set RESEND_API_KEY=...").
// "convites@neuraoab.com.br" precisa estar verificado como dominio no
// Resend (Domains no painel) — sem isso o envio falha. Se o e-mail falhar,
// a criacao do professor NAO e' desfeita: o link de convite continua
// voltando na resposta pra copiar e mandar manualmente (ver
// portal-mestre/js/admin.js), assim a conta nunca fica "presa" por causa
// de um problema so' no envio.
//
// Duplicado (nao importado de um modulo compartilhado) de proposito: o
// deploy aqui e' feito colando o codigo direto no editor do Dashboard do
// Supabase, que so' enxerga o conteudo daquela function — um import
// relativo tipo "../_shared/resend.ts" quebra o bundling ("Module not
// found"), porque nao existe nenhum arquivo vizinho de verdade nesse tipo
// de deploy. Mesma copia exata em supabase/functions/professor-portal/
// index.ts (so' muda EMAIL_COPY, que e' especifica de cada function).
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const INVITE_FROM_EMAIL = "NeuraOAB <convites@neuraoab.com.br>";

const PROFESSOR_INVITE_EMAIL_COPY = {
  subject: "Convite para o Portal Mestre — NeuraOAB",
  heading: "Você foi convidado para o NeuraOAB",
  bodyText:
    "Você foi cadastrado como professor no Portal Mestre. Clique no botão abaixo para definir seu nome e senha e acessar o sistema.",
};

// Sem o link "cru" repetido em texto (so' o botao) de proposito — pedido
// explicito pra deixar o e-mail mais limpo. O botao usa o mesmo href, so
// que se o cliente de e-mail engolir o link do botao a pessoa nao tem
// como abrir o convite; aceitavel aqui porque quem convidou sempre pode
// gerar outro (o link tambem continua disponivel no painel como fallback,
// ver showInviteResult em portal-mestre/js/admin.js).
//
// Documento HTML completo (DOCTYPE/html/head/body), não só o fragmento de
// tabela — sem isso, alguns clientes de e-mail mais rígidos (Outlook
// desktop principalmente, que renderiza com o motor do Word) podem falhar
// em exibir um fragmento solto e mostrar o e-mail em branco.
function buildInviteHtml(inviteLink: string, copy: typeof PROFESSOR_INVITE_EMAIL_COPY): string {
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
                      <a href="${inviteLink}" style="display: inline-block; padding: 13px 32px; font-size: 14px; font-weight: bold; color: #ffffff; text-decoration: none;">
                        Aceitar convite
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin: 28px 0 0; font-size: 12.5px; line-height: 1.5; color: #8b93a7;">
                  Se você não esperava este convite, pode ignorar este e-mail.
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

// Fallback em texto puro — diferente do HTML (ver comentário acima), este
// PRECISA ter o link cru: sem botão pra clicar, é o único jeito de abrir o
// convite num cliente que só mostra a versão em texto. Não conflita com o
// pedido de "e-mail mais limpo" (esse pedido era sobre a versão HTML).
function buildInviteText(inviteLink: string, copy: typeof PROFESSOR_INVITE_EMAIL_COPY): string {
  return `${copy.heading}\n\n${copy.bodyText}\n\n${inviteLink}\n\nSe você não esperava este convite, pode ignorar este e-mail.`;
}

async function sendInviteEmail(
  email: string,
  inviteLink: string,
  copy: typeof PROFESSOR_INVITE_EMAIL_COPY,
): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    return { ok: false, error: "RESEND_API_KEY não configurado no servidor." };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: INVITE_FROM_EMAIL,
        to: email,
        subject: copy.subject,
        html: buildInviteHtml(inviteLink, copy),
        text: buildInviteText(inviteLink, copy),
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

interface CreatePayload {
  action: "create";
  email: string;
  cursinho?: string;
  telefone?: string;
}
interface DeletePayload {
  action: "delete";
  id: string;
}
interface ResetPasswordPayload {
  action: "reset-password";
  id: string;
  password: string;
}
type RequestBody = CreatePayload | DeletePayload | ResetPasswordPayload;

const MIN_PASSWORD_LENGTH = 8;

// Confere quem esta' chamando a partir do JWT do header Authorization (o
// mesmo token que o supabase-js do navegador manda automaticamente numa
// chamada autenticada) e devolve o id do usuario SO' se ele tiver role
// "admin" em profiles — null em qualquer outro caso (sem token, token
// invalido, autenticado mas sem ser admin).
async function requireAdmin(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return null;

  const { data: userData, error: userError } = await adminClient.auth.getUser(jwt);
  if (userError || !userData?.user) return null;
  const userId = userData.user.id;

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.role_id) return null;

  const { data: role } = await adminClient
    .from("roles")
    .select("name")
    .eq("id", profile.role_id)
    .maybeSingle();

  return role?.name === "admin" ? userId : null;
}

async function getRoleId(name: string): Promise<string | null> {
  const { data } = await adminClient.from("roles").select("id").eq("name", name).maybeSingle();
  return data?.id ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  const adminId = await requireAdmin(req);
  if (!adminId) {
    return jsonResponse({ error: "Acesso negado: é preciso estar logado como admin." }, 403);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido." }, 400);
  }

  if (body.action === "create") {
    const { email, cursinho, telefone } = body;
    if (!email) {
      return jsonResponse({ error: "'email' é obrigatório." }, 400);
    }

    const professorRoleId = await getRoleId("professor");
    if (!professorRoleId) {
      return jsonResponse(
        { error: "Papel 'professor' não encontrado no banco — rode o schema_portal_mestre.sql primeiro." },
        500,
      );
    }

    // "generateLink" (nao "inviteUserByEmail") de proposito: cria o
    // usuario e devolve o link de convite SEM mandar nenhum e-mail — o
    // envio e' feito por conta propria logo abaixo, via Resend
    // (sendInviteEmail), pra ter o mesmo remetente/HTML do resto do
    // sistema em vez do template padrao do Supabase. O professor define o
    // proprio nome e senha ao abrir o link, em professor/definir-senha.html.
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: PROFESSOR_INVITE_REDIRECT_URL },
    });
    if (linkError || !linkData?.user) {
      return jsonResponse({ error: linkError?.message || "Falha ao gerar o convite." }, 400);
    }

    const { error: profileError } = await adminClient.from("profiles").insert({
      id: linkData.user.id,
      role_id: professorRoleId,
      nome: null, // o proprio professor preenche isso ao aceitar o convite
      email,
      cursinho: cursinho || null,
      telefone: telefone || null,
    });
    if (profileError) {
      // Sem o perfil, a conta de auth ficaria orfa (login existe, mas sem
      // registro em profiles, invisivel pro dashboard) — desfaz a criacao
      // em vez de deixar esse lixo pra tras.
      await adminClient.auth.admin.deleteUser(linkData.user.id);
      return jsonResponse(
        { error: `Falha ao salvar o perfil do professor: ${profileError.message}` },
        500,
      );
    }

    const inviteLink = linkData.properties.action_link;
    const emailResult = await sendInviteEmail(email, inviteLink, PROFESSOR_INVITE_EMAIL_COPY);
    if (!emailResult.ok) {
      console.error(`Falha ao enviar convite por e-mail para ${email}: ${emailResult.error}`);
    }

    return jsonResponse({
      id: linkData.user.id,
      inviteLink,
      emailSent: emailResult.ok,
      emailError: emailResult.ok ? undefined : emailResult.error,
    });
  }

  if (body.action === "delete") {
    const { id } = body;
    if (!id) return jsonResponse({ error: "'id' é obrigatório." }, 400);

    // So' deixa excluir quem NAO for admin por aqui — essa funcao e' pra
    // gerenciar professor, nao pra remover admins (evita, de quebra, o
    // admin se auto-excluir sem querer e ficar sem acesso nenhum).
    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("role_id")
      .eq("id", id)
      .maybeSingle();
    if (targetProfile?.role_id) {
      const { data: targetRole } = await adminClient
        .from("roles")
        .select("name")
        .eq("id", targetProfile.role_id)
        .maybeSingle();
      if (targetRole?.name === "admin") {
        return jsonResponse({ error: "Não é possível excluir uma conta de admin por aqui." }, 400);
      }
    }

    const { error } = await adminClient.auth.admin.deleteUser(id);
    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ ok: true });
  }

  if (body.action === "reset-password") {
    const { id, password } = body;
    if (!id || !password) {
      return jsonResponse({ error: "'id' e 'password' são obrigatórios." }, 400);
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return jsonResponse({ error: `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` }, 400);
    }
    const { error } = await adminClient.auth.admin.updateUserById(id, { password });
    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: "Ação desconhecida." }, 400);
});
