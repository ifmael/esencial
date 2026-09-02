// E7 task 1.1/1.3 RED→GREEN: PBKDF2 password digests + signed stateless session.
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, SESSION_MAX_AGE_S } from "../src/auth";
import { createSessionToken, readSessionToken } from "../src/auth";

const SECRET = "test-auth-secret-32-bytes-long-xx";

describe("hashPassword / verifyPassword (PBKDF2-SHA256)", () => {
  it("round-trips: digest verifies against the same password", async () => {
    const digest = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(digest, "correct horse battery staple")).toBe(true);
  });

  it("rejects a different password", async () => {
    const digest = await hashPassword("aaaa");
    expect(await verifyPassword(digest, "aaab")).toBe(false);
    expect(await verifyPassword(digest, "")).toBe(false);
  });

  it("uses the documented format pbkdf2$<iter>$<salt_b64>$<hash_b64> with >=210k iterations", async () => {
    const digest = await hashPassword("x");
    const parts = digest.split("$");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("pbkdf2");
    expect(Number(parts[1])).toBeGreaterThanOrEqual(210_000);
    // salt and hash are non-empty base64
    expect(parts[2].length).toBeGreaterThan(8);
    expect(parts[3].length).toBeGreaterThan(32);
  });

  it("salts randomly: two digests of one password differ but both verify", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, "same")).toBe(true);
    expect(await verifyPassword(b, "same")).toBe(true);
  });

  it("never compares in the clear: corrupting one digest byte flips the result", async () => {
    // If verification ever fell back to plaintext equality, a digest whose hash
    // section is still "valid-looking" would matter; instead a single flipped
    // character in the stored hash MUST break verification.
    const digest = await hashPassword("passw0rd");
    const [scheme, iter, salt, hash] = digest.split("$");
    const flipped = hash.slice(0, -1) + (hash.endsWith("A") ? "B" : "A");
    expect(await verifyPassword([scheme, iter, salt, flipped].join("$"), "passw0rd")).toBe(false);
    expect(await verifyPassword("garbage", "passw0rd")).toBe(false);
  });

  it("rejects malformed digests fail-closed", async () => {
    expect(await verifyPassword("pbkdf2$1000$abc", "x")).toBe(false);
    expect(await verifyPassword("sha512$1000$abc$def", "x")).toBe(false);
    expect(await verifyPassword("", "x")).toBe(false);
  });
});

describe("signed session token", () => {
  it("creates a token that reads back its expiry", async () => {
    const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_S;
    const token = await createSessionToken(SECRET, exp);
    expect(await readSessionToken(SECRET, token)).toEqual({ exp });
  });

  it("fails closed on tampered payload (one byte edited)", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = await createSessionToken(SECRET, exp);
    const dot = token.indexOf(".");
    const tampered = `${Number(token.slice(0, dot)) + 1}${token.slice(dot)}`;
    expect(await readSessionToken(SECRET, tampered)).toBeNull();
  });

  it("fails closed on tampered signature", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = await createSessionToken(SECRET, exp);
    const last = token.lastIndexOf(".");
    const sig = token.slice(last + 1);
    const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    expect(await readSessionToken(SECRET, `${token.slice(0, last + 1)}${flipped}`)).toBeNull();
  });

  it("fails closed on a wrong signing secret", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = await createSessionToken(SECRET, exp);
    expect(await readSessionToken("another-secret-32-bytes-long-xxx", token)).toBeNull();
  });

  it("fails closed on expired and on garbage tokens", async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    const expired = await createSessionToken(SECRET, past);
    expect(await readSessionToken(SECRET, expired)).toBeNull();
    expect(await readSessionToken(SECRET, "no-dot-here")).toBeNull();
    expect(await readSessionToken(SECRET, "")).toBeNull();
    expect(await readSessionToken(SECRET, "abc.")).toBeNull();
  });

  it("SESSION_MAX_AGE_S is 30 days", () => {
    expect(SESSION_MAX_AGE_S).toBe(30 * 24 * 60 * 60);
  });
});
