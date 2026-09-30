// Genera `public/models/muscles.glb.gz`: el modelo 3D de los músculos, una malla
// por sub-región del vocabulario (`api/src/muscle-regions.ts`) más el relleno
// que da la forma (el resto de la musculatura visible y la piel de cabeza,
// manos y pies). Sale de BodyParts3D 4.0 (CC BY 4.0), tal como lo empaqueta
// human-atlas; se corre a mano y el resultado se versiona.
//
//   node web/scripts/gen-muscle-model.ts <human-atlas>/public/models
//
// Lo que el atlas no trae se fabrica con su propia geometría:
// - recto abdominal: la aponeurosis del oblicuo externo junto a la línea media;
// - dorsal ancho: una lámina calcada de la piel y ceñida a lo que tiene debajo.
// El fichero no lleva normales (el visor las calcula: las mallas van soldadas)
// y va comprimido con gzip: el visor lo abre con `DecompressionStream`.
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { MeshoptSimplifier } from "meshoptimizer";
import * as T from "three";
import { MUSCLE_REGION_GROUPS } from "../../api/src/muscle-regions.ts";

type Part = {
  id: string;
  name: string;
  system: string;
  chunk: number;
  positions: number;
  normals: number;
  indices: number;
  vertexCount: number;
  indexCount: number;
  bounds: [number[], number[]];
};
/** Malla indexada; `att` es un canal escalar por vértice (profundidad). */
type Mesh = {
  pos: Float32Array;
  nrm: Float32Array;
  idx: Uint32Array;
  att?: Float32Array;
};
type Vec3 = [number, number, number];

const SRC = process.argv[2];
if (!SRC)
  throw new Error(
    "Uso: node web/scripts/gen-muscle-model.ts <human-atlas>/public/models",
  );
const atlas = JSON.parse(readFileSync(`${SRC}/atlas.json`, "utf8")) as {
  parts: Part[];
  chunks: unknown[];
};
const chunks = atlas.chunks.map(
  (_, i) => new Uint8Array(readFileSync(`${SRC}/body-${i}.bin`)).buffer,
);
const parts = atlas.parts;
await MeshoptSimplifier.ready;

function load(p: Part): Mesh {
  const b = chunks[p.chunk];
  return {
    pos: new Float32Array(b, p.positions, p.vertexCount * 3).slice(),
    nrm: Float32Array.from(
      new Int16Array(b, p.normals, p.vertexCount * 3),
      (v) => Math.max(v / 32767, -1),
    ),
    idx: new Uint32Array(b, p.indices, p.indexCount).slice(),
  };
}
const byName = (re: RegExp) => parts.filter((p) => re.test(p.name));

// ---- región → mallas del atlas ---------------------------------------------
// Las que el atlas trae tal cual. El trapecio se queda con su división
// anatómica: porción transversa = medio, ascendente = inferior.
const MAP: Record<string, RegExp> = {
  "shoulder-front": /clavicular part of (right|left) deltoid/i,
  "shoulder-side": /acromial part of (right|left) deltoid/i,
  "deltoid-rear": /spinal part of (right|left) deltoid/i,
  "chest-upper": /clavicular part of (right|left) pectoralis major/i,
  "chest-lower":
    /(sternocostal|abdominal) part of (right|left) pectoralis major/i,
  "traps-upper": /descending part of (right|left) trapezius/i,
  "traps-mid": /transverse part of (right|left) trapezius/i,
  "traps-lower": /ascending part of (right|left) trapezius/i,
  spine: /(spinalis|semispinalis|interspinalis|rotator)/i,
  "lower-back-erectors": /(iliocostalis|longissimus) (lumborum|thoracis)/i,
  biceps: /biceps brachii/i,
  "triceps-long": /long head of (right|left) triceps/i,
  "triceps-lateral": /lateral head of (right|left) triceps/i,
  forearm: /(right|left) (brachioradialis|supinator)|pronator teres/i,
  "forearm-flexors":
    /flexor carpi|palmaris longus|flexor digitorum (superficialis|profundus)/i,
  "forearm-extensors":
    /extensor carpi|(right|left) extensor digitorum$|extensor digiti minimi/i,
  "serratus-anterior": /serratus anterior/i,
  "hip-flexor": /(right|left) (psoas major|iliacus|pectineus)/i,
  quads: /(rectus femoris|vastus)/i,
  adductors: /(right|left) (adductor (longus|brevis|magnus)|gracilis)/i,
  "tibialis-anterior": /(right|left) tibialis anterior/i,
  "hamstrings-medial": /(semitendinosus|semimembranosus)/i,
  "hamstrings-lateral": /biceps femoris/i,
  "gluteus-maximus": /gluteus maximus/i,
  "gluteus-medius": /gluteus medius/i,
  "calves-gastroc-medial": /medial head of (right|left) gastrocnemius/i,
  "calves-gastroc-lateral": /lateral head of (right|left) gastrocnemius/i,
  "calves-soleus": /(right|left) soleus/i,
};
// Relleno fuera de «muscular» que da la forma: tendones, músculos archivados
// como esqueleto y el esternón, que tapa la columna entre los pectorales.
const FILLER_EXTRA =
  /fibularis|tibialis posterior|iliotibial tract|tensor fasciae latae|calcaneal tendon|external intercostal|^manubrium$|body of sternum|xiphoid|costal cartilage/i;
const NAVEL_Y = 1.036; // hoyuelo del ombligo en la piel (medido)

// ---- geometría -------------------------------------------------------------
const edgeKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
const centroid = (m: Mesh, a: number, b: number, c: number): Vec3 => [
  (m.pos[a * 3] + m.pos[b * 3] + m.pos[c * 3]) / 3,
  (m.pos[a * 3 + 1] + m.pos[b * 3 + 1] + m.pos[c * 3 + 1]) / 3,
  (m.pos[a * 3 + 2] + m.pos[b * 3 + 2] + m.pos[c * 3 + 2]) / 3,
];
const lerp = (a: number, b: number, t: number) =>
  a + (b - a) * Math.min(1, Math.max(0, t));

/** Sub-malla con los triángulos que cumplen `keep` (vértices compactados). */
function pick(
  m: Mesh,
  keep: (a: number, b: number, c: number) => boolean,
): Mesh {
  const remap = new Map<number, number>();
  const pos: number[] = [],
    nrm: number[] = [],
    att: number[] = [],
    idx: number[] = [];
  const v = (i: number) => {
    let j = remap.get(i);
    if (j === undefined) {
      j = pos.length / 3;
      remap.set(i, j);
      for (let k = 0; k < 3; k++) {
        pos.push(m.pos[i * 3 + k]);
        nrm.push(m.nrm[i * 3 + k]);
      }
      if (m.att) att.push(m.att[i]);
    }
    return j;
  };
  for (let t = 0; t < m.idx.length; t += 3) {
    const [a, b, c] = [m.idx[t], m.idx[t + 1], m.idx[t + 2]];
    if (keep(a, b, c)) idx.push(v(a), v(b), v(c));
  }
  return {
    pos: new Float32Array(pos),
    nrm: new Float32Array(nrm),
    idx: new Uint32Array(idx),
    ...(m.att ? { att: new Float32Array(att) } : {}),
  };
}

/** Recorta por la curva f = 0 y se queda con f ≥ 0, partiendo los triángulos
 *  del borde por el punto exacto de cada arista: el borde sale liso. */
function clip(m: Mesh, f: (p: Vec3) => number): Mesh {
  const nv = m.pos.length / 3,
    fv = new Float32Array(nv);
  for (let i = 0; i < nv; i++)
    fv[i] = f([m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]]);
  const pos = [...m.pos],
    nrm = [...m.nrm],
    att = m.att ? [...m.att] : null,
    idx: number[] = [];
  const cut = new Map<string, number>();
  const onEdge = (a: number, b: number) => {
    const key = edgeKey(a, b);
    let j = cut.get(key);
    if (j === undefined) {
      const t = fv[a] / (fv[a] - fv[b]);
      j = pos.length / 3;
      cut.set(key, j);
      for (let k = 0; k < 3; k++) {
        pos.push(pos[a * 3 + k] + t * (pos[b * 3 + k] - pos[a * 3 + k]));
        nrm.push(nrm[a * 3 + k] + t * (nrm[b * 3 + k] - nrm[a * 3 + k]));
      }
      att?.push(att[a] + t * (att[b] - att[a]));
    }
    return j;
  };
  for (let t = 0; t < m.idx.length; t += 3) {
    const tri = [m.idx[t], m.idx[t + 1], m.idx[t + 2]],
      poly: number[] = [];
    for (let e = 0; e < 3; e++) {
      const a = tri[e],
        b = tri[(e + 1) % 3];
      if (fv[a] >= 0) poly.push(a);
      if (fv[a] >= 0 !== fv[b] >= 0) poly.push(onEdge(a, b));
    }
    for (let k = 1; k + 1 < poly.length; k++)
      idx.push(poly[0], poly[k], poly[k + 1]);
  }
  return pick(
    {
      pos: new Float32Array(pos),
      nrm: new Float32Array(nrm),
      idx: new Uint32Array(idx),
      ...(att ? { att: new Float32Array(att) } : {}),
    },
    () => true,
  );
}

function merge(list: Mesh[]): Mesh {
  const nv = list.reduce((s, m) => s + m.pos.length, 0),
    ni = list.reduce((s, m) => s + m.idx.length, 0);
  const pos = new Float32Array(nv),
    nrm = new Float32Array(nv),
    idx = new Uint32Array(ni);
  let ov = 0,
    oi = 0;
  for (const m of list) {
    pos.set(m.pos, ov);
    nrm.set(m.nrm, ov);
    for (let i = 0; i < m.idx.length; i++) idx[oi + i] = m.idx[i] + ov / 3;
    ov += m.pos.length;
    oi += m.idx.length;
  }
  return { pos, nrm, idx };
}

/** Subdivisión por puntos medios (sin suavizado). */
function subdivide(m: Mesh): Mesh {
  const pos = [...m.pos],
    nrm = [...m.nrm],
    att = m.att ? [...m.att] : null,
    idx: number[] = [];
  const mid = new Map<string, number>();
  const midpoint = (a: number, b: number) => {
    const key = edgeKey(a, b);
    let j = mid.get(key);
    if (j === undefined) {
      j = pos.length / 3;
      mid.set(key, j);
      for (let k = 0; k < 3; k++) {
        pos.push((pos[a * 3 + k] + pos[b * 3 + k]) / 2);
        nrm.push((nrm[a * 3 + k] + nrm[b * 3 + k]) / 2);
      }
      att?.push((att[a] + att[b]) / 2);
    }
    return j;
  };
  for (let t = 0; t < m.idx.length; t += 3) {
    const [a, b, c] = [m.idx[t], m.idx[t + 1], m.idx[t + 2]];
    const ab = midpoint(a, b),
      bc = midpoint(b, c),
      ca = midpoint(c, a);
    idx.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  return {
    pos: new Float32Array(pos),
    nrm: new Float32Array(nrm),
    idx: new Uint32Array(idx),
    ...(att ? { att: new Float32Array(att) } : {}),
  };
}

/** Une vértices en la misma posición: las mallas del atlas vienen partidas por
 *  costuras, y sin soldar ni se simplifican ni se alisan. */
function weld(m: Mesh): Mesh {
  const key = new Map<string, number>(),
    remap = new Uint32Array(m.pos.length / 3);
  const pos: number[] = [],
    nrm: number[] = [];
  for (let i = 0; i < remap.length; i++) {
    const k = `${Math.round(m.pos[i * 3] * 1e5)},${Math.round(m.pos[i * 3 + 1] * 1e5)},${Math.round(m.pos[i * 3 + 2] * 1e5)}`;
    let j = key.get(k);
    if (j === undefined) {
      j = pos.length / 3;
      key.set(k, j);
      pos.push(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]);
      nrm.push(0, 0, 0);
    }
    for (let c = 0; c < 3; c++) nrm[j * 3 + c] += m.nrm[i * 3 + c];
    remap[i] = j;
  }
  return {
    pos: new Float32Array(pos),
    nrm: new Float32Array(nrm),
    idx: m.idx.map((i) => remap[i]),
  };
}

function simplify(
  m: Mesh,
  ratio: number,
  error: number,
  lockBorder = true,
): Mesh {
  const w = weld(m);
  const target = Math.max(3, Math.floor((w.idx.length * ratio) / 3) * 3);
  const [idx] = MeshoptSimplifier.simplify(
    w.idx,
    w.pos,
    3,
    target,
    error,
    lockBorder ? ["LockBorder"] : [],
  );
  return pick({ ...w, idx }, () => true);
}

function adjacency(m: Mesh): number[][] {
  const adj = Array.from({ length: m.pos.length / 3 }, () => new Set<number>());
  for (let t = 0; t < m.idx.length; t += 3) {
    const [a, b, c] = [m.idx[t], m.idx[t + 1], m.idx[t + 2]];
    adj[a].add(b).add(c);
    adj[b].add(a).add(c);
    adj[c].add(a).add(b);
  }
  return adj.map((s) => [...s]);
}

/** Vecinos a lo largo del borde abierto (aristas de un solo triángulo). */
function borderAdjacency(m: Mesh): Map<number, number[]> {
  const uses = new Map<string, number>();
  for (let t = 0; t < m.idx.length; t += 3)
    for (const [a, b] of [
      [m.idx[t], m.idx[t + 1]],
      [m.idx[t + 1], m.idx[t + 2]],
      [m.idx[t + 2], m.idx[t]],
    ])
      uses.set(edgeKey(a, b), (uses.get(edgeKey(a, b)) ?? 0) + 1);
  const nb = new Map<number, number[]>();
  for (const [k, n] of uses) {
    if (n !== 1) continue;
    const [a, b] = k.split(",").map(Number);
    nb.set(a, [...(nb.get(a) ?? []), b]);
    nb.set(b, [...(nb.get(b) ?? []), a]);
  }
  return nb;
}

/** Suavizado de Taubin (λ/μ: alisa sin encoger). */
function relax(
  pos: Float32Array,
  verts: number[],
  nbOf: (v: number) => number[] | undefined,
  iters: number,
) {
  const next = new Float32Array(pos.length);
  for (let it = 0; it < iters; it++)
    for (const lam of [0.5, -0.53]) {
      for (const v of verts) {
        const nb = nbOf(v);
        if (!nb?.length) continue;
        for (let k = 0; k < 3; k++) {
          let s = 0;
          for (const u of nb) s += pos[u * 3 + k];
          next[v * 3 + k] =
            pos[v * 3 + k] + lam * (s / nb.length - pos[v * 3 + k]);
        }
      }
      for (const v of verts)
        if (nbOf(v)?.length)
          for (let k = 0; k < 3; k++) pos[v * 3 + k] = next[v * 3 + k];
    }
}

/** Alisa el interior y, aparte, el contorno (quita los escalones del recorte). */
function smoothSheet(m: Mesh, interior: number, border: number) {
  const adj = adjacency(m),
    bnb = borderAdjacency(m);
  relax(m.pos, [...bnb.keys()], (v) => bnb.get(v), border);
  relax(
    m.pos,
    adj.map((_, v) => v).filter((v) => !bnb.has(v)),
    (v) => adj[v],
    interior,
  );
}

/** Da la vuelta a los triángulos cuya cara no mira hacia `out`: con el orden
 *  mezclado, las normales por vértice se anulan y salen bandas oscuras. */
function orient(m: Mesh, out: (c: Vec3) => Vec3) {
  const p = m.pos;
  for (let t = 0; t < m.idx.length; t += 3) {
    const [a, b, c] = [m.idx[t] * 3, m.idx[t + 1] * 3, m.idx[t + 2] * 3];
    const e1 = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
    const e2 = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    const n = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const o = out(centroid(m, m.idx[t], m.idx[t + 1], m.idx[t + 2]));
    if (n[0] * o[0] + n[1] * o[1] + n[2] * o[2] < 0)
      [m.idx[t + 1], m.idx[t + 2]] = [m.idx[t + 2], m.idx[t + 1]];
  }
}

/** Píxeles que gana cada malla en 28 vistas ortográficas alrededor del cuerpo
 *  (z-buffer por software). Lo que no gana casi ninguno no se ve. */
function visiblePixels(items: Mesh[], res = 640): Uint32Array {
  const counts = new Uint32Array(items.length);
  const zbuf = new Float32Array(res * res),
    ids = new Int32Array(res * res);
  const dirs: Vec3[] = [];
  for (const [elev, n] of [
    [0, 12],
    [35, 8],
    [-30, 8],
  ])
    for (let k = 0; k < n; k++) {
      const az = (k / n) * 2 * Math.PI + (elev ? Math.PI / n : 0),
        e = (elev * Math.PI) / 180;
      dirs.push([
        Math.sin(az) * Math.cos(e),
        Math.sin(e),
        Math.cos(az) * Math.cos(e),
      ]);
    }
  const C = [0, 0.86, 0],
    R = 0.92,
    s = res / (2 * R);
  for (const d of dirs) {
    const rl = Math.hypot(d[2], d[0]),
      r = [d[2] / rl, 0, -d[0] / rl];
    const u = [
      d[1] * r[2] - d[2] * r[1],
      d[2] * r[0] - d[0] * r[2],
      d[0] * r[1] - d[1] * r[0],
    ];
    zbuf.fill(Number.NEGATIVE_INFINITY);
    ids.fill(-1);
    items.forEach((m, id) => {
      const nv = m.pos.length / 3,
        P = new Float32Array(nv * 3);
      for (let i = 0; i < nv; i++) {
        const x = m.pos[i * 3] - C[0],
          y = m.pos[i * 3 + 1] - C[1],
          z = m.pos[i * 3 + 2] - C[2];
        P[i * 3] = (x * r[0] + y * r[1] + z * r[2] + R) * s;
        P[i * 3 + 1] = (R - (x * u[0] + y * u[1] + z * u[2])) * s;
        P[i * 3 + 2] = x * d[0] + y * d[1] + z * d[2];
      }
      for (let t = 0; t < m.idx.length; t += 3) {
        const a = m.idx[t] * 3,
          b = m.idx[t + 1] * 3,
          c = m.idx[t + 2] * 3;
        const [x0, y0, x1, y1, x2, y2] = [
          P[a],
          P[a + 1],
          P[b],
          P[b + 1],
          P[c],
          P[c + 1],
        ];
        const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
        if (Math.abs(area) < 1e-9) continue;
        const minX = Math.max(0, Math.ceil(Math.min(x0, x1, x2) - 0.5)),
          maxX = Math.min(res - 1, Math.floor(Math.max(x0, x1, x2) - 0.5));
        const minY = Math.max(0, Math.ceil(Math.min(y0, y1, y2) - 0.5)),
          maxY = Math.min(res - 1, Math.floor(Math.max(y0, y1, y2) - 0.5));
        for (let py = minY; py <= maxY; py++)
          for (let px = minX; px <= maxX; px++) {
            const qx = px + 0.5,
              qy = py + 0.5;
            const w0 = ((x1 - qx) * (y2 - qy) - (x2 - qx) * (y1 - qy)) / area;
            const w1 = ((x2 - qx) * (y0 - qy) - (x0 - qx) * (y2 - qy)) / area;
            const w2 = 1 - w0 - w1;
            if (w0 < 0 || w1 < 0 || w2 < 0) continue;
            const z = w0 * P[a + 2] + w1 * P[b + 2] + w2 * P[c + 2],
              o = py * res + px;
            if (z > zbuf[o]) {
              zbuf[o] = z;
              ids[o] = id;
            }
          }
      }
    });
    for (const id of ids) if (id >= 0) counts[id]++;
  }
  return counts;
}

// ---- 1. regiones que el atlas trae tal cual --------------------------------
const regions: Record<string, Mesh[]> = {};
const used = new Set<string>();
for (const [region, re] of Object.entries(MAP)) {
  const ms = byName(re).filter((p) => !/^tendon/i.test(p.name));
  if (!ms.length) throw new Error(`${region}: sin mallas en el atlas`);
  for (const p of ms) used.add(p.id);
  regions[region] = ms.map(load);
}

// ---- 2. recto abdominal: la aponeurosis del oblicuo, junto a la línea media --
// Ancho del recto a cada altura, del pubis a la apófisis xifoides.
const absField = ([x, y, z]: Vec3) => {
  const half = lerp(0.035, 0.085, (y - 0.87) / (1.26 - 0.87));
  return Math.min(half - Math.abs(x), y - 0.87, 1.26 - y, z - 0.03);
};
regions.obliques = [];
regions["abs-upper"] = [];
regions["abs-lower"] = [];
for (const p of byName(/(right|left) external oblique/i)) {
  used.add(p.id);
  const m = load(p);
  regions.obliques.push(clip(m, (k) => -absField(k)));
  const abs = clip(m, absField);
  regions["abs-upper"].push(clip(abs, ([, y]) => y - NAVEL_Y));
  regions["abs-lower"].push(clip(abs, ([, y]) => NAVEL_Y - y));
}
for (const p of byName(/^linea alba$/i)) {
  used.add(p.id);
  regions["abs-upper"].push(clip(load(p), ([, y]) => y - NAVEL_Y));
  regions["abs-lower"].push(clip(load(p), ([, y]) => NAVEL_Y - y));
}

// ---- 3. dorsal ancho: lámina de la piel, ceñida a lo que tiene debajo -------
const skin = load(byName(/^skin$/i)[0]);
// Contorno medido sobre el atlas: T7 ≈ 1,30 · ángulo inferior de la escápula ≈
// (0,10; 1,265) · axila ≈ (0,17; 1,36) · cresta ilíaca ≈ 1,03. Abajo, junto a la
// columna, el dorsal es fascia toracolumbar: la parte carnosa empieza por fuera
// de los erectores.
const upperY = (ax: number) =>
  ax < 0.1 ? lerp(1.3, 1.265, ax / 0.1) : lerp(1.265, 1.36, (ax - 0.1) / 0.07);
const latField = ([x, y, z]: Vec3) => {
  const ax = Math.abs(x);
  return Math.min(
    ax - lerp(0.08, 0.015, (y - 1.05) / (1.25 - 1.05)),
    0.19 - ax,
    y - lerp(1.06, 1.03, (ax - 0.02) / 0.1),
    upperY(ax) - y,
    lerp(-0.05, 0, (y - 1.03) / (1.3 - 1.03)) - z,
  );
};
// Hacia el eje del tronco, en horizontal: las normales de la piel no son fiables.
const inward = (x: number, z: number): Vec3 => {
  const l = Math.hypot(x, z + 0.02) || 1;
  return [-x / l, 0, -(z + 0.02) / l];
};
const inLat = (m: Mesh, i: number) =>
  latField([m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]]) >= 0;
let lat = subdivide(
  weld(
    pick(skin, (a, b, c) => inLat(skin, a) || inLat(skin, b) || inLat(skin, c)),
  ),
);
{
  // Si el primer impacto es algo que va por ENCIMA del dorsal (trapecio) o es
  // el brazo, ese punto no es dorsal.
  const box = new T.Box3().setFromArray(lat.pos).expandByScalar(0.12);
  const BLOCK =
    /trapezius|triceps|deltoid|biceps brachii|humerus|brachialis|coracobrachialis/i;
  const targets = parts
    .filter(
      (p) =>
        (p.system === "muscular" || p.system === "skeletal") &&
        new T.Box3(
          new T.Vector3(...p.bounds[0]),
          new T.Vector3(...p.bounds[1]),
        ).intersectsBox(box),
    )
    .map((p) => {
      const m = load(p),
        g = new T.BufferGeometry();
      g.setAttribute("position", new T.BufferAttribute(m.pos, 3));
      g.setIndex(new T.BufferAttribute(m.idx, 1));
      g.computeBoundingBox();
      g.computeBoundingSphere();
      const mesh = new T.Mesh(
        g,
        new T.MeshBasicMaterial({ side: T.DoubleSide }),
      );
      mesh.userData.block = BLOCK.test(p.name);
      mesh.updateMatrixWorld();
      return mesh;
    });
  const n = lat.pos.length / 3,
    depth = new Float32Array(n).fill(Number.NaN),
    blocked = new Uint8Array(n);
  const ray = new T.Raycaster();
  ray.far = 0.12;
  const o = new T.Vector3(),
    d = new T.Vector3();
  for (let i = 0; i < n; i++) {
    o.fromArray(lat.pos, i * 3);
    ray.set(o, d.fromArray(inward(o.x, o.z)));
    const found: T.Intersection[] = [];
    for (const t of targets)
      if (
        t.geometry.boundingBox &&
        ray.ray.intersectsBox(t.geometry.boundingBox)
      )
        t.raycast(ray, found);
    if (!found.length) continue;
    found.sort((a, b) => a.distance - b.distance);
    if (found[0].object.userData.block) blocked[i] = 1;
    else depth[i] = found[0].distance;
  }
  // La profundidad cruda salta de costilla a intercostal: se rellenan los
  // huecos con los vecinos (lo que no alcance, con la mediana), se toma el
  // mínimo de dos anillos (la lámina queda por fuera de los bultos) y se alisa.
  const adj = adjacency(lat);
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < n; i++) {
      if (!Number.isNaN(depth[i])) continue;
      const known = adj[i].map((j) => depth[j]).filter((v) => !Number.isNaN(v));
      if (!known.length) continue;
      depth[i] = known.reduce((s, v) => s + v, 0) / known.length;
      changed = true;
    }
  }
  const sorted = [...depth]
    .filter((v) => !Number.isNaN(v))
    .sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  for (let i = 0; i < n; i++) if (Number.isNaN(depth[i])) depth[i] = median;
  for (let ring = 0; ring < 2; ring++) {
    const prev = depth.slice();
    for (let i = 0; i < n; i++)
      for (const j of adj[i]) depth[i] = Math.min(depth[i], prev[j]);
  }
  for (let it = 0; it < 8; it++) {
    const prev = depth.slice();
    for (let i = 0; i < n; i++)
      depth[i] =
        (prev[i] + adj[i].reduce((s, j) => s + prev[j], 0)) /
        (1 + adj[i].length);
  }
  lat.att = depth;
  lat = clip(
    subdivide(
      pick(lat, (a, b, c) => !blocked[a] && !blocked[b] && !blocked[c]),
    ),
    latField,
  );
  const THICK = 0.006; // la lámina queda 6 mm por fuera de lo que cubre
  const att = lat.att ?? new Float32Array(0);
  for (let i = 0; i < lat.pos.length / 3; i++) {
    const [dx, , dz] = inward(lat.pos[i * 3], lat.pos[i * 3 + 2]),
      s = Math.max(0.002, att[i] - THICK);
    lat.pos[i * 3] += dx * s;
    lat.pos[i * 3 + 2] += dz * s;
  }
  smoothSheet(lat, 4, 4);
  orient(lat, ([x, , z]) => {
    const [dx, dy, dz] = inward(x, z);
    return [-dx, -dy, -dz];
  });
  for (const v of lat.pos)
    if (!Number.isFinite(v)) throw new Error("dorsal: posición no finita");
}
// Las fibras del dorsal convergen en la axila (inserción en el húmero): las
// tres bandas son abanicos por ángulo desde ahí, no franjas horizontales.
const fan = ([x, y]: Vec3) =>
  (Math.atan2(1.33 - y, 0.165 - Math.abs(x)) * 180) / Math.PI;
regions["lats-upper"] = [clip(lat, (k) => 40 - fan(k))];
regions["lats-mid"] = [clip(lat, (k) => Math.min(fan(k) - 40, 64 - fan(k)))];
regions["lats-lower"] = [clip(lat, (k) => fan(k) - 64)];

const missing = Object.keys(MUSCLE_REGION_GROUPS).filter(
  (r) => !regions[r]?.some((m) => m.idx.length),
);
if (missing.length)
  throw new Error(`Regiones sin geometría: ${missing.join(", ")}`);

// ---- 4. relleno: el resto visible + piel de cabeza, manos y pies -----------
const outOfView = (p: Part) => {
  const [[x0, y0], [x1, y1]] = p.bounds;
  return y0 > 1.52 || (y1 < 0.9 && Math.abs((x0 + x1) / 2) > 0.2) || y1 < 0.085;
};
const filler = parts
  .filter(
    (p) =>
      !used.has(p.id) &&
      (p.system === "muscular" || FILLER_EXTRA.test(p.name)) &&
      !outOfView(p),
  )
  .map(load);
// Cabeza cortada por la mandíbula (más baja delante que en la nuca), manos por
// la muñeca y pies por el tobillo; alisadas para que la cara quede de maniquí.
const caps = weld(
  pick(skin, (a, b, c) => {
    const [x, y, z] = centroid(skin, a, b, c);
    return y > 1.535 - 0.3 * z || (y < 0.89 && Math.abs(x) > 0.2) || y < 0.085;
  }),
);
smoothSheet(caps, 3, 12);

// Fuera lo que no se ve desde ninguna de las 28 vistas (umbral contra el
// ruido de los huecos entre mallas). Una región nunca se queda vacía.
const items = [
  ...Object.entries(regions).flatMap(([region, list]) =>
    list.map((m) => ({ m, region })),
  ),
  ...filler.map((m) => ({ m, region: "" })),
  { m: caps, region: "" },
];
const px = visiblePixels(items.map((it) => it.m));
const MIN_PX = 12;
for (const region of Object.keys(regions)) {
  const mine = items
    .map((it, k) => ({ ...it, k }))
    .filter((it) => it.region === region);
  const seen = mine.filter((it) => px[it.k] >= MIN_PX);
  regions[region] = (
    seen.length ? seen : [mine.sort((a, b) => px[b.k] - px[a.k])[0]]
  ).map((it) => it.m);
}
const visibleFiller = filler.filter(
  (_, i) => px[items.length - 1 - filler.length + i] >= MIN_PX,
);

// ---- 5. GLB ----------------------------------------------------------------
type Node = { name: string; extras: Record<string, string>; m: Mesh };
const nodes: Node[] = Object.entries(regions).map(([region, list]) => ({
  name: region,
  extras: { region, group: MUSCLE_REGION_GROUPS[region] },
  m: simplify(merge(list), 0.35, 0.02),
}));
nodes.push({
  name: "relleno",
  extras: { filler: "muscle" },
  m: merge(visibleFiller.map((f) => simplify(f, 0.15, 0.03, false))),
});
nodes.push({
  name: "piel",
  extras: { filler: "skin" },
  m: simplify(caps, 0.5, 0.01),
});

function glb(list: Node[]): Buffer {
  const bins: Buffer[] = [];
  const views: object[] = [],
    accessors: object[] = [],
    meshes: object[] = [],
    gnodes: object[] = [];
  let off = 0;
  const add = (
    arr: Float32Array | Uint16Array | Uint32Array,
    target: number,
  ) => {
    const bytes = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength),
      pad = (4 - (bytes.length % 4)) % 4;
    bins.push(bytes, Buffer.alloc(pad));
    views.push({
      buffer: 0,
      byteOffset: off,
      byteLength: bytes.length,
      target,
    });
    off += bytes.length + pad;
    return views.length - 1;
  };
  for (const n of list) {
    const { pos, idx } = n.m,
      vc = pos.length / 3;
    const min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i++) {
      min[i % 3] = Math.min(min[i % 3], pos[i]);
      max[i % 3] = Math.max(max[i % 3], pos[i]);
    }
    const small = vc < 65536;
    accessors.push({
      bufferView: add(pos, 34962),
      componentType: 5126,
      count: vc,
      type: "VEC3",
      min,
      max,
    });
    accessors.push({
      bufferView: add(small ? Uint16Array.from(idx) : idx, 34963),
      componentType: small ? 5123 : 5125,
      count: idx.length,
      type: "SCALAR",
    });
    meshes.push({
      name: n.name,
      primitives: [
        {
          attributes: { POSITION: accessors.length - 2 },
          indices: accessors.length - 1,
        },
      ],
    });
    gnodes.push({ name: n.name, mesh: meshes.length - 1, extras: n.extras });
  }
  const json = Buffer.from(
    JSON.stringify({
      asset: {
        version: "2.0",
        generator: "web/scripts/gen-muscle-model.ts",
        copyright:
          "BodyParts3D, © The Database Center for Life Science, CC BY 4.0",
      },
      scene: 0,
      scenes: [{ nodes: gnodes.map((_, i) => i) }],
      nodes: gnodes,
      meshes,
      accessors,
      bufferViews: views,
      buffers: [{ byteLength: off }],
    }),
  );
  const js = Buffer.concat([
    json,
    Buffer.alloc((4 - (json.length % 4)) % 4, 0x20),
  ]);
  const bin = Buffer.concat(bins);
  const head = Buffer.alloc(28);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(28 + js.length + bin.length, 8);
  head.writeUInt32LE(js.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(bin.length, 0);
  binHead.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head.subarray(0, 20), js, binHead, bin]);
}

const out = new URL("../public/models/", import.meta.url);
const file = glb(nodes);
writeFileSync(new URL("muscles.glb.gz", out), gzipSync(file, { level: 9 }));
writeFileSync(
  new URL("ATTRIBUTION.md", out),
  `# Modelo 3D de los músculos

\`muscles.glb.gz\` deriva de **BodyParts3D 4.0**, © The Database Center for Life
Science (DBCLS), con licencia **CC BY 4.0**
(https://creativecommons.org/licenses/by/4.0/).

- Base de datos: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- Licencia: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html
- Mitsuhashi et al. (2009), BodyParts3D: 3D structure database for anatomical
  concepts. https://doi.org/10.1093/nar/gkn613
- Empaquetado de partida: human-atlas (MIT), que convierte las unidades a
  metros con el eje Y hacia arriba y simplifica cada malla.

Cambios: se conservan solo los músculos y la piel de cabeza, manos y pies; las
mallas se agrupan por las sub-regiones de Esencial y se simplifican; el recto
abdominal se recorta de la aponeurosis del oblicuo externo y el dorsal ancho se
modela como una lámina a partir de la piel, porque el atlas no los trae. Lo
genera \`web/scripts/gen-muscle-model.ts\`.
`,
);
const tris = nodes.reduce((s, n) => s + n.m.idx.length / 3, 0);
console.log(
  `muscles.glb.gz: ${nodes.length} mallas, ${tris} triángulos, ${file.length} B → ${gzipSync(file, { level: 9 }).length} B gzip`,
);
