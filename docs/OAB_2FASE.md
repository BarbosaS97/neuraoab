# NeuraOAB — 2ª fase (correção automática por IA)

Sistema para extrair as provas da 2ª fase da OAB (peça profissional + 4 questões
discursivas), importar para o Supabase e corrigir as respostas do aluno com IA
(DeepSeek), com nota + feedback item a item, seguindo a distribuição oficial
de pontos da banca.

Peças que compõem o sistema:

| Peça | Onde fica |
|---|---|
| Extrator de PDFs (Python) | `py/extract_oab2.py` |
| Tabelas do Supabase (SQL) | `supabase/schema_fase2.sql` |
| Edge Function de correção (TypeScript) | `supabase/functions/corretor-2fase/index.ts` |
| Painel de importação (browser) | `admin/import2fase.html` |
| Página do aluno (Simulado de Prática) | `estudos/simulado2fase.html` + `.js` + `.css` |

## 1. Fluxo geral

```
PDF da prova  ──┐
                ├──► extract_oab2.py ──► JSON (por área) ──► import2fase.html ──► Supabase
PDF do gabarito ┘                                                                    │
                                                                                      │
Aluno responde no site ──► clica "Finalizar" ──► corretor-2fase (Edge Function) ─────┘
                                                     │
                                                     ▼
                                          nota + feedback item a item
                                          (gravados em oab2_respostas)
```

## 2. Extrair os PDFs

### 2.1. Organize os arquivos

Dentro de `py/PDF2fase/`, crie uma subpasta por exame (o nome só precisa conter
o número do exame em algum lugar — "2ª fase 46º", "46º_fase2", tanto faz).
Dentro dela, um par de PDFs por área do Direito:

```
py/PDF2fase/
└── 2ª fase 46º/
    ├── 46º_provas_Direito_Administrativo.pdf
    ├── 46º_resposta_Direito_Administrativo.pdf
    ├── 46º_provas_Direito_Civil.pdf
    └── 46º_resposta_Direito_Civil.pdf
```

Regras de nome de arquivo:
- Prova: `{numero}º_provas_{Área_Do_Direito}.pdf`
- Resposta/gabarito: `{numero}º_resposta_{Área_Do_Direito}.pdf` (também aceita
  `respostas` ou `gabarito` no lugar de `resposta`)
- A área é o texto após o marcador de tipo, com `_`/`-` virando espaço — não
  precisa bater 100% entre os dois arquivos (a comparação ignora acentuação,
  maiúsculas/minúsculas e `_`/`-`), mas devem se referir à mesma área.

### 2.2. Rode o extrator

```
cd py
python extract_oab2.py                    # processa todas as pastas em PDF2fase/
python extract_oab2.py --exam 46          # só o 46º exame
python extract_oab2.py --folder "2ª fase 46º"
python extract_oab2.py --force            # reprocessa mesmo se o JSON já existir
python extract_oab2.py --dump-text        # salva o texto bruto extraído (.raw.txt), útil para depurar
```

Ou, no Windows, dê duplo clique em `py/extrair2fase.bat`.

O resultado sai em `py/JSON2fase/<pasta-do-exame>/<Área>.json`, um arquivo por
área, com esta estrutura:

```jsonc
{
  "exam_number": 46,
  "phase": 2,
  "area": "Direito Administrativo",
  "source_provas_file": "46º_provas_Direito_Administrativo.pdf",
  "source_resposta_file": "46º_resposta_Direito_Administrativo.pdf",
  "peca": {
    "tipo": "peca",
    "numero": null,
    "enunciado": "...",
    "subitens": [],
    "observacao": "a peça deve abranger todos os fundamentos...",
    "valor_total": 5.0,
    "gabarito_comentado": "...",
    "criterios": [
      { "rotulo": "1", "categoria": "Endereçamento", "descricao": "...",
        "pontuacao_maxima": 0.10, "faixas_possiveis": [0.0, 0.10] },
      ...
    ],
    "criterios_texto_bruto": "...(texto oficial completo da tabela)...",
    "linhas_nao_reconhecidas": []
  },
  "questoes": [
    {
      "tipo": "questao", "numero": 1, "enunciado": "...",
      "subitens": [
        { "letra": "A", "enunciado": "...", "valor": 0.60 },
        { "letra": "B", "enunciado": "...", "valor": 0.65 }
      ],
      "valor_total": 1.25, "gabarito_comentado": "...", "criterios": [...],
      "criterios_texto_bruto": "...", "linhas_nao_reconhecidas": []
    },
    { "numero": 2, "...": "..." },
    { "numero": 3, "...": "..." },
    { "numero": 4, "...": "..." }
  ],
  "valor_total_prova": 10.0
}
```

### 2.3. Confira o log

O extrator avisa no console (e é isso que você deve revisar antes de importar):
- questões/peça não encontradas na prova ou no gabarito;
- nenhuma tabela com bordas detectada na "distribuição dos pontos" (caiu no
  fallback por regex, menos confiável);
- soma dos critérios extraídos diferente do valor oficial do item (pode
  indicar linha da tabela não reconhecida — veja `linhas_nao_reconhecidas`
  no JSON);
- área do nome do arquivo divergente da área escrita dentro do PDF de
  resposta.

Nenhum desses avisos impede a geração do JSON — mesmo quando o parser
estruturado erra algum detalhe da tabela, o campo `criterios_texto_bruto`
guarda o texto oficial completo da seção, que é o que a Edge Function usa
como contexto para a IA corrigir. Ainda assim, vale conferir com
`--dump-text` se algo parecer muito errado.

## 3. Criar as tabelas no Supabase

No SQL Editor do projeto Supabase, rode (depois do `schema.sql` da 1ª fase,
se ainda não tiver rodado):

```
supabase/schema_fase2.sql
```

Tabelas criadas:
- `oab2_provas` — um caderno por (exame, área)
- `oab2_itens` — a peça e as 4 questões de cada caderno
- `oab2_subitens` — os itens A)/B) de cada questão
- `oab2_criterios` — a distribuição dos pontos, item a item
- `oab2_tentativas` — uma tentativa do aluno num caderno completo
- `oab2_respostas` — a resposta do aluno a cada item, com nota e feedback da IA

RLS: **o NeuraOAB inteiro roda sem sistema de login** (só a anon key do
Supabase no navegador — nenhuma página do site usa Supabase Auth). Por isso
todas as tabelas da 2ª fase, incluindo `oab2_tentativas`/`oab2_respostas`, são
liberadas para `anon`/`authenticated` (mesmo padrão já usado pela tabela
`oab_questions` da 1ª fase). O aluno é identificado por um `aluno_id` (texto)
gerado como UUID aleatório e guardado no `localStorage` do navegador na
primeira visita (ver `ALUNO_ID_KEY` em `estudos/simulado2fase.js`) — isso
**não** impede alguém com a anon key de ler/gravar a tentativa de outra
pessoa; é só uma identidade de conveniência para "lembrar" o progresso no
mesmo navegador entre visitas. Se isso deixar de ser aceitável (ex.: o
produto crescer e precisar de contas de verdade), é preciso adicionar
Supabase Auth e trocar `aluno_id` por `user_id` (`auth.uid()`) nas policies.

## 4. Importar os JSONs

Abra `admin/import2fase.html` no navegador, arraste o JSON de uma área e
clique em "Importar para o banco". O painel valida a estrutura antes de
liberar o botão (erros bloqueiam a importação; avisos — ex.: poucos
critérios reconhecidos — não bloqueiam, mas vale revisar).

Reimportar o mesmo `(exame, área)` atualiza o caderno existente em vez de
duplicar (upsert por `exam_number, area`; sub-itens e critérios são
recriados do zero a cada importação).

## 5. Deploy da Edge Function de correção

```
supabase functions deploy corretor-2fase
```

Secret necessária (mesma já usada pelo `dr-laureano`, não precisa recriar
se já estiver configurada no projeto):

```
supabase secrets set API_DEEPSEEK_KEY=sk-...
```

### Contrato da função

`POST /functions/v1/corretor-2fase`

Corrige **um item por chamada** (a peça ou uma das 4 questões) — o frontend
chama a função uma vez por item quando o aluno finaliza o caderno.

Requisição:
```jsonc
{
  "item": {
    "tipo": "questao",              // "peca" | "questao"
    "numero": 1,                     // null para peça
    "enunciado": "...",
    "subitens": [{ "letra": "A", "enunciado": "...", "valor": 0.60 }, ...],
    "observacao": "...",             // opcional
    "valor_total": 1.25,
    "gabarito_comentado": "...",
    "criterios": [
      { "rotulo": "A", "categoria": null, "descricao": "...",
        "pontuacao_maxima": 0.60, "faixas_possiveis": [0.0, 0.50, 0.60] }
    ],
    "criterios_texto_bruto": "..."   // usado como contexto extra/fallback
  },
  "resposta_aluno": "texto que o aluno digitou para este item"
}
```

Todos esses campos vêm diretamente das linhas de `oab2_itens` +
`oab2_subitens` + `oab2_criterios` referentes ao item — não precisa montar
nada manualmente, é só repassar o que veio do Supabase.

Resposta:
```jsonc
{
  "nota_total": 0.85,
  "criterios": [
    { "rotulo": "A", "pontuacao_maxima": 0.60, "pontuacao_obtida": 0.50,
      "justificativa": "Identificou corretamente a resposta, mas não citou o artigo de lei.",
      "anulado": false },
    { "rotulo": "B", "pontuacao_maxima": 0.65, "pontuacao_obtida": 0.65,
      "justificativa": "Item anulado pela Coordenação do Exame.", "anulado": true }
  ],
  "feedback_geral": "Texto corrido explicando o desempenho do aluno neste item..."
}
```

A `nota_total` devolvida é sempre a soma dos `pontuacao_obtida` (a função
recalcula no servidor — nunca confia na soma que a IA eventualmente
reportar) e nunca ultrapassa `valor_total`. Resposta em branco é zerada sem
chamar a IA, exceto um critério com `anulado: true` (detectado pela própria
função quando "anulad..." aparece na `descricao` do critério oficial).

Critério anulado (`anulado: true`) sempre recebe `pontuacao_obtida` igual a
`pontuacao_maxima` — mesma prática da banca real: item anulado pontua todo
mundo, não é avaliado pelo conteúdo da resposta. `validateAndNormalize` força
isso no servidor mesmo que a IA devolva outro valor. O frontend (ver
`estudos/simulado2fase.js` e `professor-portal/js/aluno-detail.js`) mostra um
rótulo "Anulado" no lugar da fração pontuacao_obtida/pontuacao_maxima, pra não
parecer um acerto normal.

O frontend é responsável por gravar o resultado em `oab2_respostas` e, depois
de corrigir os 5 itens, somar as notas em `oab2_tentativas.nota_total` e
marcar `status = 'corrigida'` — é exatamente isso que `estudos/simulado2fase.js`
faz (ver seção 6).

## 6. A página do aluno (`estudos/simulado2fase.html`)

Fluxo implementado em `estudos/simulado2fase.js`:

1. **Seleciona Exame + Área** (`viewPicker`) → lista vem de
   `select id, exam_number, area, valor_total from oab2_provas`.
2. **Abre o caderno** (`viewCaderno`) → busca os 5 itens com sub-itens e
   critérios já embutidos numa única query (`oab2_itens.select("*, oab2_subitens(*), oab2_criterios(*)")`),
   e cria (ou retoma, via `oab2_tentativas` com `status = 'em_andamento'`) a
   tentativa do aluno. Uma aba por item (peça + questões 1-4); cada aba tem o
   enunciado (com os sub-itens A/B e seus valores, quando existirem) e um
   `<textarea>` para a resposta.
   - **Rascunho**: salvo no `localStorage` a cada tecla (instantâneo, não
     depende de rede) e sincronizado com `oab2_respostas` (`texto_resposta`)
     1,5s após parar de digitar — se o aluno fechar a aba e voltar depois
     (mesmo navegador), o caderno retoma de onde parou.
3. **Clica em "Finalizar e corrigir com IA"** → confirma se algum item ficou
   em branco, marca a tentativa como `corrigindo`, e dispara uma chamada a
   `corretor-2fase` **em paralelo** para os 5 itens (`Promise.all`, cada
   chamada isolada em try/catch — a falha de um item nunca trava os outros).
   Cada resultado é gravado em `oab2_respostas` (`nota`, `feedback_geral`,
   `feedback_criterios`, `corrected_at`).
4. **Recebe o resultado** (`viewResultado`) → nota total (soma client-side dos
   5 itens, também persistida em `oab2_tentativas.nota_total` com
   `status = 'corrigida'`), e um card por item, expansível, com o feedback
   geral, a nota de cada critério (com a descrição oficial do critério
   recuperada de `oab2_criterios` pelo `rotulo`) e um botão para rever a
   própria resposta.

A página não depende da barra lateral/chat da 1ª fase — é um layout próprio
(`simulado2fase.css`), mas reaproveita as variáveis de cor de `style.css`
(mesmo tema claro/escuro, mesma chave de `localStorage` para lembrar a
preferência entre as duas páginas).

## 7. Solução de problemas

- **"nenhuma tabela com bordas detectada"** no log do extrator: o PDF de
  resposta pode ter a tabela de distribuição de pontos sem grade vetorial
  (raro nos gabaritos oficiais da FGV, mas pode acontecer em digitalizações).
  O fallback por regex ainda roda, mas confira o resultado com
  `--dump-text` antes de importar.
- **Critérios somando um valor diferente do oficial**: normalmente indica
  uma linha da tabela que não foi reconhecida como item nem como categoria —
  veja `linhas_nao_reconhecidas` no JSON gerado.
- **Edge Function retornando 502 "a IA não retornou um JSON válido"**: a
  DeepSeek eventualmente pode devolver texto fora do JSON apesar do
  `response_format: json_object`; tentar de novo geralmente resolve. Se
  persistir, confira se `API_DEEPSEEK_KEY` está configurada corretamente.
