import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const key = () => {
  const secret = process.env.ETIMS_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error(
      "ETIMS_ENCRYPTION_KEY must be configured with at least 32 characters.",
    );
  }
  return createHash("sha256").update(secret).digest();
};

export function encryptEtimsSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptEtimsSecret(input: {
  ciphertext: string;
  iv: string;
  tag: string;
}) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(input.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(input.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
