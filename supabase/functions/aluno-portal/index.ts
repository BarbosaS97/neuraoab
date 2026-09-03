// supabase/functions/aluno-portal/index.ts
//
// Backend do aceite de convite do aluno (estudos/convite.html): valida um
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
// existente, tanto faz — ver estudos/convite.html).

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

interface ValidarConvitePayload {
  action: "validar-convite";
  codigo: string;
}
interface AtivarConvitePayload {
  action: "ativar-convite";
  codigo: string;
}
type RequestBody = ValidarConvitePayload | AtivarConvitePayload;

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

    return jsonResponse({ ok: true, turma_nome: result.turmaNome });
  }

  return jsonResponse({ error: "Ação desconhecida." }, 400);
});
