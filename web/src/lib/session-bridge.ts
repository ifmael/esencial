const BRIDGE_KEY = "esencial.api-session";

/**
 * Access pone una cookie por host. Si la web abre primero, la API aún no tiene
 * la suya y el primer fetch acaba en el login. Antes de montar la app se manda
 * al navegador al puente de la API, que autentica ese host y vuelve aquí.
 */
export async function ensureApiSession({
  apiBase = import.meta.env.VITE_API_URL ?? "",
  fetchImpl = fetch,
  storage = sessionStorage,
  location = window.location,
} = {}) {
  if (!apiBase) return true;

  try {
    const res = await fetchImpl(`${apiBase}/api/health`, {
      credentials: "include",
      redirect: "manual",
    });
    if (res.ok) {
      try {
        storage.removeItem(BRIDGE_KEY);
      } catch {
        /* sin storage */
      }
      return true;
    }
  } catch {
    /* Access redirige a otro origen: fetch lo trata como error de red. */
  }

  try {
    if (storage.getItem(BRIDGE_KEY) === "1") return true;
    storage.setItem(BRIDGE_KEY, "1");
  } catch {
    /* sin storage: mejor no arriesgar un bucle */
    return true;
  }

  const back = `${apiBase}/api/session/return?to=${encodeURIComponent(location.href)}`;
  location.assign(back);
  return false;
}
