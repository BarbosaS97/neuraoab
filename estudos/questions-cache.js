// Cache do banco de questões (oab_questions) em sessionStorage — script
// clássico compartilhado, mesmo padrão de estudos/medals.js: carrega ANTES
// de estudos.js/medalhas.js pra "loadQuestionsCache"/"saveQuestionsCache" já
// existirem quando esses scripts rodarem. simulado2fase.js não carrega este
// arquivo (não usa o banco de questões da 1ª fase).
//
// Por quê: fetchAllQuestions() busca TODAS as questões (enunciado e
// alternativas incluídos, paginado em blocos de 1000 — ver estudos.js) toda
// vez que a página carrega, mesmo voltando da 2ª fase um minuto depois. É
// de longe a busca mais pesada do init() (as outras são só algumas linhas
// da própria conta do aluno) — cachear ela é o que faz o dashboard voltar a
// aparecer na hora em vez de esperar a rede de novo. sessionStorage (não
// localStorage) de propósito: mesmo horizonte de "só na entrada de verdade
// na plataforma" já usado pra pular a splash de carregamento (ver
// hasSeenIntro em estudos.js) — expira sozinho quando a aba fecha, então
// uma questão nova importada pelo admin aparece o mais tardar na próxima
// vez que o aluno abrir uma aba nova, sem precisar de nenhuma lógica de
// invalidação manual.

const QUESTIONS_CACHE_KEY = "neuraoab-questions-cache-v1";

// Só estudos.js grava aqui (com o payload COMPLETO de fetchAllQuestions,
// enunciado/alternativas incluídos) — medalhas.js só lê, nunca escreve,
// porque só precisa de id/discipline e gravar esse subconjunto aqui
// quebraria a leitura de quem espera o payload completo (ver
// fetchQuestionDisciplines em medalhas.js).
function saveQuestionsCache(rows) {
  try {
    sessionStorage.setItem(QUESTIONS_CACHE_KEY, JSON.stringify(rows));
  } catch (e) {
    // sessionStorage indisponível (aba anônima) ou cota estourada (banco de
    // questões cresceu demais pro limite do navegador) — sem cache, as
    // páginas só voltam a buscar da rede sempre; não é motivo pra quebrar
    // nada.
  }
}

function loadQuestionsCache() {
  try {
    const raw = sessionStorage.getItem(QUESTIONS_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
