// E7 auth primitives (design D2/D3): PBKDF2-SHA256 password digests and a
// stateless HMAC-signed session token built on Hono's cookie signing helpers.
// Zero dependencies beyond hono + Web Crypto.
import { serializeSigned, parseSigned } from "hono/utils/cookie";

export const SESSION_COOKIE = "esencial_session";
/** 30 days — personal app; renewal is a re-login (design D3). */
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

const b64 = (buf: ArrayBuffer | Uint8Array): string =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));

const unb64 = (s: string): Uint8Array => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/** Digest format: `pbkdf2$<iterations>$<salt_b64>$<hash_b64>` (never stores the plaintext). */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

/**
 * Verify a password against a stored digest. The comparison happens inside
 * crypto.subtle.verify (HMAC over the derived digests), which is constant-time
 * — the plaintext never reaches a `===`. Malformed digests fail closed.
 */
export async function verifyPassword(
  digest: string,
  password: string,
): Promise<boolean> {
  const parts = digest.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1) return false;
  let salt: Uint8Array, expected: Uint8Array;
  try {
    salt = unb64(parts[2]);
    expected = unb64(parts[3]);
  } catch {
    return false;
  }
  const actual = await derive(password, salt, iterations);
  // Constant-time compare of the two digests via an HMAC verify (design D2):
  // both sides must match a signature produced over `expected`.
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("digest-compare"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    actual as unknown as BufferSource,
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    sig,
    expected as unknown as BufferSource,
  );
}

/** `<exp_epoch>.<hmac_sha256(secret, exp_epoch)>` — the signed cookie value. */
export async function createSessionToken(
  secret: string,
  expEpochSec: number,
): Promise<string> {
  const signed = await serializeSigned(
    SESSION_COOKIE,
    String(expEpochSec),
    secret,
  );
  // serializeSigned returns `name=<encoded>`; return the decoded value so
  // callers (setCookie) encode exactly once.
  return decodeURIComponent(signed.slice(signed.indexOf("=") + 1));
}

/** Valid + unexpired → `{ exp }`; anything else (tampered, garbage, past expiry) → null. */
export async function readSessionToken(
  secret: string,
  raw: string | undefined | false,
): Promise<{ exp: number } | null> {
  if (!raw) return null; // false = signature mismatch, undefined/"" = missing
  const parsed = await parseSigned(
    `${SESSION_COOKIE}=${raw}`,
    secret,
    SESSION_COOKIE,
  );
  const value = parsed[SESSION_COOKIE];
  if (value === false || value === undefined) return null; // tampered / malformed
  const exp = Number(value);
  if (!Number.isInteger(exp) || exp * 1000 <= Date.now()) return null; // expired fail-closed
  return { exp };
}
