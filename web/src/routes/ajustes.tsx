// Ajustes del usuario: el tema (sistema/claro/oscuro) y el acceso al catálogo
// del sistema de diseño (/ui). El tema se aplica al pulsar, sin guardar.
import { Link } from "react-router";
import {
  ChevronRightIcon,
  ContrastIcon,
  DarkIcon,
  LightIcon,
  SwatchIcon,
} from "../components/icons";
import { Card, ConnectedGroup, ConnectedItem, ripple } from "../components/ui";
import {
  applyTheme,
  THEME_NAME,
  THEMES,
  type Theme,
  useTheme,
} from "../lib/theme";

const THEME_ICON: Record<Theme, typeof ContrastIcon> = {
  system: ContrastIcon,
  light: LightIcon,
  dark: DarkIcon,
};

export function AjustesPage() {
  const theme = useTheme();
  return (
    <div className="flex flex-col gap-section">
      <h1 className="text-headline-l text-e">Ajustes</h1>

      <Card className="flex flex-col gap-stack">
        <h2 className="text-title-m">Apariencia</h2>
        <ConnectedGroup label="Tema" className="self-start">
          {THEMES.map((t) => {
            const Icon = THEME_ICON[t];
            return (
              <ConnectedItem
                key={t}
                pressed={theme === t}
                className="min-h-12"
                onClick={() => applyTheme(t)}
              >
                <Icon />
                {THEME_NAME[t]}
              </ConnectedItem>
            );
          })}
        </ConnectedGroup>
      </Card>

      <Card className="flex flex-col gap-stack">
        <h2 className="text-title-m">Desarrollo</h2>
        <Link
          to="/ui"
          onPointerDown={ripple}
          className="state list-row min-h-12 rounded-m px-3 text-on-surface"
        >
          <SwatchIcon className="text-on-surface-variant" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body-l">Sistema de diseño</span>
            <span className="text-body-m text-on-surface-variant">
              Catálogo de componentes y tokens
            </span>
          </span>
          <ChevronRightIcon className="text-on-surface-variant" />
        </Link>
      </Card>
    </div>
  );
}
