/* Índice, conmutador de tema y paginador del sitio. Script clásico (no módulo)
   para que funcione abriendo los ficheros con file://, sin servidor ni build. */

const SECCIONES = [
  {
    grupo: "Fundamentos",
    paginas: [
      { href: "index.html", titulo: "Visión general" },
      { href: "stack.html", titulo: "Stack y carpetas" },
    ],
  },
  {
    grupo: "Backend",
    paginas: [
      { href: "api.html", titulo: "API (Hono)" },
      { href: "datos.html", titulo: "Modelo de datos" },
      { href: "auth.html", titulo: "Auth y seguridad" },
    ],
  },
  {
    grupo: "Frontend",
    paginas: [{ href: "spa.html", titulo: "SPA (React)" }],
  },
  {
    grupo: "Operación",
    paginas: [
      { href: "deploy.html", titulo: "Deploy" },
      { href: "tests.html", titulo: "Tests" },
      { href: "ci.html", titulo: "CI (GitHub Actions)" },
    ],
  },
];

/* Tema: la preferencia vive en localStorage («auto», «light» o «dark») y el
   color efectivo en <html data-theme>. El script en el <head> de cada página
   aplica lo mismo antes de pintar, para que no haya parpadeo. */
const CLAVE_TEMA = "esencial-arquitectura-tema";
const TEMAS = [
  { id: "auto", etiqueta: "Automático", pista: "sigue al sistema" },
  { id: "light", etiqueta: "Claro", pista: "siempre claro" },
  { id: "dark", etiqueta: "Oscuro", pista: "siempre oscuro" },
];

const planas = SECCIONES.flatMap((g) => g.paginas);
const actual = location.pathname.split("/").pop() || "index.html";

const nav = document.querySelector("[data-nav]");
if (nav) {
  nav.innerHTML = SECCIONES.map(
    (g) =>
      `<div class="nav-group"><p>${g.grupo}</p>${g.paginas
        .map(
          (p) =>
            `<a href="${p.href}"${p.href === actual ? ' aria-current="page"' : ""}>${p.titulo}</a>`,
        )
        .join("")}</div>`,
  ).join("");
}

const pager = document.querySelector("[data-pager]");
if (pager) {
  const i = planas.findIndex((p) => p.href === actual);
  const prev = i > 0 ? planas[i - 1] : null;
  const next = i >= 0 && i < planas.length - 1 ? planas[i + 1] : null;
  pager.innerHTML =
    (prev
      ? `<a href="${prev.href}">&larr; ${prev.titulo}</a>`
      : "<span></span>") +
    (next
      ? `<a href="${next.href}">${next.titulo} &rarr;</a>`
      : "<span></span>");
}

function temaDelSistema() {
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function preferencia() {
  try {
    return localStorage.getItem(CLAVE_TEMA) ?? "auto";
  } catch {
    return "auto";
  }
}

function aplicarTema(pref) {
  document.documentElement.dataset.theme =
    pref === "auto" ? temaDelSistema() : pref;
  try {
    localStorage.setItem(CLAVE_TEMA, pref);
  } catch {
    /* sin almacenamiento el tema sigue funcionando, solo no se recuerda */
  }
}

const cajaTema = document.querySelector("[data-tema]");
if (cajaTema) {
  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = "theme-toggle";
  const pinta = () => {
    const t = TEMAS.find((x) => x.id === preferencia()) ?? TEMAS[0];
    boton.textContent = `Tema: ${t.etiqueta}`;
    boton.title = `Tema ${t.etiqueta.toLowerCase()} (${t.pista}) — pulsa para cambiar`;
  };
  boton.addEventListener("click", () => {
    const i = TEMAS.findIndex((x) => x.id === preferencia());
    const siguiente = TEMAS[(i + 1) % TEMAS.length];
    aplicarTema(siguiente.id);
    pinta();
  });
  pinta();
  cajaTema.append(boton);

  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (preferencia() === "auto") aplicarTema("auto");
  });
}
