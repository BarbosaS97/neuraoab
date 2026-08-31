// NeuraOAB — Portal do Professor — detalhe do aluno: 1ª fase (resumo) + 2ª
// fase (peças/questões com nota e feedback da IA, critério a critério).
//
// Só leituras diretas via client.from(...).select(...) — nenhuma Edge
// Function aqui. Quem garante que este professor só vê os PRÓPRIOS alunos
// (e não os de outro professor) são as policies de RLS criadas em
// supabase/schema_professor_portal.sql (oab_respostas_select,
// oab2_tentativas_select_auth, oab2_respostas_select_auth — todas com um
// exists(...) checando profiles.professor_id = auth.uid()). Se o id da URL
// for de um aluno de outro professor, as queries abaixo simplesmente
// devolvem zero linhas (não é uma tela de erro, é uma tela vazia).

function fmtValor(n) {
  if (n === null || n === undefined) return "—";
  return (Number(n) || 0).toFixed(2).replace(".", ",");
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return "—";
  }
}

function notaClass(nota, valorMax) {
  if (nota == null) return "";
  if (nota <= 0) return "zero";
  if (valorMax != null && nota >= valorMax - 0.005) return "full";
  return "";
}

function getStudentId() {
  return new URLSearchParams(window.location.search).get("id");
}

async function loadStudentHeader(studentId) {
  // "turmas!turma_id(nome)" — embed via FK profiles.turma_id -> turmas.id,
  // só pro breadcrumb (se o aluno não tiver turma, student.turmas vem
  // null). O hint "!turma_id" é OBRIGATÓRIO aqui: profiles e turmas têm
  // DUAS relações (profiles.turma_id -> turmas.id E turmas.professor_id ->
  // profiles.id), então "turmas(nome)" sem hint é ambíguo pro PostgREST —
  // ele responde com erro HTTP 300, que quebra o tratamento de erro do
  // supabase-js sem mensagem nenhuma (é isso que travava a tela em
  // "Carregando..." pra sempre, sem erro visível no console nem na tela).
  const { data: student, error } = await client
    .from("profiles")
    .select("id, nome, email, ativo, created_at, turma_id, turmas!turma_id(nome)")
    .eq("id", studentId)
    .maybeSingle();

  if (error || !student) {
    document.getElementById("studentName").textContent = "Aluno não encontrado";
    document.getElementById("studentMeta").textContent =
      "Este aluno não existe ou não pertence à sua turma.";
    return null;
  }

  document.getElementById("studentName").textContent = student.nome || "(convite pendente)";
  const statusLabel = student.ativo ? "Ativo" : "Inativo";
  document.getElementById("studentMeta").textContent =
    `${student.email || "—"} · Cadastrado em ${fmtDate(student.created_at)} · ${statusLabel}`;

  // Breadcrumb volta pra turma de onde o aluno veio (ou "Sem turma") em vez
  // de sempre pra lista geral — mantém a navegação consistente com o resto
  // do portal, que agora organiza tudo por turma.
  const turmaHref = `turma.html?id=${encodeURIComponent(student.turma_id || "none")}`;
  const breadcrumbTurma = document.getElementById("breadcrumbTurma");
  breadcrumbTurma.href = turmaHref;
  breadcrumbTurma.textContent = student.turmas?.nome || "Sem turma";
  document.getElementById("breadcrumbAluno").textContent = student.nome || "(convite pendente)";

  return student;
}

async function loadFase1Summary(studentId) {
  const { data, error } = await client
    .from("oab_respostas")
    .select("correct")
    .eq("user_id", studentId);

  const statEl = document.getElementById("statFase1");
  if (error || !data) {
    statEl.textContent = "—";
    return;
  }
  const total = data.length;
  const acertos = data.filter((r) => r.correct).length;
  statEl.textContent = total === 0 ? "Nenhuma resposta ainda" : `${acertos} / ${total}`;
}

function renderCriterios(criterios) {
  if (!Array.isArray(criterios) || criterios.length === 0) return null;
  const wrap = document.createElement("div");
  criterios.forEach((c) => {
    const item = document.createElement("div");
    item.className = "criterio-item";

    const head = document.createElement("div");
    head.className = "criterio-head";
    const label = document.createElement("span");
    label.textContent = c.rotulo ? `Critério ${c.rotulo}` : "Critério";
    // Critério anulado pela Coordenação do Exame: pontuação máxima já foi
    // concedida (ver supabase/functions/corretor-2fase/index.ts), mas exibir
    // como uma nota "cheia" comum confundiria com um acerto normal.
    const nota = document.createElement("span");
    if (c.anulado) {
      nota.className = "anulado";
      nota.textContent = "Anulado";
    } else {
      nota.className = notaClass(c.pontuacao_obtida, c.pontuacao_maxima);
      nota.textContent = `${fmtValor(c.pontuacao_obtida)} / ${fmtValor(c.pontuacao_maxima)}`;
    }
    head.append(label, nota);
    item.appendChild(head);

    if (c.justificativa) {
      const just = document.createElement("p");
      just.className = "criterio-just";
      just.textContent = c.justificativa;
      item.appendChild(just);
    }

    wrap.appendChild(item);
  });
  return wrap;
}

function itemLabel(item) {
  if (!item) return "Item";
  return item.tipo === "peca" ? "Peça profissional" : `Questão ${item.numero}`;
}

async function loadFase2(studentId) {
  const listEl = document.getElementById("fase2List");
  const statEl = document.getElementById("statFase2");

  const { data: tentativas, error } = await client
    .from("oab2_tentativas")
    .select("id, status, nota_total, started_at, finished_at, oab2_provas(exam_number, area, valor_total)")
    .eq("user_id", studentId)
    .order("started_at", { ascending: false });

  if (error || !tentativas || tentativas.length === 0) {
    statEl.textContent = "0";
    listEl.innerHTML = "";
    const empty = document.createElement("p");
    empty.className = "field-hint";
    empty.textContent = "Nenhum caderno da 2ª fase respondido ainda.";
    listEl.appendChild(empty);
    return;
  }

  statEl.textContent = String(tentativas.length);
  listEl.innerHTML = "";

  for (const tentativa of tentativas) {
    const card = document.createElement("div");
    card.className = "tentativa-card";

    const head = document.createElement("div");
    head.className = "tentativa-head";
    const prova = tentativa.oab2_provas;
    const title = document.createElement("h3");
    title.textContent = prova ? `Exame ${prova.exam_number} — ${prova.area}` : "Caderno";
    const statusBadge = document.createElement("span");
    const statusLabels = { em_andamento: "Em andamento", corrigindo: "Corrigindo", corrigida: "Corrigida" };
    statusBadge.className = "badge " + (tentativa.status === "corrigida" ? "ativo" : "inativo");
    statusBadge.textContent = statusLabels[tentativa.status] || tentativa.status;
    head.append(title, statusBadge);
    card.appendChild(head);

    const meta = document.createElement("p");
    meta.className = "field-hint";
    const valorMax = prova?.valor_total;
    meta.textContent = tentativa.nota_total != null
      ? `Nota total: ${fmtValor(tentativa.nota_total)} / ${fmtValor(valorMax)} · Iniciado em ${fmtDate(tentativa.started_at)}`
      : `Ainda não corrigida · Iniciado em ${fmtDate(tentativa.started_at)}`;
    card.appendChild(meta);

    const { data: respostas } = await client
      .from("oab2_respostas")
      .select("id, texto_resposta, nota, feedback_geral, feedback_criterios, alertas_juridicos, oab2_itens(tipo, numero, ordem, valor_total)")
      .eq("tentativa_id", tentativa.id)
      .order("id");

    (respostas || [])
      .sort((a, b) => (a.oab2_itens?.ordem ?? 0) - (b.oab2_itens?.ordem ?? 0))
      .forEach((r) => {
        const answer = document.createElement("div");
        answer.className = "item-answer";

        const answerHead = document.createElement("div");
        answerHead.className = "tentativa-head";
        const answerTitle = document.createElement("strong");
        answerTitle.textContent = itemLabel(r.oab2_itens);
        const answerNota = document.createElement("span");
        answerNota.className = notaClass(r.nota, r.oab2_itens?.valor_total);
        answerNota.textContent = `${fmtValor(r.nota)} / ${fmtValor(r.oab2_itens?.valor_total)}`;
        answerHead.append(answerTitle, answerNota);
        answer.appendChild(answerHead);

        if (r.feedback_geral) {
          const feedback = document.createElement("p");
          feedback.className = "criterio-just";
          feedback.textContent = r.feedback_geral;
          answer.appendChild(feedback);
        }

        const criteriosEl = renderCriterios(r.feedback_criterios);
        if (criteriosEl) answer.appendChild(criteriosEl);

        // "Camada 2": observações jurídicas/formais que não afetam a nota
        // (ver alertas_juridicos em supabase/functions/corretor-2fase/
        // index.ts) — separadas visualmente dos critérios oficiais.
        if (Array.isArray(r.alertas_juridicos) && r.alertas_juridicos.length > 0) {
          const alertasBox = document.createElement("div");
          alertasBox.className = "alertas-juridicos";
          const alertasTitulo = document.createElement("div");
          alertasTitulo.className = "alertas-juridicos-titulo";
          alertasTitulo.textContent = "Observações adicionais (não afetam a nota)";
          alertasBox.appendChild(alertasTitulo);
          r.alertas_juridicos.forEach((texto) => {
            const p = document.createElement("p");
            p.className = "alertas-juridicos-item";
            p.textContent = texto;
            alertasBox.appendChild(p);
          });
          answer.appendChild(alertasBox);
        }

        const textoWrap = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = "Ver resposta do aluno";
        summary.style.cursor = "pointer";
        summary.style.fontSize = "12.5px";
        summary.style.color = "var(--text-dim)";
        const texto = document.createElement("p");
        texto.className = "item-answer-text";
        texto.textContent = r.texto_resposta || "(sem resposta)";
        textoWrap.append(summary, texto);
        answer.appendChild(textoWrap);

        card.appendChild(answer);
      });

    listEl.appendChild(card);
  }
}

async function init() {
  const user = await requireProfessorSession();
  if (!user) return;

  const studentId = getStudentId();
  if (!studentId) {
    document.getElementById("studentName").textContent = "Aluno não encontrado";
    document.getElementById("studentMeta").textContent = "Nenhum id de aluno informado na URL.";
    return;
  }

  const student = await loadStudentHeader(studentId);
  if (!student) return;

  await Promise.all([loadFase1Summary(studentId), loadFase2(studentId)]);
}

// Rede de segurança: se qualquer coisa aqui lançar uma exceção inesperada
// (ex.: o mesmo tipo de erro de embed ambíguo do Supabase que causou a
// tela travada em "Carregando..." pra sempre, sem mensagem nenhuma), pelo
// menos mostra um erro visível em vez de ficar travado silenciosamente.
init().catch((err) => {
  console.error("Falha ao carregar detalhes do aluno:", err);
  const nameEl = document.getElementById("studentName");
  const metaEl = document.getElementById("studentMeta");
  if (nameEl) nameEl.textContent = "Não foi possível carregar este aluno";
  if (metaEl) metaEl.textContent = `Ocorreu um erro inesperado: ${err.message || err}`;
});
