// project-site/guide — resaltado de sintaxis mínimo (sin dependencias) + botón copiar.
// ponytail: tokenizador regex propio en vez de highlight.js (~100 kB) — el site
// solo muestra TS/SQL/HTML; si algún día hace falta otro lenguaje, migrar entonces.
(() => {
  const KW = /\b(await|async|const|let|var|function|return|if|else|for|of|in|new|import|from|export|type|interface|class|extends|default|try|catch|throw|null|undefined|true|false|CREATE|TABLE|IF|NOT|EXISTS|PRIMARY|KEY|REFERENCES|INTEGER|TEXT|REAL|UNIQUE|CHECK|ON|DELETE|CASCADE|RESTRICT|DEFAULT|ALTER|ADD|COLUMN|INSERT|INTO|VALUES|UPDATE|SET|SELECT|JOIN|LEFT|WHERE|GROUP|BY|ORDER|LIMIT|CONFLICT|DO|EXCLUDED|AND|AS)\b/g;

  function highlight(src) {
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    let out = "", i = 0;
    const push = (html) => (out += html);
    while (i < src.length) {
      // comentario de línea
      if (src.startsWith("//", i) || src.startsWith("--", i)) {
        const end = src.indexOf("\n", i);
        const j = end === -1 ? src.length : end;
        push(`<span class="tk-com">${esc(src.slice(i, j))}</span>`); i = j; continue;
      }
      // comentario de bloque
      if (src.startsWith("/*", i)) {
        const j = src.indexOf("*/", i);
        const k = j === -1 ? src.length : j + 2;
        push(`<span class="tk-com">${esc(src.slice(i, k))}</span>`); i = k; continue;
      }
      // strings
      const q = src[i];
      if (q === '"' || q === "'" || q === "`") {
        let j = i + 1;
        while (j < src.length && src[j] !== q) { if (src[j] === "\\") j++; j++; }
        push(`<span class="tk-str">${esc(src.slice(i, Math.min(j + 1, src.length)))}</span>`);
        i = j + 1; continue;
      }
      // números
      const mNum = /^\d[\d_.]*/.exec(src.slice(i));
      if (mNum) { push(`<span class="tk-num">${esc(mNum[0])}</span>`); i += mNum[0].length; continue; }
      // palabras clave y funciones
      const mWord = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
      if (mWord) {
        const w = mWord[0];
        const after = src.slice(i + w.length);
        if (/^(fn|function)$|^\(/.test(after)) push(`<span class="tk-fn">${esc(w)}</span>`);
        else push(esc(w));
        i += w.length; continue;
      }
      // etiquetas HTML/JSX evidentes
      if (q === "<" && /^<\/?[A-Za-z]/.test(src.slice(i))) {
        const m = /^<\/?[A-Za-z][\w.-]*/.exec(src.slice(i));
        push(`<span class="tk-tag">${esc(m[0])}</span>`); i += m[0].length; continue;
      }
      push(esc(q)); i++;
    }
    // keywords en un solo pase sobre el HTML final (solo fuera de spans ya creados):
    // más simple y seguro: aplicar sobre el texto escapado ANTES de añadir spans
    // no es viable aquí, así que re-escaneamos evitando atributos (dentro de comillas ya van coloreados).
    return out;
  }

  // Aplica keywords post-hoc con regex cuidada: solo sustituye sobre >texto< plano.
  function applyKeywords(html) {
    return html.replace(/(^|>)([^<]+)/g, (all, gt, text) => {
      if (!gt) return all;
      return gt + text.replace(KW, (w) => `<span class="tk-kw">${w}</span>`);
    });
  }

  document.querySelectorAll("pre[data-lang]").forEach((pre) => {
    const raw = pre.textContent;
    const html = applyKeywords(highlight(raw));
    pre.innerHTML = html;
    const wrap = document.createElement("div");
    wrap.className = "codewrap";
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);
    if (pre.dataset.lang !== "none") {
      const lang = document.createElement("span");
      lang.className = "lang";
      lang.textContent = pre.dataset.lang;
      wrap.appendChild(lang);
    }
    const btn = document.createElement("button");
    btn.className = "copy";
    btn.textContent = "copiar";
    btn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(raw);
      btn.textContent = "¡copiado!";
      btn.classList.add("ok");
      setTimeout(() => { btn.textContent = "copiar"; btn.classList.remove("ok"); }, 1400);
    });
    wrap.appendChild(btn);
  });

  // Marca el enlace activo del nav según pathname.
  const here = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll("nav.crumbs a").forEach((a) => {
    const href = a.getAttribute("href");
    if (href === here || (here === "" && href === "index.html")) a.setAttribute("aria-current", "page");
  });
})();
