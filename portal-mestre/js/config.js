// NeuraOAB — Portal Mestre — configuração do cliente Supabase.
//
// Mesma URL e anon key já usadas em admin/import.html, estudos/estudos.js
// etc. — a anon key é sempre pública por design do Supabase (fica no HTML
// de qualquer forma); quem protege o Portal Mestre não é essa chave, é o
// login (Supabase Auth) + a checagem de role "admin" (ver js/auth.js) e as
// policies de RLS em profiles/roles (ver supabase/schema_portal_mestre.sql).
const SUPABASE_URL = "https://lgcphxncteqpbntnlzhe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnY3BoeG5jdGVxcGJudG5semhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NzI5NTIsImV4cCI6MjEwMzM0ODk1Mn0.gQltbgj-OPpDEPuyOSonM3G8h1ppwwez0Dwi3SOdx98";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
