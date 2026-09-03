// supabase/functions/professor-portal/index.ts
//
// Backend do Portal do Professor: convite por código (individual e em
// lote, ver createConvite), reenviar/cancelar convite pendente, excluir/
// restaurar aluno (caixa "Excluídos", ver requireOwnStudent) e ativar/
// desativar (pausa reversível, sem remover da turma). Usa a service_role
// key porque cada ação aqui precisa confiar em turma_id/e-mail validados no
// servidor (nunca no valor cru vindo do cliente) e, no caso do convite,
// mandar e-mail de verdade via Resend — mas o alvo é sempre uma TURMA/ALUNO
// do professor que chamou, nunca de outro professor ou admin (ver
// requireProfessor + requireOwnStudent).
//
// O convite NÃO cria conta de aluno na hora (isso mudou — antes usava
// auth.admin.generateLink({type:"invite"}), que criava a conta do aluno
// direto e quebrava se o e-mail já tivesse conta própria, ver fluxo de
// aluno avulso em schema_aluno_avulso.sql). Agora um convite é só um
// REGISTRO (tabela "convites", ver schema_convites_turma.sql) com um
// código e validade — quem vincula o perfil à turma é a Edge Function
// "aluno-portal" (ação "ativar-convite"), quando o aluno aceita já
// logado (conta nova ou avulsa já existente, tanto faz).

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

// Pra onde o link de convite do aluno leva — direto pro dashboard do aluno
// (não uma página separada), que abre um modal de aceite sozinho quando vê
// "?convite=" na própria URL (ver checkPendingConvite em estudos/
// estudos.js). Não precisa estar cadastrada em Authentication > URL
// Configuration > Redirect URLs (diferente do convite antigo): não depende
// de um token de recuperação de senha do Supabase Auth, só chama a Edge
// Function "aluno-portal" pra validar o código.
const STUDENT_INVITE_BASE_URL = "https://neuraoab.com.br/estudos/index.html";

// Convite pendente expira 7 dias depois de gerado (ou reenviado, ver
// resendInvite) — mesmo espírito de MAX_BULK_INVITES abaixo: um número
// fixo, sem UI de configuração, porque não há necessidade de mudar isso
// por turma/professor hoje.
const CONVITE_VALIDADE_DIAS = 7;

const STUDENT_INVITE_EMAIL_COPY = {
  subject: "Você foi convidado para o NeuraOAB!",
  heading: "Você foi convidado para o NeuraOAB",
  bodyText:
    "Seu professor te convidou para uma turma no NeuraOAB. Clique no botão abaixo para entrar (ou criar sua conta, se ainda não tiver uma) e aceitar o convite — você ganha acesso Pro automaticamente.",
};

// Envio do convite por e-mail via Resend (https://resend.com). Secret
// RESEND_API_KEY precisa estar configurado no projeto (mesmo secret que
// portal-admin usa, ja' deve estar configurado se o convite de professor
// ja' funciona). "convites@neuraoab.com.br" precisa estar verificado como
// dominio no Resend — sem isso o envio falha (mas o convite JA' foi gravado
// em "convites" mesmo assim, ver createConvite abaixo — falha de e-mail
// nunca desfaz o registro, só fica sem aviso pro aluno até um "Reenviar").
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
// convite é uma chamada sequencial a createConvite, que já inclui as
// checagens de vaga/duplicata + Resend).
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
interface CancelInvitePayload {
  action: "cancel-invite";
  id: string;
}
type RequestBody =
  | CreateStudentPayload
  | BulkInviteStudentsPayload
  | DeleteStudentPayload
  | RestoreStudentPayload
  | SetActiveStudentPayload
  | ResendInvitePayload
  | CancelInvitePayload;

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
  emailSent?: boolean;
  error?: string;
}

// 32 chars hex — curto o bastante pra caber numa URL legível, longo o
// bastante (128 bits) pra não ser adivinhável por tentativa.
function generateCodigo(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

// Quantos alunos JÁ ACEITARAM (linha em "profiles", excluído não conta —
// mesmo filtro de loadStudents em turma.js) essa turma tem agora, pra
// comparar com turmas.limite_alunos antes de gerar mais um convite.
async function countTurmaAlunos(turmaId: string): Promise<number> {
  const { count } = await adminClient
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("turma_id", turmaId)
    .is("excluido_em", null);
  return count ?? 0;
}

// Cria um REGISTRO de convite (tabela "convites") + dispara o e-mail via
// Resend — não toca em auth.users nem em "profiles" nenhuma vez: quem faz
// isso é a Edge Function "aluno-portal" (ação "ativar-convite"), quando o
// aluno aceita já logado (conta nova ou avulsa já existente). Nunca lança:
// qualquer falha vira {ok:false, error} pra não travar um lote inteiro por
// causa de uma linha.
async function createConvite(professorId: string, input: StudentInput): Promise<InviteResult> {
  const email = input.email?.trim().toLowerCase();
  if (!email) return { email: input.email ?? "", ok: false, error: "E-mail vazio." };

  // Confia so' num turma_id que realmente pertence a este professor — nunca
  // no valor cru vindo do cliente (mesmo cuidado de requireProfessor
  // acima). Convite sem turma (turma_id ausente) continua valido: o aluno
  // so' cai em "Sem turma".
  let turmaId: string | null = null;
  if (input.turma_id) {
    const { data: turma } = await adminClient
      .from("turmas")
      .select("id, limite_alunos")
      .eq("id", input.turma_id)
      .eq("professor_id", professorId)
      .maybeSingle();
    if (!turma) return { email, ok: false, error: "Turma inválida." };
    turmaId = turma.id;

    if (turma.limite_alunos != null) {
      const atual = await countTurmaAlunos(turma.id);
      if (atual >= turma.limite_alunos) {
        return { email, ok: false, error: "A turma já atingiu o limite de alunos." };
      }
    }
  }

  // Já é aluno deste professor (aceitou um convite antes, ou foi movido pra
  // cá manualmente)? Convidar de novo não faz sentido.
  const { data: existingProfile } = await adminClient
    .from("profiles")
    .select("id")
    .eq("email", email)
    .eq("professor_id", professorId)
    .is("excluido_em", null)
    .maybeSingle();
  if (existingProfile) {
    return { email, ok: false, error: "Este aluno já está na sua lista." };
  }

  // Convite pendente e ainda válido pro mesmo e-mail (nesta turma, ou "Sem
  // turma" se turmaId for null) já existe — "Reenviar convite" na lista é
  // o caminho certo pra recuperar um convite perdido, não convidar de novo.
  let pendingQuery = adminClient
    .from("convites")
    .select("id")
    .eq("professor_id", professorId)
    .eq("email", email)
    .eq("status", "pendente")
    .gt("expires_at", new Date().toISOString());
  pendingQuery = turmaId ? pendingQuery.eq("turma_id", turmaId) : pendingQuery.is("turma_id", null);
  const { data: pending } = await pendingQuery.maybeSingle();
  if (pending) {
    return {
      email,
      ok: false,
      error: 'Já existe um convite pendente pra este e-mail. Use "Reenviar convite" na lista em vez de convidar de novo.',
    };
  }

  const codigo = generateCodigo();
  const expiresAt = new Date(Date.now() + CONVITE_VALIDADE_DIAS * 24 * 60 * 60 * 1000).toISOString();

  const { data: convite, error: insertError } = await adminClient
    .from("convites")
    .insert({
      turma_id: turmaId,
      professor_id: professorId,
      email,
      nome: input.nome?.trim() || null,
      codigo,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (insertError || !convite) {
    return { email, ok: false, error: insertError?.message || "Falha ao gerar o convite." };
  }

  const inviteLink = `${STUDENT_INVITE_BASE_URL}?convite=${codigo}`;
  const emailResult = await sendInviteEmail(email, inviteLink, STUDENT_INVITE_EMAIL_COPY);
  if (!emailResult.ok) {
    console.error(`Falha ao enviar convite por e-mail para ${email}: ${emailResult.error}`);
  }

  return {
    email,
    ok: true,
    id: convite.id,
    emailSent: emailResult.ok,
    error: emailResult.ok ? undefined : emailResult.error,
  };
}

// Reenvia um convite pendente perdido/expirado — gera um código novo (o
// antigo para de funcionar, já que a busca em aluno-portal é sempre pelo
// código mais recente da linha) e uma validade nova, e manda o e-mail de
// novo. Só faz sentido pra convite ainda "pendente" — um já aceito não tem
// o que reenviar (ver resultado {ok:false} abaixo).
async function resendInvite(id: string, professorId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: convite } = await adminClient
    .from("convites")
    .select("email, status, professor_id")
    .eq("id", id)
    .maybeSingle();

  if (!convite || convite.professor_id !== professorId) {
    return { ok: false, error: "Convite não encontrado." };
  }
  if (convite.status !== "pendente") {
    return { ok: false, error: "Este convite não está mais pendente." };
  }

  const codigo = generateCodigo();
  const expiresAt = new Date(Date.now() + CONVITE_VALIDADE_DIAS * 24 * 60 * 60 * 1000).toISOString();

  const { error: updateError } = await adminClient
    .from("convites")
    .update({ codigo, expires_at: expiresAt })
    .eq("id", id);
  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  const inviteLink = `${STUDENT_INVITE_BASE_URL}?convite=${codigo}`;
  const emailResult = await sendInviteEmail(convite.email, inviteLink, STUDENT_INVITE_EMAIL_COPY);
  if (!emailResult.ok) {
    return { ok: false, error: `Não foi possível enviar o e-mail: ${emailResult.error}` };
  }
  return { ok: true };
}

// Revoga um convite ainda não aceito — só existe porque agora um convite
// não tem mais um efeito colateral em auth.users pra desfazer (o antigo
// generateLink já criava a conta na hora); cancelar aqui é só marcar a
// linha, sem apagar nada.
async function cancelInvite(id: string, professorId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: convite } = await adminClient
    .from("convites")
    .select("status, professor_id")
    .eq("id", id)
    .maybeSingle();

  if (!convite || convite.professor_id !== professorId) {
    return { ok: false, error: "Convite não encontrado." };
  }
  if (convite.status !== "pendente") {
    return { ok: false, error: "Este convite não está mais pendente." };
  }

  const { error } = await adminClient.from("convites").update({ status: "cancelado" }).eq("id", id);
  if (error) return { ok: false, error: error.message };
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
    if (body.action === "create-student") {
      if (!body.email) return jsonResponse({ error: "'email' é obrigatório." }, 400);
      // Mesmo rate limit da acao bulk-invite-students, pra chamadas
      // repetidas de create-student nao virarem um jeito de contornar o
      // limite de la (ver comentario abaixo).
      if (!(await checkRateLimit(`bulk-invite:${professorId}`, 8, 3600))) {
        return jsonResponse({ error: "Muitos convites em pouco tempo. Aguarde um pouco e tente novamente." }, 429);
      }
      const result = await createConvite(professorId, {
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

    // Sequencial de propósito (não Promise.all): a checagem de vaga
    // (countTurmaAlunos) e de convite pendente duplicado dentro de
    // createConvite precisa enxergar o efeito das linhas anteriores do
    // mesmo lote — em paralelo, duas linhas pro mesmo e-mail (ou a última
    // vaga da turma) poderiam passar as duas. Cada linha já é isolada por
    // try/catch dentro de createConvite — uma falha não impede as próximas.
    const results: InviteResult[] = [];
    for (const student of students) {
      results.push(await createConvite(professorId, student));
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

  if (body.action === "cancel-invite") {
    const { id } = body;
    if (!id) return jsonResponse({ error: "'id' é obrigatório." }, 400);
    const result = await cancelInvite(id, professorId);
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
