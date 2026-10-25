import { env } from "cloudflare:test";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTVerifyGetKey,
  SignJWT,
} from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ACCESS_JWT_HEADER, accessJwtEmail } from "../src/identity";
import app from "../src/index";
import { freshDb } from "./helpers";

const TEAM = "https://team-jwt.test.cloudflareaccess.com";
const AUD = "aud-jwt-test";
const EMAIL = "jwt@test.com";

let jwks: JWTVerifyGetKey;
let token: string;
let otherToken: string;
let fetchStub: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  await freshDb();
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "k1",
    alg: "RS256",
    use: "sig",
  };
  jwks = createLocalJWKSet({ keys: [jwk] });
  const sign = (key: CryptoKey, aud: string) =>
    new SignJWT({ email: EMAIL })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(TEAM)
      .setAudience(aud)
      .setExpirationTime("5m")
      .sign(key);
  token = await sign(privateKey, AUD);
  const other = await generateKeyPair("RS256");
  otherToken = await sign(other.privateKey, AUD);
  fetchStub = vi.fn(
    async () =>
      new Response(JSON.stringify({ keys: [jwk] }), {
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchStub);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("JWT de Access (previews)", () => {
  it("acepta un JWT válido y normaliza el email", async () => {
    expect(await accessJwtEmail(token, TEAM, AUD, jwks)).toBe(EMAIL);
  });

  it("rechaza otro audiencia, firma o configuración incompleta", async () => {
    expect(await accessJwtEmail(token, TEAM, "otro", jwks)).toBeNull();
    expect(await accessJwtEmail(otherToken, TEAM, AUD, jwks)).toBeNull();
    expect(await accessJwtEmail(token, null, AUD, jwks)).toBeNull();
    expect(await accessJwtEmail("", TEAM, AUD, jwks)).toBeNull();
  });

  it("el gate acepta la cabecera JWT cuando ctx.access no existe", async () => {
    const testEnv = {
      ...env,
      DEV_AUTH: "0",
      TEAM_DOMAIN: TEAM,
      POLICY_AUD: AUD,
    };
    const res = await app.request(
      "http://localhost/api/recipes",
      { headers: { [ACCESS_JWT_HEADER]: token } },
      testEnv,
    );
    expect(res.status).toBe(200);
    expect(fetchStub).toHaveBeenCalled();
  });

  it("sin JWT válido el gate sigue siendo 401", async () => {
    const testEnv = {
      ...env,
      DEV_AUTH: "0",
      TEAM_DOMAIN: TEAM,
      POLICY_AUD: AUD,
    };
    for (const headers of [
      new Headers(),
      new Headers({ [ACCESS_JWT_HEADER]: otherToken }),
    ]) {
      const res = await app.request(
        "http://localhost/api/recipes",
        { headers },
        testEnv,
      );
      expect(res.status).toBe(401);
    }
  });
});
