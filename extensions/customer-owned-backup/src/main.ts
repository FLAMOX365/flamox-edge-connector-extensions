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
import { WebDavClient, type WebDavEntry } from "../../../shared/webdav.ts";

export function createExtension(fetcher: FetchLike = globalThis.fetch) {
  return defineExtension({
    actions: {
      health: async (context) => {
        try {
          const settings = settingsFrom(context, fetcher);
          await settings.client.health(settings.backupPath);
          return { healthy: true, message: null };
        } catch (error) {
          return {
            healthy: false,
            message:
              error instanceof Error
                ? error.message
                : "Backup collection is unavailable.",
          };
        }
      },
      "create-backup": async (context, input) => {
        const settings = settingsFrom(context, fetcher);
        const value = objectValue(input, "Backup input");
        const exportId = safeSegment(value.exportId, "Backup exportId");
        const createdAt = stringValue(value.createdAt, "Backup createdAt");
        if (Number.isNaN(Date.parse(createdAt))) {
          throw new Error("Backup createdAt must be an ISO timestamp.");
        }
        const contentType = stringValue(
          value.contentType,
          "Backup contentType",
        );
        if (!new Set(["application/json", "application/zip"]).has(contentType))
          throw new Error("Backup contentType is unsupported.");
        const content = decodeBase64(
          value.contentBase64,
          "Backup contentBase64",
        );
        const timestamp = new Date(createdAt)
          .toISOString()
          .replace(/[:.]/gu, "-");
        const extension = contentType === "application/zip" ? "zip" : "json";
        const fileName = `${settings.filePrefix}-${timestamp}-${exportId}.${extension}.backup`;
        const etag = await settings.client.write(
          `${settings.backupPath}/${fileName}`,
          Uint8Array.from(content).buffer,
          contentType,
        );
        return {
          created: true,
          fileName,
          size: content.length,
          sha256: await sha256(content),
          etag,
        };
      },
      "list-backups": async (context) => {
        const settings = settingsFrom(context, fetcher);
        return { backups: [...(await backups(settings))] };
      },
      "prune-backups": async (context) => {
        const settings = settingsFrom(context, fetcher);
        const entries = await backups(settings);
        const removed = entries.slice(settings.retentionCount);
        for (const entry of removed) {
          await settings.client.remove(`${settings.backupPath}/${entry.name}`);
        }
        return {
          retained: Math.min(entries.length, settings.retentionCount),
          removed: removed.map((entry) => entry.name),
        };
      },
    },
  });
}

export default createExtension();

function settingsFrom(
  context: {
    readonly configuration: Readonly<Record<string, JsonValue>>;
    readonly secrets: Readonly<Record<string, string>>;
  },
  fetcher: FetchLike,
) {
  const configuration = context.configuration;
  return {
    backupPath: safeConfiguredPath(
      configuration.backupPath,
      "Configuration backupPath",
      "backups",
    ),
    filePrefix: safeSegment(
      configuration.filePrefix ?? "edge-backup",
      "Configuration filePrefix",
    ),
    retentionCount: integerValue(
      configuration.retentionCount,
      "Configuration retentionCount",
      30,
      1,
      365,
    ),
    client: new WebDavClient({
      baseUrl: urlValue(configuration.baseUrl, "Configuration baseUrl"),
      username: context.secrets.BACKUP_USERNAME ?? "",
      password: context.secrets.BACKUP_PASSWORD ?? "",
      timeoutMilliseconds:
        integerValue(
          configuration.requestTimeoutSeconds,
          "Configuration requestTimeoutSeconds",
          45,
          1,
          90,
        ) * 1_000,
      fetcher,
    }),
  };
}

async function backups(
  settings: ReturnType<typeof settingsFrom>,
): Promise<readonly WebDavEntry[]> {
  return (await settings.client.list(settings.backupPath))
    .filter(
      (entry) =>
        !entry.collection &&
        entry.name.startsWith(`${settings.filePrefix}-`) &&
        entry.name.endsWith(".backup"),
    )
    .sort((left, right) => right.name.localeCompare(left.name));
}

async function sha256(content: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", Uint8Array.from(content).buffer),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
