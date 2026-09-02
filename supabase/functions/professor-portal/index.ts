// supabase/functions/professor-portal/index.ts
//
// Backend do Portal do Professor: convite (individual e em lote), excluir/
// restaurar aluno (caixa "Excluídos", ver requireOwnStudent) e ativar/
// desativar (pausa reversível, sem remover da turma). Mesmo motivo de
// portal-admin usar a service_role key (criar conta de auth por convite
// exige a API administrativa do Supabase Auth, que a anon key não alcança)
// — mas aqui o alvo é sempre um ALUNO do professor que chamou, nunca outro
// professor ou admin, e nunca um aluno de outro professor (ver
// requireProfessor + requireOwnStudent).

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

// Rate limit generico via check_rate_limit() no banco (ver
// supabase/schema_security_hardening.sql) — usado nas acoes de convite pra
// nao deixar uma conta de professor (comprometida ou nao) despejar volume
// alto de e-mail sem limite nenhum.
async function checkRateLimit(key: string, maxCount: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await adminClient.rpc("check_rate_limit", {
    p_key: key,
    p_max_count: maxCount,
    p_window_seconds: windowSeconds,
  });
  if (error) return true;
  return data === true;
}

// Pra onde o link de convite do aluno leva depois que ele clica — precisa
// estar cadastrada em Authentication > URL Configuration > Redirect URLs no
// projeto Supabase (ver roteiro em supabase/schema_professor_portal.sql).
const STUDENT_INVITE_REDIRECT_URL = "https://neuraoab.com.br/estudos/aceitar-convite.html";

const STUDENT_INVITE_EMAIL_COPY = {
  subject: "Seu professor te convidou — NeuraOAB",
  heading: "Você foi convidado para o NeuraOAB",
  bodyText:
    "Seu professor te cadastrou no NeuraOAB. Clique no botão abaixo para definir seu nome e senha e começar a estudar.",
};

// Envio do convite por e-mail via Resend (https://resend.com). Secret
// RESEND_API_KEY precisa estar configurado no projeto (mesmo secret que
// portal-admin usa, ja' deve estar configurado se o convite de professor
// ja' funciona). "convites@neuraoab.com.br" precisa estar verificado como
// dominio no Resend — sem isso o envio falha (mas o cadastro do aluno NAO
// e' desfeito por causa disso, ver inviteStudent abaixo).
//
// Duplicado (nao importado de um modulo compartilhado) de proposito: o
// deploy aqui e' feito colando o codigo direto no editor do Dashboard do
// Supabase, que so' enxerga o conteudo desta function — um import relativo
// tipo "../_shared/resend.ts" quebra o bundling ("Module not found"),
// porque nao existe nenhum arquivo vizinho de verdade nesse tipo de
// deploy. Mesma copia exata em supabase/functions/portal-admin/index.ts
// (so' muda EMAIL_COPY, que e' especifica de cada function).
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const INVITE_FROM_EMAIL = "NeuraOAB <convites@neuraoab.com.br>";

function buildInviteHtml(inviteLink: string, copy: typeof STUDENT_INVITE_EMAIL_COPY): string {
  return `
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
  `.trim();
}

async function sendInviteEmail(
  email: string,
  inviteLink: string,
  copy: typeof STUDENT_INVITE_EMAIL_COPY,
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

// Máximo de e-mails por chamada de "bulk-invite-students" — limite pra não
// deixar uma única invocação da Edge Function rodando tempo demais (cada
// convite é uma chamada sequencial a auth.admin.generateLink + Resend).
const MAX_BULK_INVITES = 150;

interface StudentInput {
  email: string;
  nome?: string;
  turma_id?: string;
}
interface CreateStudentPayload {
  action: "create-student";
  email: string;
  nome?: string;
  turma_id?: string;
}
interface BulkInviteStudentsPayload {
  action: "bulk-invite-students";
  students: StudentInput[];
}
interface DeleteStudentPayload {
  action: "delete-student";
  id: string;
}
interface RestoreStudentPayload {
  action: "restore-student";
  id: string;
}
interface SetActiveStudentPayload {
  action: "deactivate-student" | "activate-student";
  id: string;
}
interface ResendInvitePayload {
  action: "resend-invite";
  id: string;
}
type RequestBody =
  | CreateStudentPayload
  | BulkInviteStudentsPayload
  | DeleteStudentPayload
  | RestoreStudentPayload
  | SetActiveStudentPayload
  | ResendInvitePayload;

// Mesmo padrão de requireAdmin (portal-admin/index.ts), mas aceita role
// "professor" (quem vai gerenciar os próprios alunos) OU "admin" (acesso
// total, mesmo padrão de is_admin() ser superset de is_professor() no
// banco — útil pra suporte/depuração). Devolve o id do chamador.
async function requireProfessor(req: Request): Promise<string | null> {
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

  return role?.name === "professor" || role?.name === "admin" ? userId : null;
}

async function getRoleId(name: string): Promise<string | null> {
  const { data } = await adminClient.from("roles").select("id").eq("name", name).maybeSingle();
  return data?.id ?? null;
}

// Confirma que o "id" alvo é realmente um aluno DESTE professor antes de
// deixar qualquer ação (excluir/restaurar/ativar/desativar) mexer nele —
// nunca confia num id vindo cru do cliente. Usado por todas as ações de
// aluno abaixo.
async function requireOwnStudent(id: string, professorId: string): Promise<boolean> {
  const { data } = await adminClient.from("profiles").select("professor_id").eq("id", id).maybeSingle();
  return !!data && data.professor_id === professorId;
}

interface InviteResult {
  email: string;
  ok: boolean;
  id?: string;
  inviteLink?: string;
  emailSent?: boolean;
  error?: string;
}

// Cria a conta do aluno por convite (generateLink, sem mandar e-mail
// nenhum) + insere o perfil com professor_id = quem chamou + dispara o
// e-mail via Resend — mesma sequência de "create" em portal-admin/
// index.ts, adaptada pra aluno. Nunca lança: qualquer falha vira
// {ok:false, error} pra não travar um lote inteiro por causa de uma linha.
async function inviteStudent(
  professorId: string,
  alunoRoleId: string,
  input: StudentInput,
): Promise<InviteResult> {
  const email = input.email?.trim();
  if (!email) return { email: input.email ?? "", ok: false, error: "E-mail vazio." };

  // Confia so' num turma_id que realmente pertence a este professor — nunca
  // no valor cru vindo do cliente (mesmo cuidado de requireProfessor
  // acima). Convite sem turma (turma_id ausente) continua valido: o aluno
  // so' cai em "Sem turma".
  let turmaId: string | null = null;
  if (input.turma_id) {
    const { data: turma } = await adminClient
      .from("turmas")
      .select("id")
      .eq("id", input.turma_id)
      .eq("professor_id", professorId)
      .maybeSingle();
    if (!turma) return { email, ok: false, error: "Turma inválida." };
    turmaId = turma.id;
  }

  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: STUDENT_INVITE_REDIRECT_URL },
  });
  if (linkError || !linkData?.user) {
    // Mensagem mais util pro caso mais comum de falha aqui: e-mail que ja'
    // tem conta (convite anterior, ou aluno de outro professor/duplicado).
    // "Reenviar convite" (ver resendInvite abaixo) e' o caminho certo pra
    // recuperar um convite pendente perdido, nao convidar de novo do zero.
    const alreadyRegistered = /already|cadastrad|registered/i.test(linkError?.message || "");
    const error = alreadyRegistered
      ? "Este e-mail já foi convidado antes. Se o aluno perdeu o convite, use \"Reenviar convite\" na lista em vez de convidar de novo."
      : linkError?.message || "Falha ao gerar o convite.";
    return { email, ok: false, error };
  }

  const { error: profileError } = await adminClient.from("profiles").insert({
    id: linkData.user.id,
    role_id: alunoRoleId,
    professor_id: professorId,
    turma_id: turmaId,
    nome: input.nome?.trim() || null,
    email,
  });
  if (profileError) {
    await adminClient.auth.admin.deleteUser(linkData.user.id);
    return { email, ok: false, error: `Falha ao salvar o perfil do aluno: ${profileError.message}` };
  }

  const inviteLink = linkData.properties.action_link;
  const emailResult = await sendInviteEmail(email, inviteLink, STUDENT_INVITE_EMAIL_COPY);
  if (!emailResult.ok) {
    console.error(`Falha ao enviar convite por e-mail para ${email}: ${emailResult.error}`);
  }

  return {
    email,
    ok: true,
    id: linkData.user.id,
    inviteLink,
    emailSent: emailResult.ok,
    error: emailResult.ok ? undefined : emailResult.error,
  };
}

// Reenvia o convite de um aluno pendente (nome ainda null, nunca aceitou) —
// sem isso, um convite perdido/expirado ficava sem recuperação: o aluno já
// tem linha em auth.users (criada no primeiro convite, ver inviteStudent),
// então convidar de novo pelo mesmo fluxo esbarra em "e-mail já cadastrado"
// (ver mensagem em inviteStudent acima). Usa generateLink tipo "recovery"
// em vez de "invite" de propósito: "recovery" é o tipo documentado do
// Supabase Auth pra gerar um link válido pra uma conta que JÁ existe
// (confirmada ou não), enquanto "invite" é pra CRIAR uma conta nova — usar
// "invite" de novo aqui é o que devolve o erro de "já cadastrado". O link
// de recovery autentica o aluno e leva pra a mesma
// estudos/aceitar-convite.html, que só chama auth.updateUser({password}),
// então o fluxo do lado do aluno é idêntico ao de um convite normal.
async function resendInvite(id: string, professorId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: student } = await adminClient
    .from("profiles")
    .select("email, nome, professor_id")
    .eq("id", id)
    .maybeSingle();

  if (!student || student.professor_id !== professorId) {
    return { ok: false, error: "Aluno não encontrado." };
  }
  if (student.nome) {
    return { ok: false, error: "Este aluno já aceitou o convite — não é preciso reenviar." };
  }
  if (!student.email) {
    return { ok: false, error: "Este aluno não tem e-mail cadastrado." };
  }

  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email: student.email,
    options: { redirectTo: STUDENT_INVITE_REDIRECT_URL },
  });
  if (linkError || !linkData?.properties?.action_link) {
    return { ok: false, error: linkError?.message || "Falha ao gerar o novo convite." };
  }

  const emailResult = await sendInviteEmail(student.email, linkData.properties.action_link, STUDENT_INVITE_EMAIL_COPY);
  if (!emailResult.ok) {
    return { ok: false, error: `Não foi possível enviar o e-mail: ${emailResult.error}` };
  }
  return { ok: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  const professorId = await requireProfessor(req);
  if (!professorId) {
    return jsonResponse({ error: "Acesso negado: é preciso estar logado como professor." }, 403);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido." }, 400);
  }

  if (body.action === "create-student" || body.action === "bulk-invite-students") {
    const alunoRoleId = await getRoleId("aluno");
    if (!alunoRoleId) {
      return jsonResponse(
        { error: "Papel 'aluno' não encontrado no banco — rode o schema_portal_mestre.sql primeiro." },
        500,
      );
    }

    if (body.action === "create-student") {
      if (!body.email) return jsonResponse({ error: "'email' é obrigatório." }, 400);
      // Mesmo rate limit da acao bulk-invite-students, pra chamadas
      // repetidas de create-student nao virarem um jeito de contornar o
      // limite de la (ver comentario abaixo).
      if (!(await checkRateLimit(`bulk-invite:${professorId}`, 8, 3600))) {
        return jsonResponse({ error: "Muitos convites em pouco tempo. Aguarde um pouco e tente novamente." }, 429);
      }
      const result = await inviteStudent(professorId, alunoRoleId, {
        email: body.email,
        nome: body.nome,
        turma_id: body.turma_id,
      });
      if (!result.ok) return jsonResponse({ error: result.error }, 400);
      return jsonResponse(result);
    }

    // bulk-invite-students
    const students = Array.isArray(body.students) ? body.students : [];
    if (students.length === 0) {
      return jsonResponse({ error: "'students' precisa ser uma lista com pelo menos um e-mail." }, 400);
    }
    if (students.length > MAX_BULK_INVITES) {
      return jsonResponse({ error: `No máximo ${MAX_BULK_INVITES} alunos por vez.` }, 400);
    }

    // Rate limit por professor: já exige login (requireProfessorSession
    // acima), mas nada limitava QUANTAS VEZES um professor (ou uma conta
    // comprometida) podia chamar isso — cada chamada dispara e-mail de
    // verdade via Resend, com o remetente do domínio da NeuraOAB. Limite
    // generoso o bastante pra importar uma turma inteira em algumas
    // chamadas, curto o bastante pra travar um script disparando em loop.
    if (!(await checkRateLimit(`bulk-invite:${professorId}`, 8, 3600))) {
      return jsonResponse({ error: "Muitos convites em pouco tempo. Aguarde um pouco e tente novamente." }, 429);
    }

    // Sequencial de propósito (não Promise.all): não há garantia documentada
    // de taxa segura pra chamadas paralelas de auth.admin.generateLink, e
    // cada linha já é isolada por try/catch dentro de inviteStudent — uma
    // falha não impede as próximas.
    const results: InviteResult[] = [];
    for (const student of students) {
      results.push(await inviteStudent(professorId, alunoRoleId, student));
    }

    return jsonResponse({ results });
  }

  if (body.action === "resend-invite") {
    const { id } = body;
    if (!id) return jsonResponse({ error: "'id' é obrigatório." }, 400);
    const result = await resendInvite(id, professorId);
    if (!result.ok) return jsonResponse({ error: result.error }, 400);
    return jsonResponse(result);
  }

  // Quatro ações de aluno, todas com o mesmo formato {id} e a mesma checagem
  // de dono (requireOwnStudent) — nenhuma usa auth.admin.deleteUser: um
  // aluno pode ter tentativas/respostas gravadas (oab2_tentativas/
  // oab_respostas) que o professor ainda quer consultar depois, então a
  // conta de auth nunca é apagada de verdade, só marcada. O gatilho
  // protect_profile_privileged_fields permite esses UPDATEs porque a
  // chamada usa a service_role key (ver comentário sobre
  // auth.role() = 'service_role' em supabase/schema_alunos_exclusao.sql).
  if (
    body.action === "delete-student" ||
    body.action === "restore-student" ||
    body.action === "deactivate-student" ||
    body.action === "activate-student"
  ) {
    const { id } = body;
    if (!id) return jsonResponse({ error: "'id' é obrigatório." }, 400);
    if (!(await requireOwnStudent(id, professorId))) {
      return jsonResponse({ error: "Aluno não encontrado." }, 404);
    }

    // "Excluir": sai da lista/turma, some das estatísticas, vai pra caixa
    // "Excluídos" — também desativa o login (ativo=false) de quebra, pra
    // excluído significar removido de verdade, não só escondido da lista.
    if (body.action === "delete-student") {
      const { error } = await adminClient
        .from("profiles")
        .update({ excluido_em: new Date().toISOString(), ativo: false })
        .eq("id", id);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ ok: true });
    }

    // "Restaurar": desfaz a exclusão por completo — volta a aparecer na
    // turma/estatísticas e reativa o login.
    if (body.action === "restore-student") {
      const { error } = await adminClient
        .from("profiles")
        .update({ excluido_em: null, ativo: true })
        .eq("id", id);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ ok: true });
    }

    // "Inativar"/"Reativar": só pausa/retoma o login, sem tirar o aluno da
    // turma nem das estatísticas — reversível a qualquer momento,
    // diferente de excluir.
    const { error } = await adminClient
      .from("profiles")
      .update({ ativo: body.action === "activate-student" })
      .eq("id", id);
    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: "Ação desconhecida." }, 400);
});
