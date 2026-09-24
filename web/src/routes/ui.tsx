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
import {
  Badge,
  Button,
  Card,
  Chip,
  Input,
  Select,
  Textarea,
} from "../components/ui";

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
        <span className="section-label">Dirección A · Editorial cálido</span>
        <h1 className="text-hero">Sistema de diseño</h1>
        <span className="rule-accent" />
        <p className="text-caption text-text-secondary">
          Los valores viven en <code>web/src/globals.css</code>. Si algo no
          encaja, se añade un token; nunca un valor suelto.
        </p>
      </header>

      <Block
        title="Tipografía"
        hint="Siete pasos. Titulares (h1–h3, font-display) en Fraunces con óptico automático; el resto en Source Sans 3."
      >
        <div className="flex flex-col gap-2">
          <TypeRow sample="font-display text-hero" label="44px · portada" />
          <TypeRow
            sample="font-display text-display"
            label="32px · título de pantalla"
          />
          <TypeRow
            sample="font-display text-title"
            label="22px · título de bloque"
          />
          <TypeRow
            sample="text-lead"
            label="18px · dato principal de una fila"
          />
          <TypeRow sample="text-body" label="16px · texto y lectura" />
          <TypeRow sample="text-caption" label="13px · metadatos y ayudas" />
          <TypeRow sample="text-micro" label="11px · etiquetas y insignias" />
        </div>
      </Block>

      <Block
        title="Botones"
        hint="Cuatro variantes (peligro para confirmar lo destructivo) y tres tamaños; md mantiene 44px de alto y type=button por defecto."
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
          <Badge tone="accent">Acento</Badge>
        </div>
      </Block>

      <Block
        title="Fichas"
        hint="Conmutables: el estado vive en aria-pressed (estilo y lector de pantalla a la vez)."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Chip pressed>Desayuno</Chip>
          <Chip pressed={false}>Cena</Chip>
        </div>
      </Block>

      <Block
        title="Editorial"
        hint="Antetítulo, filete terracota, pie de foto en cursiva y paleta papel/tinta/oliva/terracota."
      >
        <div className="flex flex-col gap-2">
          <span className="section-label">Antetítulo</span>
          <h3 className="text-title">Titular de bloque</h3>
          <span className="rule-accent" />
          <p className="caption-editorial">Pie de foto: para 4 comensales</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span
            className="size-11 rounded-panel border border-border bg-background"
            title="background"
          />
          <span
            className="size-11 rounded-panel border border-border bg-surface"
            title="surface"
          />
          <span
            className="size-11 rounded-panel bg-surface-muted"
            title="surface-muted"
          />
          <span className="size-11 rounded-panel bg-text" title="text" />
          <span className="size-11 rounded-panel bg-primary" title="primary" />
          <span
            className="size-11 rounded-panel bg-secondary"
            title="secondary"
          />
          <span className="size-11 rounded-panel bg-accent" title="accent" />
          <span className="size-11 rounded-panel bg-scrim" title="scrim" />
        </div>
      </Block>

      <Block
        title="Superficies y elevación"
        hint="Dos sombras hacia abajo, una hundida y shadow-up para la barra inferior."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-card border border-border bg-surface p-4 shadow-card text-caption">
            shadow-card
          </div>
          <div className="rounded-card border border-border bg-surface p-4 shadow-raised text-caption">
            shadow-raised
          </div>
          <div className="rounded-card bg-surface-muted p-4 shadow-inset text-caption">
            shadow-inset
          </div>
        </div>
        <div className="skeleton h-6" />
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
        hint="Sereno: fast 140 · base 220 · slow 420 · page 480 ms, un solo easing, sin rebotes. Entradas escalonadas (.stagger) y View Transitions entre tarjeta y detalle de receta y al cambiar de semana. Todo se apaga con prefers-reduced-motion."
      >
        <Card className="card-interactive">
          <p className="text-body">
            Tarjeta interactiva: se levanta 2px al pasar por encima y vuelve al
            pulsarla.
          </p>
        </Card>
      </Block>
    </div>
  );
}
