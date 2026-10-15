import { test } from "node:test";
import { assertEquals } from "../../../scripts/assert.ts";
import { createExtension } from "./main.ts";

const context = {
  requestId: "test",
  configuration: {
    baseUrl: "https://nas.internal.example/hotfolder",
    inboxPath: "inbox",
    outboxPath: "outbox",
    archivePath: "archive",
  },
  secrets: { HOTFOLDER_USERNAME: "user", HOTFOLDER_PASSWORD: "secret" },
  host: {
    ui: { showMessage: () => Promise.resolve({ displayed: true as const }) },
  },
};

test("list-files returns only CSV and XML documents", async () => {
  const xml = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/hotfolder/inbox/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response><d:response><d:href>/hotfolder/inbox/orders.csv</d:href><d:propstat><d:prop><d:getcontentlength>42</d:getcontentlength><d:getetag>"v1"</d:getetag></d:prop></d:propstat></d:response><d:response><d:href>/hotfolder/inbox/readme.txt</d:href></d:response></d:multistatus>`;
  const extension = createExtension(() =>
    Promise.resolve(new Response(xml, { status: 207 })),
  );
  const result = await extension.actions["list-files"](context);
  assertEquals(result, {
    files: [
      {
        name: "orders.csv",
        href: "/hotfolder/inbox/orders.csv",
        etag: '"v1"',
        size: 42,
        modifiedAt: null,
        collection: false,
      },
    ],
  });
});

test("write-file uses the fixed outbox and refuses arbitrary destinations", async () => {
  const requests: Request[] = [];
  const extension = createExtension((input, init) => {
    requests.push(new Request(input, init));
    return Promise.resolve(
      new Response(null, { status: 201, headers: { etag: '"v2"' } }),
    );
  });
  const result = await extension.actions["write-file"](context, {
    fileName: "export.xml",
    content: "<orders/>",
  });
  assertEquals(result, { written: true, fileName: "export.xml", etag: '"v2"' });
  assertEquals(
    requests[0]?.url,
    "https://nas.internal.example/hotfolder/outbox/export.xml",
  );
  assertEquals(requests[0]?.method, "PUT");
});
