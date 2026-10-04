// Global test setup (web): la caché de lecturas vive en el módulo, así que hay
// que vaciarla entre casos para que un test no vea la respuesta simulada del
// anterior.
import { afterEach } from "vitest";
import { clearApiCache } from "../src/lib/api";

afterEach(clearApiCache);
