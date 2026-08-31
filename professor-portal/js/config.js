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
