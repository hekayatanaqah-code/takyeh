import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

function configuredMaterial(keyId: "d" | "s"): Buffer | null {
  const configured = keyId === "d" ? process.env.MOYASAR_TOKEN_ENCRYPTION_KEY : process.env.SESSION_SECRET;
  if (!configured) return null;
  if (keyId === "d") {
    if (/^[0-9a-f]{64}$/i.test(configured)) return Buffer.from(configured, "hex");
    const decoded = Buffer.from(configured, "base64");
    return decoded.length === 32 ? decoded : null;
  }
  return Buffer.from(configured, "utf8");
}

function deriveKey(keyId: "d" | "s"): Buffer | null {
  const secretMaterial = configuredMaterial(keyId);
  if (!secretMaterial) return null;
  const key = Buffer.from(hkdfSync(
    "sha256",
    secretMaterial,
    Buffer.from("moyasar-token-at-rest-v1", "utf8"),
    Buffer.from("moyasar-card-token-encryption", "utf8"),
    32,
  ));
  return key;
}

function encryptionMaterial(): { key: Buffer; keyId: "d" | "s" } | null {
  const dedicated = deriveKey("d");
  if (dedicated) return { key: dedicated, keyId: "d" };
  const session = deriveKey("s");
  return session ? { key: session, keyId: "s" } : null;
}

export function isMoyasarTokenVaultAvailable() {
  return encryptionMaterial() !== null;
}

/** Dedicated key is preferred; SESSION_SECRET is domain-separated through HKDF as fallback. */
export function encryptMoyasarToken(token: string): string | null {
  const material = encryptionMaterial();
  if (!material || !token || token.length > 512) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", material.key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1${material.keyId}.${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decryptMoyasarToken(encrypted: string): string | null {
  const parts = encrypted.split(".");
  if (parts.length !== 4) return null;
  const [version, ivText, tagText, ciphertextText] = parts;
  if ((version !== "v1d" && version !== "v1s") || !ivText || !tagText || !ciphertextText) return null;
  const key = deriveKey(version === "v1d" ? "d" : "s");
  if (!key) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64"));
    decipher.setAuthTag(Buffer.from(tagText, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}