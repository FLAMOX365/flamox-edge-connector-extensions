import { test } from "node:test";
import { assertEquals } from "../../../scripts/assert.ts";
import { createExtension } from "./main.ts";

const context = {
  requestId: "test",
  configuration: {
    baseUrl: "https://backup.internal.example/edge",
    backupPath: "backups",
    filePrefix: "edge-backup",
    retentionCount: 1,
  },
  secrets: { BACKUP_USERNAME: "user", BACKUP_PASSWORD: "secret" },
  host: {
    ui: { showMessage: () => Promise.resolve({ displayed: true as const }) },
  },
};

test("create-backup writes one immutable snapshot with a checksum", async () => {
  const requests: Request[] = [];
  const extension = createExtension((input, init) => {
    requests.push(new Request(input, init));
    return Promise.resolve(new Response(null, { status: 201 }));
  });
  const result = await extension.actions["create-backup"](context, {
    exportId: "export-42",
    createdAt: "2026-08-01T12:30:45.000Z",
    contentType: "application/json",
    contentBase64: btoa("{}"),
  });
  assertEquals(result, {
    created: true,
    fileName: "edge-backup-2026-08-01T12-30-45-000Z-export-42.json.backup",
    size: 2,
    sha256: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    etag: null,
  });
  assertEquals(requests[0]?.headers.get("if-none-match"), "*");
});

test("prune-backups deletes only older snapshots beyond retention", async () => {
  const deleted: string[] = [];
  const xml = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/edge/backups/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response><d:response><d:href>/edge/backups/edge-backup-2026-08-01-new.json.backup</d:href></d:response><d:response><d:href>/edge/backups/edge-backup-2026-07-01-old.json.backup</d:href></d:response><d:response><d:href>/edge/backups/unrelated.backup</d:href></d:response></d:multistatus>`;
  const extension = createExtension((input, init) => {
    const request = new Request(input, init);
    if (request.method === "DELETE") deleted.push(request.url);
    return Promise.resolve(
      request.method === "PROPFIND"
        ? new Response(xml, { status: 207 })
        : new Response(null, { status: 204 }),
    );
  });
  const result = await extension.actions["prune-backups"](context);
  assertEquals(result, {
    retained: 1,
    removed: ["edge-backup-2026-07-01-old.json.backup"],
  });
  assertEquals(deleted, [
    "https://backup.internal.example/edge/backups/edge-backup-2026-07-01-old.json.backup",
  ]);
});
