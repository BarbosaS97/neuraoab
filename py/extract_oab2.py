#!/usr/bin/env python3
"""
extract_oab2.py — NeuraOAB

Extrai a estrutura completa das provas da 2a fase da OAB (peca profissional +
4 questoes discursivas) a partir de dois PDFs por area do Direito — o caderno
de prova e o padrao de resposta oficial (gabarito comentado + distribuicao
dos pontos) — e salva tudo em JSON estruturado, pronto para importar no
Supabase (ver admin/import2fase.html e supabase/schema_fase2.sql).

Estrutura de pastas esperada (execute a partir de py/):

    py/
    |-- extract_oab2.py
    |-- requirements.txt
    |-- PDF2fase/
    |   |-- 2a fase 46o/
    |   |   |-- 46o_provas_Direito_Administrativo.pdf
    |   |   `-- 46o_resposta_Direito_Administrativo.pdf
    |   `-- 2a fase 47o/
    |       `-- ...
    `-- JSON2fase/
        |-- 2a fase 46o/
        |   `-- Direito_Administrativo.json
        `-- ...

Nomes esperados:
    - Pasta do exame: qualquer nome que contenha o numero do exame (ex.:
      "2a fase 46o", "46o_fase2", "fase2_46"). O MAIOR numero encontrado no
      nome da pasta e usado como numero do exame (o indicador de fase, "2",
      e sempre menor que o numero do exame, entao nao ha ambiguidade).
    - Prova:    "{numero}[o/º]_provas_{Area_Do_Direito}.pdf"
                (ex.: "46º_provas_Direito_Administrativo.pdf")
    - Resposta: "{numero}[o/º]_resposta_{Area_Do_Direito}.pdf"
                (tambem aceita "respostas" ou "gabarito" no lugar de "resposta")
    - A area e obtida trocando "_"/"-" por espaco no trecho apos o marcador
      de tipo de arquivo (ex.: "Direito_Administrativo" -> "Direito Administrativo").
    - Provas e respostas da MESMA area (comparacao case-insensitive, ignorando
      "_"/"-"/espacos) dentro da mesma pasta de exame sao pareadas automaticamente.

Uso:
    python extract_oab2.py                          # processa todos os exames
    python extract_oab2.py --exam 46                 # so a pasta do 46o exame
    python extract_oab2.py --folder "2a fase 46o"     # so essa pasta, pelo nome literal
    python extract_oab2.py --force                    # reprocessa mesmo se o JSON ja existir
    python extract_oab2.py --dump-text                 # salva o texto bruto de cada PDF (.raw.txt), util para depuracao

Como o conteudo e identificado:
    - PROVA: a peca profissional comeca no titulo "PECA PRATICO-PROFISSIONAL"
      (ou "PECA PROFISSIONAL"); cada questao comeca no titulo "QUESTAO N"
      (N = 1 a 4). O valor de cada item/subitem vem do proprio enunciado,
      no padrao "(Valor: X,XX)". Paginas de rascunho (so linhas numeradas,
      para transcricao manual do aluno na prova real) sao detectadas e
      ignoradas automaticamente.
    - RESPOSTA: cada secao comeca no titulo "PADRAO DE RESPOSTA - PECA
      PROFISSIONAL" ou "PADRAO DE RESPOSTA - QUESTAO N", e dentro dela:
      "ENUNCIADO" (repete o enunciado da prova, usado so como fallback),
      "GABARITO COMENTADO" (resposta modelo, comentada) e "DISTRIBUICAO DOS
      PONTOS" (a tabela oficial de criterios de correcao, item a item).
    - A tabela de distribuicao dos pontos e extraida via
      pdfplumber.extract_tables() (ela tem bordas desenhadas no PDF oficial
      da FGV/OAB). Se nenhuma tabela for detectada nas paginas da secao,
      cai para uma extracao por regex sobre o texto corrido (menos
      confiavel — confira com --dump-text se o resultado parecer estranho).

Qualidade / o que fazer com o resultado:
    - Cada criterio extraido guarda tanto os campos estruturados (rotulo,
      descricao, pontuacao_maxima, faixas_possiveis) quanto, no nivel do
      item (peca/questao), o texto bruto completo da secao "DISTRIBUICAO
      DOS PONTOS" (campo "criterios_texto_bruto") — isso garante que, mesmo
      se o parser estruturado errar algum detalhe, a Edge Function de
      correcao (ver supabase/functions/corretor-2fase) sempre tem o texto
      oficial completo do criterio para basear a nota da IA.
    - Linhas da tabela que nao foram reconhecidas como item nem como
      cabecalho de categoria ficam registradas em "linhas_nao_reconhecidas"
      (por item), para voce revisar manualmente se quiser.
    - Sempre revise o total de pontos somado dos criterios contra o valor
      oficial do item (a funcao emite um aviso no log quando a diferenca e
      maior que 0,02).

Limitacoes conhecidas:
    - Depende de heuristicas sobre o texto e sobre a deteccao de tabelas
      com bordas no PDF. Provas com layout muito diferente do padrao
      FGV/OAB podem exigir ajustes nos padroes de regex abaixo.
    - Use --dump-text para inspecionar o texto bruto extraido quando o
      resultado parecer incorreto.
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import statistics
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import pdfplumber
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Configuracao
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
PDFS_DIR = BASE_DIR / "PDF2fase"
OUTPUT_DIR = BASE_DIR / "JSON2fase"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("extract_oab2")


# ---------------------------------------------------------------------------
# Estruturas
# ---------------------------------------------------------------------------

@dataclass
class SubItem:
    letra: str
    enunciado: str
    valor: Optional[float] = None

    def to_dict(self) -> dict:
        return {"letra": self.letra, "enunciado": self.enunciado, "valor": self.valor}


@dataclass
class Criterio:
    rotulo: Optional[str]
    categoria: Optional[str]
    descricao: str
    pontuacao_maxima: Optional[float]
    faixas_possiveis: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "rotulo": self.rotulo,
            "categoria": self.categoria,
            "descricao": self.descricao,
            "pontuacao_maxima": self.pontuacao_maxima,
            "faixas_possiveis": self.faixas_possiveis,
        }


@dataclass
class ItemProva:
    tipo: str  # "peca" | "questao"
    numero: Optional[int]
    enunciado: str = ""
    subitens: list = field(default_factory=list)   # list[SubItem]
    observacao: Optional[str] = None
    valor_total: Optional[float] = None
    gabarito_comentado: Optional[str] = None
    criterios: list = field(default_factory=list)   # list[Criterio]
    criterios_texto_bruto: Optional[str] = None
    linhas_nao_reconhecidas: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "tipo": self.tipo,
            "numero": self.numero,
            "enunciado": self.enunciado,
            "subitens": [s.to_dict() for s in self.subitens],
            "observacao": self.observacao,
            "valor_total": self.valor_total,
            "gabarito_comentado": self.gabarito_comentado,
            "criterios": [c.to_dict() for c in self.criterios],
            "criterios_texto_bruto": self.criterios_texto_bruto,
            "linhas_nao_reconhecidas": self.linhas_nao_reconhecidas,
        }


# ---------------------------------------------------------------------------
# Utilidades de texto
# ---------------------------------------------------------------------------

def strip_accents(text: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFD", text) if unicodedata.category(ch) != "Mn"
    )


def normalize_key(text: str) -> str:
    """Normaliza um nome (ex.: area do Direito) para comparacao: sem acento,
    minusculo, "_"/"-" viram espaco, espacos colapsados."""
    text = strip_accents(text).lower()
    text = re.sub(r"[_\-]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


AMERICAN_DECIMAL_RE = re.compile(r"^\d+\.\d{2}$")


def to_float_br(text: str) -> Optional[float]:
    """Converte um numero no formato brasileiro ("5,00") para float. Tambem
    aceita, como excecao segura, o formato americano com ponto decimal
    ("5.00") sem nenhuma virgula — ja visto por typo em pelo menos um PDF
    oficial (ex.: 42o Exame, Direito Empresarial, "(Valor: 5.00)" em vez de
    "(Valor: 5,00)"). So' trata o ponto como decimal (em vez de milhar)
    quando o texto tem EXATAMENTE 2 casas apos ele e nenhuma virgula — nunca
    ambiguo aqui, ja que nenhum valor de pontuacao da OAB chega perto de
    milhares."""
    text = text.strip()
    if "," not in text and AMERICAN_DECIMAL_RE.match(text):
        try:
            return round(float(text), 2)
        except ValueError:
            return None
    text = text.replace(".", "").replace(",", ".")
    try:
        return round(float(text), 2)
    except ValueError:
        return None


VALOR_RE = re.compile(r"\(\s*Valor:?\s*([\d.,]+)\s*\)", re.IGNORECASE)
OBS_RE = re.compile(r"(?is)Obs\.?:\s*(.+)$")

# pdfplumber.Page.extract_text() NAO preserva paragrafos: o espaco vertical
# extra que o PDF usa entre um paragrafo e o proximo (visivel a olho nu no
# documento) simplesmente nao vira uma linha em branco no texto extraido —
# os paragrafos saem "colados", linha após linha, do mesmo jeito que as
# linhas dentro de um MESMO paragrafo (quebradas so por causa do
# word-wrap). As duas situacoes so' se distinguem pela COORDENADA vertical
# real de cada linha (page.extract_text_lines(), que devolve "top"/"bottom"
# por linha): no padrao FGV/OAB, o espaco entre linhas do mesmo paragrafo
# fica em torno de 2 a 2.5pt, enquanto o espaco entre paragrafos fica em
# torno de 6 a 6.5pt — quase 3x maior. Comparamos cada intervalo com a
# MEDIANA dos intervalos da pagina (robusta a titulos/rodapes, que tem
# espacos bem maiores ainda, mas sao poucos) para decidir o que conta como
# quebra de paragrafo, em vez de um valor fixo em pontos (que quebraria se
# um documento usasse fonte/entrelinha diferente).
PARAGRAPH_GAP_RATIO = 1.7
PARAGRAPH_GAP_MIN_EXTRA = 2.0


def extract_page_lines(page) -> list:
    """Devolve o texto da pagina como uma lista de linhas (mesmo conteudo
    que page.extract_text() devolveria, uma linha por item da lista), com
    uma linha vazia ("") inserida onde a distancia vertical até a linha
    anterior indica o fim de um paragrafo (ver comentario acima)."""
    text_lines = page.extract_text_lines()
    if not text_lines:
        return []

    gaps = [text_lines[i]["top"] - text_lines[i - 1]["bottom"] for i in range(1, len(text_lines))]
    positive_gaps = [g for g in gaps if g > 0]
    typical_gap = statistics.median(positive_gaps) if positive_gaps else 0
    threshold = max(typical_gap * PARAGRAPH_GAP_RATIO, typical_gap + PARAGRAPH_GAP_MIN_EXTRA)

    out = [text_lines[0]["text"]]
    for i in range(1, len(text_lines)):
        if typical_gap > 0 and gaps[i - 1] > threshold:
            out.append("")
        out.append(text_lines[i]["text"])
    return out


def clean_lines(text: str, noise_patterns: list) -> str:
    """Remove linhas de ruido (cabecalho/rodape) e normaliza espacos, mas
    preserva a fronteira entre paragrafos: uma linha em branco no PDF
    (espaco vertical extra entre blocos de texto) vira UMA linha vazia no
    resultado — um marcador que flow_paragraphs() usa depois pra saber onde
    manter a quebra (fim de paragrafo) e onde so' emendar com espaco (quebra
    de linha no meio do mesmo paragrafo, por causa do word-wrap do PDF)."""
    kept = []
    pending_blank = False
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            pending_blank = True
            continue
        if any(p.match(stripped) for p in noise_patterns):
            continue
        if pending_blank and kept:
            kept.append("")
        pending_blank = False
        kept.append(stripped)
    return "\n".join(kept)


def flow_paragraphs(text: str) -> str:
    """Reflui um texto onde fronteiras de paragrafo estao marcadas por uma
    linha vazia (ver clean_lines): linhas consecutivas do MESMO paragrafo
    sao unidas com espaco (desfaz o corte de linha do PDF, que nao tem
    relacao com o layout de tela), e paragrafos ficam separados por uma
    linha em branco ("\\n\\n")."""
    paragraphs = []
    current = []
    for line in text.split("\n"):
        if line == "":
            if current:
                paragraphs.append(" ".join(current))
                current = []
            continue
        current.append(line)
    if current:
        paragraphs.append(" ".join(current))
    return "\n\n".join(re.sub(r"\s+", " ", p).strip() for p in paragraphs)


def extract_and_strip_observacao(block: str) -> tuple:
    """Separa a linha "Obs.: ..." (quando presente) do restante do bloco.
    Devolve (bloco_sem_obs, observacao_ou_None)."""
    m = OBS_RE.search(block)
    if not m:
        return block.strip(), None
    obs = re.sub(r"\s+", " ", m.group(1)).strip()
    return block[: m.start()].strip(), obs or None


# ---------------------------------------------------------------------------
# Deteccao de paginas de rascunho (so linhas numeradas, sem conteudo real)
# ---------------------------------------------------------------------------

# O numero da linha as vezes sai colado com uma unica letra solta (ex.: "13 S"),
# resto de uma marca d'agua diagonal ("RASCUNHO") cuja extracao de texto caiu
# bem em cima do numero — por isso o padrao aceita um sufixo de 1 letra.
BLANK_LINE_NUM_RE = re.compile(r"^\d{1,3}(?:\s*[A-ZÀ-Ü])?$")
# Quando a mesma marca d'agua cai LONGE de qualquer numero, vira uma linha
# inteira formada so' por uma letra solta (ex.: "O", "N", "U", "C", "A" — as
# letras de "RASCUNHO" espalhadas pela pagina). Essas linhas nao contam nem a
# favor nem contra a proporcao abaixo (sao descartadas antes de medir).
STRAY_WATERMARK_LETTER_RE = re.compile(r"^[A-ZÀ-Ü]$")
MIN_LINES_FOR_RULED_CHECK = 10
RULED_LINE_RATIO = 0.85


def is_ruled_or_empty_page(page_text: str) -> bool:
    """Verdadeiro para paginas de rascunho (linhas numeradas 1..30 para
    transcricao manual do aluno na prova real) ou paginas quase vazias
    (ex.: colofao "Realizacao" no fim do caderno)."""
    raw_lines = [ln.strip() for ln in page_text.splitlines() if ln.strip()]
    if not raw_lines:
        return True
    lines = [ln for ln in raw_lines if not STRAY_WATERMARK_LETTER_RE.match(ln)]
    if not lines:
        return True
    if len(lines) < MIN_LINES_FOR_RULED_CHECK:
        # pagina curta demais para ter conteudo real (ex.: colofao)
        joined = " ".join(lines)
        return len(joined) < 40
    numeric = sum(1 for ln in lines if BLANK_LINE_NUM_RE.match(ln))
    return (numeric / len(lines)) >= RULED_LINE_RATIO


# ---------------------------------------------------------------------------
# PROVA — descoberta de secoes e parsing
# ---------------------------------------------------------------------------

PROVA_NOISE_PATTERNS = [
    re.compile(r"^\d+[oº]?\s+EXAME\s+D[EO]\s+ORDEM\s+UNIFICADO$", re.IGNORECASE),
    re.compile(r"^PROVA\s+PR[ÁA]TICO[- ]PROFISSIONAL\s*[–\-]\s*P[ÁA]GINA\s*\d+$", re.IGNORECASE),
    re.compile(r"^QUEST[ÃA]O\s*\d+\s*[–\-]\s*P[ÁA]GINA\s*\d+$", re.IGNORECASE),
    re.compile(r"^CONSELHO\s+FEDERAL$", re.IGNORECASE),
    re.compile(r"^FGV\s*CONHECIMENTO$", re.IGNORECASE),
    re.compile(r"^Realiza[cç][ãa]o$", re.IGNORECASE),
]

PECA_HEADING_RE = re.compile(
    r"^PE[ÇC]A\s+(?:PR[ÁA]TICO[- ]?PROFISSIONAL|PROFISSIONAL)$", re.IGNORECASE | re.MULTILINE
)
QUESTAO_HEADING_RE = re.compile(r"^QUEST[ÃA]O\s+(\d+)$", re.IGNORECASE | re.MULTILINE)
SUBITEM_RE = re.compile(r"(?ms)^\s*\(?([A-D])\)\s*(.*?)\(\s*Valor:?\s*([\d.,]+)\s*\)")


def extract_prova_pages(pdf_path: Path) -> list:
    """Extrai o texto de cada pagina da prova, ja limpo de ruido de
    cabecalho/rodape, descartando paginas de rascunho/colofao."""
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            raw = "\n".join(extract_page_lines(page))
            if is_ruled_or_empty_page(raw):
                continue
            pages.append(clean_lines(raw, PROVA_NOISE_PATTERNS))
    return pages


def find_section_spans(text: str) -> list:
    """Localiza, no texto ja concatenado da prova, os limites de cada
    secao (peca + questoes 1-4). Devolve lista de tuplas
    (tipo, numero, texto_da_secao), na ordem em que aparecem."""
    markers = []
    peca_m = PECA_HEADING_RE.search(text)
    if peca_m:
        markers.append((peca_m.start(), peca_m.end(), "peca", None))
    else:
        log.warning("Titulo da PECA PRATICO-PROFISSIONAL nao encontrado na prova.")

    for m in QUESTAO_HEADING_RE.finditer(text):
        markers.append((m.start(), m.end(), "questao", int(m.group(1))))

    markers.sort(key=lambda t: t[0])
    spans = []
    for idx, (start, content_start, tipo, numero) in enumerate(markers):
        end = markers[idx + 1][0] if idx + 1 < len(markers) else len(text)
        spans.append((tipo, numero, text[content_start:end].strip()))
    return spans


def parse_prova_peca(block: str) -> ItemProva:
    block, obs = extract_and_strip_observacao(block)
    valores = [to_float_br(v) for v in VALOR_RE.findall(block)]
    enunciado = flow_paragraphs(VALOR_RE.sub("", block))
    valor_total = valores[-1] if valores else None
    return ItemProva(tipo="peca", numero=None, enunciado=enunciado, observacao=obs, valor_total=valor_total)


def parse_prova_questao(numero: int, block: str) -> ItemProva:
    block, obs = extract_and_strip_observacao(block)

    subitem_matches = list(SUBITEM_RE.finditer(block))
    intro = block[: subitem_matches[0].start()] if subitem_matches else block
    intro = flow_paragraphs(intro)

    subitens = []
    for m in subitem_matches:
        letra = m.group(1).upper()
        texto = re.sub(r"\s+", " ", m.group(2)).strip()
        valor = to_float_br(m.group(3))
        subitens.append(SubItem(letra=letra, enunciado=texto, valor=valor))

    valor_total = None
    if subitens:
        valores = [s.valor for s in subitens if s.valor is not None]
        if valores:
            valor_total = round(sum(valores), 2)
    else:
        # questao sem subitens lettered (enunciado unico com um so "(Valor: X)")
        valores = [to_float_br(v) for v in VALOR_RE.findall(block)]
        valor_total = valores[-1] if valores else None
        intro = flow_paragraphs(VALOR_RE.sub("", block))

    if not subitens and not intro:
        log.warning("Questao %d: nao foi possivel extrair enunciado/subitens.", numero)

    return ItemProva(
        tipo="questao", numero=numero, enunciado=intro, subitens=subitens,
        observacao=obs, valor_total=valor_total,
    )


def extract_prova(pdf_path: Path) -> dict:
    pages = extract_prova_pages(pdf_path)
    full_text = "\n".join(pages)
    spans = find_section_spans(full_text)

    result = {"peca": None, "questoes": {}}
    for tipo, numero, block in spans:
        if tipo == "peca":
            result["peca"] = parse_prova_peca(block)
        else:
            result["questoes"][numero] = parse_prova_questao(numero, block)

    for n in range(1, 5):
        if n not in result["questoes"]:
            log.warning("Questao %d nao encontrada na prova %s.", n, pdf_path.name)

    return result


# ---------------------------------------------------------------------------
# RESPOSTA (padrao de resposta / gabarito) — descoberta de secoes e parsing
# ---------------------------------------------------------------------------

RESPOSTA_NOISE_PATTERNS = [
    re.compile(r"^ORDEM\s+DOS\s+ADVOGADOS\s+DO\s+BRASIL$", re.IGNORECASE),
    re.compile(r"^\d+[oº]?\s+Exame\s+de\s+Ordem\s+Unificado$", re.IGNORECASE),
    re.compile(r"^Prova\s+Pr[áa]tico[- ][Pp]rofissional\s+Aplicada\s+em\s+\d{2}/\d{2}/\d{4}$", re.IGNORECASE),
    re.compile(r"^Prova\s+Pr[áa]tico[- ][Pp]rofissional\s+P[áa]gina\s*\d+\s*/\s*\d+$", re.IGNORECASE),
    re.compile(r"^Aplicada\s+em\s+\d{2}/\d{2}/\d{4}$", re.IGNORECASE),
    # Layout visto a partir do 43o Exame: cabecalho/rodape "Padrao de Resposta
    # da Prova Pratico-Profissional - 43o Exame de Ordem Unificado Pagina N de
    # M" e a linha "AREA: <area>" repetidos em TODA pagina do PDF (nos exames
    # anteriores essas linhas so apareciam uma vez, no topo). Sem filtrar isso
    # aqui, o texto injeta essas linhas NO MEIO de paragrafos e ate' de tabelas
    # de distribuicao dos pontos sempre que a secao atravessa uma quebra de
    # pagina. A deteccao da area (AREA_RE, usada so' para o aviso de
    # divergencia com o nome do arquivo) roda ANTES desse filtro, sobre a
    # primeira pagina crua (ver extract_resposta), entao filtrar toda
    # ocorrencia de "AREA:" aqui nao perde essa informacao.
    re.compile(
        r"^Padr[ãa]o\s+de\s+Resposta\s+da\s+Prova\s+Pr[áa]tico[- ]?[Pp]rofissional\s*[–\-]\s*"
        r"\d+[oº]?\s*Exame\s+de\s+Ordem\s+Unificado\s+P[áa]gina\s*\d+\s*(?:de|/)\s*\d+$",
        re.IGNORECASE,
    ),
    re.compile(r"^[ÁA]REA:\s*.+$", re.IGNORECASE),
]

AREA_RE = re.compile(r"[ÁA]REA:\s*(.+)", re.IGNORECASE)

PADRAO_PECA_RE = re.compile(
    r"PADR[ÃA]O\s+DE\s+RESPOSTA\s*[–\-:]?\s*PE[ÇC]A\s+(?:PR[ÁA]TICO[- ]?PROFISSIONAL|PROFISSIONAL)",
    re.IGNORECASE,
)
PADRAO_QUESTAO_RE = re.compile(
    r"PADR[ÃA]O\s+DE\s+RESPOSTA\s*[–\-:]?\s*QUEST[ÃA]O\s+(\d+)", re.IGNORECASE
)
ENUNCIADO_HEADING_RE = re.compile(r"^ENUNCIADO$", re.IGNORECASE | re.MULTILINE)
GABARITO_HEADING_RE = re.compile(r"^GABARITO\s+COMENTADO$", re.IGNORECASE | re.MULTILINE)
# Normalmente a peca/questao tem UM padrao de resposta so', com o titulo
# exato "DISTRIBUICAO DOS PONTOS". Mas algumas pecas de Direito do Trabalho
# aceitam DUAS pecas processuais distintas como resposta valida para o mesmo
# enunciado (ex.: 43o Exame — "Excecao de Pre-Executividade" OU "Agravo de
# Peticao", cada uma com seu proprio "Gabarito Comentado"/"Distribuicao dos
# Pontos"), e nesse caso o titulo vem com um sufixo identificando a opcao
# ("Distribuicao dos Pontos – Excecao de Pre-Executividade"). O sufixo
# opcional e' capturado no grupo 1 para rotular cada alternativa (ver
# parse_resposta_section).
DISTRIB_HEADING_RE = re.compile(
    r"^DISTRIBUI[ÇC][ÃA]O\s+DOS\s+PONTOS(?:\s*[–\-:]\s*(.+))?$", re.IGNORECASE | re.MULTILINE
)

# Separador entre os valores da "escada" e' normalmente "/", mas aceita
# tambem espaco (ver comentario em extract_criterios_from_tables sobre
# escadas longas que quebram em duas linhas fisicas dentro da celula).
LADDER_RE = re.compile(r"^\d+,\d+(?:[\s/]+\d+,\d+)+$")
# Rotulo numerico (peca: "1.", "7.1.") ou por letra (questoes: "A.", "B.",
# tambem visto como "A ." com espaco antes do ponto, ou "A1."/"A2." quando o
# subitem da questao tem mais de uma parte, sem espaco nem ponto entre a
# letra e o digito) no inicio de uma celula da tabela de distribuicao dos
# pontos. Para letras o ponto final e OBRIGATORIO (nao opcional como no
# numerico) — "A" sozinho e comum demais como artigo do portugues ("a"
# prova, "a" indisponibilidade) e geraria falsos positivos se aceitassemos
# "A " sem ponto nenhum como rotulo; ja' um digito colado ("A1") ou um
# espaco ANTES do ponto ("A .") sao seguros de aceitar, pois exigem de
# qualquer forma um ponto de verdade logo em seguida.
ITEM_LABEL_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)\.?\s+")
LETTER_LABEL_RE = re.compile(r"^\s*([A-D]\d*)\s*\.\s+")
# Visto a partir do 43o Exame (Direito Civil, peca, itens "5A."/"5B."): duas
# alternativas do MESMO item numerico, letradas em vez de usar o formato
# pontuado "5.1"/"5.2". O ponto final aqui e' OBRIGATORIO (nao opcional,
# diferente do numerico puro em ITEM_LABEL_RE) pela mesma razao da
# LETTER_LABEL_RE: sem ele, um numero de endereco/apartamento no meio do
# enunciado (ex.: "5A" de "Rua X, no 5A") poderia ser confundido com rotulo.
NUM_LETTER_LABEL_RE = re.compile(r"^\s*(\d+[A-D])\.\s+")


def match_item_label(text: str) -> Optional[re.Match]:
    return ITEM_LABEL_RE.match(text) or NUM_LETTER_LABEL_RE.match(text) or LETTER_LABEL_RE.match(text)


def extract_resposta_page_texts(pdf_path: Path) -> list:
    """Devolve o texto (ja limpo de ruido) de cada pagina, na ordem do PDF."""
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            raw = "\n".join(extract_page_lines(page))
            pages.append(clean_lines(raw, RESPOSTA_NOISE_PATTERNS))
    return pages


def find_page_of(pages: list, pattern: re.Pattern) -> Optional[int]:
    for i, text in enumerate(pages):
        if pattern.search(text):
            return i
    return None


def find_resposta_sections(pages: list) -> list:
    """Localiza, por pagina, o inicio de cada secao (peca + questoes 1-4).
    Devolve lista de tuplas (tipo, numero, pagina_inicio), ordenada por
    pagina_inicio."""
    full = "\n".join(pages)
    # mapeia posicao no texto concatenado -> indice de pagina, via offsets
    offsets = []
    pos = 0
    for text in pages:
        offsets.append(pos)
        pos += len(text) + 1  # +1 pelo "\n" usado no join

    def page_of_offset(char_pos: int) -> int:
        lo, hi = 0, len(offsets) - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if offsets[mid] <= char_pos:
                lo = mid
            else:
                hi = mid - 1
        return lo

    markers = []
    m = PADRAO_PECA_RE.search(full)
    if m:
        markers.append(("peca", None, page_of_offset(m.start())))
    else:
        log.warning("Titulo 'PADRAO DE RESPOSTA - PECA PROFISSIONAL' nao encontrado.")

    for m in PADRAO_QUESTAO_RE.finditer(full):
        markers.append(("questao", int(m.group(1)), page_of_offset(m.start())))

    markers.sort(key=lambda t: t[2])
    return markers


CATEGORY_MAX_CHARS = 60
# Cabecalhos de categoria de verdade sao sempre uma palavra/expressao com
# tamanho razoavel ("Pedidos", "Fechamento", "Endereçamento"...). Um limite
# minimo evita confundir uma linha curta de conectivo — como "Ou"/"OU", que
# alguns PDFs oficiais usam (com maiuscula!) pra separar respostas
# alternativas de um MESMO criterio — com um cabecalho de categoria de
# verdade, o que cortaria o criterio no meio e perderia a alternativa.
CATEGORY_MIN_CHARS = 4


def _looks_like_categoria(col_item: str, col_pont_compact: str) -> bool:
    """Cabecalho de categoria (ex.: "Endereçamento", "Mérito recursal"): uma
    linha curta, sem digitos, comecando com maiuscula e sem terminar em
    virgula, com a coluna de pontuacao vazia. O padrao oficial nunca usa
    digitos nesses titulos de agrupamento, e eles nunca terminam com virgula
    nem comecam em minuscula — o que evita confundir com uma linha de
    continuacao de item (que quase sempre cita um valor "(0,10)"/artigo de
    lei, ou e o meio/fim de uma frase que comeca em minuscula ou termina com
    virgula, quando o texto da celula veio fragmentado pelo pdfplumber)."""
    return (
        not col_pont_compact
        and not match_item_label(col_item)
        and not any(ch.isdigit() for ch in col_item)
        and not col_item.endswith((",", ";", ":"))
        and col_item[:1].isupper()
        and CATEGORY_MIN_CHARS <= len(col_item) <= CATEGORY_MAX_CHARS
    )


MISSING_COMMA_TOKEN_RE = re.compile(r"^0\d{2}$")
PROPER_LADDER_TOKEN_RE = re.compile(r"^\d+,\d+$")
# Variante do mesmo typo, vista a partir do 43o Exame: a virgula some bem em
# cima do ponto onde a celula quebra em duas linhas fisicas, entao em vez de
# grudar os dois digitos (o caso "055" acima) ela separa um "0" isolado do
# resto (ex.: "0,00/0,20/0,35/\n0/45/0,55/0,65" em vez de
# "...0,35/0,45/0,55/0,65" — o "0" e o "45" saem como dois tokens distintos,
# porque o \n vira separador de token igual a "/"). So' funde de volta um "0"
# isolado com o token de 2 digitos seguinte quando nenhum dos dois ja' faz
# parte de um numero com virgula (evita mexer em "0,20" ou em algo tipo
# "Art. 45").
SPLIT_DECIMAL_RE = re.compile(r"(?<![\d,])0[\s/]+(\d{2})(?![\d,])")
# Outro typo do material oficial (visto no 40o Exame, Direito Civil, peca,
# item B: "0,00/0,25/0,30/0,35/O,40/0,55/0,65"): a letra maiuscula "O" no
# lugar do digito "0" num valor da escada — provavelmente erro de digitacao
# do proprio PDF original (a tecla "O" fica do lado do "0" no teclado). Sem
# esse reparo, o token inteiro ("O,40") nao bate com \d+,\d+ e quebra o
# LADDER_RE da celula INTEIRA — nao so' aquele valor: a celula deixa de ser
# reconhecida como escada, o item vira "sem pontuacao" na propria linha, e o
# proximo rotulo (que dependia dessa escada) acaba absorvido como
# continuacao do item ANTERIOR em vez de abrir um item novo (ver
# extract_criterios_from_tables). So' troca um "O" isolado (nao colado a
# outra letra/digito, pra' nao mexer em siglas ou trechos de texto real)
# imediatamente seguido de vírgula+dígitos — padrao que so' aparece mesmo
# dentro de uma escada de pontuacao, nunca em prosa normal.
STRAY_LETTER_O_RE = re.compile(r"(?<![A-Za-zÀ-ÿ0-9])O(?=,\d)")
# Terceira variante do mesmo tipo de typo (vista no 40o Exame, Direito
# Constitucional, Questao 2: "0.00/0,55/0,65"): um valor da escada digitado
# com PONTO em vez de virgula — o mesmo erro que to_float_br() ja' trata
# isoladamente (ver AMERICAN_DECIMAL_RE, visto antes no 42o Exame, Direito
# Empresarial, "(Valor: 5.00)"), so' que aqui dentro de uma escada inteira,
# onde ele quebra o LADDER_RE da celula tambem (mistura de separador decimal
# no meio dos demais valores, todos com virgula). Repara ANTES do parser
# tentar casar a celula inteira como escada.
AMERICAN_DECIMAL_TOKEN_RE = re.compile(r"(?<!\d)(\d+)\.(\d{2})(?!\d)")


def _repair_missing_commas(cell: str) -> str:
    """Corrige erros de digitacao ja vistos no material oficial: um valor da
    escada sai sem a virgula, seja colado (ex.: "055" em vez de "0,55" em
    "0,00/055/0,65") seja partido em dois tokens pela quebra de linha da
    celula (ver SPLIT_DECIMAL_RE acima), com a letra "O" no lugar do digito
    "0" (ver STRAY_LETTER_O_RE acima), ou com ponto no lugar de virgula (ver
    AMERICAN_DECIMAL_TOKEN_RE acima) — provavelmente um typo/glitch de
    digitacao do proprio PDF original, ja que os demais valores da mesma
    celula estao corretos. So mexe quando ha pelo menos um outro token na
    mesma celula ja no formato certo — assim nao arrisca alterar um numero
    que nao tem nada a ver com pontuacao."""
    tokens = re.split(r"([\s/]+)", cell)
    if not any(PROPER_LADDER_TOKEN_RE.match(t) for t in tokens):
        return cell
    cell = AMERICAN_DECIMAL_TOKEN_RE.sub(r"\1,\2", cell)
    cell = SPLIT_DECIMAL_RE.sub(r"0,\1", cell)
    cell = STRAY_LETTER_O_RE.sub("0", cell)
    tokens = re.split(r"([\s/]+)", cell)
    return "".join(
        f"{t[0]},{t[1:]}" if MISSING_COMMA_TOKEN_RE.match(t) else t
        for t in tokens
    )


def extract_criterios_from_tables(pdf, page_indices: list) -> tuple:
    """Extrai os criterios de correcao das tabelas com bordas ("DISTRIBUICAO
    DOS PONTOS") nas paginas indicadas. Devolve (criterios, linhas_nao_reconhecidas).

    A descricao de um item costuma quebrar em varias LINHAS FISICAS dentro do
    PDF (o texto e longo demais para caber numa linha so). Quando isso
    acontece, pdfplumber.extract_tables() as vezes devolve cada linha quebrada
    como uma linha SEPARADA da tabela (sem repetir bordas entre elas) — mas,
    ao contrario do que se poderia supor, a coluna de pontuacao ("0,00/0,10"
    etc.) vem preenchida na PRIMEIRA dessas linhas (a que tem o rotulo do
    item, ex.: "7.1." ou "A."), e as linhas de continuacao seguintes vem com a
    coluna de pontuacao vazia. Por isso: um item fecha (e um novo comeca)
    sempre que aparece uma linha cujo texto comeca com um rotulo valido (ver
    match_item_label) — a pontuacao, se houver, e capturada ja nessa primeira
    linha — e toda linha seguinte sem rotulo nem cara de categoria e tratada
    como continuacao do item ainda aberto.

    A posicao da coluna de pontuacao dentro da linha (row) do pdfplumber NAO
    e confiavel — a mesma tabela pode ter, em linhas diferentes, o valor na
    ultima celula, no meio, ou a celula "ITEM" partida em varias colunas
    vazias intercaladas (efeito de linhas verticais espurias detectadas no
    PDF). Por isso procuramos, em CADA celula da linha, qual delas bate com o
    padrao de "escada" de valores (ver LADDER_RE), em vez de assumir uma
    posicao fixa; todas as demais celulas nao vazias sao concatenadas como o
    texto da coluna ITEM, na ordem em que aparecem."""
    criterios = []
    unrecognized = []
    categoria_atual = None
    current: Optional[dict] = None  # {"rotulo", "categoria", "desc_parts", "faixas"}
    # Escada "orfa" (ver comentario mais abaixo, no bloco que a preenche):
    # capturada numa linha sem NENHUM rotulo/texto, esperando o proximo
    # rotulo pra' ser associada a ele.
    pending_faixas: Optional[list] = None

    def close_current():
        nonlocal current
        if current is None:
            return
        descricao = " ".join(p for p in current["desc_parts"] if p).strip()
        if current["faixas"] is None:
            if descricao:
                prefix = f'{current["rotulo"]}. ' if current["rotulo"] else ""
                unrecognized.append(f"{prefix}{descricao} (pontuação não encontrada)")
        elif descricao:
            criterios.append(Criterio(
                rotulo=current["rotulo"], categoria=current["categoria"], descricao=descricao,
                pontuacao_maxima=max(current["faixas"]) if current["faixas"] else None,
                faixas_possiveis=current["faixas"],
            ))
        current = None

    for i in page_indices:
        page = pdf.pages[i]
        for table in page.extract_tables():
            for row in table:
                cells = [(c or "").replace("\n", " ").strip() for c in row]
                cells = [re.sub(r"\s+", " ", c) for c in cells]
                cells = [c for c in cells if c]  # descarta celulas vazias (colunas fantasmas)
                cells = [_repair_missing_commas(c) for c in cells]

                if any(c.upper() in ("ITEM", "PONTUAÇÃO", "PONTUACAO") for c in cells):
                    continue  # cabecalho da tabela

                ladder_idx = None
                faixas = None
                for idx, c in enumerate(cells):
                    # NAO tira todos os espacos aqui: quando a "escada" de
                    # valores e' longa demais pra caber numa linha so' da
                    # celula, pdfplumber quebra ela em duas linhas fisicas —
                    # apos o join com espaco (linha 622), o separador entre
                    # o ultimo valor de uma linha e o primeiro da proxima
                    # vira um ESPACO em vez de "/" (ex.: "...0,45 0,55...").
                    # Tirar o espaco corromperia os dois numeros colados
                    # ("0,450,55"), entao LADDER_RE aceita espaco OU barra
                    # como separador, e o split abaixo faz o mesmo.
                    if LADDER_RE.match(c):
                        ladder_idx = idx
                        faixas = [to_float_br(p) for p in re.split(r"[\s/]+", c)]
                        faixas = [f for f in faixas if f is not None]
                        break

                col_item = " ".join(c for idx, c in enumerate(cells) if idx != ladder_idx)
                col_pont_compact = cells[ladder_idx].replace(" ", "") if ladder_idx is not None else ""

                if not col_item and not col_pont_compact:
                    continue

                # Linha "orfa": SO' a escada de pontuacao, sem nenhum
                # rotulo/texto de item (visto no 40o Exame, Direito
                # Tributario, Questao 1: pdfplumber quebrou a MESMA linha
                # logica da tabela em duas linhas fisicas porque a celula da
                # esquerda — rotulo "B." + descricao — ficou mais alta que a
                # da direita, e a escada "vazou" pra' uma linha vazia que
                # aparece ANTES da linha com o rotulo de verdade). Sem isso,
                # esse valor era descartado em silencio (nada nesta funcao
                # tinha onde guarda-lo) e o rotulo seguinte, chegando sem
                # escada propria, caia justamente no ramo abaixo que trata
                # "sem escada" como continuacao do item anterior — perdendo
                # um criterio inteiro. Guarda aqui pra' usar no PROXIMO
                # rotulo que chegar sem escada propria.
                if not col_item and faixas is not None:
                    pending_faixas = faixas
                    continue

                label_m = match_item_label(col_item)
                if label_m:
                    # Visto no 43o Exame (Direito Administrativo, peca, itens
                    # "2."/"3." sob "Qualificacao das partes"): um item com
                    # rotulo PROPRIO mas SEM escada de pontuacao na sua
                    # propria linha, logo depois de um item ainda aberto —
                    # nesse caso a escada inteira do criterio (ex.: autor +
                    # todos os reus) ja' esta' na linha do item ANTERIOR, e
                    # este rotulo novo e' so' a continuacao da MESMA
                    # descricao (mais uma parte do mesmo criterio combinado),
                    # nao um item novo e distinto — que ficaria pra sempre
                    # sem pontuacao propria e cairia em linhas_nao_reconhecidas
                    # se tratado como novo. So' faz isso quando ha um item
                    # aberto, esta linha nao trouxe sua propria escada, E nao
                    # ha' nenhuma escada orfa esperando (ver bloco acima) —
                    # se houver, e' ELA que pertence a este rotulo, entao o
                    # comportamento correto e' abrir um item novo com ela
                    # (branch de baixo), nao tratar como continuacao.
                    if current is not None and faixas is None and pending_faixas is None:
                        current["desc_parts"].append(col_item[label_m.end():].strip())
                        continue
                    close_current()
                    current = {
                        "rotulo": label_m.group(1),
                        "categoria": categoria_atual,
                        "desc_parts": [col_item[label_m.end():].strip()],
                        "faixas": faixas if faixas is not None else pending_faixas,
                    }
                    pending_faixas = None
                    continue

                if _looks_like_categoria(col_item, col_pont_compact):
                    close_current()
                    categoria_atual = col_item
                    continue

                if current is not None:
                    if col_item:
                        current["desc_parts"].append(col_item)
                    if faixas is not None and current["faixas"] is None:
                        current["faixas"] = faixas
                    continue

                if col_item:
                    unrecognized.append(col_item)

    close_current()
    return criterios, unrecognized


def extract_criterios_fallback_regex(section_distrib_text: str) -> tuple:
    """Fallback quando nenhuma tabela com bordas foi detectada: tenta separar
    os itens por regex sobre o texto corrido da secao DISTRIBUICAO DOS
    PONTOS. Menos confiavel que extract_criterios_from_tables."""
    criterios = []
    unrecognized = []
    categoria_atual = None

    section_distrib_text = re.sub(
        r"(?im)^\s*ITEM\s+PONTUA[ÇC][ÃA]O\s*$\n?", "", section_distrib_text
    )
    ladder_matches = list(re.finditer(r"\d+,\d+(?:[\s/]+\d+,\d+)+", section_distrib_text))
    if not ladder_matches:
        if section_distrib_text.strip():
            unrecognized.append(section_distrib_text.strip())
        return criterios, unrecognized

    cursor = 0
    for m in ladder_matches:
        chunk = section_distrib_text[cursor:m.start()].strip()
        cursor = m.end()
        if not chunk:
            continue
        label_m = match_item_label(chunk)
        if label_m:
            rotulo = label_m.group(1)
            descricao = chunk[label_m.end():].strip()
        else:
            # pode ser um cabecalho de categoria colado antes do item real;
            # separa a ultima linha (o item) do resto (categoria)
            parts = chunk.rsplit("\n", 1)
            if len(parts) == 2 and match_item_label(parts[1].strip()):
                categoria_atual = parts[0].strip() or categoria_atual
                sub_m = match_item_label(parts[1].strip())
                rotulo = sub_m.group(1)
                descricao = parts[1].strip()[sub_m.end():].strip()
            else:
                rotulo = None
                descricao = chunk

        faixas = [to_float_br(p) for p in re.split(r"[\s/]+", m.group(0))]
        faixas = [f for f in faixas if f is not None]
        criterios.append(Criterio(
            rotulo=rotulo, categoria=categoria_atual, descricao=descricao,
            pontuacao_maxima=max(faixas) if faixas else None, faixas_possiveis=faixas,
        ))

    return criterios, unrecognized


def parse_resposta_section_multi_gabarito(
    section_text: str, enun_m: Optional[re.Match], gab_matches: list, dist_matches: list, label: str,
) -> dict:
    """Trata secoes com MAIS de um gabarito valido para o mesmo enunciado
    (visto a partir do 43o Exame: a peca de Direito do Trabalho aceita
    Excecao de Pre-Executividade OU Agravo de Peticao como resposta correta
    para o mesmo caso) — cada alternativa tem seu proprio par "Gabarito
    Comentado" + "Distribuicao dos Pontos" ("Distribuicao dos Pontos –
    Excecao de Pre-Executividade", depois "Distribuicao dos Pontos – Agravo
    de Peticao"). Mesclar os criterios das duas alternativas numa unica
    lista estruturada somaria em dobro o valor da peca (cada alternativa ja
    vale o total sozinha) e faria a correcao por IA cobrar os dois formatos
    ao mesmo tempo do aluno. Por isso aqui os criterios estruturados ficam
    vazios de proposito: gabarito_comentado e criterios_texto_bruto reunem
    as duas alternativas, cada uma claramente rotulada, e a Edge Function de
    correcao (que sempre usa criterios_texto_bruto como contexto quando nao
    ha criterios estruturados — ver supabase/functions/corretor-2fase) decide
    sozinha, pelo texto do aluno, qual alternativa foi escolhida. O
    valor_total do item continua vindo do proprio enunciado da prova (nao ha
    soma de criterios para sobrescreve-lo — ver check_point_sum), o que esta'
    correto aqui: o valor e' o mesmo nas duas alternativas."""
    log.info(
        "Secao '%s': %d gabaritos alternativos detectados (a peca aceita mais de um formato de "
        "resposta) — criterios estruturados desativados para esta secao; a correcao usara so' o "
        "texto bruto de cada alternativa.",
        label, max(len(gab_matches), len(dist_matches)),
    )

    def block_end(matches: list, idx: int) -> int:
        return matches[idx + 1].start() if idx + 1 < len(matches) else len(section_text)

    gabarito_blocks = []
    for i, gm in enumerate(gab_matches):
        rotulo = None
        if i < len(dist_matches) and dist_matches[i].group(1):
            rotulo = re.sub(r"\s+", " ", dist_matches[i].group(1)).strip()
        # O narrativo do gabarito_i termina no inicio da SUA PROPRIA
        # distribuicao dos pontos (dist_matches[i]), nao no proximo titulo de
        # gabarito — senao, na ULTIMA alternativa (que nao tem "proximo
        # gabarito" pra servir de limite), o narrativo engoliria tambem a
        # tabela de distribuicao dos pontos inteira ate' o fim da secao.
        end = dist_matches[i].start() if i < len(dist_matches) else block_end(gab_matches, i)
        texto = flow_paragraphs(section_text[gm.end():end])
        gabarito_blocks.append({"rotulo": rotulo or f"Opção {i + 1}", "texto": texto})

    distrib_blocks = []
    for i, dm in enumerate(dist_matches):
        rotulo = re.sub(r"\s+", " ", dm.group(1)).strip() if dm.group(1) else f"Opção {i + 1}"
        texto = re.sub(r"\n{2,}", "\n", section_text[dm.end():block_end(gab_matches, i) if i < len(gab_matches) else block_end(dist_matches, i)]).strip()
        distrib_blocks.append({"rotulo": rotulo, "texto": texto})

    gabarito_comentado = "\n\n".join(
        f"[[Opção de resposta: {b['rotulo']}]]\n{b['texto']}" for b in gabarito_blocks if b["texto"]
    ) or None
    criterios_texto_bruto = "\n\n".join(
        f"[[Distribuição dos pontos — Opção: {b['rotulo']}]]\n{b['texto']}" for b in distrib_blocks if b["texto"]
    ) or None

    enunciado_resposta = None
    if enun_m:
        end = gab_matches[0].start() if gab_matches else len(section_text)
        enunciado_resposta = flow_paragraphs(section_text[enun_m.end():end])

    return {
        "gabarito_comentado": gabarito_comentado,
        "enunciado_resposta": enunciado_resposta,
        "criterios": [],
        "criterios_texto_bruto": criterios_texto_bruto,
        "linhas_nao_reconhecidas": [],
    }


def parse_resposta_section(
    pdf, pages: list, tipo: str, numero: Optional[int], page_start: int, page_end: int
) -> dict:
    """Extrai gabarito_comentado + criterios de uma secao (peca ou questao),
    delimitada pelas paginas [page_start, page_end)."""
    section_text = "\n".join(pages[page_start:page_end])

    label = f"questao {numero}" if tipo == "questao" else "peca profissional"

    enun_m = ENUNCIADO_HEADING_RE.search(section_text)
    gab_matches = list(GABARITO_HEADING_RE.finditer(section_text))
    dist_matches = list(DISTRIB_HEADING_RE.finditer(section_text))

    if len(gab_matches) > 1 or len(dist_matches) > 1:
        return parse_resposta_section_multi_gabarito(section_text, enun_m, gab_matches, dist_matches, label)

    gab_m = gab_matches[0] if gab_matches else None
    dist_m = dist_matches[0] if dist_matches else None

    gabarito_comentado = None
    if gab_m:
        end = dist_m.start() if dist_m else len(section_text)
        gabarito_comentado = flow_paragraphs(section_text[gab_m.end():end])
    else:
        log.warning("Secao '%s': titulo GABARITO COMENTADO nao encontrado.", label)

    enunciado_resposta = None
    if enun_m:
        end = gab_m.start() if gab_m else (dist_m.start() if dist_m else len(section_text))
        enunciado_resposta = flow_paragraphs(section_text[enun_m.end():end])

    criterios: list = []
    unrecognized: list = []
    criterios_texto_bruto = None
    if dist_m:
        # texto bruto da secao (do titulo ate o fim do intervalo de paginas
        # desta secao), preservado para a Edge Function usar como contexto
        # mesmo se o parser estruturado deixar passar algum detalhe.
        criterios_texto_bruto = re.sub(r"\n{2,}", "\n", section_text[dist_m.end():]).strip()

        dist_page = find_page_of(pages[page_start:page_end], DISTRIB_HEADING_RE)
        table_page_indices = list(range(page_start + dist_page, page_end)) if dist_page is not None else []
        criterios, unrecognized = extract_criterios_from_tables(pdf, table_page_indices)

        if not criterios:
            log.info("Secao '%s': nenhuma tabela com bordas detectada, usando fallback por regex.", label)
            criterios, unrecognized = extract_criterios_fallback_regex(criterios_texto_bruto)
    else:
        log.warning("Secao '%s': titulo DISTRIBUICAO DOS PONTOS nao encontrado.", label)

    return {
        "gabarito_comentado": gabarito_comentado,
        "enunciado_resposta": enunciado_resposta,
        "criterios": criterios,
        "criterios_texto_bruto": criterios_texto_bruto,
        "linhas_nao_reconhecidas": unrecognized,
    }


def extract_resposta(pdf_path: Path) -> dict:
    with pdfplumber.open(pdf_path) as pdf:
        # A area e' lida da primeira pagina CRUA (antes do filtro de ruido),
        # pois RESPOSTA_NOISE_PATTERNS agora descarta toda linha "AREA: ..."
        # (ela se repete em toda pagina em exames mais recentes — ver
        # comentario em RESPOSTA_NOISE_PATTERNS).
        raw_first_page = "\n".join(extract_page_lines(pdf.pages[0])) if pdf.pages else ""
        pages = extract_resposta_page_texts(pdf_path)
        markers = find_resposta_sections(pages)

        area = None
        area_m = AREA_RE.search(raw_first_page)
        if area_m:
            area = re.sub(r"\s+", " ", area_m.group(1)).strip()

        result = {"peca": None, "questoes": {}, "area": area}
        for idx, (tipo, numero, page_start) in enumerate(markers):
            page_end = markers[idx + 1][2] if idx + 1 < len(markers) else len(pages)
            parsed = parse_resposta_section(pdf, pages, tipo, numero, page_start, page_end)
            if tipo == "peca":
                result["peca"] = parsed
            else:
                result["questoes"][numero] = parsed

        for n in range(1, 5):
            if n not in result["questoes"]:
                log.warning("Questao %d nao encontrada no padrao de resposta %s.", n, pdf_path.name)

        return result


# ---------------------------------------------------------------------------
# Combinacao prova + resposta
# ---------------------------------------------------------------------------

POINT_SUM_TOLERANCE = 0.02


MIN_DESCRICAO_CHARS = 20

PARENT_ROTULO_RE = re.compile(r"^\d+$")


def drop_redundant_parent_criterios(criterios: list) -> list:
    """Alguns padroes de resposta oficiais escrevem um criterio "pai" (rotulo
    "5") por extenso, com a SOMA dos pontos das partes, e logo em seguida
    quebram o mesmo conteudo em sub-criterios "5.1", "5.2" etc — a MESMA
    argumentacao, uma vez inteira e outra vez fatiada (ex.: 45o Exame,
    Direito Administrativo, peca, itens 5 e 6: pai vale 0,80, filhos 5.1
    (0,50) + 5.2 (0,30) tambem somam 0,80). Manter as duas versoes
    duplicaria a pontuacao na correcao por IA.

    So' descarta o "pai" quando ha' PELO MENOS DOIS filhos imediatamente
    seguintes ("N.1", "N.2"...) cuja soma bate com o valor do proprio pai
    (dentro da tolerancia) — essa combinacao (2+ filhos E mesma soma) e' a
    assinatura de que e' uma repeticao do mesmo conteudo fatiado, e nao
    criterios genuinamente separados. Ja se viu o caso contrario no mesmo
    exame (45o, Direito Civil, peca, item 8: pai vale 0,40, mas os filhos
    8.1 (0,20) + 8.2 (0,30) somam 0,50 — valores diferentes, TRES criterios
    distintos que devem ser somados, nao um pai redundante).

    Exigir 2+ filhos evita outro falso positivo real, visto no 42o Exame,
    Direito Administrativo: item "1" (endereçar a peca ao juizo a quo) e seu
    UNICO "filho" "1.1" (endereçar as razoes ao tribunal ad quem) sao dois
    REQUISITOS DIFERENTES de uma peca recursal — coincidem em valor (0,10
    cada) so' porque cada exigencia isolada vale o mesmo, nao porque um
    repete o outro. Com um so' filho, a numeracao "N.1" e' comum demais
    para servir de sub-item genuino (endereçamento em duas partes, ou um
    "1.1" que e' na real proximo requisito autonomo) para arriscar apagar
    conteudo — so' o padrao de 2+ filhos e' especifico o bastante."""
    result = []
    i = 0
    while i < len(criterios):
        c = criterios[i]
        rotulo = c.rotulo or ""
        is_parent_candidate = bool(PARENT_ROTULO_RE.match(rotulo))

        children = []
        if is_parent_candidate:
            j = i + 1
            while j < len(criterios) and (criterios[j].rotulo or "").startswith(rotulo + "."):
                children.append(criterios[j])
                j += 1

        if len(children) >= 2:
            parent_max = c.pontuacao_maxima or 0
            children_sum = round(sum(ch.pontuacao_maxima or 0 for ch in children), 2)
            if abs(parent_max - children_sum) <= POINT_SUM_TOLERANCE:
                i += 1  # pai redundante: descarta so' ele, mantem os filhos
                continue
        result.append(c)
        i += 1
    return result


def check_point_sum(item: ItemProva, label: str) -> None:
    if not item.criterios:
        return
    soma = round(sum(c.pontuacao_maxima for c in item.criterios if c.pontuacao_maxima is not None), 2)

    # A distribuicao dos pontos (criterios) e' o que efetivamente vale nota
    # na correcao por IA — nao o "(Valor: X)" impresso no enunciado da
    # prova. Os dois DEVERIAM sempre bater, mas os PDFs oficiais da banca
    # ocasionalmente tem uma inconsistencia entre eles (ex.: 46o Exame,
    # Direito Civil, Questao 1: o enunciado da PROVA diz "(Valor: 0,60)"
    # para o item A, mas tanto o enunciado quanto a tabela reimpressos no
    # PADRAO DE RESPOSTA dizem 0,65 para o mesmo item — um erro do proprio
    # material oficial, nao do parser). Por isso o valor_total final do
    # item sempre segue a soma dos criterios: e' o unico numero que a IA
    # realmente usa como teto de nota (ver corrigindoStatus em
    # supabase/functions/corretor-2fase), entao e' o que deve aparecer
    # tambem pro aluno no caderno, para nao mostrar um total diferente do
    # que de fato vale a questao.
    if item.valor_total is not None and abs(soma - item.valor_total) > POINT_SUM_TOLERANCE:
        log.warning(
            "%s: valor do enunciado da prova (%.2f) difere da soma dos criterios oficiais do "
            "padrao de resposta (%.2f) — provavel inconsistencia no material oficial da banca. "
            "Usando %.2f (soma dos criterios) como valor_total, pois e' isso que a IA usa como "
            "teto de nota na correcao.",
            label, item.valor_total, soma, soma,
        )
    if soma > 0:
        item.valor_total = soma

    # pdfplumber pode, em casos raros, deixar de incluir alguma linha
    # quebrada de uma celula na tabela extraida (perda na propria biblioteca,
    # nao um problema de agrupamento) — o valor do criterio fica correto (veio
    # do rotulo/pontuacao, que sempre aparecem juntos na primeira linha), mas
    # a descricao sai truncada. Isso nao compromete a correcao por IA (que
    # sempre recebe tambem "criterios_texto_bruto", com o texto completo da
    # secao via extracao simples de texto), mas vale avisar para revisão.
    for c in item.criterios:
        if c.pontuacao_maxima and len(c.descricao) < MIN_DESCRICAO_CHARS:
            log.warning(
                "%s: criterio '%s' com descricao muito curta (%r) — a extracao da tabela pode ter "
                "perdido parte do texto; a nota nao e afetada (o valor veio do rotulo/pontuacao), mas "
                "confira 'criterios_texto_bruto' no JSON para o texto completo do criterio.",
                label, c.rotulo, c.descricao,
            )


def merge_item(prova_item: Optional[ItemProva], resposta_data: Optional[dict], label: str) -> ItemProva:
    if prova_item is None:
        prova_item = ItemProva(tipo="questao" if "questao" in label else "peca", numero=None)
        log.warning("%s: sem dados da prova, usando apenas o padrao de resposta.", label)

    if resposta_data:
        prova_item.gabarito_comentado = resposta_data.get("gabarito_comentado")
        prova_item.criterios = drop_redundant_parent_criterios(resposta_data.get("criterios", []))
        prova_item.criterios_texto_bruto = resposta_data.get("criterios_texto_bruto")
        prova_item.linhas_nao_reconhecidas = resposta_data.get("linhas_nao_reconhecidas", [])
        if not prova_item.enunciado and resposta_data.get("enunciado_resposta"):
            prova_item.enunciado = resposta_data["enunciado_resposta"]
    else:
        log.warning("%s: sem dados do padrao de resposta.", label)

    check_point_sum(prova_item, label)
    return prova_item


def build_exam_json(
    exam_number: int, area: str, prova_data: dict, resposta_data: dict,
    provas_file: str, resposta_file: str,
) -> dict:
    peca = merge_item(prova_data.get("peca"), resposta_data.get("peca"), "Peca profissional")
    questoes = []
    for n in range(1, 5):
        q = merge_item(prova_data["questoes"].get(n), resposta_data["questoes"].get(n), f"Questao {n}")
        q.numero = n
        questoes.append(q)

    valor_total_prova = round(
        (peca.valor_total or 0) + sum(q.valor_total or 0 for q in questoes), 2
    )

    return {
        "exam_number": exam_number,
        "phase": 2,
        "area": area,
        "source_provas_file": provas_file,
        "source_resposta_file": resposta_file,
        "peca": peca.to_dict(),
        "questoes": [q.to_dict() for q in questoes],
        "valor_total_prova": valor_total_prova,
    }


# ---------------------------------------------------------------------------
# Descoberta de arquivos
# ---------------------------------------------------------------------------

PROVA_FILE_RE = re.compile(r"^\d+[oº]?[ _\-]+provas?[ _\-]+(.+)\.pdf$", re.IGNORECASE)
RESPOSTA_FILE_RE = re.compile(r"^\d+[oº]?[ _\-]+(?:respostas?|gabarito)[ _\-]+(.+)\.pdf$", re.IGNORECASE)


def parse_exam_folder_number(folder_name: str) -> Optional[int]:
    """O numero do exame e sempre bem maior que o indicador de fase ("2" de
    "2a fase") que costuma aparecer no mesmo nome de pasta — por isso usamos
    o MAIOR numero encontrado, e nao o ultimo (que pegaria o "2" de um nome
    como "46o_fase2")."""
    numbers = [int(n) for n in re.findall(r"\d+", folder_name)]
    return max(numbers) if numbers else None


def area_from_match(match_text: str) -> str:
    return re.sub(r"[_\-]+", " ", match_text).strip()


def discover_pairs(exam_dir: Path) -> list:
    """Pareia, dentro da pasta de um exame, cada PDF de prova com o PDF de
    resposta da mesma area. Devolve lista de dicts
    {area, provas_path, resposta_path}."""
    provas_by_key = {}
    resposta_by_key = {}

    for pdf in sorted(exam_dir.glob("*.pdf")):
        m_prova = PROVA_FILE_RE.match(pdf.name)
        if m_prova:
            area = area_from_match(m_prova.group(1))
            provas_by_key[normalize_key(area)] = (area, pdf)
            continue
        m_resp = RESPOSTA_FILE_RE.match(pdf.name)
        if m_resp:
            area = area_from_match(m_resp.group(1))
            resposta_by_key[normalize_key(area)] = (area, pdf)
            continue
        log.warning(
            "Arquivo '%s' nao segue o padrao esperado (\"{numero}_provas_{Area}.pdf\" ou "
            "\"{numero}_resposta_{Area}.pdf\"). Ignorando.", pdf.name,
        )

    pairs = []
    all_keys = set(provas_by_key) | set(resposta_by_key)
    for key in sorted(all_keys):
        prova_entry = provas_by_key.get(key)
        resposta_entry = resposta_by_key.get(key)
        if prova_entry and resposta_entry:
            area = prova_entry[0]
            pairs.append({"area": area, "provas_path": prova_entry[1], "resposta_path": resposta_entry[1]})
        elif prova_entry:
            log.error("Area '%s': prova encontrada sem o respectivo arquivo de resposta. Pulando.", prova_entry[0])
        else:
            log.error("Area '%s': resposta encontrada sem o respectivo arquivo de prova. Pulando.", resposta_entry[0])

    return pairs


def discover_exam_dirs(pdfs_dir: Path, exam_number: Optional[int] = None, folder: Optional[str] = None) -> list:
    if not pdfs_dir.exists():
        log.error("Pasta nao encontrada: %s", pdfs_dir)
        return []

    if folder:
        base = pdfs_dir / folder
        if not base.exists():
            log.error("Pasta nao encontrada: %s", base)
            return []
        return [base]

    dirs = []
    for p in sorted(pdfs_dir.iterdir()):
        if not p.is_dir():
            continue
        num = parse_exam_folder_number(p.name)
        if num is None:
            log.warning("Ignorando pasta '%s': nao foi possivel identificar o numero do exame no nome.", p.name)
            continue
        if exam_number is not None and num != exam_number:
            continue
        dirs.append(p)

    if not dirs:
        log.warning("Nenhuma pasta de exame encontrada em %s com os filtros informados.", pdfs_dir)
    return dirs


# ---------------------------------------------------------------------------
# Pipeline principal
# ---------------------------------------------------------------------------

def process_pair(
    exam_dir: Path, pair: dict, exam_number: int, output_dir: Path,
    force: bool, dump_text: bool,
) -> None:
    area = pair["area"]
    provas_path: Path = pair["provas_path"]
    resposta_path: Path = pair["resposta_path"]

    slug = re.sub(r"\s+", "_", area.strip())
    out_path = output_dir / exam_dir.name / f"{slug}.json"
    if out_path.exists() and not force:
        log.info("Pulando (ja processado): %s", out_path)
        return

    log.info("Processando %sº exame — %s", exam_number, area)

    try:
        prova_data = extract_prova(provas_path)
    except Exception:
        log.exception("Falha ao extrair a prova %s", provas_path)
        return

    try:
        resposta_data = extract_resposta(resposta_path)
    except Exception:
        log.exception("Falha ao extrair o padrao de resposta %s", resposta_path)
        return

    if resposta_data.get("area") and normalize_key(resposta_data["area"]) != normalize_key(area):
        log.warning(
            "Area no nome do arquivo ('%s') difere da area informada no PDF de resposta ('%s').",
            area, resposta_data["area"],
        )

    if dump_text:
        debug_dir = output_dir / exam_dir.name
        debug_dir.mkdir(parents=True, exist_ok=True)
        (debug_dir / f"{slug}.provas.raw.txt").write_text(
            "\n".join(extract_prova_pages(provas_path)), encoding="utf-8",
        )
        (debug_dir / f"{slug}.resposta.raw.txt").write_text(
            "\n".join(extract_resposta_page_texts(resposta_path)), encoding="utf-8",
        )

    data = build_exam_json(
        exam_number, area, prova_data, resposta_data,
        provas_path.name, resposta_path.name,
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    n_criterios = len(data["peca"]["criterios"]) + sum(len(q["criterios"]) for q in data["questoes"])
    log.info(
        "Salvo: %s (peca + %d questoes, %d criterios extraidos, valor total %.2f)",
        out_path, len(data["questoes"]), n_criterios, data["valor_total_prova"],
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Extrai provas da 2a fase da OAB (peca + questoes + gabarito comentado).")
    parser.add_argument("--exam", type=int, help="Processa apenas o exame com esse numero (ex.: 46).")
    parser.add_argument("--folder", help="Processa apenas a pasta PDF2fase/<folder>, pelo nome literal.")
    parser.add_argument("--force", action="store_true", help="Reprocessa mesmo se o JSON ja existir.")
    parser.add_argument(
        "--dump-text", action="store_true",
        help="Salva o texto bruto extraido de cada PDF (.raw.txt) junto ao JSON, util para depuracao.",
    )
    args = parser.parse_args()

    exam_dirs = discover_exam_dirs(PDFS_DIR, exam_number=args.exam, folder=args.folder)
    if not exam_dirs:
        return

    all_pairs = []
    for exam_dir in exam_dirs:
        num = parse_exam_folder_number(exam_dir.name)
        if num is None:
            continue
        for pair in discover_pairs(exam_dir):
            all_pairs.append((exam_dir, pair, num))

    if not all_pairs:
        log.warning("Nenhum par prova/resposta encontrado.")
        return

    for exam_dir, pair, num in tqdm(all_pairs, desc="Provas 2a fase", unit="area"):
        process_pair(exam_dir, pair, num, OUTPUT_DIR, force=args.force, dump_text=args.dump_text)


if __name__ == "__main__":
    main()
