import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fetchWithTimeout, responseJson } from "./http.ts";

test("HTTP deadlines abort an actual pending request and release its socket", {
  timeout: 5_000,
}, async (t) => {
  let entered!: () => void;
  const received = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const server = createServer(() => entered());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const request = fetchWithTimeout(
    fetch,
    `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
    {},
    300,
  );
  const rejected = assert.rejects(
    request,
    (error) => error instanceof Error && error.name === "AbortError",
  );
  await received;
  await rejected;
});
test("HTTP response decoding distinguishes empty bodies, JSON values and malformed upstream responses", async () => {
  assert.equal(await responseJson(new Response(" \n"), "ERP"), null);
  assert.deepEqual(
    await responseJson(
      new Response('{"name":"Grüße","items":[1,null,true]}'),
      "ERP",
    ),
    { name: "Grüße", items: [1, null, true] },
  );
  await assert.rejects(
    () =>
      responseJson(
        new Response("<html>private upstream diagnostic</html>"),
        "ERP",
      ),
    (error) =>
      error instanceof Error && error.message === "ERP returned invalid JSON.",
  );
});
