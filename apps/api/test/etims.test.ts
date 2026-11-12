import assert from "node:assert/strict";

process.env.ETIMS_ENCRYPTION_KEY ??=
  "test-only-etims-encryption-key-with-32-characters";

const { decryptEtimsSecret, encryptEtimsSecret } =
  await import("../src/etims-crypto.js");

const secret = "sandbox-communication-key";
const first = encryptEtimsSecret(secret);
const second = encryptEtimsSecret(secret);

assert.notEqual(
  first.ciphertext,
  secret,
  "the KRA communication key is never stored as plaintext",
);
assert.notEqual(
  first.ciphertext,
  second.ciphertext,
  "AES-GCM uses a fresh IV for every credential rotation",
);
assert.equal(
  decryptEtimsSecret({
    ciphertext: first.ciphertext,
    iv: first.iv,
    tag: first.tag,
  }),
  secret,
  "the worker can recover the KRA communication key for submission",
);

console.log("eTIMS credential encryption tests passed.");
