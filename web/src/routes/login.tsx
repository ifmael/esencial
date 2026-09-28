// E7 login screen: marca expresiva sobre una composición de formas M3E, tarjeta
// con el campo contraseña y «Entrar». 401 → error en el campo; 429 → aviso de
// espera; éxito → ?next= (o /). El servidor es la autoridad; esto es UX.
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Shape } from "../components/expressive";
import { LeafIcon } from "../components/icons";
import { Alert, Button, Card, Field, Input } from "../components/ui";
import { apiFetchRaw } from "../lib/api";

export function LoginPage() {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{
    field?: string;
    message: string;
  } | null>(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await apiFetchRaw("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.status === 200) {
        navigate(params.get("next") || "/", { replace: true });
        return;
      }
      setError(
        res.status === 429
          ? {
              field: "login",
              message: "Demasiados intentos. Espera un momento.",
            }
          : { field: "password", message: "Contraseña incorrecta" },
      );
    } catch {
      setError({
        field: "login",
        message: "No se pudo conectar. Inténtalo otra vez.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-surface p-4">
      {/* Fondo decorativo: formas grandes que se salen del borde. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <Shape
          name="cookie-12"
          size={420}
          className="absolute -top-32 -left-36 text-primary-container animate-rise"
        />
        <Shape
          name="flower"
          size={300}
          className="absolute -right-24 -bottom-20 text-tertiary-container"
        />
        <Shape
          name="pill"
          size={160}
          className="absolute top-16 right-10 rotate-45 text-secondary-container"
        />
        <Shape
          name="soft-diamond"
          size={88}
          className="absolute bottom-24 left-12 text-primary opacity-20"
        />
      </div>

      <main className="stagger flex w-full max-w-sm flex-col gap-6">
        <div
          className="flex items-center gap-3 px-2"
          style={{ ["--i" as string]: 0 }}
        >
          <Shape name="cookie-9" size={56} className="text-primary">
            <LeafIcon className="text-on-primary" width={28} height={28} />
          </Shape>
          <h1 className="text-display-s text-e text-on-surface">Esencial</h1>
        </div>

        <Card className="rounded-xl p-6" style={{ ["--i" as string]: 1 }}>
          <form onSubmit={submit} noValidate className="flex flex-col gap-5">
            <div>
              <p className="text-title-l">Hola de nuevo</p>
              <p className="text-body-m text-on-surface-variant">
                Entra para ver tu semana.
              </p>
            </div>
            <Field
              label="Contraseña"
              error={error?.field === "password" ? error.message : undefined}
            >
              {(a) => (
                <Input
                  {...a}
                  type="password"
                  required
                  autoComplete="current-password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
            </Field>
            {error && error.field !== "password" && (
              <Alert tone="error">
                <p className="text-body-m">{error.message}</p>
              </Alert>
            )}
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={pending}
            >
              Entrar
            </Button>
          </form>
        </Card>
      </main>
    </div>
  );
}
