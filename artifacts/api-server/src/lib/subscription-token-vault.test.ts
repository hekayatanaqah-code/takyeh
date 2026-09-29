import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decryptMoyasarToken,
  encryptMoyasarToken,
  isMoyasarTokenVaultAvailable,
} from "./subscription-token-vault";

test("Moyasar token vault derives a domain-separated key from SESSION_SECRET when needed", () => {
  const priorDedicated = process.env.MOYASAR_TOKEN_ENCRYPTION_KEY;
  const priorSession = process.env.SESSION_SECRET;
  try {
    delete process.env.MOYASAR_TOKEN_ENCRYPTION_KEY;
    process.env.SESSION_SECRET = "stable-test-session-secret-for-vault";
    assert.equal(isMoyasarTokenVaultAvailable(), true);
    const encrypted = encryptMoyasarToken("moyasar-token-test");
    assert.ok(encrypted?.startsWith("v1s."));
    assert.equal(decryptMoyasarToken(encrypted!), "moyasar-token-test");
    assert.equal(decryptMoyasarToken(`${encrypted}.tampered`), null);
  } finally {
    if (priorDedicated === undefined) delete process.env.MOYASAR_TOKEN_ENCRYPTION_KEY;
    else process.env.MOYASAR_TOKEN_ENCRYPTION_KEY = priorDedicated;
    if (priorSession === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = priorSession;
  }
});