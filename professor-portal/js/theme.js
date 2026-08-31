// NeuraOAB — Portal do Professor — alternância de tema claro/escuro.
//
// Mesmo mecanismo de estudos/simulado2fase.js (applyTheme): atributo
// data-theme em <html> + localStorage. MESMA chave "neuraoab-theme" de
// propósito — mesma origem/localStorage, então a preferência de tema fica
// compartilhada entre o Portal do Professor e o app de estudos. Carregado
// depois do HTML da sidebar (que já tem o botão #themeToggleBtn), então
// roda direto sem esperar DOMContentLoaded, igual ao padrão já usado lá.

const THEME_STORAGE_KEY = "neuraoab-theme";

const SUN_ICON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="4"></circle>
  <line x1="12" y1="2" x2="12" y2="4"></line>
  <line x1="12" y1="20" x2="12" y2="22"></line>
  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
  <line x1="2" y1="12" x2="4" y2="12"></line>
  <line x1="20" y1="12" x2="22" y2="12"></line>
  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
</svg>`;

const MOON_ICON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
</svg>`;

function safeGetItem(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSetItem(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignora */ }
}

const themeToggleBtn = document.getElementById("themeToggleBtn");

// Ícone + rótulo de texto (não só o ícone) — pra ficar óbvio, sem precisar
// adivinhar, o que esse botão faz e qual tema está ativo agora.
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  if (themeToggleBtn) {
    const icon = theme === "light" ? SUN_ICON : MOON_ICON;
    const label = theme === "light" ? "Tema claro" : "Tema escuro";
    themeToggleBtn.innerHTML = `${icon}<span>${label}</span>`;
    themeToggleBtn.setAttribute("aria-label", `Alternar tema (atual: ${label.toLowerCase()})`);
  }
  safeSetItem(THEME_STORAGE_KEY, theme);
}

if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    applyTheme(current === "light" ? "dark" : "light");
  });
}

applyTheme(safeGetItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark");
