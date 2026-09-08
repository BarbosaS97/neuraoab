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
// Login por e-mail+senha (Google saiu de uso — causava um bug real: o
// retorno do OAuth só promovia a role "professor" se voltasse pra ESTA
// página, e se o redirectTo não estivesse cadastrado certinho no painel do
// Supabase, o Google devolvia pra landing, que logava a pessoa como aluno.
// Senha é síncrono, sem round-trip por provedor externo — essa classe de
// bug não existe mais aqui). Quem é autorizado a entrar:
//   1. Já tem profiles.role_id = "professor"/"admin" (fluxo antigo de
//      convite pelo Portal Mestre) — checkIsProfessor já resolve, sem
//      nenhuma chamada extra.
//   2. Ou o e-mail está na allowlist "professores_autorizados" (Portal
//      Mestre) — checado pela Edge Function professor-auth-check, que
//      também promove role_id pra "professor" na hora (client não pode
//      fazer isso direto: protect_profile_privileged_fields,
//      schema_professor_portal.sql, só libera esse UPDATE pra admin ou
//      service_role). Não liga como a pessoa autenticou, só o e-mail.
// Quem não é nenhum dos dois vê a tela "Acesso Restrito" (#restrictedView,
// ver js/planos-restrito.js) em vez de ser deslogado — a sessão continua
// válida, só não abre o dashboard.
(function initLoginPage() {
  const form = document.getElementById("loginForm");
  if (!form) return; // esta pagina nao e' a de login

  const emailInput = document.getElementById("loginEmail");
  const passwordInput = document.getElementById("loginPassword");
  const password2Field = document.getElementById("loginPassword2Field");
  const password2Input = document.getElementById("loginPassword2");
  const submitBtn = document.getElementById("loginSubmitBtn");
  const toggleModeBtn = document.getElementById("loginToggleModeBtn");
  const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
  const loginSub = document.getElementById("loginSub");
  const errorEl = document.getElementById("loginError");
  const loginCard = document.getElementById("loginCard");
  const restrictedView = document.getElementById("restrictedView");
  const restrictedLogoutBtn = document.getElementById("restrictedLogoutBtn");

  let resolved = false; // evita reprocessar a mesma sessão duas vezes
  let mode = "login"; // "login" | "signup"

  function showMessage(message, kind) {
    errorEl.textContent = message;
    errorEl.className = "login-error show" + (kind === "info" ? " info" : "");
  }
  function clearMessage() {
    errorEl.textContent = "";
    errorEl.className = "login-error";
  }

  function setMode(next) {
    mode = next;
    clearMessage();
    const isSignup = mode === "signup";
    password2Field.hidden = !isSignup;
    password2Input.required = isSignup;
    submitBtn.textContent = isSignup ? "Criar conta" : "Entrar";
    toggleModeBtn.textContent = isSignup ? "Já tem conta? Entrar" : "Primeiro acesso? Criar conta";
    forgotPasswordBtn.hidden = isSignup;
    loginSub.textContent = isSignup
      ? "Só entra quem o Portal Mestre já autorizou por e-mail."
      : "Acesso restrito a professores autorizados";
  }

  function showLoginCard() {
    loginCard.hidden = false;
    restrictedView.hidden = true;
  }
  function showRestrictedView() {
    loginCard.hidden = true;
    restrictedView.hidden = false;
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
  }

  toggleModeBtn.addEventListener("click", () => {
    setMode(mode === "login" ? "signup" : "login");
  });

  // Não confirma nem nega se o e-mail existe (mesmo cuidado padrão desse
  // tipo de fluxo) — sempre mostra a mesma mensagem, exista conta ou não.
  // Serve tanto pra quem esqueceu a senha quanto pra quem só tinha logado
  // com Google antes (nunca teve senha nenhuma na conta).
  forgotPasswordBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    if (!email) {
      showMessage("Digite seu e-mail acima primeiro.");
      return;
    }
    forgotPasswordBtn.disabled = true;
    // IMPORTANTE (config do Supabase, não é código): esta URL precisa estar
    // cadastrada em Authentication > URL Configuration > Redirect URLs, ou
    // o GoTrue ignora "redirectTo" e o link do e-mail volta pro Site URL
    // padrão do projeto em vez de cair em definir-senha.html.
    await client.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/professor/definir-senha.html",
    });
    forgotPasswordBtn.disabled = false;
    showMessage("Se esse e-mail tiver conta, enviamos um link pra redefinir a senha.", "info");
  });

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    clearMessage();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (mode === "signup") {
      const password2 = password2Input.value;
      if (password.length < 8) {
        showMessage("A senha precisa ter pelo menos 8 caracteres.");
        return;
      }
      if (password !== password2) {
        showMessage("As senhas não coincidem.");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Criando conta...";

      // IMPORTANTE: mesmo aviso do resetPasswordForEmail acima — esta URL
      // (a própria página) também precisa estar na allowlist de Redirect
      // URLs do Supabase, senão o link de confirmação de e-mail cai no
      // Site URL padrão em vez de voltar aqui.
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin + window.location.pathname },
      });

      submitBtn.disabled = false;
      if (error) {
        submitBtn.textContent = "Criar conta";
        const jaCadastrado = /already registered|already exists|user already/i.test(error.message || "");
        showMessage(jaCadastrado ? "Este e-mail já tem conta. Tente entrar em vez de cadastrar." : (error.message || "Não foi possível criar a conta."));
        return;
      }

      if (!data?.session) {
        // "Confirm email" ligado no projeto — conta criada, mas sem sessão
        // até confirmar. Nada mais a fazer nesta aba agora.
        submitBtn.textContent = "Criar conta";
        showMessage("Conta criada! Confira seu e-mail e clique no link de confirmação pra entrar.", "info");
        return;
      }

      submitBtn.textContent = "Criar conta";
      await handleSession(data.session);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Entrando...";
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    submitBtn.disabled = false;
    submitBtn.textContent = "Entrar";

    if (error || !data?.session) {
      showMessage("E-mail ou senha inválidos.");
      return;
    }

    await handleSession(data.session);
  });

  // Pega a sessão estabelecida sozinha pelo supabase-js quando a página
  // carrega com um link mágico na URL (ex.: confirmação de e-mail depois
  // do "Criar conta", ver emailRedirectTo acima) — sem OAuth não tem mais
  // flag de sessionStorage pra filtrar "essa sessão era esperada": qualquer
  // sessão que aparecer aqui já é motivo pra checar acesso, e o guard
  // `resolved` acima evita processar a mesma sessão duas vezes (ex.: se
  // isso disparar de novo logo depois de um signIn/signUp pelo formulário).
  client.auth.onAuthStateChange((_event, session) => {
    if (session?.user) handleSession(session);
  });

  // Visita direta com uma sessão já existente (não passou pelo formulário
  // agora) — ex.: quem já foi autorizado antes e só reabre index.html.
  (async () => {
    const { data: { session } } = await client.auth.getSession();
    if (session?.user) await handleSession(session);
  })();

  if (restrictedLogoutBtn) {
    restrictedLogoutBtn.addEventListener("click", async () => {
      await client.auth.signOut();
      resolved = false;
      setMode("login");
      showLoginCard();
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
