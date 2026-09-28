// Catálogo del sistema de diseño M3 Expressive (AGENTS.md § "Sistema de
// diseño"). Todas las variantes en un sitio: es lo que se mira antes de
// inventar una pieza. Se llega por «Sistema de diseño» en el menú.
import { type ReactNode, useState } from "react";
import {
  CountUp,
  EmptyState,
  Loader,
  Monogram,
  RewardSeal,
  Shape,
  WavyProgress,
  WavyRing,
} from "../components/expressive";
import * as icons from "../components/icons";
import { AddIcon, CheckIcon, EditIcon } from "../components/icons";
import {
  Dialog,
  OverlayHeader,
  Sheet,
  useSnackbar,
} from "../components/overlay";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  ConnectedGroup,
  ConnectedItem,
  Fab,
  Field,
  Input,
  Kbd,
  Select,
  SplitButton,
  Switch,
  Textarea,
} from "../components/ui";
import { SHAPES, type ShapeName } from "../lib/shapes";

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
    <Card className="flex flex-col gap-4 rounded-xl">
      <div className="flex flex-col gap-1">
        <h2 className="text-title-l">{title}</h2>
        {hint ? (
          <p className="text-body-m text-on-surface-variant">{hint}</p>
        ) : null}
      </div>
      {children}
    </Card>
  );
}

/** Las clases van como literales: Tailwind escanea el texto del fichero, así
 * que una clase compuesta en tiempo de ejecución no existiría en el CSS. */
const TYPE_SCALE: [string, string][] = [
  ["text-display-l", "Display L · 57"],
  ["text-display-m", "Display M · 45"],
  ["text-display-s", "Display S · 36"],
  ["text-headline-l", "Headline L · 32"],
  ["text-headline-m", "Headline M · 28"],
  ["text-headline-s", "Headline S · 24"],
  ["text-title-l", "Title L · 22"],
  ["text-title-m", "Title M · 16"],
  ["text-title-s", "Title S · 14"],
  ["text-body-l", "Body L · 16"],
  ["text-body-m", "Body M · 14"],
  ["text-body-s", "Body S · 12"],
  ["text-label-l", "Label L · 14"],
  ["text-label-m", "Label M · 12"],
  ["text-label-s", "Label S · 11"],
];

const RADII: [string, string][] = [
  ["rounded-none", "none 0"],
  ["rounded-xs", "xs 4"],
  ["rounded-s", "s 8"],
  ["rounded-m", "m 12"],
  ["rounded-l", "l 16"],
  ["rounded-l-inc", "l-inc 20"],
  ["rounded-xl", "xl 28"],
  ["rounded-xl-inc", "xl-inc 32"],
  ["rounded-xxl", "xxl 48"],
  ["rounded-full", "full"],
];

const COLORS: [string, string][] = [
  ["bg-primary text-on-primary", "primary"],
  ["bg-primary-container text-on-primary-container", "primary-container"],
  ["bg-secondary text-on-secondary", "secondary"],
  ["bg-secondary-container text-on-secondary-container", "secondary-container"],
  ["bg-tertiary text-on-tertiary", "tertiary"],
  ["bg-tertiary-container text-on-tertiary-container", "tertiary-container"],
  ["bg-tertiary-soft text-on-tertiary-soft", "tertiary-soft"],
  ["bg-error text-on-error", "error"],
  ["bg-error-container text-on-error-container", "error-container"],
  ["bg-surface-container-lowest text-on-surface", "container-lowest"],
  ["bg-surface-container-low text-on-surface", "container-low"],
  ["bg-surface-container text-on-surface", "container"],
  ["bg-surface-container-high text-on-surface", "container-high"],
  ["bg-surface-container-highest text-on-surface", "container-highest"],
  ["bg-inverse-surface text-inverse-on-surface", "inverse-surface"],
];

const SPRINGS: [string, string][] = [
  ["motion-spatial-fast", "espacial rápido · k 800 ζ 0,6"],
  ["motion-spatial", "espacial · k 380 ζ 0,8"],
  ["motion-spatial-slow", "espacial lento · k 200 ζ 0,8"],
  ["motion-effects-fast", "efectos rápido · k 3800 ζ 1"],
  ["motion-effects", "efectos · k 1600 ζ 1"],
  ["motion-effects-slow", "efectos lento · k 800 ζ 1"],
];

export function UiPage() {
  const [view, setView] = useState<"dia" | "semana" | "mes">("semana");
  const [chips, setChips] = useState<Record<string, boolean>>({ Pecho: true });
  const [done, setDone] = useState(3);
  const [shape, setShape] = useState<ShapeName>("cookie-9");
  const [springOn, setSpringOn] = useState(false);
  const [overlay, setOverlay] = useState<"dialog" | "sheet" | null>(null);
  const [fabOpen, setFabOpen] = useState(false);
  const snackbar = useSnackbar();
  const [undone, setUndone] = useState(false);
  const shapeNames = Object.keys(SHAPES) as ShapeName[];
  const iconEntries = Object.entries(icons).filter(([k]) =>
    k.endsWith("Icon"),
  ) as [string, typeof CheckIcon][];

  return (
    <div className="flex flex-col gap-section">
      <header className="flex flex-col gap-2">
        <h1 className="text-display-s text-e">Sistema de diseño</h1>
        <p className="max-w-2xl text-body-l text-on-surface-variant">
          Material 3 Expressive. Los valores viven en{" "}
          <code>web/src/globals.css</code> y <code>web/src/tokens.css</code>{" "}
          (generado); las piezas, en <code>components/ui.tsx</code>,{" "}
          <code>expressive.tsx</code> y <code>overlay.tsx</code>. Si algo no
          encaja, se añade un token; nunca un valor suelto.
        </p>
      </header>

      <Block
        title="Color"
        hint="Roles M3 desde la semilla #15803d, claro y oscuro, todos AA. Deporte = primary, Nutrición = tertiary, Hoy = secondary."
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {COLORS.map(([cls, name]) => (
            <div
              key={name}
              className={`flex h-20 items-end rounded-l p-3 text-label-m ${cls}`}
            >
              {name}
            </div>
          ))}
        </div>
      </Block>

      <Block
        title="Tipografía"
        hint="Google Sans Flex variable (peso, anchura, tamaño óptico, ROND). text-e = emphasized."
      >
        <div className="flex flex-col gap-2">
          {TYPE_SCALE.map(([cls, label]) => (
            <div key={cls} className="flex flex-wrap items-baseline gap-x-4">
              <span className={cls}>Esencial</span>
              <span className={`${cls} text-e text-accent`}>Esencial</span>
              <span className="text-body-s text-on-surface-variant">
                {label}
              </span>
            </div>
          ))}
          <p className="text-headline-m tabular">
            <span className="text-e">12</span> series · 57,5 kg · 1.250 m
          </p>
        </div>
      </Block>

      <Block
        title="Forma"
        hint="Escala de esquinas M3E y formas abstractas. Pulsa una forma: el indicador se transforma (morph)."
      >
        <div className="flex flex-wrap gap-3">
          {RADII.map(([cls, label]) => (
            <div
              key={cls}
              className={`grid size-20 place-items-center bg-secondary-container text-label-s text-on-secondary-container ${cls}`}
            >
              {label}
            </div>
          ))}
        </div>
        <div
          data-testid="shape-set"
          className="flex flex-wrap items-center gap-3"
        >
          {shapeNames.map((name) => (
            <button
              key={name}
              type="button"
              aria-label={`Forma ${name}`}
              aria-pressed={shape === name}
              onClick={() => setShape(name)}
              className="state grid rounded-m p-1 text-tertiary"
            >
              <Shape name={name} size={48} />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <Shape
            name={shape}
            size={112}
            className="text-primary"
            label={`Forma elegida: ${shape}`}
          />
          <p className="text-body-m text-on-surface-variant">
            Todas las formas se muestrean con los mismos 120 puntos: cambiar de
            una a otra interpola el trazo con el muelle espacial.
          </p>
        </div>
      </Block>

      <Block
        title="Botones"
        hint="Redondos en reposo; al pulsar se cuadran (shape morph) y la etiqueta gana peso. md = 48 px."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button>Filled</Button>
          <Button variant="tonal">Tonal</Button>
          <Button variant="outlined">Outlined</Button>
          <Button variant="text">Text</Button>
          <Button variant="danger">Destructivo</Button>
          <Button disabled>Deshabilitado</Button>
          <Button size="sm">Pequeño</Button>
          <Button size="lg">Grande</Button>
          <Button size="icon" variant="tonal" aria-label="Botón de icono">
            <CheckIcon />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <SplitButton
            onClick={() => {}}
            menuLabel="Más formas de guardar"
            items={[
              {
                label: "Guardar y añadir otra",
                icon: <AddIcon />,
                onSelect: () => {},
              },
              {
                label: "Guardar y programar",
                icon: <EditIcon />,
                onSelect: () => {},
              },
            ]}
          >
            Guardar
          </SplitButton>
          <ConnectedGroup label="Vista">
            <ConnectedItem
              pressed={view === "dia"}
              onClick={() => setView("dia")}
            >
              Día
            </ConnectedItem>
            <ConnectedItem
              pressed={view === "semana"}
              onClick={() => setView("semana")}
            >
              Semana
            </ConnectedItem>
            <ConnectedItem
              pressed={view === "mes"}
              onClick={() => setView("mes")}
            >
              Mes
            </ConnectedItem>
          </ConnectedGroup>
        </div>
        <div
          className="flex flex-wrap items-end gap-4"
          data-section="nutricion"
        >
          <Fab size="sm" aria-label="FAB pequeño">
            <AddIcon />
          </Fab>
          <Fab aria-label="FAB">
            <EditIcon />
          </Fab>
          <Fab aria-label="FAB extendido" className="px-5">
            <AddIcon /> <span className="text-label-l">Crear</span>
          </Fab>
          <Fab
            size="lg"
            aria-label="FAB grande"
            aria-expanded={fabOpen}
            onClick={() => setFabOpen((o) => !o)}
          >
            <AddIcon width={36} height={36} />
          </Fab>
          <span className="text-body-s text-on-surface-variant">
            El grande se transforma en círculo al abrir.
          </span>
        </div>
      </Block>

      <Block title="Chips, casillas e interruptor">
        <div className="flex flex-wrap gap-2">
          {["Pecho", "Espalda", "Pierna"].map((c) => (
            <Chip
              key={c}
              pressed={Boolean(chips[c])}
              onClick={() => setChips((s) => ({ ...s, [c]: !s[c] }))}
            >
              {chips[c] ? <CheckIcon width={18} height={18} /> : null}
              {c}
            </Chip>
          ))}
        </div>
        <div className="flex items-center gap-6">
          <span className="flex items-center text-body-l">
            <Checkbox aria-label="Casilla" defaultChecked />
            Casilla
          </span>
          <span className="flex items-center gap-3 text-body-l">
            <Switch aria-label="Interruptor" defaultChecked />
            Interruptor
          </span>
        </div>
      </Block>

      <Block
        title="Campos"
        hint="Outlined con etiqueta flotante, ayuda y error con aria-invalid (gancho de estilo y de lector a la vez)."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Nombre de la receta"
            support="Así aparecerá en el recetario"
          >
            {(a) => <Input {...a} />}
          </Field>
          <Field label="Raciones" error="Tiene que ser un número">
            {(a) => <Input {...a} defaultValue="dos" />}
          </Field>
          <Field label="Comida">
            {(a) => (
              <Select {...a} defaultValue="comida">
                <option value="desayuno">Desayuno</option>
                <option value="comida">Comida</option>
                <option value="cena">Cena</option>
              </Select>
            )}
          </Field>
          <Field label="Notas">{(a) => <Textarea {...a} rows={2} />}</Field>
          <Input
            aria-label="Campo deshabilitado"
            disabled
            placeholder="Deshabilitado"
          />
        </div>
      </Block>

      <Block
        title="Tarjetas"
        hint="La jerarquía la marcan los tonos, no las sombras."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Card variant="elevated">Elevated</Card>
          <Card variant="filled">Filled</Card>
          <Card variant="outlined">Outlined</Card>
          <Card>Tonal</Card>
          <Card
            variant="filled"
            className="card-interactive state rounded-xl rounded-tr-xxl sm:col-span-4"
          >
            Destacada: esquinas asimétricas y pulsable (se encoge y redondea con
            muelle).
          </Card>
        </div>
      </Block>

      <Block title="Insignias y avisos">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="pending">Pendiente</Badge>
          <Badge tone="done">Hecho</Badge>
          <Badge>Neutro</Badge>
          <Badge tone="accent">Sección</Badge>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </div>
        <Alert>No se pudo guardar. Revisa la conexión.</Alert>
        <Alert tone="info">
          La lista de la compra se genera con el plan de la semana.
        </Alert>
      </Block>

      <Block
        title="Progreso y carga"
        hint="Ondulado lineal y circular; el indicador de carga cambia de forma."
      >
        <div className="flex flex-wrap items-center gap-6">
          <WavyRing value={done} max={8} label="Series hechas">
            <span className="text-headline-s text-e tabular">
              <CountUp value={done} />
              <span className="text-on-surface-variant">/8</span>
            </span>
          </WavyRing>
          <div className="flex min-w-60 flex-1 flex-col gap-3">
            <WavyProgress value={done} max={8} label="Progreso de ejemplo" />
            <div className="flex gap-2">
              <Button
                variant="tonal"
                size="sm"
                onClick={() => setDone((d) => Math.max(0, d - 1))}
              >
                −1
              </Button>
              <Button
                variant="tonal"
                size="sm"
                onClick={() => setDone((d) => Math.min(8, d + 1))}
              >
                +1
              </Button>
            </div>
          </div>
          <Loader label="Cargando ejemplo…" />
          <div className="skeleton h-12 w-40" />
        </div>
      </Block>

      <Block title="Recompensa, vacíos y miniaturas">
        <RewardSeal sets={12} />
        <div className="flex flex-wrap items-center gap-3">
          <Monogram name="Crema de calabaza" />
          <Monogram name="Lentejas" />
          <Monogram name="Tortilla" />
          <Monogram name="Press banca" />
        </div>
        <EmptyState title="Aún no hay nada aquí">
          <Button variant="tonal">Crear el primero</Button>
        </EmptyState>
      </Block>

      <Block
        title="Movimiento"
        hint="Muelles M3E en linear() muestreado. Espaciales rebotan; de efectos, no. Con prefers-reduced-motion todo se queda quieto."
      >
        <Button
          variant="tonal"
          onClick={() => setSpringOn((s) => !s)}
          aria-pressed={springOn}
        >
          Mover
        </Button>
        <div className="flex flex-col gap-2">
          {SPRINGS.map(([cls, label]) => (
            <div key={cls} className="flex items-center gap-3">
              <span className="w-56 shrink-0 text-body-s text-on-surface-variant">
                {label}
              </span>
              <span className="relative h-8 flex-1 rounded-full bg-surface-container-highest">
                <span
                  className={`absolute top-0 left-0 size-8 rounded-full bg-primary transition-[left] ${cls} ${springOn ? "left-[calc(100%-2rem)]" : ""}`}
                />
              </span>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Superficies superpuestas">
        <div className="flex flex-wrap gap-3">
          <Button variant="outlined" onClick={() => setOverlay("dialog")}>
            Abrir diálogo
          </Button>
          <Button variant="outlined" onClick={() => setOverlay("sheet")}>
            Abrir hoja inferior
          </Button>
          <Button
            variant="outlined"
            onClick={() => {
              setUndone(false);
              snackbar({
                message: "Ejercicio quitado",
                onUndo: () => setUndone(true),
              });
            }}
          >
            Mostrar snackbar
          </Button>
          {undone ? (
            <span className="self-center text-body-m">Deshecho ✓</span>
          ) : null}
        </div>
        <div
          role="toolbar"
          aria-label="Barra flotante de ejemplo"
          className="toolbar flex w-fit items-center gap-1 p-2"
        >
          <Button variant="text" size="icon" aria-label="Editar">
            <EditIcon />
          </Button>
          <Button variant="text" size="icon" aria-label="Añadir">
            <AddIcon />
          </Button>
          <Button>Guardar</Button>
        </div>
      </Block>

      <Block
        title="Iconos"
        hint="Material Symbols Rounded en línea; relleno en el estado activo."
      >
        <div
          data-testid="icon-set"
          className="flex flex-wrap items-center gap-4 text-on-surface-variant"
        >
          {iconEntries.map(([name, Icon]) => (
            <Icon key={name} aria-label={name} />
          ))}
        </div>
        <div className="flex items-center gap-4 text-primary">
          <icons.HomeIcon /> <icons.HomeIcon filled />
          <icons.DumbbellIcon /> <icons.BookIcon filled />
        </div>
      </Block>

      {overlay === "dialog" ? (
        <Dialog
          onClose={() => setOverlay(null)}
          labelledBy="ui-dialog"
          className="md:max-w-md"
        >
          <OverlayHeader
            id="ui-dialog"
            title="Diálogo M3"
            onClose={() => setOverlay(null)}
          />
          <p className="px-6 pb-4 text-body-m text-on-surface-variant">
            Esquinas XL; a pantalla completa en móvil. Escape o el fondo lo
            cierran.
          </p>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button variant="text" onClick={() => setOverlay(null)}>
              Cancelar
            </Button>
            <Button onClick={() => setOverlay(null)}>Aceptar</Button>
          </div>
        </Dialog>
      ) : null}
      {overlay === "sheet" ? (
        <Sheet label="Hoja de ejemplo" onClose={() => setOverlay(null)}>
          <OverlayHeader
            title="Hoja inferior"
            onClose={() => setOverlay(null)}
          />
          <p className="px-6 pb-8 text-body-m text-on-surface-variant">
            Arrastra el asa hacia abajo para cerrarla.
          </p>
        </Sheet>
      ) : null}
    </div>
  );
}
