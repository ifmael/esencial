// Visor 3D de los músculos (modelo de `public/models/muscles.glb.gz`, generado
// desde BodyParts3D). Dos modos, como el mapa SVG: con `onSelect` se pulsa un
// músculo para filtrar; sin él informa, con cada músculo pintado según su grado.
//
// three va en su propio trozo (`import()` de `./scene`) y solo se descarga
// donde hay visor. Sin WebGL, o si la escena no carga, se pinta `fallback` (el
// mapa SVG), que además es el camino accesible por teclado músculo a músculo:
// el lienzo no tiene foco ni botones, solo un nombre que lista lo marcado.
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type ExerciseRegion, ROLE_LABELS } from "../../lib/exercises";
import type { BodyView } from "../body-map/body-map";
import { regionLabel } from "../body-map/regions";
import { Loader } from "../expressive";
import { cx } from "../ui";
import type { SceneHandle } from "./scene";

/** WebGL de verdad: el global existe y el navegador da un contexto (una GPU
 *  vetada devuelve null). Sin el global (jsdom) ni se intenta. El contexto de
 *  prueba se suelta al acabar: Chrome tiene un tope de contextos vivos y, al
 *  pasarlo, pierde el más antiguo, que puede ser el del propio visor. Lo usa
 *  también quien tenga que ofrecer por su cuenta el camino por teclado que el
 *  respaldo SVG ya trae (sus músculos son botones). */
export function hasWebGL(): boolean {
  if (typeof WebGL2RenderingContext === "undefined") return false;
  const canvas = document.createElement("canvas");
  const gl = (canvas.getContext("webgl2") ??
    canvas.getContext("webgl")) as WebGLRenderingContext | null;
  if (!gl) return false;
  gl.getExtension?.("WEBGL_lose_context")?.loseContext();
  return true;
}

export function Body3D({
  regions,
  onSelect,
  view = "front",
  fallback,
  className = "h-96 w-full",
}: {
  /** Lo marcado con su grado: lo que trabaja el ejercicio o el filtro elegido. */
  regions: ExerciseRegion[];
  /** Sin él, el visor es solo lectura: informa y no filtra. */
  onSelect?: (region: string) => void;
  /** Vista de partida (y a la que vuelve al cambiarla); se puede girar. */
  view?: BodyView;
  /** Lo que se pinta sin WebGL o si la escena falla. */
  fallback: ReactNode;
  className?: string;
}) {
  const [failed, setFailed] = useState(() => !hasWebGL());
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<SceneHandle | null>(null);
  // La escena se monta una vez; lo que cambia le llega por estas referencias.
  const latest = useRef({ regions, onSelect, view });
  latest.current = { regions, onSelect, view };
  const interactive = onSelect !== undefined;

  useEffect(() => {
    const el = host.current;
    if (failed || !el) return;
    let dead = false;
    import("./scene")
      .then(({ mountScene }) => {
        return mountScene(el, {
          interactive,
          onSelect: (id) => latest.current.onSelect?.(id),
          onHover: setHover,
          onLost: () => setFailed(true),
        });
      })
      .then((h) => {
        if (dead) return h.dispose();
        scene.current = h;
        h.paint(latest.current.regions);
        h.view(latest.current.view);
        setReady(true);
      })
      .catch(() => {
        if (!dead) setFailed(true);
      });
    return () => {
      dead = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, [failed, interactive]);

  const key = regions.map((r) => `${r.region}:${r.role}`).join();
  useEffect(() => scene.current?.paint(latest.current.regions), [key, ready]);
  useEffect(() => scene.current?.view(view), [view]);

  if (failed) return <>{fallback}</>;
  const name = interactive
    ? "Mapa muscular 3D: arrastra para girarlo y pulsa un músculo para filtrar"
    : `Músculos: ${regions
        .map(
          (r) =>
            `${regionLabel(r.region)}, ${ROLE_LABELS[r.role].toLowerCase()}`,
        )
        .join("; ")}`;
  return (
    <div className={cx("relative", className)}>
      {/* `pan-y`: el dedo en vertical desplaza la página (el visor solo gira
          en horizontal); con `none` el lienzo atraparía el scroll en móvil. */}
      <div
        ref={host}
        role="img"
        aria-label={name}
        title={hover ? regionLabel(hover) : undefined}
        className="size-full touch-pan-y"
      />
      {/* Fuera del `role="img"`: dentro, el lector no anunciaría la carga. */}
      {!ready && (
        <Loader
          label="Cargando el modelo 3D…"
          className="absolute inset-0 m-auto"
        />
      )}
    </div>
  );
}
