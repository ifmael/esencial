// project-site/guide — cabecera + pie compartidos por todas las páginas.
// Ponytail: 4 páginas, un template literal en vez de un SSG.
const NAV = [
  ["index.html", "Inicio"],
  ["arquitectura.html", "Arquitectura"],
  ["datos.html", "Datos"],
  ["api.html", "API"],
  ["frontend.html", "Frontend"],
  ["gestion.html", "Gestión"],
];

document.addEventListener("DOMContentLoaded", () => {
  const main = document.querySelector("main.wrap");
  if (!main) return;
  const top = document.createElement("div");
  top.className = "topbar";
  top.innerHTML = `
    <div class="topbar-inner">
      <a class="brand" href="index.html">Esencial<span> · guía del proyecto</span></a>
      <nav class="crumbs" aria-label="Secciones">
        ${NAV.map(([h, l]) => `<a href="${h}">${l}</a>`).join("")}
      </nav>
    </div>`;
  document.body.prepend(top);

  const foot = document.createElement("footer");
  foot.className = "foot";
  foot.innerHTML = `Guía pedagógica estática del proyecto <b>Esencial</b> — sin build, sin dependencias.
    Código real en <code>api/src/</code> y <code>web/src/</code>.`;
  document.body.appendChild(foot);
});
