// NeuraOAB — Portal do Professor — gráfico de linha simples em SVG puro, sem
// nenhuma lib externa — usado no resumo de evolução da turma (1 linha) e no
// gráfico "aluno vs turma" do detalhe do aluno (2 linhas).
//
// series: [{ name, color, points: [{ x: label, y: 0-100 }] }]
// Todas as séries devem compartilhar o mesmo eixo X (mesmos labels), na
// mesma ordem — o eixo X desenhado é o da série com mais pontos.

const CHART_HEIGHT = 180;
const CHART_PAD = { top: 12, right: 16, bottom: 26, left: 30 };

function svgEl(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

function buildLineChartSVG(container, series, opts) {
  container.innerHTML = "";
  const nonEmpty = (series || []).filter((s) => s.points && s.points.length > 0);

  if (nonEmpty.length === 0) {
    const empty = document.createElement("p");
    empty.className = "field-hint";
    empty.textContent = (opts && opts.emptyText) || "Sem dados suficientes ainda.";
    container.appendChild(empty);
    return;
  }

  const width = (opts && opts.width) || container.clientWidth || 420;
  const height = CHART_HEIGHT;
  const innerW = width - CHART_PAD.left - CHART_PAD.right;
  const innerH = height - CHART_PAD.top - CHART_PAD.bottom;

  // Eixo X: labels da série mais longa (as demais são plotadas nas mesmas
  // posições relativas, mesmo que tenham menos pontos — pode acontecer
  // quando a turma tem histórico mais longo que um aluno específico, ou
  // vice-versa).
  const labels = nonEmpty.reduce((longest, s) => (s.points.length > longest.length ? s.points.map((p) => p.x) : longest), []);
  const xStep = labels.length > 1 ? innerW / (labels.length - 1) : 0;
  const xForIndex = (idx) => CHART_PAD.left + (labels.length > 1 ? idx * xStep : innerW / 2);
  const yForValue = (val) => CHART_PAD.top + innerH - (Math.max(0, Math.min(100, val)) / 100) * innerH;

  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width: "100%",
    height,
    role: "img",
    "aria-label": (opts && opts.ariaLabel) || "Gráfico de evolução",
  });

  // Grade horizontal pontilhada + labels do eixo Y (0/25/50/75/100).
  [0, 25, 50, 75, 100].forEach((tick) => {
    const y = yForValue(tick);
    svg.appendChild(svgEl("line", {
      x1: CHART_PAD.left, x2: width - CHART_PAD.right, y1: y, y2: y,
      stroke: "var(--panel-border)", "stroke-width": 1, "stroke-dasharray": "3 4",
    }));
    const label = svgEl("text", {
      x: CHART_PAD.left - 8, y: y + 3, "text-anchor": "end",
      fill: "var(--text-dim)", "font-size": 10,
    });
    label.textContent = tick;
    svg.appendChild(label);
  });

  // Eixo X.
  labels.forEach((lbl, idx) => {
    const label = svgEl("text", {
      x: xForIndex(idx), y: height - 8, "text-anchor": "middle",
      fill: "var(--text-dim)", "font-size": 10,
    });
    label.textContent = lbl;
    svg.appendChild(label);
  });

  nonEmpty.forEach((s) => {
    const pts = s.points.map((p, idx) => ({ x: xForIndex(idx), y: yForValue(p.y) }));
    if (pts.length === 1) {
      svg.appendChild(svgEl("circle", { cx: pts[0].x, cy: pts[0].y, r: 3.5, fill: s.color }));
      return;
    }
    const d = pts.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    svg.appendChild(svgEl("path", { d, fill: "none", stroke: s.color, "stroke-width": 2.5, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    pts.forEach((p) => {
      svg.appendChild(svgEl("circle", { cx: p.x, cy: p.y, r: 3, fill: s.color }));
    });
  });

  container.appendChild(svg);

  if (nonEmpty.length > 1) {
    const legend = document.createElement("div");
    legend.className = "chart-legend";
    nonEmpty.forEach((s) => {
      const item = document.createElement("span");
      item.className = "chart-legend-item";
      const dot = document.createElement("i");
      dot.style.background = s.color;
      item.append(dot, document.createTextNode(s.name));
      legend.appendChild(item);
    });
    container.appendChild(legend);
  }
}
