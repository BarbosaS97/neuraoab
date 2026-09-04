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
//
// Login por senha saiu de uso — vira só "Continuar com Google" (mesmo
// mecanismo de index.html, a landing: overlay "oauth-returning" +
// sessionStorage["neuraoab-oauth-pending"] + onAuthStateChange guardado por
// essa flag, ver comentários lá). Quem é autorizado a entrar:
//   1. Já tem profiles.role_id = "professor"/"admin" (fluxo antigo de
//      convite pelo Portal Mestre) — checkIsProfessor já resolve, sem
//      nenhuma chamada extra.
//   2. Ou o e-mail está na allowlist "professores_autorizados" (Portal
//      Mestre, painel novo) — checado pela Edge Function
//      professor-auth-check, que também promove role_id pra "professor" na
//      hora (client não pode fazer isso direto: protect_profile_
//      privileged_fields, schema_professor_portal.sql, só libera esse
//      UPDATE pra admin ou service_role).
// Quem não é nenhum dos dois vê a tela "Acesso Restrito" (#restrictedView,
// ver js/planos-restrito.js) em vez de ser redirecionado/deslogado — a
// sessão do Google continua válida, só não abre o dashboard.
(function initLoginPage() {
  const googleBtn = document.getElementById("googleLoginBtn");
  if (!googleBtn) return; // esta pagina nao e' a de login

  const errorEl = document.getElementById("loginError");
  const loginCard = document.getElementById("loginCard");
  const restrictedView = document.getElementById("restrictedView");
  const restrictedLogoutBtn = document.getElementById("restrictedLogoutBtn");

  const OAUTH_PENDING_KEY = "neuraoab-oauth-pending";
  let resolved = false; // evita reprocessar a mesma sessão duas vezes (getSession inicial + onAuthStateChange)

  function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.add("show");
  }

  // Desfaz o "esconde a página inteira" do <script> no <head> — chamado em
  // todo caminho que NÃO termina em redirect de verdade (deu erro, ou o
  // timeout de segurança abaixo bateu), senão a pessoa ficava presa numa
  // tela em branco.
  function revealPage() {
    document.documentElement.classList.remove("oauth-returning");
  }

  function showLoginCard() {
    loginCard.hidden = false;
    restrictedView.hidden = true;
  }
  function showRestrictedView() {
    loginCard.hidden = true;
    restrictedView.hidden = false;
  }

  // Rede de segurança: se a página carregou escondida (voltou do Google)
  // mas nenhuma sessão válida chegou a tempo — aba fechada no meio do
  // caminho, usuário cancelou no Google, erro silencioso do GoTrue.
  if (document.documentElement.classList.contains("oauth-returning")) {
    setTimeout(() => {
      if (document.documentElement.classList.contains("oauth-returning")) {
        sessionStorage.removeItem(OAUTH_PENDING_KEY);
        revealPage();
      }
    }, 6000);
  }

  async function resolveAccess(userId) {
    if (await checkIsProfessor(userId)) return true;
    try {
      const { data, error } = await client.functions.invoke("professor-auth-check", { body: {} });
      return !error && data?.authorized === true;
    } catch {
      return false;
    }
  }

  async function handleSession(session) {
    if (!session?.user || resolved) return;
    resolved = true;

    const authorized = await resolveAccess(session.user.id);
    if (authorized) {
      window.location.replace("dashboard.html");
      return;
    }
    showRestrictedView();
    revealPage();
  }

  googleBtn.addEventListener("click", async () => {
    googleBtn.disabled = true;
    sessionStorage.setItem(OAUTH_PENDING_KEY, "1");
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) {
      sessionStorage.removeItem(OAUTH_PENDING_KEY);
      googleBtn.disabled = false;
      showError("Não foi possível iniciar o login com Google. Tente novamente.");
    }
    // Sucesso: o navegador já está sendo redirecionado pro Google, nada mais
    // a fazer aqui — o retorno é tratado pelo onAuthStateChange abaixo,
    // quando a página recarregar de volta.
  });

  // Volta do redirect do Google com sessão pronta — só processa se essa
  // sessão veio de um login iniciado por ESTA aba (OAUTH_PENDING_KEY): sem
  // essa checagem, qualquer visitante que já estivesse logado seria
  // reprocessado só por a aba existir.
  client.auth.onAuthStateChange((_event, session) => {
    if (!session?.user || sessionStorage.getItem(OAUTH_PENDING_KEY) !== "1") return;
    sessionStorage.removeItem(OAUTH_PENDING_KEY);
    handleSession(session);
  });

  // Visita direta com uma sessão já existente (não passou pelo botão agora)
  // — ex.: quem já foi autorizado antes e só reabre index.html.
  (async () => {
    const { data: { session } } = await client.auth.getSession();
    if (session?.user) {
      await handleSession(session);
    } else {
      revealPage();
    }
  })();

  if (restrictedLogoutBtn) {
    restrictedLogoutBtn.addEventListener("click", async () => {
      await client.auth.signOut();
      resolved = false;
      showLoginCard();
      googleBtn.disabled = false;
    });
  }
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

// Marca o link "Turmas" da sidebar como ativo em toda página que a tem —
// único item do menu hoje (a aba "Análises" foi removida por ficar
// redundante com o dashboard de turma.html), incluindo turma.html/
// aluno.html (páginas de detalhe abertas a partir de uma turma, sem link
// próprio na sidebar).
(function highlightActiveSidebarLink() {
  const navLinks = document.querySelectorAll(".sidebar-nav a");
  navLinks.forEach((a) => {
    a.classList.toggle("active", a.getAttribute("href") === "dashboard.html");
  });
})();
