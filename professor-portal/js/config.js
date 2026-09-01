// NeuraOAB — Portal do Professor — configuração do cliente Supabase.
//
// Mesma URL e anon key já usadas em portal-mestre/js/config.js, estudos/
// estudos.js etc. — a anon key é sempre pública por design do Supabase;
// quem protege o Portal do Professor é o login (Supabase Auth) + a
// checagem de role "professor" (ver js/auth.js) e as policies de RLS em
// profiles/oab2_tentativas/oab2_respostas/oab_respostas (ver
// supabase/schema_professor_portal.sql).
const SUPABASE_URL = "https://lgcphxncteqpbntnlzhe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnY3BoeG5jdGVxcGJudG5semhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NzI5NTIsImV4cCI6MjEwMzM0ODk1Mn0.gQltbgj-OPpDEPuyOSonM3G8h1ppwwez0Dwi3SOdx98";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// O PostgREST (por baixo do Supabase) limita qualquer .select() sem
// paginação a 1000 linhas por padrão — SEM erro nenhum quando o limite é
// atingido, só devolve um subconjunto arbitrário das linhas. Pra tabelas que
// crescem com o uso (oab_respostas, oab2_tentativas, profiles em turmas
// grandes) isso pode virar uma estatística silenciosamente errada pro
// professor. fetchAllRows pagina em blocos de 1000 até esgotar o resultado;
// buildQuery(from, to) deve devolver a MESMA query base com .range(from, to)
// aplicado. Compartilhado entre js/turma.js, js/turmas.js, js/analises.js e
// js/aluno-detail.js — todos carregam este arquivo antes do seu próprio.
const FETCH_ALL_PAGE_SIZE = 1000;

async function fetchAllRows(buildQuery) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery(from, from + FETCH_ALL_PAGE_SIZE - 1);
    if (error) return { data: null, error };
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < FETCH_ALL_PAGE_SIZE) break;
    from += FETCH_ALL_PAGE_SIZE;
  }
  return { data: rows, error: null };
}
