// Escena three del visor 3D. Solo la importa `body-3d.tsx` con `import()`, así
// que three no entra en el trozo principal. Pinta bajo demanda (al girar, al
// cambiar lo marcado, el tamaño o el tema), no en un bucle continuo.
//
// Los colores salen de los tokens de `globals.css`, leídos sobre el propio
// visor: siguen el tema claro/oscuro sin duplicar la paleta aquí.
import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { ExerciseRegion, RegionRole } from "../../lib/exercises";
import type { BodyView } from "../body-map/body-map";

const MODEL_URL = "/models/muscles.glb.gz";
/** Centro del cuerpo (metros, Y arriba) y distancia a la que cabe entero. */
const TARGET = new T.Vector3(0, 0.88, 0);
const DISTANCE = 3.9;
/** Un toque se distingue de un arrastre por lo que se mueve el puntero. */
const TAP_PX = 6;

export type SceneHandle = {
  paint(regions: ExerciseRegion[]): void;
  view(view: BodyView): void;
  dispose(): void;
};

type Palette = Record<RegionRole | "hover" | "filler" | "skin", T.Color>;

/** Resuelve un token (cualquier sintaxis de color CSS, `color-mix` incluido)
 *  pintando un píxel: `getComputedStyle` no traduce `color-mix` a RGB. */
function palette(el: HTMLElement): Palette {
  const probe = document.createElement("span");
  el.appendChild(probe);
  const ctx = document
    .createElement("canvas")
    .getContext("2d", { willReadFrequently: true });
  const read = (token: string) => {
    probe.style.color = `var(${token})`;
    if (!ctx) return new T.Color(getComputedStyle(probe).color);
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = getComputedStyle(probe).color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return new T.Color().setRGB(r / 255, g / 255, b / 255, T.SRGBColorSpace);
  };
  const colors: Palette = {
    primary: read("--color-primary"),
    secondary: read("--color-muscle-secondary"),
    stabilizer: read("--color-muscle-stabilizer"),
    hover: read("--color-muscle-strong"),
    // Lo que no está marcado va en gris, como el relleno: en el selector solo
    // destaca lo elegido (y lo que hay bajo el ratón).
    filler: read("--color-body"),
    skin: read("--color-surface-container-highest"),
  };
  probe.remove();
  return colors;
}

async function loadModel(): Promise<T.Group> {
  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) throw new Error(`Modelo 3D: ${res.status}`);
  const data = await new Response(
    res.body.pipeThrough(new DecompressionStream("gzip")),
  ).arrayBuffer();
  return (await new GLTFLoader().parseAsync(data, "")).scene;
}

export async function mountScene(
  host: HTMLElement,
  opts: {
    interactive: boolean;
    onSelect: (region: string) => void;
    /** El músculo bajo el ratón y dónde (px sobre el lienzo); `null` al salir. */
    onHover: (region: string | null, x: number, y: number) => void;
    /** El usuario giró o acercó la cámara. */
    onMoved: () => void;
    onLost: () => void;
  },
): Promise<SceneHandle> {
  const model = await loadModel();
  const reduced =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  // El lienzo sigue al visor por CSS, no con un ancho en px: fijado en px
  // (`setSize` por defecto) sostiene su columna al estrechar la ventana, el
  // visor ya no encoge y la página se sale por la derecha.
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  host.appendChild(renderer.domElement);

  const scene = new T.Scene();
  const pmrem = new T.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = env.texture;
  pmrem.dispose();
  const key = new T.DirectionalLight(0xffffff, 1.4);
  key.position.set(-2, 4, 3);
  const rim = new T.DirectionalLight(0xffffff, 1);
  rim.position.set(2, 2, -3);
  scene.add(key, rim, model);

  const camera = new T.PerspectiveCamera(30, 1, 0.05, 20);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(TARGET);
  controls.enablePan = false;
  controls.enableDamping = !reduced;
  // La rueda (o el pellizco) acerca hacia lo que hay bajo el cursor, no hacia el
  // centro del cuerpo: así se ve de cerca una zona concreta.
  controls.zoomToCursor = true;
  controls.minDistance = 0.6;
  controls.maxDistance = 6;
  // Una figura de pie solo gira en horizontal: el gesto vertical queda para
  // desplazar la página. OrbitControls pone `touch-action: none` al lienzo al
  // conectarse; se devuelve a `pan-y` o en móvil el dedo no saldría del visor.
  controls.minPolarAngle = Math.PI / 2;
  controls.maxPolarAngle = Math.PI / 2;
  renderer.domElement.style.touchAction = "pan-y";

  // Una malla por región (`extras.region`) y el relleno, que no se pulsa.
  const meshes = new Map<
    string,
    T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>
  >();
  const others: {
    mesh: T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>;
    skin: boolean;
  }[] = [];
  model.traverse((o) => {
    if (!(o instanceof T.Mesh)) return;
    o.geometry.computeVertexNormals();
    const material = new T.MeshStandardMaterial({
      roughness: 0.62,
      metalness: 0.02,
      side: T.DoubleSide,
    });
    o.material = material;
    const region: string | undefined = o.userData.region;
    if (region) meshes.set(region, o);
    else others.push({ mesh: o, skin: o.userData.filler === "skin" });
  });

  let colors = palette(host);
  let marks = new Map<string, RegionRole>();
  let hovered: string | null = null;
  let frame = 0;
  const render = () => {
    frame = 0;
    if (controls.update()) request();
    renderer.render(scene, camera);
  };
  const request = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };
  const recolor = () => {
    if (opts.interactive)
      renderer.domElement.style.cursor = hovered ? "pointer" : "grab";
    for (const [region, mesh] of meshes) {
      const role = marks.get(region);
      mesh.material.color.copy(
        role
          ? opts.interactive
            ? colors.primary
            : colors[role]
          : opts.interactive && region === hovered
            ? colors.hover
            : colors.filler,
      );
    }
    for (const { mesh, skin } of others)
      mesh.material.color.copy(skin ? colors.skin : colors.filler);
    request();
  };
  // `start` llega con cualquier toque o rueda; solo cuenta si la cámara se mueve
  // de verdad después (un toque para elegir no la mueve). `view()` lo apaga.
  let touched = false;
  controls.addEventListener("start", () => {
    touched = true;
  });
  controls.addEventListener("change", () => {
    if (touched) opts.onMoved();
    request();
  });

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = host;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    request();
  };
  const sizes = new ResizeObserver(resize);
  sizes.observe(host);
  resize();

  // El tema cambia `data-theme` en <html> (y el sistema, la preferencia).
  const retheme = () => {
    colors = palette(host);
    recolor();
  };
  const themes = new MutationObserver(retheme);
  themes.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  const dark = window.matchMedia?.("(prefers-color-scheme: dark)");
  dark?.addEventListener("change", retheme);

  const ray = new T.Raycaster();
  const pointer = new T.Vector2();
  const regionAt = (e: PointerEvent): string | null => {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObject(model, true)[0];
    return (hit?.object.userData.region as string | undefined) ?? null;
  };
  let down: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_PX)
      return;
    down = null;
    const region = regionAt(e);
    if (region) opts.onSelect(region);
  };
  const onLeave = () => {
    if (hovered === null) return;
    hovered = null;
    opts.onHover(null, 0, 0);
    recolor();
  };
  const onMove = (e: PointerEvent) => {
    // Arrastrando se gira: ni realce ni tooltip.
    if (e.buttons || e.pointerType === "touch") return onLeave();
    const region = regionAt(e);
    if (!region) return onLeave();
    const r = renderer.domElement.getBoundingClientRect();
    opts.onHover(region, e.clientX - r.left, e.clientY - r.top);
    if (region === hovered) return;
    hovered = region;
    recolor();
  };
  renderer.domElement.addEventListener("pointermove", onMove);
  renderer.domElement.addEventListener("pointerleave", onLeave);
  if (opts.interactive) {
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
  }
  const lost = (e: Event) => {
    e.preventDefault();
    opts.onLost();
  };
  renderer.domElement.addEventListener("webglcontextlost", lost);

  return {
    paint(regions) {
      marks = new Map(regions.map((r) => [r.region, r.role]));
      recolor();
    },
    view(v) {
      touched = false;
      controls.target.copy(TARGET);
      camera.position.set(
        0,
        TARGET.y + 0.05,
        v === "front" ? DISTANCE : -DISTANCE,
      );
      controls.update();
      request();
    },
    dispose() {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      themes.disconnect();
      dark?.removeEventListener("change", retheme);
      controls.dispose();
      model.traverse((o) => {
        if (!(o instanceof T.Mesh)) return;
        o.geometry.dispose();
        o.material.dispose();
      });
      env.dispose();
      renderer.dispose();
      // Suelta el contexto ya: el GC tarda y Chrome limita los contextos vivos.
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
