import { createDecipheriv, createHash } from "node:crypto";

export function decryptEtimsSecret(input: {
  ciphertext: string;
  iv: string;
  tag: string;
}) {
  const secret = process.env.ETIMS_ENCRYPTION_KEY;
  if (!secret || secret.length < 32)
    throw new Error("ETIMS_ENCRYPTION_KEY is not configured.");
  const key = createHash("sha256").update(secret).digest();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(input.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(input.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
