// Catálogo del sistema de diseño (AGENTS.md § "Sistema de diseño").
//
// Todas las variantes de las primitivas en un sitio: es lo que se mira antes de
// inventar una pieza. Se llega por el enlace «Sistema de diseño» del menú — es
// una referencia para quien construye, no una pantalla del producto.
import type { ReactNode } from "react";
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloudIcon,
  DumbbellIcon,
  LeafIcon,
  LogoutIcon,
  SwatchIcon,
  UtensilsIcon,
} from "../components/icons";
import { SessionReward } from "../components/reward";
import { Badge, Button, Card, Input, Select, Textarea } from "../components/ui";

function Block({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="section-label">{title}</h2>
        {hint ? (
          <p className="text-caption text-text-secondary">{hint}</p>
        ) : null}
      </div>
      {children}
    </Card>
  );
}

/** Las clases van como literales: Tailwind escanea el texto del fichero, así que
 * una clase compuesta en tiempo de ejecución no existiría en el CSS. */
function TypeRow({ sample, label }: { sample: string; label: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className={`${sample} font-semibold`}>Aa</span>
      <span className="text-caption text-text-secondary">{label}</span>
    </div>
  );
}

export function UiPage() {
  return (
    <div className="flex flex-col gap-section">
      <header className="flex flex-col gap-1">
        <h1 className="text-display font-bold">Sistema de diseño</h1>
        <p className="text-caption text-text-secondary">
          Los valores viven en <code>web/src/globals.css</code>. Si algo no
          encaja, se añade un token; nunca un valor suelto.
        </p>
      </header>

      <Block
        title="Tipografía"
        hint="Siete pasos; hero, display y title van en Bricolage Grotesque."
      >
        <div className="flex flex-col gap-2">
          <TypeRow sample="text-hero" label="48px · sello y cifras grandes" />
          <TypeRow sample="text-display" label="28px · título de pantalla" />
          <TypeRow sample="text-title" label="20px · título de bloque" />
          <TypeRow
            sample="text-lead"
            label="17px · dato principal de una fila"
          />
          <TypeRow sample="text-body" label="15px · texto de interfaz" />
          <TypeRow sample="text-caption" label="13px · metadatos y ayudas" />
          <TypeRow sample="text-micro" label="11px · etiquetas y insignias" />
        </div>
      </Block>

      <Block
        title="Botones"
        hint="Cuatro variantes y tres tamaños; md mantiene 44px de alto. Al pulsar, el botón se hunde sobre su sombra dura."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primario</Button>
          <Button variant="secondary">Secundario</Button>
          <Button variant="ghost">Fantasma</Button>
          <Button variant="danger">Peligro</Button>
          <Button disabled>Deshabilitado</Button>
          <Button size="sm">Pequeño</Button>
          <Button size="icon" aria-label="Botón de icono">
            <CheckIcon />
          </Button>
        </div>
      </Block>

      <Block
        title="Campos"
        hint="El error se marca con aria-invalid: es el gancho de estilo y lo que anuncia el lector de pantalla."
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            aria-label="Campo normal"
            placeholder="Texto normal"
            className="sm:max-w-xs"
          />
          <Input
            aria-label="Campo con error"
            aria-invalid
            defaultValue="Sin conexión"
            className="sm:max-w-xs"
          />
          <Input
            aria-label="Campo deshabilitado"
            disabled
            placeholder="Deshabilitado"
            className="sm:max-w-xs"
          />
          <Select
            aria-label="Selector"
            defaultValue="uno"
            className="sm:max-w-xs"
          >
            <option value="uno">Una opción</option>
            <option value="dos">Otra opción</option>
          </Select>
        </div>
        <Textarea aria-label="Área de texto" placeholder="Área de texto" />
      </Block>

      <Block title="Insignias">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="pending">Pendiente</Badge>
          <Badge tone="done">Hecho</Badge>
          <Badge>Neutro</Badge>
        </div>
      </Block>

      <Block
        title="Superficies y elevación"
        hint="Sombras duras de tinta, sin blur: control, card, raised y press (la hundida). Trazo de 2px (border) o 3px (border-thick)."
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-card border bg-surface p-4 text-caption shadow-control">
            shadow-control
          </div>
          <div className="rounded-card border-thick bg-surface p-4 text-caption shadow-card">
            shadow-card
          </div>
          <div className="rounded-card border-thick bg-surface p-4 text-caption shadow-raised">
            shadow-raised
          </div>
          <div className="rounded-card border bg-surface-muted p-4 text-caption shadow-inset">
            shadow-inset
          </div>
        </div>
        <div className="skeleton h-6" />
      </Block>

      <Block
        title="Color"
        hint="Planos y saturados, siempre con tinta encima. Un acento por sección: Hoy azul, Deporte verde, Nutrición rosa; el amarillo marca hover y racha."
      >
        <div className="flex flex-wrap gap-3">
          <span className="rounded-panel border bg-primary-fill px-3 py-2 text-caption font-bold shadow-control">
            primary-fill
          </span>
          <span className="rounded-panel border bg-accent-yellow px-3 py-2 text-caption font-bold shadow-control">
            accent-yellow
          </span>
          <span className="rounded-panel border bg-accent-pink px-3 py-2 text-caption font-bold shadow-control">
            accent-pink
          </span>
          <span className="rounded-panel border bg-accent-blue px-3 py-2 text-caption font-bold shadow-control">
            accent-blue
          </span>
          <span className="rounded-panel border bg-error px-3 py-2 text-caption font-bold text-on-error shadow-control">
            error
          </span>
          <span className="rounded-panel border bg-surface-muted px-3 py-2 text-caption font-bold shadow-control">
            surface-muted
          </span>
        </div>
      </Block>

      <Block
        title="Casilla"
        hint="Caja de tinta que se rellena de verde con un pop al marcarla."
      >
        <div className="flex items-center gap-4">
          <input type="checkbox" aria-label="Casilla pequeña" defaultChecked />
          <input
            type="checkbox"
            aria-label="Casilla táctil"
            className="min-h-11 min-w-11"
            defaultChecked
          />
          <input
            type="checkbox"
            aria-label="Casilla sin marcar"
            className="min-h-11 min-w-11"
          />
        </div>
      </Block>

      <Block
        title="Recompensa"
        hint="Al marcar lo último de /sesion/:fecha: sello ¡Hecho! y confeti (canvas propio). Con reduced-motion, solo el sello quieto."
      >
        <SessionReward />
      </Block>

      <Block
        title="Iconos"
        hint="Once trazos de 24px; once formas no justifican una librería."
      >
        <div
          data-testid="icon-set"
          className="flex flex-wrap items-center gap-4 text-text-secondary"
        >
          <CalendarIcon />
          <DumbbellIcon />
          <UtensilsIcon />
          <ChevronDownIcon />
          <ChevronLeftIcon />
          <ChevronRightIcon />
          <LogoutIcon />
          <CloudIcon />
          <CheckIcon />
          <LeafIcon />
          <SwatchIcon />
        </div>
      </Block>

      <Block
        title="Movimiento"
        hint="Tres duraciones, ease-out-quart para reaccionar y ease-bounce para lo que salta; todo se apaga con prefers-reduced-motion. Pasa el ratón por encima."
      >
        <Card className="card-interactive">
          <p className="text-body">
            Tarjeta interactiva: se levanta en hover (sombra más larga) y se
            hunde al pulsarla, con rebote.
          </p>
        </Card>
      </Block>
    </div>
  );
}
