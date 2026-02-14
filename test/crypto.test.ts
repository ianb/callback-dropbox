import t from "tap";
import {
  generateChannelKey,
  exportKey,
  importKey,
  encrypt,
  decrypt,
} from "../client/crypto.js";

t.test("generateChannelKey produces an AES-GCM key", async (t) => {
  const key = await generateChannelKey();
  t.equal(key.algorithm.name, "AES-GCM");
  t.equal(key.extractable, true);
  t.ok(key.usages.includes("encrypt"));
  t.ok(key.usages.includes("decrypt"));
});

t.test("export and import round-trip", async (t) => {
  const key = await generateChannelKey();
  const exported = await exportKey(key);
  t.type(exported, "string");
  t.ok(exported.length > 0);

  const imported = await importKey(exported);
  const reExported = await exportKey(imported);
  t.equal(reExported, exported);
});

t.test("encrypt and decrypt round-trip", async (t) => {
  const key = await generateChannelKey();
  const plaintext = JSON.stringify({ type: "test", data: [1, 2, 3] });

  const { body, nonce } = await encrypt(key, plaintext);
  t.type(body, "string");
  t.type(nonce, "string");
  t.not(body, plaintext, "body should be encrypted");

  const decrypted = await decrypt({ key, body, nonce });
  t.equal(decrypted, plaintext);
});

t.test("decrypt with wrong key fails", async (t) => {
  const key1 = await generateChannelKey();
  const key2 = await generateChannelKey();
  const { body, nonce } = await encrypt(key1, "secret");

  await t.rejects(() => decrypt({ key: key2, body, nonce }));
});

t.test("each encryption produces unique nonce", async (t) => {
  const key = await generateChannelKey();
  const { nonce: n1 } = await encrypt(key, "hello");
  const { nonce: n2 } = await encrypt(key, "hello");
  t.not(n1, n2);
});
