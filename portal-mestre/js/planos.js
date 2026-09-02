// NeuraOAB — Portal Mestre — painel "Planos": limites de uso (plan_limits,
// ver supabase/schema_planos.sql) e troca manual do plano de um aluno
// específico (profiles.plano), pra testar a experiência de Básico/Pro antes
// da integração com o Asaas.
//
// Arquivo separado de admin.js de propósito (mesmo espírito de auth.js vs.
// admin.js): um concern por arquivo. requireAdminSession() é chamada de
// novo aqui (mesma função já usada por admin.js) — só leitura, sem efeito
// colateral, então rodar duas vezes na mesma carga de página é inofensivo.

const PLAN_LABELS = { gratuito: "Grátis", basico: "Básico", pro: "Pro" };
const PLAN_ORDER = ["gratuito", "basico", "pro"];

const planLimitsTableBody = document.getElementById("planLimitsTableBody");
const planLimitsMsg = document.getElementById("planLimitsMsg");

const studentPlanForm = document.getElementById("studentPlanForm");
const studentPlanEmail = document.getElementById("studentPlanEmail");
const studentPlanSearchBtn = document.getElementById("studentPlanSearchBtn");
const studentPlanResult = document.getElementById("studentPlanResult");
const studentPlanNome = document.getElementById("studentPlanNome");
const studentPlanEmailLabel = document.getElementById("studentPlanEmailLabel");
const studentPlanSelect = document.getElementById("studentPlanSelect");
const studentPlanSaveBtn = document.getElementById("studentPlanSaveBtn");
const studentPlanMsg = document.getElementById("studentPlanMsg");

function showMsg(el, text, kind) {
  el.textContent = text;
  el.className = `modal-msg show ${kind}`;
}

function clearMsg(el) {
  el.className = "modal-msg";
  el.textContent = "";
}

// -------------------------------------------------------------- Limites

// Um <input type="number"> vazio devolve "" — converte pra null (ilimitado,
// ver plan_limits.questoes_por_dia etc.); qualquer outro valor vira inteiro
// não-negativo (min="0" no HTML já ajuda, isto é só a segunda linha de
// defesa no JS).
function parseLimitInput(input) {
  const raw = input.value.trim();
  if (raw === "") return null;
  const n = Math.max(0, Math.floor(Number(raw)));
  return Number.isFinite(n) ? n : null;
}

function buildPlanLimitsRow(row) {
  const tr = document.createElement("tr");
  tr.dataset.plano = row.plano;

  const nomeTd = document.createElement("td");
  nomeTd.textContent = PLAN_LABELS[row.plano] || row.plano;
  tr.appendChild(nomeTd);

  const questoesInput = document.createElement("input");
  questoesInput.type = "number";
  questoesInput.min = "0";
  questoesInput.className = "plan-limit-input";
  questoesInput.placeholder = "Ilimitado";
  questoesInput.value = row.questoes_por_dia ?? "";
  const questoesTd = document.createElement("td");
  questoesTd.appendChild(questoesInput);
  tr.appendChild(questoesTd);

  const simuladosInput = document.createElement("input");
  simuladosInput.type = "number";
  simuladosInput.min = "0";
  simuladosInput.className = "plan-limit-input";
  simuladosInput.placeholder = "Ilimitado";
  simuladosInput.value = row.simulados_por_mes ?? "";
  const simuladosTd = document.createElement("td");
  simuladosTd.appendChild(simuladosInput);
  tr.appendChild(simuladosTd);

  const chatInput = document.createElement("input");
  chatInput.type = "number";
  chatInput.min = "0";
  chatInput.className = "plan-limit-input";
  chatInput.placeholder = "Ilimitado";
  chatInput.value = row.chat_mensagens_por_mes ?? "";
  const chatTd = document.createElement("td");
  chatTd.appendChild(chatInput);
  tr.appendChild(chatTd);

  const iaCheck = document.createElement("input");
  iaCheck.type = "checkbox";
  iaCheck.className = "plan-limit-check";
  iaCheck.checked = !!row.estatisticas_ia;
  const iaTd = document.createElement("td");
  iaTd.appendChild(iaCheck);
  tr.appendChild(iaTd);

  const faseCheck = document.createElement("input");
  faseCheck.type = "checkbox";
  faseCheck.className = "plan-limit-check";
  faseCheck.checked = !!row.segunda_fase;
  const faseTd = document.createElement("td");
  faseTd.appendChild(faseCheck);
  tr.appendChild(faseTd);

  const actionsTd = document.createElement("td");
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "Salvar";
  saveBtn.addEventListener("click", async () => {
    clearMsg(planLimitsMsg);
    saveBtn.disabled = true;
    saveBtn.textContent = "Salvando...";
    const { error } = await client
      .from("plan_limits")
      .update({
        questoes_por_dia: parseLimitInput(questoesInput),
        simulados_por_mes: parseLimitInput(simuladosInput),
        chat_mensagens_por_mes: parseLimitInput(chatInput),
        estatisticas_ia: iaCheck.checked,
        segunda_fase: faseCheck.checked,
      })
      .eq("plano", row.plano);
    saveBtn.disabled = false;
    saveBtn.textContent = "Salvar";
    if (error) {
      showMsg(planLimitsMsg, `Falha ao salvar ${PLAN_LABELS[row.plano] || row.plano}: ${error.message}`, "err");
      return;
    }
    showMsg(planLimitsMsg, `Limites de ${PLAN_LABELS[row.plano] || row.plano} salvos — já valem pro próximo uso.`, "ok");
  });
  actionsTd.appendChild(saveBtn);
  tr.appendChild(actionsTd);

  return tr;
}

async function loadPlanLimits() {
  const { data, error } = await client.from("plan_limits").select("*");
  planLimitsTableBody.innerHTML = "";

  if (error || !data) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    const td = document.createElement("td");
    td.colSpan = 7;
    td.textContent = "Não foi possível carregar os planos — rode supabase/schema_planos.sql.";
    tr.appendChild(td);
    planLimitsTableBody.appendChild(tr);
    return;
  }

  const byPlano = new Map(data.map((row) => [row.plano, row]));
  PLAN_ORDER.filter((p) => byPlano.has(p)).forEach((p) => {
    planLimitsTableBody.appendChild(buildPlanLimitsRow(byPlano.get(p)));
  });
}

// ---------------------------------------------------- Plano de um aluno

let foundStudentId = null;

studentPlanForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  clearMsg(studentPlanMsg);
  studentPlanResult.hidden = true;
  foundStudentId = null;

  const email = studentPlanEmail.value.trim().toLowerCase();
  if (!email) return;

  studentPlanSearchBtn.disabled = true;
  studentPlanSearchBtn.textContent = "Buscando...";

  const { data, error } = await client
    .from("profiles")
    .select("id, nome, email, plano")
    .eq("email", email)
    .maybeSingle();

  studentPlanSearchBtn.disabled = false;
  studentPlanSearchBtn.textContent = "Buscar";

  if (error) {
    showMsg(studentPlanMsg, `Erro na busca: ${error.message}`, "err");
    return;
  }
  if (!data) {
    showMsg(studentPlanMsg, "Nenhuma conta encontrada com esse e-mail.", "err");
    return;
  }

  foundStudentId = data.id;
  studentPlanNome.textContent = data.nome || "(sem nome cadastrado)";
  studentPlanEmailLabel.textContent = data.email || email;
  studentPlanSelect.value = PLAN_ORDER.includes(data.plano) ? data.plano : "gratuito";
  studentPlanResult.hidden = false;
});

studentPlanSaveBtn.addEventListener("click", async () => {
  if (!foundStudentId) return;
  clearMsg(studentPlanMsg);
  studentPlanSaveBtn.disabled = true;
  studentPlanSaveBtn.textContent = "Salvando...";

  // profiles.plano só é editável por admin (gatilho
  // protect_profile_privileged_fields, ver supabase/schema_aluno_avulso.sql)
  // — funciona aqui porque quem chama já passou por requireAdminSession().
  const { error } = await client
    .from("profiles")
    .update({ plano: studentPlanSelect.value })
    .eq("id", foundStudentId);

  studentPlanSaveBtn.disabled = false;
  studentPlanSaveBtn.textContent = "Salvar";

  if (error) {
    showMsg(studentPlanMsg, `Falha ao salvar: ${error.message}`, "err");
    return;
  }
  showMsg(studentPlanMsg, `Plano atualizado para ${PLAN_LABELS[studentPlanSelect.value]}.`, "ok");
});

// -------------------------------------------------------------------- Init

async function initPlanos() {
  const user = await requireAdminSession();
  if (!user) return; // requireAdminSession já redirecionou pro login
  await loadPlanLimits();
}

initPlanos();
