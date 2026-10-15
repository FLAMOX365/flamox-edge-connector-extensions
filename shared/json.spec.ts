import { test } from "node:test";
import assert from "node:assert/strict";
import {
  basicAuthorization,
  childUrl,
  decodeBase64,
  integerValue,
  safeConfiguredPath,
  safeSegment,
  urlValue,
} from "./json.ts";

for (const value of [
  ".",
  "..",
  "../invoice.pdf",
  "a/b",
  "a\\b",
  "a\0b",
  "x".repeat(241),
]) {
  test(`path segments reject traversal or invalid file names: ${JSON.stringify(value)}`, () => {
    assert.throws(() => safeSegment(value, "File"), /safe path segment/);
  });
}
for (const value of [
  "inbox/../private",
  "inbox//file",
  "./inbox",
  "inbox\\private",
  "inbox\0private",
]) {
  test(`configured collections reject unsafe path: ${JSON.stringify(value)}`, () => {
    assert.throws(() => safeConfiguredPath(value, "Collection"), /unsafe path/);
  });
}
test("destination construction preserves a configured collection and encodes Unicode and reserved file characters", () => {
  const base = urlValue("https://nas.example/dav", "Server");
  assert.equal(
    childUrl(
      base,
      safeConfiguredPath("/inbox/2026/", "Collection"),
      safeSegment("Grüße #?%.csv", "File"),
    ).href,
    "https://nas.example/dav/inbox/2026/Gr%C3%BC%C3%9Fe%20%23%3F%25.csv",
  );
});
for (const target of [
  "file:///etc/passwd",
  "ftp://nas.example",
  "https://user:password@nas.example",
  "http://[invalid]",
]) {
  test(`destination configuration rejects credentials or unsupported targets: ${target}`, () => {
    assert.throws(() => urlValue(target, "Server"));
  });
}
test("binary inputs preserve every byte and enforce decoded size rather than encoded length", () => {
  const content = Uint8Array.from([0, 255, 128, 10, 13, 1]);
  const encoded = Buffer.from(content).toString("base64");
  assert.deepEqual(decodeBase64(encoded, "Content", content.length), content);
  assert.throws(
    () => decodeBase64(encoded, "Content", content.length - 1),
    /decoded bytes/,
  );
  assert.throws(() => decodeBase64("%%%", "Content"), /valid base64/);
  assert.throws(() => decodeBase64("", "Content"));
});
test("configuration bounds reject coercion, fractions and out-of-range values", () => {
  assert.equal(integerValue(undefined, "Limit", 10, 1, 30), 10);
  assert.equal(integerValue(30, "Limit", 10, 1, 30), 30);
  for (const value of ["10", 1.5, 0, 31, null, true])
    assert.throws(() => integerValue(value, "Limit", 10, 1, 30));
});
test("Basic credentials use UTF-8 for non-ASCII NAS accounts", () => {
  assert.equal(
    Buffer.from(
      basicAuthorization("müller", "päss:word").slice(6),
      "base64",
    ).toString("utf8"),
    "müller:päss:word",
  );
});
