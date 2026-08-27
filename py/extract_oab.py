#!/usr/bin/env python3
"""
extract_oab.py — NeuraOAB

Extrai questoes e gabarito de provas da OAB (1a fase) a partir de PDFs
e salva tudo em JSON estruturado.

A OAB realiza mais de um exame por ano (ex.: 35o, 36o, 37o Exame de Ordem
Unificado), cada um com 4 tipos de prova (Tipo 1 - Branca, Tipo 2 - Verde,
Tipo 3 - Amarelo, Tipo 4 - Azul). Por isso cada EXAME (nao cada ano) tem sua
propria subpasta.

Estrutura de pastas esperada (execute a partir de py/):

    py/
    |-- extract_oab.py
    |-- requirements.txt
    |-- pdfs/
    |   |-- 35_exame_2022/
    |   |   |-- oab_2022_35_tipo1.pdf
    |   |   |-- oab_2022_35_tipo2.pdf
    |   |   |-- oab_2022_35_tipo3.pdf
    |   |   |-- oab_2022_35_tipo4.pdf
    |   |   `-- gabarito_2022_35.pdf
    |   |-- 36_exame_2022/
    |   |   `-- ...
    |   `-- 37_exame_2023/
    |       `-- ...
    `-- output/
        |-- 35_exame_2022/
        |   |-- oab_2022_35_tipo1.json
        |   `-- ...
        `-- ...

Nomes esperados:
    - Pasta do exame: "{numero}_exame_{ano}" (ex.: "35_exame_2022"; tambem
      aceita o ordinal, ex.: "35o_exame_2022" ou "35º_exame_2022").
    - Prova: "oab_{ano}_{exame}_tipo{tipo}.pdf" (ex.: "oab_2022_35_tipo1.pdf")
    - Gabarito: "gabarito_{ano}_{exame}.pdf" (ex.: "gabarito_2022_35.pdf")
      — um unico arquivo reunindo os 4 tipos, como o gabarito oficial do
      Conselho Federal da OAB.

Uso:
    python extract_oab.py                              # processa todos os exames
    python extract_oab.py --exam 35                     # so a pasta do 35o exame
    python extract_oab.py --year 2022                   # todos os exames de 2022 (pode ser mais de um)
    python extract_oab.py --folder 35_exame_2022         # so essa pasta, pelo nome literal
    python extract_oab.py --file pdfs/35_exame_2022/oab_2022_35_tipo1.pdf
    python extract_oab.py --force                        # reprocessa mesmo se o JSON ja existir
    python extract_oab.py --dump-text                    # salva o texto bruto extraido (.raw.txt) para depuracao

Como identifica as coisas:
    - Ano e numero do exame: nome da subpasta dentro de pdfs/, no padrao
      "{numero}_exame_{ano}" (ex.: pdfs/35_exame_2022 -> exam_number = 35,
      year = 2022). Pastas fora desse padrao sao ignoradas com um aviso.
    - Tipo de prova: procurado no nome do arquivo, padrao "tipoN" (N = 1 a 4)
    - Gabarito: qualquer PDF na mesma pasta cujo nome contenha "gabarito".
      Se houver varios, prioriza um cujo nome ja cite o mesmo tipo
      (ex.: gabarito_tipo1.pdf). Caso contrario, usa o primeiro encontrado
      (util quando um unico arquivo reune o gabarito dos 4 tipos, como o
      gabarito oficial do Conselho Federal da OAB).

Qualidade / questoes descartadas:
    - So entram no JSON questoes extraidas com enunciado completo E as 4
      alternativas. Qualquer questao que nao atenda a isso — por exemplo,
      um trecho do PDF cuja fonte embutida nao tem mapeamento Unicode
      valido (o texto vira ilegivel, tipo "(cid:1007)", mesmo para
      bibliotecas de extracao — ja testamos pdfplumber e pypdf nesses
      trechos, ambas falham) — e DESCARTADA, nao aparece em "questions".
    - O numero oficial de cada questao descartada fica registrado em
      "skipped_numbers" (nivel raiz do JSON), para voce saber o que falta
      e, se quiser o conteudo completo, resolver manualmente ou via OCR.
      A numeracao das questoes mantidas continua sendo o numero oficial da
      prova (nao e renumerada), entao ela sempre casa com o gabarito.

Campo "discipline":
    - Classificado por contagem de palavras-chave juridicas tipicas de
      cada area (ver DISCIPLINE_KEYWORDS) — funciona em qualquer ano sem
      calibracao manual, mas e uma heuristica: pode errar em questoes de
      fronteira entre duas areas, ou ficar None se nao achar keyword
      nenhuma. Revise/ajuste DISCIPLINE_KEYWORDS conforme necessario.

Limitacoes conhecidas:
    - A extracao depende de heuristicas sobre o texto (numeros de questao
      sozinhos em uma linha, alternativas comecando com "A) ", "B) " etc.).
      Provas com layout muito diferente do padrao FGV/OAB podem exigir ajustes.
    - Use --dump-text para inspecionar o texto bruto extraido de uma prova
      quando o resultado parecer incorreto.
"""

from __future__ import annotations

import argparse
import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import pdfplumber
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Configuracao
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
PDFS_DIR = BASE_DIR / "pdfs"
OUTPUT_DIR = BASE_DIR / "output"

TOTAL_QUESTIONS = 80
ALTERNATIVE_LETTERS = ("A", "B", "C", "D")

# Fracao da altura da pagina ignorada no topo/rodape ao recortar as colunas,
# para nao capturar cabecalho/rodape junto do texto das questoes.
TOP_MARGIN_RATIO = 0.06
BOTTOM_MARGIN_RATIO = 0.06

GABARITO_HINTS = ("gabarito",)

# Linhas de ruido (cabecalho/rodape) removidas do texto de cada questao.
NOISE_PATTERNS = [
    re.compile(r"EXAME\s+DE\s+ORDEM\s+UNIFICADO", re.IGNORECASE),
    re.compile(r"PROVA\s+APLICADA\s+EM", re.IGNORECASE),
    re.compile(r"^\s*TIPO\s*\d", re.IGNORECASE),
    re.compile(r"^\s*[-]?\s*(BRANC[AO]|VERDE|AMARELA?|AZUL)\s*$", re.IGNORECASE),
    re.compile(r"CONSELHO\s+FEDERAL", re.IGNORECASE),
    re.compile(r"^\s*FGV\s*$", re.IGNORECASE),
    re.compile(r"^\s*OAB\s*$", re.IGNORECASE),
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("extract_oab")


# ---------------------------------------------------------------------------
# Estruturas
# ---------------------------------------------------------------------------

@dataclass
class Question:
    number: int
    statement: str
    alternatives: list = field(default_factory=list)
    correct_answer: Optional[str] = None
    discipline: Optional[str] = None
    year: Optional[int] = None
    exam_number: Optional[int] = None

    def to_dict(self) -> dict:
        return {
            "number": self.number,
            "year": self.year,
            "exam_number": self.exam_number,
            "discipline": self.discipline,
            "statement": self.statement,
            "alternatives": self.alternatives,
            "correct_answer": self.correct_answer,
        }


# ---------------------------------------------------------------------------
# Utilidades de texto
# ---------------------------------------------------------------------------

CID_TOKEN_RE = re.compile(r"\(cid:\d+\)")

# Algumas provas (ex.: o 16o Exame) tem trechos em negrito renderizados com
# uma tecnica de "negrito falso": o PDF desenha cada glifo duas vezes,
# levemente deslocado, por nao ter uma variante bold de verdade embutida na
# fonte. A extracao de texto captura as DUAS copias sobrepostas, entao cada
# caractere daquele trecho sai dobrado (ex.: "BBeerrnnaarrddoo" em vez de
# "Bernardo"). Corrigimos isso em duas passadas complementares — ver
# fix_doubled_glyphs para o motivo de precisar das duas.
PAIR_TOKEN_RE = re.compile(r"\S+")
# Pelo menos 2 pares consecutivos (4 caracteres) — abaixo disso (so' 1 par,
# ex.: "ss" em "assessoria") e' indistinguivel de uma letra dobrada legitima
# no meio de uma palavra normal, entao NAO mexemos.
DOUBLED_RUN_RE = re.compile(r"(?:(.)\1){2,}")
# Um algarismo romano como "II", "XX" ou "XXII" TAMBEM e' so' pares de
# caracteres identicos — o que distingue e' que ele e' formado SO' por
# letras romanas (I V X L C D M). Qualquer trecho que misture uma letra
# fora desse conjunto (minuscula, acentuada, pontuacao, digito) e' seguro
# de colapsar; um trecho puramente romano fica protegido.
ROMAN_NUMERAL_CHARS = set("IVXLCDM")


def _is_pair_doubled(token: str) -> bool:
    """Um token e' candidato a "negrito dobrado" quando TODO ele e' formado
    por pares de caracteres identicos consecutivos (ex.: "ddaa" -> pares
    "dd" e "aa"). Exige comprimento par e >=2; comprimento impar nunca
    forma so' pares, entao ja' descarta boa parte dos tokens normais."""
    if len(token) < 2 or len(token) % 2 != 0:
        return False
    return all(token[i] == token[i + 1] for i in range(0, len(token), 2))


def _fix_doubled_tokens(text: str) -> str:
    """1a passada: corrige palavras CURTAS que saem inteiramente dobradas
    (ex.: "eemm" -> "em", "ddaa" -> "da") — preposicoes assim sao comuns
    demais pra arriscar so' com um limite de tamanho minimo, entao so'
    mexemos nelas quando um token VIZINHO tambem esta' dobrado (sinal de
    que estamos no meio de um trecho de negrito falso, nao um caso
    isolado tipo um algarismo romano solto). Palavras isoladas so' sao
    corrigidas se ja' forem longas o bastante (>=6 caracteres) pra uma
    coincidencia ser praticamente impossivel."""
    tokens = list(PAIR_TOKEN_RE.finditer(text))
    if not tokens:
        return text
    candidate = [_is_pair_doubled(m.group(0)) for m in tokens]

    def should_fix(i: int) -> bool:
        if not candidate[i]:
            return False
        if len(tokens[i].group(0)) >= 6:
            return True
        prev_candidate = i > 0 and candidate[i - 1]
        next_candidate = i < len(tokens) - 1 and candidate[i + 1]
        return prev_candidate or next_candidate

    pieces = []
    last_end = 0
    for i, m in enumerate(tokens):
        pieces.append(text[last_end:m.start()])
        token = m.group(0)
        pieces.append(token[0::2] if should_fix(i) else token)
        last_end = m.end()
    pieces.append(text[last_end:])
    return "".join(pieces)


def _collapse_unless_roman(m: "re.Match") -> str:
    run = m.group(0)
    if all(ch in ROMAN_NUMERAL_CHARS for ch in run):
        # Pode ser um algarismo romano de verdade (ex.: "II", "XXII", "MM")
        # — como isso e' indistinguivel so' pelo padrao de pares, preferimos
        # nao mexer a arriscar trocar o numero de um artigo/inciso citado.
        return run
    return run[0::2]


def fix_doubled_glyphs(text: str) -> str:
    """Duas passadas complementares para o problema de "negrito dobrado":

    1) _fix_doubled_tokens: pega palavras CURTAS que saem INTEIRAS dobradas
       (ex.: "AA" -> "A", "eemm" -> "em") usando o contexto da palavra
       vizinha — uma palavra sozinha de so' 1 par (uma letra dobrada) e'
       indistinguivel de coincidencia sem esse contexto de vizinhanca.
    2) DOUBLED_RUN_RE + _collapse_unless_roman: o trecho afetado nem sempre
       e' uma palavra inteira — pode comecar/terminar no meio dela (ex.:
       "ccoonnttabilistas", onde so' o prefixo "cont" saiu dobrado, ou
       "ex-ssóócciiaa", onde so' o sufixo saiu) — a passada 1 nao pega isso,
       pois exige a palavra INTEIRA dobrada. Por isso repetimos a busca
       direto no texto corrido, sem depender de limite de palavra nem de
       maiuscula/minuscula, protegendo so' os trechos que podem ser um
       algarismo romano de verdade.
    """
    text = _fix_doubled_tokens(text)
    text = DOUBLED_RUN_RE.sub(_collapse_unless_roman, text)
    return text


def clean_text(text: str) -> str:
    """Remove linhas de ruido (cabecalho/rodape) e normaliza espacos."""
    kept = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if any(p.search(stripped) for p in NOISE_PATTERNS):
            continue
        kept.append(stripped)
    joined = " ".join(kept)
    joined = re.sub(r"\s+", " ", joined).strip()
    if CID_TOKEN_RE.search(joined):
        # Caractere sem mapeamento Unicode na fonte do PDF (pdfminer/pdfplumber
        # renderiza como "(cid:N)"). Removemos para nao poluir o texto, mas
        # isso indica possivel perda de um caractere (normalmente pontuacao
        # ou um simbolo especial) — inspecione com --dump-text se necessario.
        joined = CID_TOKEN_RE.sub("", joined)
        joined = re.sub(r"\s+", " ", joined).strip()
    joined = fix_doubled_glyphs(joined)
    return joined


# Marcador de numero de questao "solto" em uma linha. Cobre tres casos,
# que podem inclusive se misturar num mesmo numero de 2 digitos:
#   - PDFs normais: o numero aparece como digitos comuns (ex.: "1", "23").
#   - PDFs cuja fonte em negrito nao tem mapeamento Unicode (comum em provas
#     da OAB/FGV): cada digito aparece como um token "(cid:N)", ex.:
#     "(cid:1007)" para um "4" (o valor de N e o indice do glifo dentro da
#     fonte, sem relacao direta com o digito impresso — por isso NAO
#     restringimos o valor de N aqui).
#   - as vezes um numero de 2 digitos mistura os dois: um digito comum e
#     outro como token "(cid:N)" (ex.: "1(cid:1005)" para "36" — o CMap da
#     fonte mapeia errado apenas alguns glifos).
# Falsos positivos (outro caractere qualquer que caiu sozinho numa linha)
# sao filtrados adiante, exigindo que A)/B)/C)/D) apareçam em seguida.
_MARKER_ATOM = r"(?:\d|\(cid:\d+\))"
MARKER_LINE_RE = re.compile(
    rf"(?m)^[ \t]*{_MARKER_ATOM}(?:[ \t]*{_MARKER_ATOM}){{0,2}}[ \t]*$"
)

# Marcador de alternativa "de verdade": letra (ou, quando a fonte quebra so
# aquele glifo, um token "(cid:N)") no INICIO da linha seguida de ")" (ex.:
# "A) texto..."), com o "(" de abertura opcional (ex.: "(A) texto..."),
# pois algumas provas usam esse formato entremeado com o outro — ja se viu
# a mesma prova alternar "A) ..." e "(A) ..." de questao para questao. O
# questionario de percepcao ao final da prova sempre usa "A) texto..." (sem
# parenteses) em todas as provas inspecionadas, e de qualquer forma nunca e
# alcancado, pois a busca para assim que TOTAL_QUESTIONS questoes validas
# sao encontradas.
#
# Nao tentamos identificar QUAL letra um token quebrado representa (nao da
# para saber com seguranca) — em vez disso, assim como os numeros de
# questao, tratamos as 4 alternativas pela ORDEM em que aparecem (1a = A,
# 2a = B, 3a = C, 4a = D), nao pelo valor capturado.
_LETTER_ATOM = r"(?:[A-D]|\(cid:\d+\))"
ALT_MARKER_RE = re.compile(rf"(?m)^\s*\(?{_LETTER_ATOM}\)")

# Provas ate por volta do 29o Exame (2019) nao colocam o numero da questao
# sozinho numa linha (ver MARKER_LINE_RE): em vez disso, cada questao comeca
# com a palavra "Questao" (ou "Questão") seguida do numero, na sua propria
# linha (ex.: "Questao 1"). Ao contrario do formato mais novo, aqui o numero
# geralmente e legivel direto (nao e um digito em negrito sem mapeamento
# Unicode), entao sabemos o numero OFICIAL da questao sem depender da ordem
# em que os marcadores aparecem no texto.
QUESTAO_WORD_MARKER_RE = re.compile(
    rf"(?im)^[ \t]*Quest[aã]o[ \t]+({_MARKER_ATOM}(?:[ \t]*{_MARKER_ATOM}){{0,2}})\b"
)
LEADING_QUESTAO_WORD_RE = re.compile(
    rf"^[ \t]*Quest[aã]o[ \t]+{_MARKER_ATOM}(?:[ \t]*{_MARKER_ATOM}){{0,2}}[ \t]*\n?",
    re.IGNORECASE,
)

# Fracao minima de questoes que precisam ter um marcador "Questao N" legivel
# para tratarmos a prova inteira como sendo desse formato mais antigo, em
# vez do formato "numero sozinho numa linha".
WORD_FORMAT_MIN_RATIO = 0.5


def find_question_markers_by_label(text: str, total: int) -> list:
    """
    Localiza marcadores no formato "Questao N" e devolve uma lista
    (posicao, numero) ordenada por posicao.

    So mantemos ocorrencias com numero totalmente legivel (sem tokens
    "(cid:N)") e ESTRITAMENTE CRESCENTE em relacao a ultima aceita — isso
    descarta tanto marcadores corrompidos quanto referencias soltas a outra
    questao dentro do enunciado (ex.: "vide Questao 5", que apareceria fora
    de ordem).
    """
    found = []
    last_num = 0
    for m in QUESTAO_WORD_MARKER_RE.finditer(text):
        token = re.sub(r"\s+", "", m.group(1))
        if not token.isdigit():
            continue
        num = int(token)
        if num <= last_num or num > total:
            continue
        found.append((m.start(), num))
        last_num = num
    return found

MIN_STATEMENT_CHARS = 15
MAX_WINDOW = 3000
LOOKAHEAD_CANDIDATES = 5

# Algumas provas da OAB/FGV tem paginas/questoes inteiras cuja fonte nao tem
# NENHUM mapeamento Unicode (nao so o numero da questao, mas o enunciado e
# ate as alternativas viram uma sequencia de tokens "(cid:N)"). Nesses casos
# nao ha como recuperar o texto so com extracao (seria preciso OCR). Para
# nao perder a numeracao das questoes seguintes, ainda assim contamos essas
# como uma questao "corrompida" (com enunciado/alternativas vazios) em vez
# de simplesmente pula-las.
CID_DOMINATED_WINDOW = 600
CID_DOMINATED_RATIO = 0.4
# Candidatos corrompidos a menos que isso de distancia do ultimo candidato
# corrompido sao tratados como o MESMO bloco ilegivel (varios tokens soltos
# dentro do mesmo paragrafo quebrado), em vez de uma questao "nova" — real
# questoes tem bem mais conteudo entre uma e outra do que isso.
CORRUPTED_MERGE_GAP = 300


def find_question_markers(text: str, total: int = TOTAL_QUESTIONS) -> list:
    """
    Localiza as posicoes (no texto) onde cada questao comeca.

    Nao confiamos no *valor* do numero impresso (pode estar ilegivel por
    causa de fontes sem mapeamento Unicode — ver MARKER_LINE_RE); em vez
    disso, tratamos qualquer linha "numero sozinho" como candidata e so a
    aceitamos como inicio de questao se, antes do PROXIMO candidato (ou de
    um limite maximo de caracteres), aparecerem as 4 alternativas
    "A) ... B) ... C) ... D) ..." nessa ordem, com um enunciado
    minimamente substancial antes da primeira alternativa.

    Um candidato solto no meio do enunciado/alternativas de uma questao
    real (ex.: outro caractere sem mapeamento Unicode que caiu sozinho
    numa linha) pode truncar essa janela cedo demais; nesse caso, tentamos
    o candidato seguinte como novo limite (ate LOOKAHEAD_CANDIDATES
    tentativas, respeitando MAX_WINDOW). Uma vez validada uma questao,
    a busca continua a partir do candidato que serviu de limite, pulando
    qualquer candidato "aninhado" dentro do bloco ja consumido — isso
    evita que esse mesmo candidato solto seja validado de novo contra as
    alternativas da questao seguinte.

    Cada questao valida e devolvida como uma tupla (posicao, corrompida,
    numero). `numero` vem preenchido quando o marcador e do formato
    "Questao N" (ver find_question_markers_by_label), caso em que o numero
    oficial e conhecido diretamente; e None quando vem do formato "numero
    sozinho numa linha", caso em que a questao e numerada 1..total pela
    ordem em que os marcadores aparecem no documento (ver parse_questions).
    `corrompida` e True quando o candidato tem cara de marcador de questao
    real mas o texto logo em seguida esta predominantemente ilegivel (fonte
    sem mapeamento Unicode) — nesse caso nao encontramos A)/B)/C)/D), mas
    ainda assim contamos a questao (com conteudo vazio) para nao desalinhar
    a numeracao das questoes seguintes com o gabarito oficial.
    """
    labeled = find_question_markers_by_label(text, total)
    if len(labeled) >= max(10, int(total * WORD_FORMAT_MIN_RATIO)):
        return [(pos, False, num) for pos, num in labeled]

    candidates = [m.start() for m in MARKER_LINE_RE.finditer(text)]
    n = len(candidates)
    valid = []
    i = 0
    while i < n and len(valid) < total:
        pos = candidates[i]
        line_end = text.find("\n", pos)
        if line_end == -1:
            line_end = len(text)

        matched = False
        for j in range(i + 1, min(i + 1 + LOOKAHEAD_CANDIDATES, n) + 1):
            boundary = candidates[j] if j < n else len(text)
            boundary = min(boundary, line_end + MAX_WINDOW)
            segment = text[line_end:boundary]

            alt_matches = list(ALT_MARKER_RE.finditer(segment))
            has_4_in_order = len(alt_matches) >= len(ALTERNATIVE_LETTERS)
            first_alt_pos = alt_matches[0].start() if alt_matches else -1

            if has_4_in_order and first_alt_pos >= MIN_STATEMENT_CHARS:
                valid.append((pos, False))
                i = j  # pula candidatos "aninhados" dentro do bloco ja consumido
                matched = True
                break

        if not matched:
            probe = text[line_end:line_end + CID_DOMINATED_WINDOW]
            cid_chars = sum(len(m.group(0)) for m in CID_TOKEN_RE.finditer(probe))
            if len(probe) >= 80 and cid_chars / len(probe) >= CID_DOMINATED_RATIO:
                still_same_block = (
                    valid and valid[-1][1] and (pos - valid[-1][0]) <= CORRUPTED_MERGE_GAP
                )
                if not still_same_block:
                    valid.append((pos, True))
            i += 1

    return [(pos, corrupted, None) for pos, corrupted in valid]


# ---------------------------------------------------------------------------
# Extracao das questoes (prova)
# ---------------------------------------------------------------------------

def extract_page_columns(page) -> list:
    """
    Recorta a pagina em coluna esquerda e coluna direita (ignorando margens
    de topo/rodape) e devolve o texto de cada coluna, na ordem de leitura
    (esquerda, depois direita).
    """
    width = page.width
    height = page.height
    top = height * TOP_MARGIN_RATIO
    bottom = height * (1 - BOTTOM_MARGIN_RATIO)
    mid = width / 2

    columns_text = []
    for x0, x1 in ((0, mid), (mid, width)):
        try:
            cropped = page.crop((x0, top, x1, bottom))
            text = cropped.extract_text() or ""
        except Exception:
            text = ""
        columns_text.append(text)
    return columns_text


def extract_exam_text(pdf_path: Path) -> str:
    """Extrai o texto completo da prova, respeitando a ordem de leitura das
    colunas de cada pagina."""
    parts = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            for col_text in extract_page_columns(page):
                if col_text.strip():
                    parts.append(col_text)
    return "\n".join(parts)


ALTERNATIVE_SPLIT_RE = re.compile(rf"(?m)^\s*\(?{_LETTER_ATOM}\)\s*")
LEADING_MARKER_RE = re.compile(
    rf"^[ \t]*{_MARKER_ATOM}(?:[ \t]*{_MARKER_ATOM}){{0,2}}[ \t]*\n?"
)


def parse_questions(raw_text: str, total: int = TOTAL_QUESTIONS) -> tuple:
    """
    Devolve (questions, skipped_numbers).

    `questions` contem apenas questoes extraidas com qualidade: enunciado
    nao vazio E as 4 alternativas completas. Qualquer questao que nao
    atenda a isso (fonte do PDF sem mapeamento Unicode, ou qualquer outra
    falha de extracao) e DESCARTADA do resultado — seu numero oficial e
    apenas registrado em `skipped_numbers`, para que a numeracao das
    questoes seguintes (e, portanto, o casamento com o gabarito) continue
    correta.
    """
    markers = find_question_markers(raw_text, total)
    if not markers:
        return [], []

    questions = []
    skipped = []
    for idx, (pos, corrupted, forced_num) in enumerate(markers):
        qnum = forced_num if forced_num is not None else idx + 1
        end = markers[idx + 1][0] if idx + 1 < len(markers) else len(raw_text)
        block = raw_text[pos:end]

        # remove a linha do proprio marcador da questao: "Questao N" quando
        # o numero oficial e conhecido (forced_num), ou digitos normais /
        # tokens "(cid:N)" sozinhos numa linha no formato mais novo.
        if forced_num is not None:
            block = LEADING_QUESTAO_WORD_RE.sub("", block, count=1)
        else:
            block = LEADING_MARKER_RE.sub("", block, count=1)

        if corrupted:
            log.warning(
                "Questao %d descartada: fonte do PDF sem mapeamento Unicode "
                "nesse trecho (texto ilegivel na extracao).",
                qnum,
            )
            skipped.append(qnum)
            continue

        # ALTERNATIVE_SPLIT_RE nao captura a letra (pode estar ilegivel na
        # fonte do PDF — ver _LETTER_ATOM), entao pieces[0] e o enunciado e
        # pieces[1..4] sao os textos das alternativas NESSA ORDEM (1a = A,
        # 2a = B, 3a = C, 4a = D), independentemente do glifo real da letra.
        pieces = ALTERNATIVE_SPLIT_RE.split(block)
        statement = clean_text(pieces[0])

        alternatives = []
        for i, letter in enumerate(ALTERNATIVE_LETTERS):
            text = clean_text(pieces[i + 1]) if i + 1 < len(pieces) else ""
            if text:
                alternatives.append(f"{letter}) {text}")

        if not statement or len(alternatives) != len(ALTERNATIVE_LETTERS):
            log.warning(
                "Questao %d descartada: extracao incompleta (enunciado=%s, "
                "%d/%d alternativas) — verifique com --dump-text.",
                qnum, "vazio" if not statement else "ok",
                len(alternatives), len(ALTERNATIVE_LETTERS),
            )
            skipped.append(qnum)
            continue

        questions.append(Question(number=qnum, statement=statement, alternatives=alternatives))

    missing = sorted(set(range(1, total + 1)) - {q.number for q in questions} - set(skipped))
    if missing:
        log.warning("Questoes nao encontradas: %s", missing)
    if skipped:
        log.warning("Total de questoes descartadas por qualidade: %d %s", len(skipped), skipped)

    return questions, skipped


# ---------------------------------------------------------------------------
# Extracao do gabarito
# ---------------------------------------------------------------------------

# A maioria dos gabaritos oficiais rotula cada secao "TIPO N", mas alguns
# anos (ex.: gabarito do 39o Exame) usam "PROVA N" para o mesmo conceito —
# ambos numerados 1 a 4, na mesma ordem (Branca, Verde, Amarela, Azul).
TIPO_HEADER_RE = re.compile(r"(?:TIPO|PROVA)\s*([1-4])\b", re.IGNORECASE)
CORRESPONDENCE_TABLE_RE = re.compile(r"TABELA\s+DE\s+CORRESPOND", re.IGNORECASE)


def extract_gabarito_text(pdf_path: Path) -> str:
    parts = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            parts.append(page.extract_text() or "")
    return "\n".join(parts)


def split_gabarito_sections(text: str) -> dict:
    """Divide o texto do gabarito em secoes por TIPO (1 a 4).

    Ignora qualquer coisa a partir de uma eventual "TABELA DE
    CORRESPONDENCIA DE QUESTOES" (presente em alguns gabaritos oficiais),
    que repete os rotulos "TIPO 1".."TIPO 4" como cabecalho de colunas e
    quebraria a extracao se fosse tratada como uma nova secao de respostas.
    """
    cut = CORRESPONDENCE_TABLE_RE.search(text)
    if cut:
        text = text[: cut.start()]

    headers = list(TIPO_HEADER_RE.finditer(text))
    sections = {}
    for idx, m in enumerate(headers):
        tipo = int(m.group(1))
        start = m.end()
        end = headers[idx + 1].start() if idx + 1 < len(headers) else len(text)
        # mantem apenas a primeira ocorrencia de cada tipo
        sections.setdefault(tipo, text[start:end])
    return sections


def parse_gabarito_section(section_text: str, total: int = TOTAL_QUESTIONS) -> dict:
    """
    Extrai o par (numero da questao -> letra) de uma secao de gabarito.

    A secao contem blocos de ate 20 numeros (ex.: "1 2 3 ... 20") seguidos,
    na linha seguinte, pelas respectivas respostas (ex.: "C D B D ... B"),
    repetidos 4 vezes (1-20, 21-40, 41-60, 61-80). Casamos cada numero com
    a resposta na MESMA POSICAO dentro do seu proprio par de linhas — e nao
    com duas listas achatadas de numeros/letras extraidas do texto inteiro
    — porque questoes anuladas aparecem como "*" (ou similar) no lugar da
    letra; se essas fossem simplesmente descartadas de uma lista achatada,
    todas as respostas seguintes ficariam deslocadas uma posicao para tras.
    Uma questao anulada fica mapeada para None (sem resposta).
    """
    lines = [ln.strip() for ln in section_text.splitlines() if ln.strip()]
    mapping = {}
    expected = 1
    i = 0
    while i + 1 < len(lines) and expected <= total:
        num_tokens = lines[i].split()
        if num_tokens and all(t.isdigit() for t in num_tokens) and int(num_tokens[0]) == expected:
            ans_tokens = lines[i + 1].split()
            if len(ans_tokens) == len(num_tokens):
                for n_tok, a_tok in zip(num_tokens, ans_tokens):
                    letter = a_tok.upper()
                    mapping[int(n_tok)] = letter if letter in ALTERNATIVE_LETTERS else None
                expected += len(num_tokens)
                i += 2
                continue
        i += 1

    if len(mapping) != total:
        log.warning(
            "Gabarito: esperado %d respostas nesta secao, encontrado %d.",
            total, len(mapping),
        )
    return mapping


def load_gabarito(pdf_path: Path, tipo: int) -> dict:
    text = extract_gabarito_text(pdf_path)
    sections = split_gabarito_sections(text)
    if tipo not in sections:
        log.warning(
            "Gabarito %s nao contem secao para TIPO %d (secoes encontradas: %s).",
            pdf_path.name, tipo, sorted(sections),
        )
        return {}
    return parse_gabarito_section(sections[tipo])


# ---------------------------------------------------------------------------
# Classificacao por disciplina (heuristica, baseada em palavras-chave)
# ---------------------------------------------------------------------------

# Termos tipicos de cada disciplina do Exame de Ordem. E uma heuristica por
# contagem de palavras-chave (a disciplina com mais termos encontrados no
# enunciado + alternativas vence) — nao ha calibracao por ano/prova, entao
# funciona em qualquer edicao, mas pode errar em questoes de fronteira entre
# duas areas. Revise o campo "discipline" se precisar de precisao alta.
DISCIPLINE_KEYWORDS = {
    "Ética Profissional": [
        "estatuto da advocacia", "código de ética e disciplina", "processo disciplinar",
        "infração disciplinar", "conselho seccional", "conselho federal da oab",
        "sociedade de advogados", "estagiário", "advogado empregado",
        "sigilo profissional", "publicidade irregular", "captação de clientela",
        "renúncia ao mandato", "substabelecimento", "anuidade", "honorários advocatícios",
        "exame de ordem", "prerrogativas", "membro honorário",
    ],
    "Filosofia do Direito e Direitos Humanos": [
        "hannah arendt", "norberto bobbio", "kelsen", "positivismo jurídico",
        "jusnaturalismo", "antinomia", "ordenamento jurídico", "hermenêutica jurídica",
        "corte interamericana", "controle de convencionalidade", "direitos humanos",
        "pacto de san josé", "tratados internacionais de direitos humanos",
    ],
    "Direito Constitucional": [
        "constituição federal", "poder constituinte", "controle de constitucionalidade",
        "ação direta de inconstitucionalidade", "adi", "adpf", "adc",
        "supremo tribunal federal", "stf", "cláusula pétrea", "direitos fundamentais",
        "competência comum", "competência privativa", "território federal",
        "nacionalidade", "mandado de segurança", "habeas data", "remédio constitucional",
    ],
    "Direito Administrativo": [
        "administração pública", "licitação", "lei de licitações", "servidor público",
        "processo administrativo disciplinar", "improbidade administrativa", "concessão",
        "permissão de serviço público", "poder de polícia", "ato administrativo",
        "agência reguladora", "consórcio público", "parceria público-privada",
        "terceiro setor", "oscip",
    ],
    "Direito Ambiental": [
        "licenciamento ambiental", "licença ambiental", "dano ambiental", "meio ambiente",
        "infração ambiental", "poluidor", "auto de infração ambiental",
    ],
    "Direito Tributário": [
        "tributo", "imposto", "icms", "ipi", "iss ", "ipva", "irpj", "irrf",
        "imunidade tributária", "isenção fiscal", "obrigação tributária",
        "fato gerador", "lançamento tributário", "execução fiscal",
        "exceção de pré-executividade", "fazenda pública",
    ],
    "Direito Civil": [
        "casamento", "divórcio", "sucessão", "testamento", "herança", "união estável",
        "posse", "propriedade", "direito real", "usucapião", "personalidade jurídica",
        "desconsideração da personalidade jurídica", "curatela", "tutela",
        "pensão alimentícia", "locação", "fiança", "direito real de laje",
    ],
    "Direito do Consumidor": [
        "consumidor", "fornecedor", "código de defesa do consumidor", "cdc",
        "relação de consumo", "vício do produto", "fato do produto",
    ],
    "Direito Empresarial": [
        "sociedade empresária", "recuperação judicial", "falência", "título de crédito",
        "duplicata", "cheque", "nota promissória", "franquia empresarial",
        "sociedade limitada", "sociedade anônima", "junta comercial", "aval",
    ],
    "Direito Processual Civil": [
        "petição inicial", "contestação", "tutela provisória", "litisconsórcio",
        "cumprimento de sentença", "agravo de instrumento", "apelação",
        "improcedência liminar", "arbitragem", "compromisso arbitral",
        "carta precatória", "código de processo civil",
    ],
    "Direito Penal": [
        "crime de", "pena de reclusão", "dolo", "flagrante delito", "furto", "roubo",
        "latrocínio", "estupro de vulnerável", "corrupção passiva", "prevaricação",
        "arma de fogo", "tráfico de drogas", "reincidência", "prescrição da pretensão punitiva",
        "porte de arma",
    ],
    "Direito Processual Penal": [
        "inquérito policial", "denúncia", "ação penal", "prisão preventiva",
        "prisão em flagrante", "audiência de custódia", "acordo de não persecução penal",
        "transação penal", "suspensão condicional do processo", "habeas corpus",
        "prisão domiciliar",
    ],
    "Direito do Trabalho": [
        "clt", "empregado", "empregador", "contrato de trabalho", "férias",
        "fgts", "jornada de trabalho", "aviso prévio", "verbas rescisórias",
        "contrato intermitente", "sobreaviso", "estabilidade gestante",
    ],
    "Direito Processual do Trabalho": [
        "reclamação trabalhista", "justiça do trabalho", "execução trabalhista",
        "tribunal superior do trabalho", "tst", "embargos à execução",
        "incidente de desconsideração de personalidade jurídica",
    ],
    "Direito Internacional e Migração": [
        "naturalização", "estrangeiro", "residente fronteiriço", "extradição",
        "lindb", "homologação de sentença estrangeira", "domicílio conjugal",
        "brasileiro nato",
    ],
    "Direito Digital e Proteção de Dados": [
        "lei geral de proteção de dados", "lgpd", "dados pessoais", "tratamento de dados",
    ],
    "Estatuto da Criança e do Adolescente": [
        "criança", "adolescente", "conselho tutelar", "adoção", "guarda",
        "poder familiar", "ato infracional", "eca",
    ],
    "Direito Previdenciário": [
        "inss", "aposentadoria", "benefício previdenciário",
        "perfil profissiográfico previdenciário", "seguridade social", "assistência social",
    ],
}

_DISCIPLINE_PATTERNS = {
    discipline: [re.compile(re.escape(kw), re.IGNORECASE) for kw in keywords]
    for discipline, keywords in DISCIPLINE_KEYWORDS.items()
}


def classify_discipline(text: str) -> Optional[str]:
    """Classifica a disciplina pelo numero de palavras-chave encontradas no
    texto (enunciado + alternativas). Devolve None se nenhuma disciplina
    tiver pelo menos uma ocorrencia."""
    best_discipline = None
    best_score = 0
    for discipline, patterns in _DISCIPLINE_PATTERNS.items():
        score = sum(1 for p in patterns if p.search(text))
        if score > best_score:
            best_score = score
            best_discipline = discipline
    return best_discipline


# ---------------------------------------------------------------------------
# Descoberta de arquivos
# ---------------------------------------------------------------------------

TIPO_IN_NAME_RE = re.compile(r"tipo\s*([1-4])", re.IGNORECASE)

# Nome da pasta de um exame: "{numero}_exame_{ano}", com o ordinal opcional
# ("35_exame_2022", "35o_exame_2022" ou "35º_exame_2022" sao todos aceitos).
EXAM_FOLDER_RE = re.compile(r"^(\d+)\s*[oº]?\s*_exame_(\d{4})$", re.IGNORECASE)


def parse_exam_folder(folder_name: str) -> Optional[tuple]:
    """Extrai (exam_number, year) do nome da pasta do exame, ou None se o
    nome nao seguir o padrao "{numero}_exame_{ano}"."""
    m = EXAM_FOLDER_RE.match(folder_name.strip())
    if not m:
        return None
    return int(m.group(1)), int(m.group(2))


def guess_exam_type(filename: str) -> Optional[str]:
    m = TIPO_IN_NAME_RE.search(filename)
    if not m:
        return None
    return f"tipo{m.group(1)}"


def is_gabarito_file(filename: str) -> bool:
    lower = filename.lower()
    return any(hint in lower for hint in GABARITO_HINTS)


def find_gabarito_for(exam_path: Path, tipo_num: int) -> Optional[Path]:
    """Procura, na mesma pasta da prova, um arquivo de gabarito adequado."""
    folder = exam_path.parent
    candidates = [p for p in folder.glob("*.pdf") if is_gabarito_file(p.name)]
    if not candidates:
        return None

    # Prioriza gabarito cujo nome ja cita o mesmo tipo (ex.: gabarito_tipo1.pdf)
    for cand in candidates:
        m = TIPO_IN_NAME_RE.search(cand.name)
        if m and int(m.group(1)) == tipo_num:
            return cand

    # Caso contrario, devolve o primeiro candidato (pode ser um gabarito
    # unico que reune todos os tipos).
    return candidates[0]


# ---------------------------------------------------------------------------
# Pipeline principal
# ---------------------------------------------------------------------------

def process_exam(pdf_path: Path, output_dir: Path, force: bool = False, dump_text: bool = False) -> None:
    folder_name = pdf_path.parent.name
    parsed_folder = parse_exam_folder(folder_name)
    if parsed_folder is None:
        log.error(
            "Pasta '%s' nao segue o padrao esperado \"{numero}_exame_{ano}\" "
            "(ex.: 35_exame_2022). Pulando %s.",
            folder_name, pdf_path,
        )
        return
    exam_number, year_num = parsed_folder

    exam_type = guess_exam_type(pdf_path.name) or "desconhecido"

    out_path = output_dir / folder_name / f"{pdf_path.stem}.json"
    if out_path.exists() and not force:
        log.info("Pulando (ja processado): %s", out_path)
        return

    log.info("Processando prova: %s", pdf_path)

    try:
        raw_text = extract_exam_text(pdf_path)
    except Exception:
        log.exception("Falha ao extrair texto de %s", pdf_path)
        return

    if dump_text:
        debug_path = out_path.with_suffix(".raw.txt")
        debug_path.parent.mkdir(parents=True, exist_ok=True)
        debug_path.write_text(raw_text, encoding="utf-8")

    questions, skipped_numbers = parse_questions(raw_text)
    if not questions:
        # Ainda assim salvamos o JSON (vazio, com todas as questoes em
        # skipped_numbers) em vez de abandonar o arquivo silenciosamente —
        # isso costuma acontecer quando a prova inteira foi tipografada com
        # uma fonte sem mapeamento Unicode (nao ha texto recuperavel sem
        # OCR), e o pipeline downstream precisa de um registro de que essa
        # prova existe e requer atencao manual.
        log.error(
            "Nenhuma questao de qualidade extraida de %s (prova provavelmente "
            "requer OCR — use --dump-text para inspecionar).",
            pdf_path,
        )

    for q in questions:
        q.year = year_num
        q.exam_number = exam_number
        q.discipline = classify_discipline(q.statement + " " + " ".join(q.alternatives))

    gabarito_path = None
    tipo_num = None
    tipo_match = TIPO_IN_NAME_RE.search(pdf_path.name)
    if tipo_match:
        tipo_num = int(tipo_match.group(1))
        gabarito_path = find_gabarito_for(pdf_path, tipo_num)

    answer_map = {}
    if gabarito_path:
        try:
            answer_map = load_gabarito(gabarito_path, tipo_num)
        except Exception:
            log.exception("Falha ao extrair gabarito de %s", gabarito_path)
    else:
        log.warning(
            "Gabarito nao encontrado para %s. As questoes serao salvas sem correct_answer.",
            pdf_path.name,
        )

    for q in questions:
        q.correct_answer = answer_map.get(q.number)

    # Uma questao "anulada" pelo gabarito oficial (marcada "*" ou similar,
    # ver parse_gabarito_section) fica no mapa com valor None — diferente
    # de uma questao simplesmente ausente do gabarito (falha de extracao).
    # Anuladas nao tem certo/errado para o app de estudos avaliar, entao
    # sao removidas do JSON de import (tal como as descartadas por
    # qualidade), em vez de serem salvas com correct_answer nulo.
    annuled_numbers = sorted(
        q.number for q in questions
        if q.number in answer_map and answer_map[q.number] is None
    )
    if annuled_numbers:
        log.warning(
            "%s: %d questoes anuladas pelo gabarito oficial, removidas do "
            "import: %s",
            pdf_path.name, len(annuled_numbers), annuled_numbers,
        )
        questions = [q for q in questions if q.number not in annuled_numbers]
        skipped_numbers = sorted(skipped_numbers + annuled_numbers)

    missing_answers = [q.number for q in questions if q.correct_answer is None]
    if missing_answers and answer_map:
        log.warning(
            "%s: %d questoes sem resposta no gabarito: %s",
            pdf_path.name, len(missing_answers), missing_answers,
        )

    data = {
        "year": year_num,
        "exam_number": exam_number,
        "exam_type": exam_type,
        "questions": [q.to_dict() for q in questions],
        "total": len(questions),
        "skipped_numbers": skipped_numbers,
        "source_file": pdf_path.name,
        "gabarito_file": gabarito_path.name if gabarito_path else None,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info(
        "Salvo: %s (%d questoes de qualidade, %d descartadas, %d com resposta)",
        out_path, len(questions), len(skipped_numbers),
        sum(1 for q in questions if q.correct_answer),
    )


def discover_exam_files(
    pdfs_dir: Path,
    year: Optional[int] = None,
    exam_number: Optional[int] = None,
    folder: Optional[str] = None,
) -> list:
    """Lista os PDFs de prova (exclui gabaritos) dentro das pastas de exame
    que casam com os filtros informados. Pastas que nao seguem o padrao
    "{numero}_exame_{ano}" sao ignoradas (com aviso), pois nao ha como saber
    a que ano/exame pertencem."""
    if not pdfs_dir.exists():
        log.error("Pasta nao encontrada: %s", pdfs_dir)
        return []

    if folder:
        base = pdfs_dir / folder
        if not base.exists():
            log.error("Pasta nao encontrada: %s", base)
            return []
        exam_dirs = [base]
    else:
        exam_dirs = []
        for p in sorted(pdfs_dir.iterdir()):
            if not p.is_dir():
                continue
            parsed = parse_exam_folder(p.name)
            if parsed is None:
                log.warning(
                    "Ignorando pasta '%s': nao segue o padrao \"{numero}_exame_{ano}\".",
                    p.name,
                )
                continue
            exam_num, exam_year = parsed
            if year is not None and exam_year != year:
                continue
            if exam_number is not None and exam_num != exam_number:
                continue
            exam_dirs.append(p)

        if not exam_dirs:
            log.warning(
                "Nenhuma pasta de exame encontrada em %s com os filtros informados.",
                pdfs_dir,
            )

    files = []
    for exam_dir in exam_dirs:
        for pdf in sorted(exam_dir.glob("*.pdf")):
            if is_gabarito_file(pdf.name):
                continue
            files.append(pdf)
    return files


def main() -> None:
    parser = argparse.ArgumentParser(description="Extrai questoes e gabarito de provas da OAB.")
    parser.add_argument("--year", type=int, help="Processa todos os exames desse ano (pode ser mais de um).")
    parser.add_argument("--exam", type=int, help="Processa apenas o exame com esse numero (ex.: 35).")
    parser.add_argument("--folder", help="Processa apenas a pasta pdfs/<folder>, pelo nome literal.")
    parser.add_argument("--file", help="Processa apenas um arquivo de prova especifico.")
    parser.add_argument("--force", action="store_true", help="Reprocessa mesmo se o JSON ja existir.")
    parser.add_argument(
        "--dump-text", action="store_true",
        help="Salva o texto bruto extraido (.raw.txt) junto ao JSON, util para depuracao.",
    )
    args = parser.parse_args()

    if args.file:
        pdf_path = Path(args.file)
        if not pdf_path.exists():
            log.error("Arquivo nao encontrado: %s", pdf_path)
            return
        process_exam(pdf_path, OUTPUT_DIR, force=args.force, dump_text=args.dump_text)
        return

    exam_files = discover_exam_files(PDFS_DIR, year=args.year, exam_number=args.exam, folder=args.folder)
    if not exam_files:
        log.warning("Nenhum arquivo de prova encontrado em %s", PDFS_DIR)
        return

    for pdf_path in tqdm(exam_files, desc="Provas", unit="arquivo"):
        process_exam(pdf_path, OUTPUT_DIR, force=args.force, dump_text=args.dump_text)


if __name__ == "__main__":
    main()
