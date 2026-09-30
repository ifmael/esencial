// Visor 3D de los músculos (modelo de `public/models/muscles.glb.gz`, generado
// desde BodyParts3D). Dos modos, como el mapa SVG: con `onSelect` se pulsa un
// músculo para filtrar; sin él informa, con cada músculo pintado según su grado.
//
// three va en su propio trozo (`import()` de `./scene`) y solo se descarga
// donde hay visor. Sin WebGL, o si la escena no carga, se pinta `fallback` (el
// mapa SVG), que además es el camino accesible por teclado músculo a músculo:
// el lienzo no tiene foco, solo un nombre que lista lo marcado. Con el ratón,
// un tooltip nombra el músculo de debajo y la rueda acerca hacia el cursor.
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type ExerciseRegion, ROLE_LABELS } from "../../lib/exercises";
import { isSoftwareRenderer } from "../../lib/webgl";
import type { BodyView } from "../body-map/body-map";
import { regionLabel } from "../body-map/regions";
import { Loader } from "../expressive";
import { UndoIcon } from "../icons";
import { Tooltip } from "../overlay";
import { Button, cx } from "../ui";
import type { SceneHandle } from "./scene";

/** WebGL de verdad: el global existe, el navegador da un contexto (una GPU
 *  vetada devuelve null) y lo pinta una GPU, no un renderizador por software
 *  (`isSoftwareRenderer`). Sin el global (jsdom) ni se intenta. El contexto de
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
  // La extensión da el nombre real; sin ella (obsoleta en Firefox), RENDERER.
  const info = gl.getExtension?.("WEBGL_debug_renderer_info");
  const renderer = gl.getParameter?.(
    info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER,
  );
  gl.getExtension?.("WEBGL_lose_context")?.loseContext();
  return !isSoftwareRenderer(renderer);
}

export function Body3D({
  regions,
  onSelect,
  view = "front",
  fallback,
  legend,
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
  /** Fila bajo el visor (y bajo el respaldo); con ella, «Restablecer vista» va
   *  a su izquierda en vez de sobre el modelo. */
  legend?: ReactNode;
  className?: string;
}) {
  const [failed, setFailed] = useState(() => !hasWebGL());
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<{
    region: string;
    x: number;
    y: number;
  } | null>(null);
  // El usuario giró o acercó: se ofrece volver a la vista de partida.
  const [moved, setMoved] = useState(false);
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
          onHover: (region, x, y) => setHover(region ? { region, x, y } : null),
          onMoved: () => setMoved(true),
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
  // Cambiar de vista (o pulsar «Restablecer vista») devuelve la cámara a la de
  // partida: sin zoom y de frente o de espaldas.
  const reset = () => {
    scene.current?.view(view);
    setMoved(false);
  };
  useEffect(() => {
    scene.current?.view(view);
    setMoved(false);
  }, [view]);

  if (failed)
    return (
      <>
        {fallback}
        {legend}
      </>
    );
  const name = interactive
    ? "Mapa muscular 3D: arrastra para girarlo y pulsa un músculo para filtrar"
    : `Músculos: ${regions
        .map(
          (r) =>
            `${regionLabel(r.region)}, ${ROLE_LABELS[r.role].toLowerCase()}`,
        )
        .join("; ")}`;
  // Solo icono: en móvil, con texto, tapaba medio modelo.
  const resetButton = moved && (
    <Button
      variant="tonal"
      size="icon"
      onClick={reset}
      aria-label="Restablecer vista"
      title="Restablecer vista"
      className={cx(
        "absolute",
        legend ? "top-1/2 left-0 -translate-y-1/2" : "bottom-2 left-2",
      )}
    >
      <UndoIcon />
    </Button>
  );
  const viewer = (
    <div className={cx("relative", className)}>
      {/* `pan-y`: el dedo en vertical desplaza la página (el visor solo gira
          en horizontal); con `none` el lienzo atraparía el scroll en móvil. */}
      <div
        ref={host}
        role="img"
        aria-label={name}
        className="size-full touch-pan-y"
      />
      {/* Sobre el cursor (debajo si no cabe arriba), fuera del `role="img"`:
          dentro, su texto se sumaría al nombre del lienzo. */}
      {hover && (
        <Tooltip
          className="absolute whitespace-nowrap px-2 py-1 text-body-s"
          style={{
            left: hover.x,
            top: hover.y < 48 ? hover.y + 24 : hover.y - 12,
            transform: `translate(-50%, ${hover.y < 48 ? "0" : "-100%"})`,
          }}
        >
          {regionLabel(hover.region)}
        </Tooltip>
      )}
      {!legend && resetButton}
      {/* Fuera del `role="img"`: dentro, el lector no anunciaría la carga. */}
      {!ready && (
        <Loader
          label="Cargando el modelo 3D…"
          className="absolute inset-0 m-auto"
        />
      )}
    </div>
  );
  if (!legend) return viewer;
  // El botón va fuera del flujo de la fila: al aparecer no la hace crecer. Su
  // hueco (48 px + margen) se reserva a los dos lados para que la leyenda siga
  // centrada y no quede debajo del botón.
  return (
    <>
      {viewer}
      <div className="relative grid min-h-12 items-center px-14">
        {resetButton}
        {legend}
      </div>
    </>
  );
}
