// E7 task 1.5: local CLI printing the PASSWORD_HASH digest for
// `wrangler secret put PASSWORD_HASH`. Node 24 + Web Crypto, run via tsx-free
// strip-types:  node --experimental-strip-types api/scripts/hash-password.ts 'pw'
// (stdin fallback: echo 'pw' | node --experimental-strip-types ... )
import { readFileSync } from "node:fs";
// Extensionless relative imports don't resolve under plain node; .ts is explicit.
import { hashPassword, verifyPassword } from "../src/auth.ts";

async function main(): Promise<void> {
  const pw = (process.argv[2] ?? readFileSync(0, "utf8")).trim();
  if (!pw) {
    console.error("usage: hash-password.ts <password>  (or pipe it on stdin)");
    process.exit(2);
  }
  const digest = await hashPassword(pw);
  // Smoke self-check: what we print must verify what we hashed.
  if (!(await verifyPassword(digest, pw))) {
    console.error("self-check failed: digest does not verify");
    process.exit(1);
  }
  console.log(digest);
}

await main();
