import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const encryptedPrefix = "enc:v1:";

function getEncryptionKey() {
  const encoded = process.env.PAYMENT_CONFIG_ENCRYPTION_KEY;
  if (!encoded) {
    throw new Error("PAYMENT_CONFIG_ENCRYPTION_KEY is not configured");
  }

  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) {
    throw new Error("PAYMENT_CONFIG_ENCRYPTION_KEY must contain exactly 32 base64-encoded bytes");
  }
  return key;
}

export function encryptProviderSecret(value: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), nonce);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${encryptedPrefix}${nonce.toString("base64")}:${ciphertext.toString("base64")}:${tag.toString("base64")}`;
}

export function decryptProviderSecret(value: string) {
  if (!value.startsWith(encryptedPrefix)) {
    return value;
  }

  const [nonceValue, ciphertextValue, tagValue] = value.slice(encryptedPrefix.length).split(":");
  if (!nonceValue || ciphertextValue === undefined || !tagValue) {
    throw new Error("Invalid encrypted payment provider secret");
  }

  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(nonceValue, "base64"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64")),
    decipher.final()
  ]).toString("utf8");
}
