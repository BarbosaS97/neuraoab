// NeuraOAB — Portal Mestre — painel "Alunos": lista TODOS os alunos
// cadastrados (avulsos e convidados por professor), com busca por nome/
// e-mail, filtro por plano, e troca de plano direto na tabela.
//
// Reaproveita showMsg/clearMsg de js/planos.js (mesmo escopo global de
// script clássico, carregado antes deste — ver ordem em dashboard.html) em
// vez de duplicar essas duas funções.
//
// profiles.plano só é editável por admin/service_role (gatilho
// protect_profile_privileged_fields, ver supabase/schema_aluno_avulso.sql)
// — o UPDATE direto abaixo funciona porque quem chama já passou por
// requireAdminSession(). Mesma mecânica que js/planos.js já usa pra "testar
// plano de um aluno" (aqui só numa lista completa, com busca, em vez de um
// aluno de cada vez).

const PLAN_LABELS_ALUNOS = { gratuito: "Grátis", basico: "Básico", pro: "Pro" };
const STUDENTS_PAGE_SIZE = 50;

let alunoRoleId = null;
let studentsOffset = 0;
let studentsHasMore = true;
let studentsSearchTerm = "";
let studentsPlanoFiltro = "";

const statTotalAlunosEl = document.getElementById("statTotalAlunos");
const statAlunosPagosEl = document.getElementById("statAlunosPagos");
const studentsSearchInput = document.getElementById("studentsSearch");
const studentsPlanFilterSelect = document.getElementById("studentsPlanFilter");
const studentsTableBodyEl = document.getElementById("studentsTableBody");
const studentsMsgEl = document.getElementById("studentsMsg");
const studentsLoadMoreBtn = document.getElementById("studentsLoadMoreBtn");

function fmtDateAluno(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return "—";
  }
}

function showEmptyStudentsRow(text) {
  studentsTableBodyEl.innerHTML = "";
  const tr = document.createElement("tr");
  tr.className = "empty-row";
  const td = document.createElement("td");
  td.colSpan = 6;
  td.textContent = text;
  tr.appendChild(td);
  studentsTableBodyEl.appendChild(tr);
}

async function loadStudentStats() {
  if (!alunoRoleId) return;

  const { count: total } = await client
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role_id", alunoRoleId);
  statTotalAlunosEl.textContent = total ?? "—";

  const { count: pagos } = await client
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role_id", alunoRoleId)
    .neq("plano", "gratuito");
  statAlunosPagosEl.textContent = pagos ?? "—";
}

function buildStudentRow(student) {
  const tr = document.createElement("tr");

  // Nota: só existe linha em "profiles" pra quem já ACEITOU um convite (ou
  // é avulso) — ver supabase/functions/aluno-portal/index.ts. Sem nome
  // aqui não é mais sinal de "convite pendente" (isso agora mora só na
  // tabela "convites", visível pro professor em turma.html — Portal Mestre
  // não lista convite pendente nenhum), só de conta que nunca preencheu o
  // próprio nome (ex.: primeiro login com Google sem nome no perfil).
  const nomeTd = document.createElement("td");
  nomeTd.textContent = student.nome || "(sem nome)";
  tr.appendChild(nomeTd);

  const emailTd = document.createElement("td");
  emailTd.textContent = student.email || "—";
  tr.appendChild(emailTd);

  const tipoTd = document.createElement("td");
  tipoTd.textContent = student.is_avulso ? "Avulso" : "Convidado";
  tr.appendChild(tipoTd);

  const planoTd = document.createElement("td");
  const planoSelect = document.createElement("select");
  planoSelect.className = "student-plano-select";
  ["gratuito", "basico", "pro"].forEach((plano) => {
    const opt = document.createElement("option");
    opt.value = plano;
    opt.textContent = PLAN_LABELS_ALUNOS[plano];
    if (plano === student.plano) opt.selected = true;
    planoSelect.appendChild(opt);
  });
  planoSelect.addEventListener("change", async () => {
    const novoPlano = planoSelect.value;
    const planoAnterior = student.plano;
    planoSelect.disabled = true;
    clearMsg(studentsMsgEl);

    // .select().maybeSingle() de propósito, não só .update() — um UPDATE
    // bloqueado pela RLS (linha não bate com nenhuma policy) não é um erro
    // pro Supabase: ele só afeta ZERO linhas e devolve error:null do mesmo
    // jeito que um sucesso de verdade. Sem pedir a linha de volta, isso
    // aparecia aqui como "sucesso" mesmo sem ter mudado nada no banco — o
    // "falha silenciosa" que motivou este comentário.
    const { data, error } = await client
      .from("profiles")
      .update({ plano: novoPlano })
      .eq("id", student.id)
      .select("id, plano")
      .maybeSingle();

    planoSelect.disabled = false;
    const label = student.nome || student.email || "aluno";

    if (error) {
      planoSelect.value = planoAnterior; // desfaz a seleção visualmente
      showMsg(studentsMsgEl, `Falha ao mudar o plano de ${label}: ${error.message}`, "err");
      return;
    }

    if (!data || data.plano !== novoPlano) {
      // UPDATE "passou" sem erro, mas nenhuma linha voltou (ou voltou com
      // outro valor) — sinal de que a RLS bloqueou silenciosamente. Mais
      // comum quando quem está logado no Portal Mestre não é (ou deixou de
      // ser) admin de verdade em profiles.role_id.
      planoSelect.value = planoAnterior;
      showMsg(
        studentsMsgEl,
        `O plano de ${label} não foi alterado — o Supabase não confirmou a mudança (RLS?). Confira se sua conta ainda tem o papel "admin" em profiles.`,
        "err",
      );
      return;
    }

    student.plano = novoPlano;
    showMsg(studentsMsgEl, `Plano de ${label} agora é ${PLAN_LABELS_ALUNOS[novoPlano]}.`, "ok");
    loadStudentStats();
  });
  planoTd.appendChild(planoSelect);
  tr.appendChild(planoTd);

  const dateTd = document.createElement("td");
  dateTd.textContent = fmtDateAluno(student.created_at);
  tr.appendChild(dateTd);

  const statusTd = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = "badge " + (student.ativo ? "ativo" : "inativo");
  badge.textContent = student.ativo ? "Ativo" : "Inativo";
  statusTd.appendChild(badge);
  tr.appendChild(statusTd);

  return tr;
}

async function loadStudents(reset) {
  if (!alunoRoleId) return;

  if (reset) {
    studentsOffset = 0;
    studentsHasMore = true;
    studentsTableBodyEl.innerHTML = "";
  }
  if (!studentsHasMore) return;

  studentsLoadMoreBtn.disabled = true;
  studentsLoadMoreBtn.textContent = "Carregando...";
  clearMsg(studentsMsgEl);

  let query = client
    .from("profiles")
    .select("id, nome, email, plano, is_avulso, ativo, created_at")
    .eq("role_id", alunoRoleId)
    .order("created_at", { ascending: false })
    .range(studentsOffset, studentsOffset + STUDENTS_PAGE_SIZE - 1);

  // "," e "%" tem significado especial no filtro .or()/ilike do PostgREST —
  // remove antes de montar a string, pra um termo de busca digitado por
  // acaso com essses caracteres não quebrar a sintaxe do filtro (não
  // precisa disso pra segurança — RLS/parametrização já cobrem isso — só
  // pra busca não devolver um erro estranho por causa de pontuação).
  const termoSeguro = studentsSearchTerm.replace(/[,%]/g, "");
  if (termoSeguro) {
    query = query.or(`nome.ilike.%${termoSeguro}%,email.ilike.%${termoSeguro}%`);
  }
  if (studentsPlanoFiltro) {
    query = query.eq("plano", studentsPlanoFiltro);
  }

  const { data, error } = await query;

  studentsLoadMoreBtn.disabled = false;
  studentsLoadMoreBtn.textContent = "Carregar mais";

  if (error) {
    showMsg(studentsMsgEl, `Erro ao carregar alunos: ${error.message}`, "err");
    return;
  }

  const rows = data || [];

  if (reset && rows.length === 0) {
    showEmptyStudentsRow("Nenhum aluno encontrado.");
  } else {
    rows.forEach((student) => studentsTableBodyEl.appendChild(buildStudentRow(student)));
  }

  studentsOffset += rows.length;
  studentsHasMore = rows.length === STUDENTS_PAGE_SIZE;
  studentsLoadMoreBtn.hidden = !studentsHasMore;
}

// Debounce (350ms) pra não disparar uma busca a cada tecla — só depois que
// o admin para de digitar por um instante.
let studentsSearchDebounce = null;
studentsSearchInput.addEventListener("input", () => {
  clearTimeout(studentsSearchDebounce);
  studentsSearchDebounce = setTimeout(() => {
    studentsSearchTerm = studentsSearchInput.value.trim();
    loadStudents(true);
  }, 350);
});

studentsPlanFilterSelect.addEventListener("change", () => {
  studentsPlanoFiltro = studentsPlanFilterSelect.value;
  loadStudents(true);
});

studentsLoadMoreBtn.addEventListener("click", () => loadStudents(false));

async function initAlunos() {
  const user = await requireAdminSession();
  if (!user) return; // requireAdminSession já redirecionou pro login

  const { data: role } = await client.from("roles").select("id").eq("name", "aluno").maybeSingle();
  alunoRoleId = role?.id ?? null;

  if (!alunoRoleId) {
    showEmptyStudentsRow('Papel "aluno" não encontrado — rode supabase/schema_portal_mestre.sql.');
    return;
  }

  await Promise.all([loadStudentStats(), loadStudents(true)]);
}

initAlunos();
