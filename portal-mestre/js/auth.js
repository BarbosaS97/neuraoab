// NeuraOAB — Portal Mestre — autenticação.
//
// Um arquivo só, carregado tanto por index.html (login) quanto por
// dashboard.html (guarda de sessão + logout) — cada bloco abaixo só roda
// se os elementos daquela página existirem no DOM, então não há conflito
// entre os dois usos.

// Consulta profiles + roles pra saber se o usuário logado é admin. Nunca
// confiamos em nada guardado no navegador pra essa decisão — sempre uma
// consulta fresca ao banco, protegida pelas próprias RLS policies de
// "profiles" (ver supabase/schema_portal_mestre.sql).
async function checkIsAdmin(userId) {
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role_id")
    .eq("id", userId)
    .maybeSingle();
  if (profileError || !profile?.role_id) return false;

  const { data: role, error: roleError } = await client
    .from("roles")
    .select("name")
    .eq("id", profile.role_id)
    .maybeSingle();
  if (roleError || !role) return false;

  return role.name === "admin";
}

// -------------------------------------------------------- index.html (login)

(function initLoginPage() {
  const form = document.getElementById("loginForm");
  if (!form) return; // esta pagina nao e' a de login

  const emailInput = document.getElementById("loginEmail");
  const passwordInput = document.getElementById("loginPassword");
  const submitBtn = document.getElementById("loginSubmit");
  const errorEl = document.getElementById("loginError");

  function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.add("show");
  }

  function hideError() {
    errorEl.classList.remove("show");
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitBtn.textContent = loading ? "Entrando..." : "Entrar";
  }

  // Se já tiver uma sessão válida de admin (ex.: voltou pra essa página
  // com a aba ainda logada), pula direto pro dashboard em vez de pedir
  // login de novo.
  (async () => {
    const { data: { session } } = await client.auth.getSession();
    if (session?.user && (await checkIsAdmin(session.user.id))) {
      window.location.replace("dashboard.html");
    }
  })();

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    hideError();
    setLoading(true);

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    const { data, error } = await client.auth.signInWithPassword({ email, password });

    if (error || !data?.user) {
      setLoading(false);
      showError("E-mail ou senha inválidos.");
      return;
    }

    const isAdmin = await checkIsAdmin(data.user.id);
    if (!isAdmin) {
      await client.auth.signOut();
      setLoading(false);
      showError("Acesso negado: esta conta não tem permissão de admin.");
      return;
    }

    window.location.replace("dashboard.html");
  });
})();

// ---------------------------------------------------------- dashboard.html

// Roda antes de qualquer outra coisa na página do dashboard (chamado no
// topo de js/admin.js): confirma sessão + role admin, ou manda de volta
// pro login. Alguém pode ter salvo a URL do dashboard direto nos
// favoritos — essa checagem vale a cada carregamento, não só uma vez.
async function requireAdminSession() {
  const { data: { session } } = await client.auth.getSession();
  if (!session?.user) {
    window.location.replace("index.html");
    return null;
  }
  const isAdmin = await checkIsAdmin(session.user.id);
  if (!isAdmin) {
    await client.auth.signOut();
    window.location.replace("index.html");
    return null;
  }
  return session.user;
}

(function initLogoutButton() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (!logoutBtn) return;
  logoutBtn.addEventListener("click", async () => {
    await client.auth.signOut();
    window.location.replace("index.html");
  });
})();
