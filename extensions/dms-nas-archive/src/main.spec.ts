import { test } from "node:test";
import { assertEquals, assertRejects } from "../../../scripts/assert.ts";
import { createExtension } from "./main.ts";

const context = {
  requestId: "test",
  configuration: {
    baseUrl: "https://dms.internal.example/archive",
    archivePath: "documents",
  },
  secrets: { ARCHIVE_USERNAME: "user", ARCHIVE_PASSWORD: "secret" },
  host: {
    ui: { showMessage: () => Promise.resolve({ displayed: true as const }) },
  },
};

test("archive-document writes one immutable bounded object", async () => {
  const requests: Request[] = [];
  const extension = createExtension((input, init) => {
    requests.push(new Request(input, init));
    return Promise.resolve(
      new Response(null, { status: 201, headers: { etag: '"document-1"' } }),
    );
  });
  const result = await extension.actions["archive-document"](context, {
    documentId: "invoice-42",
    fileName: "invoice.pdf",
    contentType: "application/pdf",
    contentBase64: btoa("PDF"),
  });
  assertEquals(result, {
    archived: true,
    storageKey: "invoice-42--invoice.pdf",
    etag: '"document-1"',
    size: 3,
  });
  assertEquals(
    requests[0]?.url,
    "https://dms.internal.example/archive/documents/invoice-42--invoice.pdf",
  );
  assertEquals(requests[0]?.headers.get("if-none-match"), "*");
});

test("archive-document rejects an unsupported active content type", async () => {
  const extension = createExtension(() =>
    Promise.reject(new Error("must not send")),
  );
  await assertRejects(
    () =>
      extension.actions["archive-document"](context, {
        documentId: "invoice-42",
        fileName: "script.html",
        contentType: "text/html",
        contentBase64: btoa("<script/>"),
      }),
    Error,
    "unsupported",
  );
});
