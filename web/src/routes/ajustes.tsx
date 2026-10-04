// Ajustes del usuario: el tema (sistema/claro/oscuro), la familia (solo el
// admin) y el acceso al catálogo del sistema de diseño (/ui). El tema se aplica
// al pulsar, sin guardar.
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { EmptyState, Loader } from "../components/expressive";
import {
  ChevronRightIcon,
  ContrastIcon,
  DarkIcon,
  LightIcon,
  SwatchIcon,
} from "../components/icons";
import {
  Alert,
  Badge,
  Button,
  buttonClass,
  Card,
  ConnectedGroup,
  ConnectedItem,
  Field,
  Input,
  ripple,
} from "../components/ui";
import { ApiError } from "../lib/api";
import {
  addMember,
  type FamilyUser,
  type Me,
  type Role,
  removeMember,
  useMe,
  useUsers,
} from "../lib/family";
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

const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  member: "Miembro",
};

/** Una cuenta de la lista: email, la marca «Tú» y su rol. El quitar solo lo
 *  ofrece la familia (la API rechaza sacar a alguien que no está en ella) y
 *  nunca sobre uno mismo. */
function UserRow({
  user,
  self,
  removable,
  pending,
  onRemove,
}: {
  user: FamilyUser;
  self: boolean;
  removable: boolean;
  pending: boolean;
  onRemove: (user: FamilyUser) => void;
}) {
  return (
    <li className="list-row min-h-12 px-3">
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-body-l">{user.email}</span>
        {self ? (
          <span className="shrink-0 text-label-l text-on-surface-variant">
            Tú
          </span>
        ) : null}
      </span>
      <Badge tone={user.role === "admin" ? "accent" : "neutral"}>
        {ROLE_LABEL[user.role]}
      </Badge>
      {removable && !self ? (
        <Button
          variant="text"
          disabled={pending}
          aria-label={`Quitar a ${user.email} de mi familia`}
          onClick={() => onRemove(user)}
        >
          Quitar
        </Button>
      ) : null}
    </li>
  );
}

/** Tarjeta «Familia»: solo la pinta el admin (un member recibe 403 de la API).
 *  La lista se refresca tras cada alta o baja que salga bien. */
function FamilyCard({ me }: { me: Me }) {
  const users = useUsers();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const list = users.data ?? [];
  const members = list.filter((u) => u.familyId === me.familyId);
  const outside = list.filter((u) => u.familyId !== me.familyId);

  /** Escritura + recarga: el error de la API se enseña tal cual; el 400 del
   *  email se marca en el campo (`aria-invalid`) y el resto como mensaje. */
  const run = async (write: () => Promise<unknown>) => {
    setEmailError(null);
    setError(null);
    setPending(true);
    try {
      await write();
      await users.reload();
    } catch (e) {
      const text =
        e instanceof ApiError && e.error
          ? e.error
          : "No se pudo conectar con el servidor";
      if (e instanceof ApiError && e.field === "email") setEmailError(text);
      else setError(text);
    } finally {
      setPending(false);
    }
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void run(async () => {
      await addMember(me.familyId, email.trim());
      setEmail("");
    });
  };

  const remove = (user: FamilyUser) =>
    void run(() => removeMember(me.familyId, user.id));

  const row = (user: FamilyUser, removable: boolean) => (
    <UserRow
      key={user.id}
      user={user}
      self={user.id === me.id}
      removable={removable}
      pending={pending}
      onRemove={remove}
    />
  );

  return (
    <Card className="flex flex-col gap-stack">
      <h2 className="text-title-m">Familia</h2>

      <form
        className="flex flex-col gap-stack sm:flex-row sm:items-start"
        onSubmit={submit}
        noValidate
      >
        <Field label="Email" error={emailError} className="grow">
          {(a11y) => (
            <Input
              {...a11y}
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" disabled={pending}>
          Añadir a mi familia
        </Button>
      </form>

      {error ? (
        <Alert tone="error">
          <p className="text-body-m">{error}</p>
        </Alert>
      ) : null}

      {users.error ? (
        <Alert tone="error">
          <p className="text-body-m">{users.error}</p>
        </Alert>
      ) : null}

      {users.loading && users.data === null ? (
        <Loader label="Cargando familia…" />
      ) : null}

      {!users.loading && !users.error && list.length === 0 ? (
        <EmptyState title="No hay cuentas todavía" />
      ) : null}

      {list.length > 0 ? (
        <>
          <div className="flex flex-col gap-1">
            <h3 className="section-label">Mi familia</h3>
            <ul aria-label="Mi familia" className="flex flex-col">
              {members.map((u) => row(u, true))}
            </ul>
          </div>
          {outside.length > 0 ? (
            <div className="flex flex-col gap-1">
              <h3 className="section-label">Fuera de mi familia</h3>
              <ul aria-label="Fuera de mi familia" className="flex flex-col">
                {outside.map((u) => row(u, false))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

export function AjustesPage() {
  const theme = useTheme();
  const me = useMe();
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

      {me.data?.role === "admin" ? <FamilyCard me={me.data} /> : null}

      {/* Cerrar sesión es cosa de Access: se enseña solo cuando Access está
          delante (en local no hay sesión que cerrar). Es un enlace normal, no
          del router: esa ruta la atiende Cloudflare antes que el Worker, y desde
          el dominio de la app borra la cookie al instante. Va como botón
          (outlined), sin la flecha de las filas que navegan: hace, no lleva. */}
      {me.data?.access ? (
        <Card className="flex items-center justify-between gap-stack">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-title-m">Sesión</h2>
            <p className="text-body-m text-on-surface-variant">
              Te saca de Cloudflare Access en este navegador.
            </p>
          </div>
          <a
            href="/cdn-cgi/access/logout"
            onPointerDown={ripple}
            className={buttonClass({
              variant: "outlined",
              className: "shrink-0",
            })}
          >
            Cerrar sesión
          </a>
        </Card>
      ) : null}

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
