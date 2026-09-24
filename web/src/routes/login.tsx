// E7 login screen: centered card (DESIGN.md system), password field, "Entrar".
// 401 → inline "Contraseña incorrecta" on the field; 429 → wait message;
// success → navigate to ?next= (or /). Server gate is authoritative; this is UX.
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button, Card, Input } from "../components/ui";
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
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <form onSubmit={submit} noValidate>
          <h1 className="mb-4 text-title font-bold text-primary">Esencial</h1>
          <label
            htmlFor="password"
            className="mb-1 block text-caption font-medium"
          >
            Contraseña
          </label>
          <Input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            aria-invalid={error?.field === "password" ? "true" : undefined}
            aria-describedby={error ? "login-error" : undefined}
            className="mb-2 w-full"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p
              id="login-error"
              className="mb-2 text-caption text-error"
              role="alert"
            >
              {error.message}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            Entrar
          </Button>
        </form>
      </Card>
    </div>
  );
}
