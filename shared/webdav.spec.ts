import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createServer, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";
import { WebDavClient, parseMultiStatus } from "./webdav.ts";

async function fixture(t: TestContext, handler: RequestListener) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const baseUrl = new URL(
    `http://127.0.0.1:${(server.address() as AddressInfo).port}/dav`,
  );
  return {
    baseUrl,
    client: new WebDavClient({
      baseUrl,
      username: "müller",
      password: "test-only",
      timeoutMilliseconds: 1_000,
      fetcher: fetch,
    }),
  };
}

test("WebDAV writes are immutable and transfer binary content, credentials and ETags over HTTP", async (t) => {
  const contents: Buffer[] = [];
  const { client } = await fixture(t, async (request, response) => {
    assert.equal(request.method, "PUT");
    assert.equal(request.url, "/dav/documents/Gr%C3%BC%C3%9Fe%20%23.pdf");
    assert.equal(request.headers["if-none-match"], "*");
    assert.equal(request.headers["content-type"], "application/pdf");
    assert.equal(
      Buffer.from(request.headers.authorization!.slice(6), "base64").toString(),
      "müller:test-only",
    );
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    contents.push(Buffer.concat(chunks));
    response.writeHead(contents.length === 1 ? 201 : 412, {
      etag: '"immutable"',
    });
    response.end();
  });
  const bytes = Uint8Array.from([0, 255, 10, 128]);
  assert.equal(
    await client.write(
      "documents/Grüße #.pdf",
      bytes.buffer,
      "application/pdf",
    ),
    '"immutable"',
  );
  await assert.rejects(
    () =>
      client.write("documents/Grüße #.pdf", bytes.buffer, "application/pdf"),
    /412/,
  );
  assert.deepEqual(contents, [Buffer.from(bytes), Buffer.from(bytes)]);
});

test("WebDAV listing preserves namespaced Unicode metadata and omits the requested collection", async (t) => {
  const xml =
    '<d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/inbox/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response><d:response><d:href>/dav/inbox/Gr%C3%BC%C3%9Fe%20%26.csv</d:href><d:propstat><d:prop><d:getetag>&quot;e&amp;1&quot;</d:getetag><d:getcontentlength>12</d:getcontentlength><d:getlastmodified>Thu, 15 Oct 2026 10:00:00 GMT</d:getlastmodified></d:prop></d:propstat></d:response></d:multistatus>';
  const { client } = await fixture(t, (request, response) => {
    assert.equal(request.method, "PROPFIND");
    assert.equal(request.headers.depth, "1");
    response.writeHead(207);
    response.end(xml);
  });
  assert.equal(parseMultiStatus(xml)[0]!.collection, true);
  assert.deepEqual(await client.list("inbox"), [
    {
      name: "Grüße &.csv",
      href: "/dav/inbox/Gr%C3%BC%C3%9Fe%20%26.csv",
      etag: '"e&1"',
      size: 12,
      modifiedAt: "Thu, 15 Oct 2026 10:00:00 GMT",
      collection: false,
    },
  ]);
});

test("WebDAV reads enforce the byte limit and distinguish missing objects from unavailable storage", async (t) => {
  const { client } = await fixture(t, (request, response) => {
    if (request.url!.endsWith("missing")) {
      response.writeHead(404);
      response.end();
    } else if (request.url!.endsWith("offline")) {
      response.writeHead(503);
      response.end();
    } else {
      response.setHeader("etag", '"version-1"');
      response.end("Grüße");
    }
  });
  assert.deepEqual(await client.read("inbox/file", 7), {
    content: "Grüße",
    etag: '"version-1"',
  });
  await assert.rejects(() => client.read("inbox/file", 6), /exceeds 6 bytes/);
  assert.equal(await client.exists("missing"), false);
  await assert.rejects(() => client.exists("offline"), /503/);
  await assert.rejects(() => client.read("missing"), /404/);
});

test("WebDAV archive moves refuse overwrites and deletion is idempotent only for missing files", async (t) => {
  const methods: string[] = [];
  const { client, baseUrl } = await fixture(t, (request, response) => {
    methods.push(request.method!);
    if (request.method === "MOVE") {
      assert.equal(request.headers.overwrite, "F");
      assert.equal(
        request.headers.destination,
        `${baseUrl.href}/archive/Gr%C3%BC%C3%9Fe.csv`,
      );
      response.writeHead(201);
    } else response.writeHead(request.url!.endsWith("missing") ? 404 : 403);
    response.end();
  });
  await client.move("inbox/Grüße.csv", "archive/Grüße.csv");
  await client.remove("missing");
  await assert.rejects(() => client.remove("forbidden"), /403/);
  assert.deepEqual(methods, ["MOVE", "DELETE", "DELETE"]);
});
