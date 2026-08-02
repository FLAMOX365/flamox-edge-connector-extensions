import { defineExtension, type JsonValue } from "@edge-connector/sdk";
import type { FetchLike } from "../../../shared/http.ts";
import {
  decodeBase64,
  integerValue,
  objectValue,
  stringValue,
  urlValue,
} from "../../../shared/json.ts";
import { IppClient } from "../../../shared/ipp.ts";

const documentFormats = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/plain",
]);

export function createExtension(fetcher: FetchLike = globalThis.fetch) {
  return defineExtension({
    actions: {
      health: async (context) => {
        try {
          const result = await clientFrom(context, fetcher).client.health();
          return { healthy: true, ippStatus: result.status, message: null };
        } catch (error) {
          return {
            healthy: false,
            ippStatus: null,
            message: error instanceof Error
              ? error.message
              : "Printer is unavailable.",
          };
        }
      },
      print: async (context, input) => {
        const { client, requestingUserName } = clientFrom(context, fetcher);
        const value = objectValue(input, "Print input");
        const documentFormat = stringValue(
          value.documentFormat,
          "Print documentFormat",
        );
        if (!documentFormats.has(documentFormat)) {
          throw new Error("Print documentFormat is unsupported.");
        }
        const result = await client.print({
          content: decodeBase64(value.documentBase64, "Print documentBase64"),
          documentFormat,
          jobName: stringValue(value.jobName, "Print jobName"),
          userName: requestingUserName,
        });
        return {
          accepted: true,
          ippStatus: result.status,
          jobId: result.jobId,
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
    requestingUserName: stringValue(
      configuration.requestingUserName,
      "Configuration requestingUserName",
      "FLAMOX365",
    ),
    client: new IppClient({
      printerUrl: urlValue(
        configuration.printerUrl,
        "Configuration printerUrl",
      ),
      username: context.secrets.PRINTER_USERNAME ?? "",
      password: context.secrets.PRINTER_PASSWORD ?? "",
      timeoutMilliseconds: integerValue(
        configuration.requestTimeoutSeconds,
        "Configuration requestTimeoutSeconds",
        30,
        1,
        90,
      ) * 1_000,
      fetcher,
    }),
  };
}
