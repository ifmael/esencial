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

const updated = document.getElementById("updated");
const treeRoot = document.getElementById("tree");
if (updated) updated.textContent = TREE.updated;
if (treeRoot) treeRoot.appendChild(renderNode(TREE));
