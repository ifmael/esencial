// Recompensa al completar la sesión (dirección D): sello «¡Hecho!» y confeti
// ligero en un <canvas> propio, sin librería. Con prefers-reduced-motion no hay
// confeti y el sello queda quieto (la regla global de globals.css).
import { useEffect, useRef } from "react";

const COLORS = ["#34d27b", "#ffd23f", "#ff8fc2", "#7cb8ff", "#111111"];

function burst(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;
  canvas.width = w;
  canvas.height = h;
  const bits = Array.from({ length: 90 }, (_, i) => ({
    x: w / 2,
    y: h / 3,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 12 - 4,
    r: Math.random() * Math.PI,
    s: 6 + Math.random() * 6,
    c: COLORS[i % COLORS.length],
  }));
  let frame = 0;
  let id = 0;
  const tick = () => {
    ctx.clearRect(0, 0, w, h);
    for (const b of bits) {
      b.vy += 0.35;
      b.x += b.vx;
      b.y += b.vy;
      b.r += 0.15;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.r);
      ctx.fillStyle = b.c;
      ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2);
      ctx.restore();
    }
    // ~1,5 s a 60 fps y se limpia solo.
    if (++frame < 90) id = requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, w, h);
  };
  id = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(id);
}

export function SessionReward() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced || !canvas.current) return;
    return burst(canvas.current);
  }, []);

  return (
    <div
      role="status"
      aria-label="Sesión completa"
      className="relative flex flex-col items-center gap-2 py-4"
    >
      <canvas
        ref={canvas}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-50 h-full w-full"
      />
      <span className="stamp">¡Hecho!</span>
      <span className="text-caption font-bold">
        Todo marcado. Elige el esfuerzo y cierra la sesión.
      </span>
    </div>
  );
}
