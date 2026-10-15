import { defineExtension, type JsonValue } from "@edge-connector/sdk";
import type { FetchLike } from "../../../shared/http.ts";
import {
  decodeBase64,
  integerValue,
  objectValue,
  safeConfiguredPath,
  safeSegment,
  stringValue,
  urlValue,
} from "../../../shared/json.ts";
import { WebDavClient } from "../../../shared/webdav.ts";

const contentTypes = new Set([
  "application/json",
  "application/pdf",
  "application/xml",
  "image/jpeg",
  "image/png",
  "text/csv",
  "text/plain",
]);

export function createExtension(fetcher: FetchLike = globalThis.fetch) {
  return defineExtension({
    actions: {
      health: async (context) => {
        try {
          const { client, archivePath } = clientFrom(context, fetcher);
          await client.health(archivePath);
          return { healthy: true, message: null };
        } catch (error) {
          return {
            healthy: false,
            message:
              error instanceof Error
                ? error.message
                : "Archive is unavailable.",
          };
        }
      },
      "archive-document": async (context, input) => {
        const { client, archivePath } = clientFrom(context, fetcher);
        const value = objectValue(input, "Archive input");
        const documentId = safeSegment(value.documentId, "Archive documentId");
        const fileName = safeSegment(value.fileName, "Archive fileName");
        const contentType = stringValue(
          value.contentType,
          "Archive contentType",
        );
        if (!contentTypes.has(contentType)) {
          throw new Error("Archive contentType is unsupported.");
        }
        const content = decodeBase64(
          value.contentBase64,
          "Archive contentBase64",
        );
        const storageKey = `${documentId}--${fileName}`;
        const etag = await client.write(
          `${archivePath}/${storageKey}`,
          Uint8Array.from(content).buffer,
          contentType,
        );
        return { archived: true, storageKey, etag, size: content.length };
      },
      "verify-document": async (context, input) => {
        const { client, archivePath } = clientFrom(context, fetcher);
        const storageKey = safeSegment(
          objectValue(input, "Verify input").storageKey,
          "Verify storageKey",
        );
        return {
          storageKey,
          exists: await client.exists(`${archivePath}/${storageKey}`),
        };
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
  return {
    archivePath: safeConfiguredPath(
      configuration.archivePath,
      "Configuration archivePath",
      "documents",
    ),
    client: new WebDavClient({
      baseUrl: urlValue(configuration.baseUrl, "Configuration baseUrl"),
      username: context.secrets.ARCHIVE_USERNAME ?? "",
      password: context.secrets.ARCHIVE_PASSWORD ?? "",
      timeoutMilliseconds:
        integerValue(
          configuration.requestTimeoutSeconds,
          "Configuration requestTimeoutSeconds",
          30,
          1,
          60,
        ) * 1_000,
      fetcher,
    }),
  };
}
