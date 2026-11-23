// Genera el par de claves VAPID para los avisos push. Corre una sola vez:
//   node scripts/claves-avisos.mjs
// La pública va en wrangler.toml (VAPID_PUBLIC, no es secreta).
// La privada se guarda como secreto:  npx wrangler secret put VAPID_PRIVATE
const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pub = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
const jwk = await crypto.subtle.exportKey("jwk", par.privateKey);
const b64u = (b) => Buffer.from(b).toString("base64url");
console.log("VAPID_PUBLIC (pégala en wrangler.toml):\n" + b64u(pub));
console.log("\nVAPID_PRIVATE (pégala cuando te la pida 'npx wrangler secret put VAPID_PRIVATE'; no la compartas):\n" + jwk.d);
