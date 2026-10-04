// Familia (Ajustes): quién soy, quién hay en mi familia y las altas/bajas.
// `/api/me` y `/api/users` devuelven la misma forma de cuenta; el alta y la
// baja mueven a alguien entre familias y solo las admite el admin (403 al
// resto, que ni siquiera ve la tarjeta). Los errores llegan como `ApiError`
// con el texto del envelope `{ error, field? }`.
import { useCallback, useEffect, useState } from "react";
import { ApiError, apiGet, apiSend } from "./api";

export type Role = "admin" | "member";

/** Cuenta tal cual la devuelven `/api/me` y `/api/users`. */
export type FamilyUser = {
  id: number;
  email: string;
  role: Role;
  familyId: number;
};

export type Me = FamilyUser;

/** Lectura con estado, igual que el resto de hooks de la casa. */
export type Resource<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

/** GET a `path` con `{ data, loading, error, reload }`; `reload` reengancha
 *  tras una escritura para que la lista refleje el cambio. */
function useResource<T>(path: string): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiGet<T>(path));
      setError(null);
    } catch (e) {
      setError(
        e instanceof ApiError && e.error
          ? e.error
          : "No se pudo conectar con el servidor",
      );
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
}

/** Quién soy (id, email, rol y familia). */
export const useMe = () => useResource<Me>("/api/me");

/** Todas las cuentas, ordenadas por email; solo el admin recibe 200. */
export const useUsers = () => useResource<FamilyUser[]>("/api/users");

/** Alta en la familia: mueve la cuenta y devuelve su fila ya en la destino. */
export const addMember = (familyId: number, email: string) =>
  apiSend<FamilyUser>(`/api/families/${familyId}/members`, "POST", { email });

/** Baja de la familia: deja al usuario en una familia nueva y vacía (204). */
export const removeMember = (familyId: number, userId: number) =>
  apiSend<unknown>(`/api/families/${familyId}/members/${userId}`, "DELETE", {});
