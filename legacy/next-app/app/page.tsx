"use client";

import { useState } from "react";

export function formatDateEs(date: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function DayHeader({ date, onChange }: { date: Date; onChange: (d: Date) => void }) {
  return (
    <header className="mb-6 flex items-center justify-between">
      <button
        aria-label="Día anterior"
        className="btn-secondary"
        onClick={() => onChange(addDays(date, -1))}
      >
        ←
      </button>
      <h1 className="text-2xl font-bold capitalize">{formatDateEs(date)}</h1>
      <button
        aria-label="Día siguiente"
        className="btn-secondary"
        onClick={() => onChange(addDays(date, 1))}
      >
        →
      </button>
    </header>
  );
}

export default function DiaPage() {
  const [date, setDate] = useState(() => new Date());

  return (
    <>
      <DayHeader date={date} onChange={setDate} />
      <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-2 text-lg font-semibold">RECETA</h2>
        <div className="card text-text-secondary">No hay comidas planificadas para este día.</div>
      </section>
      <section>
        <h2 className="mb-2 text-lg font-semibold">FUERZA</h2>
        <div className="card text-text-secondary">Sin sesión asignada.</div>
      </section>
      <section>
        <h2 className="mb-2 text-lg font-semibold">NOTAS DEL DÍA</h2>
        <div className="card text-text-secondary">Escribe algo sobre hoy…</div>
      </section>
      </div>
    </>
  );
}
