const KINDS = new Set(["decidido", "descartado", "pendiente", "nota"]);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function renderNode(node) {
  const wrap = el("div", "node");
  const d = el("details");
  d.open = node.open === true || node.status === "activo" || !node.children;
  const s = el("summary");
  if (node.status) s.appendChild(el("span", "badge " + node.status, node.status));
  s.appendChild(document.createTextNode(node.title));
  d.appendChild(s);

  const ul = el("ul");
  for (const n of node.notes || []) {
    const li = el("li", n.kind === "nota" ? "nota" : "");
    if (KINDS.has(n.kind) && n.kind !== "nota") li.appendChild(el("span", "badge " + n.kind, n.kind));
    li.appendChild(document.createTextNode(n.text));
    ul.appendChild(li);
  }
  if (ul.children.length) d.appendChild(ul);

  for (const c of node.children || []) d.appendChild(renderNode(c));
  wrap.appendChild(d);
  return wrap;
}

const updatedEl = document.getElementById("updated");
if (updatedEl) updatedEl.textContent = TREE.updated;

// --- Zona dinámica (CM2): merge de ENTRIES, formulario de autoría, guardado FSA/descarga ---
const form = document.getElementById("entry-form");
if (form) {

function titles(tree, acc) {
  acc = acc || [];
  acc.push(tree.title);
  for (const c of tree.children || []) titles(c, acc);
  return acc;
}

function render() {
  const merged = mergeEntries(TREE, window.ENTRIES);
  const box = document.getElementById("tree");
  box.textContent = "";
  box.appendChild(renderNode(merged));
  const sel = document.getElementById("f-parent");
  const keep = sel.value;
  sel.textContent = "";
  for (const t of titles(merged)) sel.appendChild(el("option", null, t));
  if (keep) sel.value = keep;
  document.getElementById("f-warn").textContent =
    countTitleMatches(merged, sel.value) > 1
      ? "Aviso: hay varios nodos con este título; la entrada se fijará al primero."
      : "";
}

for (const r of form.elements["f-mode"])
  r.addEventListener("change", () => {
    const node = form.elements["f-mode"].value === "node";
    document.getElementById("f-node-box").hidden = !node;
    document.getElementById("f-note-box").hidden = node;
    document.getElementById("f-text").required = !node; // no validar un campo oculto
  });

document.getElementById("f-parent").addEventListener("change", render); // reavisa colisiones al elegir
form.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const parent_title = document.getElementById("f-parent").value;
  if (form.elements["f-mode"].value === "node") {
    const title = document.getElementById("f-title").value.trim();
    if (!title) return;
    const status = document.getElementById("f-status").value;
    window.ENTRIES.push(status ? { parent_title, title, status } : { parent_title, title });
    document.getElementById("f-title").value = "";
  } else {
    const text = document.getElementById("f-text").value.trim();
    if (!text) return;
    window.ENTRIES.push({ parent_title, kind: document.getElementById("f-kind").value, text });
    document.getElementById("f-text").value = "";
  }
  render();
});

let fileHandle = null;
document.getElementById("f-save").addEventListener("click", async () => {
  const data = serializeEntries(window.ENTRIES);
  if (window.showOpenFilePicker) {
    try {
      if (!fileHandle)
        fileHandle = (await showOpenFilePicker({ suggestedName: "entries.js" }))[0];
      const w = await fileHandle.createWritable();
      await w.write(data);
      await w.close();
    } catch (err) {
      if (err.name !== "AbortError") throw err; // cancelar el picker = no guardar
    }
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type: "text/javascript" }));
  a.download = "entries.js";
  a.click();
  URL.revokeObjectURL(a.href);
});
  render();
}
