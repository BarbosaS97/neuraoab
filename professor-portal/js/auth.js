// NeuraOAB — Portal do Professor — autenticação.
//
// Mesmo padrão de portal-mestre/js/auth.js: um arquivo só, carregado tanto
// por index.html (login) quanto por dashboard.html/aluno.html (guarda de
// sessão + logout) — só que aqui a checagem é por role "professor" (ou
// "admin", que também pode entrar, mesmo padrão de requireProfessor na
// Edge Function professor-portal), não "admin".

async function checkIsProfessor(userId) {
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

  return role.name === "professor" || role.name === "admin";
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

  (async () => {
    const { data: { session } } = await client.auth.getSession();
    if (session?.user && (await checkIsProfessor(session.user.id))) {
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

    const isProfessor = await checkIsProfessor(data.user.id);
    if (!isProfessor) {
      await client.auth.signOut();
      setLoading(false);
      showError("Acesso negado: esta conta não tem permissão de professor.");
      return;
    }

    window.location.replace("dashboard.html");
  });
})();

// ------------------------------------------------- dashboard.html / aluno.html

async function requireProfessorSession() {
  const { data: { session } } = await client.auth.getSession();
  if (!session?.user) {
    window.location.replace("index.html");
    return null;
  }
  const isProfessor = await checkIsProfessor(session.user.id);
  if (!isProfessor) {
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

// Marca o link ativo da sidebar a partir da URL de verdade, em vez de cada
// HTML fixar "class=active" na mão — turma.html e aluno.html não têm link
// próprio na sidebar (são páginas de detalhe abertas a partir de uma
// turma), então contam como "Turmas" ativo, não "Análises".
(function highlightActiveSidebarLink() {
  const navLinks = document.querySelectorAll(".sidebar-nav a");
  if (navLinks.length === 0) return; // index.html (login) não tem sidebar

  const page = window.location.pathname.split("/").pop();
  const activeHref = page === "analises.html" ? "analises.html" : "dashboard.html";
  navLinks.forEach((a) => {
    a.classList.toggle("active", a.getAttribute("href") === activeHref);
  });
})();
