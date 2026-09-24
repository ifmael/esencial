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
  MoonIcon,
  SunIcon,
  SwatchIcon,
  UtensilsIcon,
} from "../components/icons";
import {
  Badge,
  Button,
  Card,
  chipClass,
  Input,
  Select,
  Sheet,
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
        <h1 className="text-display font-bold">Sistema de diseño</h1>
        <p className="text-caption text-text-secondary">
          Los valores viven en <code>web/src/globals.css</code>. Si algo no
          encaja, se añade un token; nunca un valor suelto.
        </p>
      </header>

      <Block
        title="Tipografía"
        hint="Seis pasos, cada uno con su interlineado y su tracking."
      >
        <div className="flex flex-col gap-2">
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
        hint="Cuatro variantes y tres tamaños; md mantiene 44px de alto y type=button por defecto. Hover y pulsación con muelle (--ease-spring)."
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
        title="Fichas"
        hint="chipClass(): materiales, tags y filtros. Si es un botón conmutable, aria-pressed la pinta rellena."
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className={chipClass()}>Sartén</span>
          <span className={chipClass({ tone: "done" })}>cena</span>
          <button type="button" aria-pressed={true} className={chipClass()}>
            Desayuno
          </button>
          <button type="button" aria-pressed={false} className={chipClass()}>
            Almuerzo
          </button>
        </div>
      </Block>

      <Block
        title="Vidrio y elevación"
        hint="Card = vidrio (blur 18px + borde de luz); una tarjeta dentro de otra no vuelve a desenfocar. Sheet = vidrio denso de modales y cajones (blur 28px). Sin backdrop-filter o con transparencia reducida, el vidrio pasa a opaco."
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
        <Sheet className="text-caption">
          Sheet · shadow-sheet · rounded-sheet
          <Card className="mt-3">Card anidada: sin segundo blur</Card>
        </Sheet>
        <div className="skeleton h-6" />
      </Block>

      <Block
        title="Iconos"
        hint="Trece trazos de 24px; trece formas no justifican una librería."
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
          <MoonIcon />
          <SunIcon />
        </div>
      </Block>

      <Block
        title="Movimiento"
        hint="Tres duraciones, un easing de salida y un muelle; la aurora se pausa con la pestaña oculta y todo se apaga con prefers-reduced-motion. Pasa el ratón por encima."
      >
        <Card className="card-interactive">
          <p className="text-body">
            Tarjeta interactiva: con ratón se inclina hacia el puntero (hasta
            5°), se levanta 2px y al pulsarla se hunde con un muelle.
          </p>
        </Card>
      </Block>
    </div>
  );
}
