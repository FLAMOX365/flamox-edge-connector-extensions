import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createServer as createHttpServer,
  type IncomingHttpHeaders,
} from "node:http";
import {
  createServer as createTcpServer,
  type AddressInfo,
  type Socket,
} from "node:net";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildProject } from "../dependencies/edge-connector/cli/project.ts";
import { ExtensionHost } from "../dependencies/edge-connector/runtime/extension-host.ts";
import type { JsonValue } from "@edge-connector/sdk";
import { discoverExtensions } from "./extensions.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const entries = await discoverExtensions();

test("every catalog extension executes its compiled action contracts in the OS sandbox", {
  timeout: 180_000,
}, async (t) => {
  assert.ok(
    entries.length > 0,
    "The catalog must contain executable extensions.",
  );
  for (const entry of entries) {
    await t.test(entry.id, { timeout: 45_000 }, async (t) => {
      const output = join(
        root,
        entry.path,
        "dist",
        `verification-${crypto.randomUUID()}`,
      );
      t.after(() => rm(output, { recursive: true, force: true }));
      const built = await buildProject(join(root, entry.path), output);
      assert.equal(built.manifest.runtime.entrypoint, "runtime/extension.mjs");
      const requests: {
        method: string;
        path: string;
        headers: IncomingHttpHeaders;
        body: Buffer;
      }[] = [];
      const objects = new Map<string, Buffer>();
      const sockets = new Set<Socket>();
      let prelogin: Buffer | undefined;
      const http = createHttpServer(async (request, response) => {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const body = Buffer.concat(chunks),
          path = request.url!,
          pathname = new URL(path, "http://fixture").pathname;
        requests.push({
          method: request.method!,
          path,
          headers: request.headers,
          body,
        });
        if (entry.directory === "telephony-fritzbox") {
          response.setHeader("content-type", "text/xml");
          if (pathname === "/tr64desc.xml")
            response.end(
              "<root><device><modelName>Fixture</modelName><serviceList><service><serviceType>urn:dslforum-org:service:X_VoIP:1</serviceType><controlURL>/voip</controlURL></service><service><serviceType>urn:dslforum-org:service:X_AVM-DE_OnTel:1</serviceType><controlURL>/contact</controlURL></service></serviceList></device></root>",
            );
          else if (pathname === "/calls")
            response.end(
              "<root><timestamp>101</timestamp><Call><Id>7</Id><Type>1</Type><Caller>030123</Caller><CalledNumber>4930555</CalledNumber><Date>15.10.26 12:03</Date><Duration>0:02</Duration></Call></root>",
            );
          else if (body.includes(Buffer.from("InitChallenge"))) {
            response.writeHead(500);
            response.end(
              "<root><Challenge><Nonce>fixture-nonce</Nonce><Realm>Fixture realm</Realm></Challenge></root>",
            );
          } else
            response.end(
              "<root><NextChallenge><Nonce>next-nonce</Nonce><Realm>Fixture realm</Realm></NextChallenge><NewX_AVM-DE_PhoneName>Fixture phone</NewX_AVM-DE_PhoneName><NewCallListURL>http://untrusted.invalid:49000/calls?sid=fixture</NewCallListURL></root>",
            );
        } else if (entry.directory === "network-printer") {
          const reply = Buffer.from([
            2, 0, 0, 0, 0, 0, 0, 1, 2, 0x21, 0, 6, 106, 111, 98, 45, 105, 100,
            0, 4, 0, 0, 0, 42, 3,
          ]);
          body.copy(reply, 4, 4, 8);
          response.setHeader("content-type", "application/ipp");
          response.end(reply);
        } else if (
          [
            "customer-owned-backup",
            "data-hotfolder",
            "dms-nas-archive",
          ].includes(entry.directory)
        ) {
          if (request.method === "PROPFIND") {
            response.writeHead(207, { "content-type": "application/xml" });
            const members = [...objects.keys()].filter((key) =>
              key.startsWith(`${pathname}/`),
            );
            response.end(
              `<d:multistatus xmlns:d="DAV:"><d:response><d:href>${pathname}/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>${members.map((key) => `<d:response><d:href>${key}</d:href><d:propstat><d:prop><d:getetag>&quot;fixture&quot;</d:getetag><d:getcontentlength>${objects.get(key)!.length}</d:getcontentlength></d:prop></d:propstat></d:response>`).join("")}</d:multistatus>`,
            );
          } else if (request.method === "PUT") {
            if (objects.has(pathname)) response.writeHead(412);
            else {
              assert.equal(request.headers["if-none-match"], "*");
              objects.set(pathname, body);
              response.writeHead(201, { etag: '"fixture"' });
            }
            response.end();
          } else if (request.method === "MOVE") {
            assert.equal(request.headers.overwrite, "F");
            const destination = new URL(request.headers.destination as string)
              .pathname;
            if (!objects.has(pathname)) response.writeHead(404);
            else if (objects.has(destination)) response.writeHead(412);
            else {
              objects.set(destination, objects.get(pathname)!);
              objects.delete(pathname);
              response.writeHead(201);
            }
            response.end();
          } else if (request.method === "DELETE") {
            response.writeHead(objects.delete(pathname) ? 204 : 404);
            response.end();
          } else if (objects.has(pathname)) {
            response.setHeader("etag", '"fixture"');
            response.end(objects.get(pathname));
          } else {
            response.writeHead(404);
            response.end();
          }
        } else {
          response.setHeader("content-type", "application/json");
          response.end(
            JSON.stringify({ value: [{ sku: "A-1" }], accepted: true }),
          );
        }
      });
      const tcp = createTcpServer((socket) => {
        sockets.add(socket);
        socket.on("close", () => sockets.delete(socket));
        socket.on("error", () => undefined);
        socket.once("data", (bytes) => {
          prelogin = Buffer.from(bytes);
          socket.destroy();
        });
      });
      const server = entry.directory === "sqlserver-readonly" ? tcp : http;
      const requestedPort =
        entry.directory === "sqlserver-readonly"
          ? 14330
          : entry.directory === "telephony-fritzbox"
            ? 49000
            : 0;
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(requestedPort, "127.0.0.1", resolve);
      });
      t.after(async () => {
        http.closeAllConnections();
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      });
      const port = (server.address() as AddressInfo).port,
        baseUrl = `http://127.0.0.1:${port}`;
      const configuration: Record<string, JsonValue> = {
        "customer-display": { displayUrl: `${baseUrl}/display` },
        "customer-owned-backup": { baseUrl, retentionCount: 1 },
        "data-hotfolder": { baseUrl },
        "dms-nas-archive": { baseUrl },
        "erp-rest-odata": { baseUrl },
        "hello-world": { defaultTitle: "Fixture title" },
        "internal-webhook-relay": { endpointUrl: `${baseUrl}/webhook` },
        "network-printer": { printerUrl: `${baseUrl}/ipp/print` },
        "sqlserver-readonly": {
          serverAddress: `127.0.0.1:${port}`,
          database: "fixture",
          encrypt: false,
          queriesJson: '{"status":{"sql":"SELECT 1 AS value","parameters":{}}}',
          requestTimeoutSeconds: 1,
        },
        "telephony-fritzbox": {
          baseUrl,
          timeZone: "Europe/Berlin",
          phoneName: "Fixture phone",
        },
      }[entry.directory] as Record<string, JsonValue>;
      const hostCalls: JsonValue[] = [];
      const host = new ExtensionHost({
        extensionDirectory: output,
        manifest: built.manifest,
        grant: {
          capabilities: [...built.manifest.capabilities],
          network: [`127.0.0.1:${port}`],
          secrets: [...built.manifest.permissions.secrets],
        },
        configuration,
        secrets: {
          resolve: async () =>
            Object.fromEntries(
              built.manifest.permissions.secrets.map((name) => [
                name,
                `fixture-${name}`,
              ]),
            ),
        },
        hostCapabilities: {
          invoke: async (call) => {
            hostCalls.push(call.input);
            return { displayed: true };
          },
        },
      });
      t.after(() => host.stop());
      const exercised = new Set<string>();
      const execute = async (action: string, input: JsonValue = null) => {
        exercised.add(action);
        const value = await host.execute(crypto.randomUUID(), action, input);
        assert.ok(
          typeof value === "object" && value !== null && !Array.isArray(value),
        );
        return value;
      };
      if (built.manifest.actions.some((action) => action.name === "health")) {
        const health = await execute("health");
        assert.equal(
          health.healthy,
          entry.directory !== "sqlserver-readonly",
          JSON.stringify({
            health,
            requests: requests.map(({ method, path }) => ({ method, path })),
          }),
        );
      }
      switch (entry.directory) {
        case "customer-display":
          assert.equal(
            (
              await execute("show", {
                presentationId: "fixture",
                headline: "Grüße",
                lines: ["Offer 42"],
              })
            ).displayed,
            true,
          );
          assert.equal((await execute("clear")).cleared, true);
          assert.deepEqual(
            requests.map((request) => request.method),
            ["HEAD", "PUT", "DELETE"],
          );
          assert.ok(
            requests.every(
              (request) =>
                request.headers.authorization ===
                "Bearer fixture-DISPLAY_TOKEN",
            ),
          );
          break;
        case "customer-owned-backup": {
          const created = await execute("create-backup", {
            exportId: "fixture",
            createdAt: "2026-10-15T10:00:00.000Z",
            contentType: "application/json",
            contentBase64: "e30=",
          });
          assert.equal(
            created.sha256,
            "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
          );
          objects.set(
            "/backups/edge-backup-2025-old.json.backup",
            Buffer.from("old"),
          );
          objects.set("/backups/unrelated.backup", Buffer.from("preserve"));
          assert.equal(
            (await execute("list-backups")).backups instanceof Array,
            true,
          );
          assert.deepEqual(await execute("prune-backups"), {
            retained: 1,
            removed: ["edge-backup-2025-old.json.backup"],
          });
          assert.equal(
            objects.get("/backups/unrelated.backup")!.toString(),
            "preserve",
          );
          assert.ok(objects.has(`/backups/${created.fileName}`));
          break;
        }
        case "data-hotfolder":
          objects.set("/inbox/orders.csv", Buffer.from("sku,quantity\nA-1,2"));
          objects.set("/inbox/ignored.txt", Buffer.from("ignore"));
          assert.equal(
            ((await execute("list-files")).files as JsonValue[]).length,
            1,
          );
          assert.equal(
            (await execute("read-file", { fileName: "orders.csv" })).content,
            "sku,quantity\nA-1,2",
          );
          assert.equal(
            (
              await execute("write-file", {
                fileName: "response.xml",
                content: "<ok/>",
              })
            ).written,
            true,
          );
          assert.equal(
            (await execute("archive-file", { fileName: "orders.csv" }))
              .archived,
            true,
          );
          assert.equal(objects.has("/inbox/orders.csv"), false);
          assert.equal(
            objects.get("/archive/orders.csv")!.toString(),
            "sku,quantity\nA-1,2",
          );
          break;
        case "dms-nas-archive": {
          const archived = await execute("archive-document", {
            documentId: "42",
            fileName: "invoice.pdf",
            contentType: "application/pdf",
            contentBase64: "AP8K",
          });
          assert.deepEqual(
            objects.get("/documents/42--invoice.pdf"),
            Buffer.from([0, 255, 10]),
          );
          assert.equal(
            (
              await execute("verify-document", {
                storageKey: archived.storageKey,
              })
            ).exists,
            true,
          );
          assert.equal(
            (await execute("verify-document", { storageKey: "missing.pdf" }))
              .exists,
            false,
          );
          break;
        }
        case "erp-rest-odata":
          assert.deepEqual(
            (
              await execute("list-products", {
                search: "Grüße & stock",
                maximumRecords: 25,
              })
            ).data,
            { value: [{ sku: "A-1" }], accepted: true },
          );
          await execute("get-availability", { sku: "A &/1" });
          assert.equal(
            (
              await execute("submit-order", {
                idempotencyKey: "stable-order-key",
                order: { sku: "A-1", quantity: 2 },
              })
            ).accepted,
            true,
          );
          assert.equal(
            requests.at(-1)!.headers["idempotency-key"],
            "stable-order-key",
          );
          assert.equal(
            new URL(requests[2]!.path, baseUrl).searchParams.get("sku"),
            "A &/1",
          );
          break;
        case "hello-world":
          assert.deepEqual(
            await execute("show-message", { message: "Grüße" }),
            { displayed: true },
          );
          assert.deepEqual(hostCalls, [
            { title: "Fixture title", message: "Grüße", kind: "info" },
          ]);
          break;
        case "internal-webhook-relay":
          assert.equal(
            (
              await execute("deliver", {
                event: "order.created",
                eventId: "stable-event",
                occurredAt: "2026-10-15T10:00:00.000Z",
                payload: { number: "42" },
              })
            ).accepted,
            true,
          );
          assert.equal(
            requests.at(-1)!.headers["x-edge-event-id"],
            "stable-event",
          );
          assert.equal(
            requests.at(-1)!.headers.authorization,
            "Bearer fixture-WEBHOOK_TOKEN",
          );
          break;
        case "network-printer":
          assert.deepEqual(
            await execute("print", {
              jobName: "Grüße",
              documentFormat: "application/pdf",
              documentBase64: "AP8K",
            }),
            { accepted: true, ippStatus: 0, jobId: 42 },
          );
          assert.deepEqual(
            requests.at(-1)!.body.subarray(-3),
            Buffer.from([0, 255, 10]),
          );
          break;
        case "sqlserver-readonly":
          assert.equal(
            prelogin?.[0],
            0x12,
            "The bundled Tedious driver must reach TDS pre-login through the SOCKS proxy",
          );
          await assert.rejects(
            () => execute("query", { queryName: "status", parameters: {} }),
            /Extension action failed/,
          );
          break;
        case "telephony-fritzbox":
          assert.equal((await execute("configure")).configured, true);
          assert.equal(
            (
              await execute("dial", {
                callIntentId: "fixture",
                phoneNumber: "+49 (30) 123",
                actor: {
                  userId: "actor",
                  address: "actor@example.com",
                  displayName: "Actor",
                },
              })
            ).status,
            "ACCEPTED",
          );
          assert.equal(
            (
              await execute("hangup", {
                callIntentId: "fixture",
                providerCallId: null,
              })
            ).status,
            "ENDED",
          );
          assert.equal(
            (
              (
                await execute("list-calls", {
                  cursor: null,
                  maximumRecords: 25,
                })
              ).calls as JsonValue[]
            ).length,
            1,
          );
          assert.ok(
            requests.some((request) =>
              request.body.includes(
                Buffer.from(
                  "<NewX_AVM-DE_PhoneNumber>+4930123</NewX_AVM-DE_PhoneNumber>",
                ),
              ),
            ),
          );
          assert.ok(
            requests.some((request) =>
              request.path.startsWith("/calls?sid=fixture"),
            ),
          );
          break;
        default:
          assert.fail(`Missing action scenario for ${entry.id}`);
      }
      // A catalog addition or new manifest action must supply a compiled regression scenario.
      assert.deepEqual(
        [...exercised].sort(),
        built.manifest.actions.map((action) => action.name).sort(),
      );
      for (const action of built.manifest.actions.filter(
        (action) => action.inputSchema,
      )) {
        const before: number = requests.length,
          beforeHostCalls: number = hostCalls.length;
        await assert.rejects(
          () => host.execute("invalid-contract", action.name, []),
          /input violates its contract/,
        );
        assert.equal(requests.length, before);
        assert.equal(hostCalls.length, beforeHostCalls);
      }
      assert.ok(
        (await readFile(join(output, "runtime/extension.mjs"), "utf8")).length >
          0,
      );
    });
  }
});
