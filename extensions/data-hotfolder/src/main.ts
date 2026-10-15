import { defineExtension, type JsonValue } from "@edge-connector/sdk";
import type { FetchLike } from "../../../shared/http.ts";
import {
  integerValue,
  objectValue,
  safeConfiguredPath,
  safeSegment,
  stringValue,
  urlValue,
} from "../../../shared/json.ts";
import { WebDavClient } from "../../../shared/webdav.ts";

export function createExtension(fetcher: FetchLike = globalThis.fetch) {
  return defineExtension({
    actions: {
      health: async (context) => {
        try {
          const { client, inboxPath } = clientFrom(context, fetcher);
          await client.health(inboxPath);
          return { healthy: true, message: null };
        } catch (error) {
          return {
            healthy: false,
            message:
              error instanceof Error
                ? error.message
                : "Hotfolder is unavailable.",
          };
        }
      },
      "list-files": async (context) => {
        const { client, inboxPath } = clientFrom(context, fetcher);
        const entries = await client.list(inboxPath);
        return {
          files: entries.filter(
            (entry) => !entry.collection && /\.(?:csv|xml)$/iu.test(entry.name),
          ),
        };
      },
      "read-file": async (context, input) => {
        const { client, inboxPath } = clientFrom(context, fetcher);
        const fileName = fileNameFrom(input);
        const result = await client.read(`${inboxPath}/${fileName}`);
        return { fileName, ...result };
      },
      "write-file": async (context, input) => {
        const { client, outboxPath } = clientFrom(context, fetcher);
        const value = objectValue(input, "Write input");
        const fileName = supportedFileName(value.fileName);
        const content = stringValue(value.content, "Write content");
        if (new TextEncoder().encode(content).length > 512 * 1024) {
          throw new Error("Write content exceeds 524288 bytes.");
        }
        const etag = await client.write(
          `${outboxPath}/${fileName}`,
          content,
          fileName.toLowerCase().endsWith(".xml")
            ? "application/xml"
            : "text/csv; charset=utf-8",
        );
        return { written: true, fileName, etag };
      },
      "archive-file": async (context, input) => {
        const { client, inboxPath, archivePath } = clientFrom(context, fetcher);
        const fileName = fileNameFrom(input);
        await client.move(
          `${inboxPath}/${fileName}`,
          `${archivePath}/${fileName}`,
        );
        return { archived: true, fileName };
      },
    },
  });
}

export default createExtension();

function clientFrom(
  context: {
    readonly configuration: Readonly<Record<string, JsonValue>>;
    readonly secrets: Readonly<Record<string, string>>;
  },
  fetcher: FetchLike,
) {
  const configuration = context.configuration;
  const inboxPath = safeConfiguredPath(
    configuration.inboxPath,
    "Configuration inboxPath",
    "inbox",
  );
  const outboxPath = safeConfiguredPath(
    configuration.outboxPath,
    "Configuration outboxPath",
    "outbox",
  );
  const archivePath = safeConfiguredPath(
    configuration.archivePath,
    "Configuration archivePath",
    "archive",
  );
  return {
    inboxPath,
    outboxPath,
    archivePath,
    client: new WebDavClient({
      baseUrl: urlValue(configuration.baseUrl, "Configuration baseUrl"),
      username: context.secrets.HOTFOLDER_USERNAME ?? "",
      password: context.secrets.HOTFOLDER_PASSWORD ?? "",
      timeoutMilliseconds:
        integerValue(
          configuration.requestTimeoutSeconds,
          "Configuration requestTimeoutSeconds",
          20,
          1,
          60,
        ) * 1_000,
      fetcher,
    }),
  };
}

function fileNameFrom(input: JsonValue): string {
  return supportedFileName(objectValue(input, "File input").fileName);
}

function supportedFileName(value: JsonValue): string {
  const fileName = safeSegment(value, "File name");
  if (!/\.(?:csv|xml)$/iu.test(fileName)) {
    throw new Error("File name must end in .csv or .xml.");
  }
  return fileName;
}
