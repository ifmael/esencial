// E7 login screen: centered card (DESIGN.md system), password field, "Entrar".
// 401 → inline "Contraseña incorrecta" on the field; 429 → wait message;
// success → navigate to ?next= (or /). Server gate is authoritative; this is UX.
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

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
      const res = await fetch("/api/auth/login", {
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
      <form onSubmit={submit} className="card w-full max-w-sm" noValidate>
        <h1 className="mb-4 text-xl font-bold text-primary">Esencial</h1>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          aria-invalid={error?.field === "password" ? "true" : undefined}
          aria-describedby={error ? "login-error" : undefined}
          className="mb-2 w-full rounded-lg border border-border bg-surface px-3 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p id="login-error" className="mb-2 text-sm text-error" role="alert">
            {error.message}
          </p>
        )}
        <button type="submit" className="btn-primary w-full" disabled={pending}>
          Entrar
        </button>
      </form>
    </div>
  );
}
