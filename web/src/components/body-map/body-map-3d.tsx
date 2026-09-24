// Mapa muscular 3D (se carga bajo demanda desde `stage.tsx`).
//
// La geometría no es un modelo nuevo: se EXTRUYEN los mismos `path` de
// `data.ts` (body-muscles, Apache-2.0; `LICENSE` y `NOTICE` en esta carpeta)
// con `SVGLoader` + `ExtrudeGeometry`. Cada pieza es un mesh propio con su
// sub-región canónica, así que pulsar un mesh elige lo mismo que pulsar su
// `<g role="button">` del SVG. La vista frontal mira a +z y la trasera se
// coloca de espaldas detrás: girar la figura es darle la vuelta al cuerpo.
//
// Esta capa es decorativa para el lector de pantalla (`aria-hidden`): los
// botones accesibles siguen siendo los del SVG que hay debajo.
import { Canvas, type ThreeEvent, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import {
  Color,
  ExtrudeGeometry,
  type Group,
  MathUtils,
  type Shape,
} from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import type { BodyView } from "./body-map";
import { BACK_REGIONS, type BodyRegion, FRONT_REGIONS } from "./data";
import { canonicalRegionId } from "./regions";

/** Centro horizontal de cada vista en el lienzo original (ver `VIEWBOX`). */
const CENTER_X = { front: 17.5, back: 54.5 };
const CENTER_Y = 46.5;
const DEPTH = 2.2;
/** Separación entre la cara frontal y la trasera de la figura. */
const GAP = 0.6;
/** Radianes por píxel arrastrado. */
const DRAG_SPEED = 0.01;
/** Giro de reposo (rad): tres cuartos suaves en vez de plano frontal. */
const TILT = -0.45;

type Piece = {
  key: string;
  region: string | null;
  geometry: ExtrudeGeometry;
  back: boolean;
};

const loader = new SVGLoader();

function shapesOf(path: string): Shape[] {
  const data = loader.parse(
    `<svg xmlns="http://www.w3.org/2000/svg"><path d="${path}"/></svg>`,
  );
  return data.paths.flatMap((p) => p.toShapes());
}

function buildPieces(): Piece[] {
  const make = (r: BodyRegion, back: boolean): Piece => {
    const geometry = new ExtrudeGeometry(shapesOf(r.path), {
      depth: DEPTH,
      bevelEnabled: true,
      bevelThickness: 0.35,
      bevelSize: 0.18,
      bevelSegments: 2,
      curveSegments: 6,
    });
    // SVG: y hacia abajo → three: y hacia arriba. Centrado en su vista.
    const cx = back ? CENTER_X.back : CENTER_X.front;
    geometry.translate(-cx, -CENTER_Y, 0);
    geometry.scale(1, -1, 1);
    // `scale(1,-1,1)` invierte el sentido de las caras: se compensa en z.
    geometry.scale(1, 1, -1);
    if (back) {
      // De espaldas y detrás: girada 180° en y, así la derecha de la vista
      // trasera queda donde la izquierda de la frontal, como en un cuerpo.
      geometry.rotateY(Math.PI);
      geometry.translate(0, 0, -(GAP / 2 + DEPTH));
    } else {
      geometry.translate(0, 0, GAP / 2 + DEPTH);
    }
    return {
      key: `${back ? "b" : "f"}-${r.id}`,
      region: r.tag ? canonicalRegionId(r.id) : null,
      geometry,
      back,
    };
  };
  return [
    ...FRONT_REGIONS.map((r) => make(r, false)),
    ...BACK_REGIONS.map((r) => make(r, true)),
  ];
}

/** Colores del sistema de diseño, leídos de las variables CSS. */
function palette() {
  const css = getComputedStyle(document.documentElement);
  const read = (name: string) => new Color(css.getPropertyValue(name).trim());
  return {
    filler: read("--color-border-strong"),
    muscle: read("--color-muscle"),
    hover: read("--color-muscle-strong"),
    active: read("--color-primary"),
    focus: read("--color-secondary"),
  };
}

function Figure({
  view,
  regions,
  focused,
  onSelect,
}: {
  view?: BodyView;
  regions: string[];
  focused: string | null;
  onSelect?: (region: string) => void;
}) {
  const pieces = useMemo(buildPieces, []);
  const colors = useMemo(palette, []);
  const group = useRef<Group>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  // Arranca girada un poco para que se lea el volumen desde el primer vistazo.
  const yaw = useRef((view === "back" ? Math.PI : 0) + TILT);
  const lastView = useRef(view);
  const active = new Set(regions);

  useFrame((_, dt) => {
    // Cambiar de vista (Frontal/Trasera) gira la figura hasta esa cara.
    if (view !== lastView.current) {
      lastView.current = view;
      const target = (view === "back" ? Math.PI : 0) + TILT;
      const turns = Math.round((yaw.current - target) / (2 * Math.PI));
      yaw.current = target + turns * 2 * Math.PI;
    }
    const g = group.current;
    if (!g) return;
    if (!view && !drag.current) yaw.current += dt * 0.35; // ficha: giro lento
    g.rotation.y = MathUtils.damp(g.rotation.y, yaw.current, 8, dt);
  });

  const skin = (region: string | null) => {
    if (!region) return colors.filler;
    if (active.has(region)) return colors.active;
    if (region === focused) return colors.focus;
    if (onSelect && region === hovered) return colors.focus;
    return onSelect ? colors.hover : colors.filler;
  };

  return (
    <group
      ref={group}
      scale={0.075}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        drag.current = { x: e.clientX, moved: false };
        (e.target as Element).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.x;
        if (Math.abs(dx) > 3) drag.current.moved = true;
        drag.current.x = e.clientX;
        yaw.current += dx * DRAG_SPEED;
      }}
      onPointerUp={() => {
        // El clic de un mesh llega después: se deja la marca un instante.
        setTimeout(() => {
          drag.current = null;
        });
      }}
    >
      {pieces.map((p) => {
        const on = p.region !== null && active.has(p.region);
        const lit = on || p.region === focused || p.region === hovered;
        const color = skin(p.region);
        return (
          <mesh
            key={p.key}
            geometry={p.geometry}
            onPointerOver={(e) => {
              if (!p.region || !onSelect) return;
              e.stopPropagation();
              setHovered(p.region);
            }}
            onPointerOut={() => setHovered((h) => (h === p.region ? null : h))}
            onClick={(e) => {
              if (!p.region || !onSelect || drag.current?.moved) return;
              e.stopPropagation();
              onSelect(p.region);
            }}
          >
            <meshStandardMaterial
              color={color}
              emissive={lit ? color : colors.filler}
              emissiveIntensity={lit ? (on ? 0.7 : 0.3) : 0}
              roughness={0.55}
              metalness={0.1}
            />
          </mesh>
        );
      })}
    </group>
  );
}

export default function BodyMap3D(props: {
  view?: BodyView;
  regions: string[];
  focused: string | null;
  onSelect?: (region: string) => void;
}) {
  return (
    <div
      aria-hidden="true"
      className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
    >
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, 11], fov: 40 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={1.1} />
        <hemisphereLight args={["#dfe7f2", "#0a0c0f", 0.8]} />
        <directionalLight position={[4, 6, 8]} intensity={2.4} />
        <directionalLight position={[-6, -2, -8]} intensity={1.4} />
        <Figure {...props} />
      </Canvas>
    </div>
  );
}
