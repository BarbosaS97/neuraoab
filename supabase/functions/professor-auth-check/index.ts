// supabase/functions/professor-auth-check/index.ts
//
// Checa se quem está logado (QUALQUER usuário autenticado, não precisa já
// ser professor — mesmo modelo de "requireCaller" de aluno-portal/index.ts)
// está autorizado a entrar no Portal do Professor, via a tabela
// "professores_autorizados" (allowlist gerenciada pelo admin no Portal
// Mestre, ver supabase/schema_professores_autorizados.sql).
//
// Por que isso não é uma RPC comum (SECURITY DEFINER): profiles.role_id é
// protegido pelo trigger protect_profile_privileged_fields
// (schema_professor_portal.sql), que só libera UPDATE de role_id pra
// admin ou pra quem chama com a service_role key — e isso vale mesmo
// dentro de uma função SECURITY DEFINER chamada por um usuário comum
// (auth.role() reflete o JWT da chamada HTTP, não o dono da função). Por
// isso a promoção de role_id pra "professor" só pode acontecer aqui, numa
// Edge Function com a service_role key — mesmo padrão já usado em
// professor-portal/index.ts e aluno-portal/index.ts.
//
// professor-portal/index.ts (as ações de gerenciar turma/aluno) e
// requireProfessorSession (professor-portal/js/auth.js) continuam checando
// só profiles.role_id — esta function só existe pra garantir que esse
// role_id já está certo ANTES do usuário chegar em dashboard.html.

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
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  const caller = await requireCaller(req);
  if (!caller) {
    return jsonResponse({ error: "Acesso negado: é preciso estar logado." }, 401);
  }

  const { data: autorizado } = await adminClient
    .from("professores_autorizados")
    .select("email")
    .eq("email", caller.email.toLowerCase())
    .maybeSingle();

  if (!autorizado) {
    return jsonResponse({ authorized: false });
  }

  // Já é professor/admin (conta criada pelo fluxo antigo de convite, ou já
  // promovida numa chamada anterior)? Não mexe em nada — evita um UPDATE à
  // toa a cada login.
  const { data: callerProfile } = await adminClient
    .from("profiles")
    .select("role_id")
    .eq("id", caller.id)
    .maybeSingle();

  let currentRoleName: string | null = null;
  if (callerProfile?.role_id) {
    const { data: currentRole } = await adminClient
      .from("roles")
      .select("name")
      .eq("id", callerProfile.role_id)
      .maybeSingle();
    currentRoleName = currentRole?.name ?? null;
  }

  if (currentRoleName === "professor" || currentRoleName === "admin") {
    return jsonResponse({ authorized: true });
  }

  const { data: professorRole } = await adminClient
    .from("roles")
    .select("id")
    .eq("name", "professor")
    .maybeSingle();
  if (!professorRole?.id) {
    return jsonResponse({ error: "Papel 'professor' não encontrado. Rode supabase/schema_portal_mestre.sql." }, 500);
  }

  // O trigger handle_new_auth_user (schema_aluno_avulso.sql) já criou uma
  // profiles row com role_id='aluno' pra QUALQUER login novo, incluindo
  // este — então aqui é sempre um UPDATE, nunca um INSERT.
  const { error: updateError } = await adminClient
    .from("profiles")
    .update({ role_id: professorRole.id })
    .eq("id", caller.id);
  if (updateError) {
    return jsonResponse({ error: updateError.message }, 400);
  }

  return jsonResponse({ authorized: true });
});
