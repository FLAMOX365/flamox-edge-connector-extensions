import { test } from "node:test";
import assert from "node:assert/strict";
import { IppClient } from "./ipp.ts";

function client(
  reply: Response,
  inspect?: (request: Request) => Promise<void>,
) {
  return new IppClient({
    printerUrl: new URL("http://printer.example:631/ipp/print"),
    username: "printer",
    password: "fixture",
    timeoutMilliseconds: 1_000,
    fetcher: async (input, init) => {
      await inspect?.(new Request(input, init));
      return reply;
    },
  });
}
const success = [2, 0, 0, 0, 0, 0, 0, 1];
test("IPP encodes Unicode job metadata and preserves arbitrary document bytes", async () => {
  const bytes = Uint8Array.from([0, 255, 10, 128]);
  const result = await client(
    new Response(
      Uint8Array.from([
        ...success,
        2,
        0x21,
        0,
        6,
        106,
        111,
        98,
        45,
        105,
        100,
        0,
        4,
        0,
        0,
        1,
        0,
        3,
      ]),
    ),
    async (request) => {
      assert.equal(request.method, "POST");
      assert.equal(request.headers.get("content-type"), "application/ipp");
      assert.equal(
        request.headers.get("authorization"),
        `Basic ${Buffer.from("printer:fixture").toString("base64")}`,
      );
      const body = Buffer.from(await request.arrayBuffer());
      assert.deepEqual([...body.subarray(0, 4)], [2, 0, 0, 2]);
      assert.deepEqual(body.subarray(-bytes.length), Buffer.from(bytes));
      assert.ok(body.includes(Buffer.from("Grüße aus Vertrieb")));
      assert.ok(body.includes(Buffer.from("application/pdf")));
    },
  ).print({
    content: bytes,
    documentFormat: "application/pdf",
    jobName: "Grüße aus Vertrieb",
    userName: "müller",
  });
  assert.deepEqual(result, { status: 0, jobId: 256 });
});
test("IPP health sends a read-only Get-Printer-Attributes operation without a print document", async () => {
  assert.deepEqual(
    await client(
      new Response(Uint8Array.from([...success, 3])),
      async (request) => {
        const body = Buffer.from(await request.arrayBuffer());
        assert.deepEqual([...body.subarray(0, 4)], [2, 0, 0, 11]);
        assert.ok(body.includes(Buffer.from("printer-state-reasons")));
        assert.equal(body.at(-1), 3);
      },
    ).health(),
    { status: 0, jobId: null },
  );
});
for (const [name, response, error] of [
  [
    "HTTP failure",
    new Response("private diagnostic", { status: 503 }),
    /HTTP status 503/,
  ],
  ["truncated header", new Response(Uint8Array.from([2, 0, 0])), /incomplete/],
  [
    "printer rejection",
    new Response(Uint8Array.from([2, 0, 4, 1, 0, 0, 0, 1, 3])),
    /0x401/,
  ],
] as const) {
  test(`IPP does not report an accepted job for ${name}`, async () => {
    await assert.rejects(
      () =>
        client(response).print({
          content: new Uint8Array([1]),
          documentFormat: "application/pdf",
          jobName: "Fixture",
          userName: "user",
        }),
      error,
    );
  });
}
