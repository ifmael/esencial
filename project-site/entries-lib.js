// Lógica pura del sitio de gestión: merge de ENTRIES sobre TREE. Sin DOM.
// Funciones globales para el navegador; export para `node --test`.

// Ruta (índices de children desde la raíz) de cada nodo con `title`, en orden de documento.
function findTitlePaths(tree, title) {
  const paths = [];
  (function go(node, path) {
    if (node.title === title) paths.push(path);
    (node.children || []).forEach((c, i) => go(c, path.concat(i)));
  })(tree, []);
  return paths;
}

// Clona el camino raíz→nodo y aplica `fn` al nodo del final. Nunca muta el árbol de entrada.
function setAtPath(tree, path, fn) {
  if (path.length === 0) return fn(tree);
  const children = tree.children.slice();
  children[path[0]] = setAtPath(children[path[0]], path.slice(1), fn);
  return { ...tree, children };
}

function attach(node, entry) {
  if (entry.title != null) {
    const child = { title: entry.title };
    if (entry.status != null) child.status = entry.status;
    return { ...node, children: [...(node.children || []), child] };
  }
  return { ...node, notes: [...(node.notes || []), { kind: entry.kind, text: entry.text }] };
}

// Aplica entries en orden de fichero sobre tree: anotaciones tras las notes existentes,
// nodos nuevos tras los children existentes, padre = primera coincidencia en orden de documento.
// Entradas huérfanas (parent_title sin nodo) se omiten en silencio.
function mergeEntries(tree, entries) {
  let out = tree;
  for (const entry of entries) {
    const path = findTitlePaths(out, entry.parent_title)[0];
    if (!path) continue;
    out = setAtPath(out, path, (node) => attach(node, entry));
  }
  return out;
}

// Serie `entries` como script cargable: "window.ENTRIES = [...];".
function serializeEntries(entries) {
  return "window.ENTRIES = " + JSON.stringify(entries, null, 2) + ";\n";
}

// Nº de nodos con ese título, en orden de documento.
function countTitleMatches(tree, title) {
  return findTitlePaths(tree, title).length;
}

if (typeof module !== "undefined") module.exports = { mergeEntries, serializeEntries, countTitleMatches };
