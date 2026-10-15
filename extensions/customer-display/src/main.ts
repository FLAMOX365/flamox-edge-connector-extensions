import { defineExtension, type JsonValue } from "@edge-connector/sdk";
import {
  assertSuccessful,
  bearerHeaders,
  type FetchLike,
  fetchWithTimeout,
  responseJson,
} from "../../../shared/http.ts";
import {
  integerValue,
  objectValue,
  optionalString,
  stringValue,
  urlValue,
} from "../../../shared/json.ts";

export function createExtension(fetcher: FetchLike = globalThis.fetch) {
  return defineExtension({
    actions: {
      health: async (context) => {
        const settings = settingsFrom(context.configuration);
        try {
          const response = await request(
            fetcher,
            settings,
            context.secrets.DISPLAY_TOKEN,
            { method: "HEAD" },
          );
          return {
            healthy: response.status < 500,
            status: response.status,
            message: null,
          };
        } catch (error) {
          return {
            healthy: false,
            status: null,
            message:
              error instanceof Error
                ? error.message
                : "Display receiver is unavailable.",
          };
        }
      },
      show: async (context, input) => {
        const settings = settingsFrom(context.configuration);
        const presentation = parsePresentation(input);
        const response = await request(
          fetcher,
          settings,
          context.secrets.DISPLAY_TOKEN,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(presentation),
          },
        );
        assertSuccessful(response, "Display update");
        return {
          displayed: true,
          status: response.status,
          response: await responseJson(response, "Display receiver"),
        };
      },
      clear: async (context) => {
        const settings = settingsFrom(context.configuration);
        const response = await request(
          fetcher,
          settings,
          context.secrets.DISPLAY_TOKEN,
          { method: "DELETE" },
        );
        assertSuccessful(response, "Display clear");
        return { cleared: true, status: response.status };
      },
    },
  });
}

export default createExtension();

function settingsFrom(configuration: Readonly<Record<string, JsonValue>>) {
  return {
    displayUrl: urlValue(configuration.displayUrl, "Configuration displayUrl"),
    timeoutMilliseconds:
      integerValue(
        configuration.requestTimeoutSeconds,
        "Configuration requestTimeoutSeconds",
        10,
        1,
        30,
      ) * 1_000,
  };
}

function request(
  fetcher: FetchLike,
  settings: ReturnType<typeof settingsFrom>,
  token: string | undefined,
  init: RequestInit,
) {
  const headers = bearerHeaders(token);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  return fetchWithTimeout(
    fetcher,
    settings.displayUrl,
    { ...init, headers },
    settings.timeoutMilliseconds,
  );
}

function parsePresentation(input: JsonValue) {
  const value = objectValue(input, "Presentation input");
  if (
    !Array.isArray(value.lines) ||
    value.lines.length === 0 ||
    value.lines.length > 12
  ) {
    throw new Error(
      "Presentation lines must contain between 1 and 12 entries.",
    );
  }
  const lines = value.lines.map((line, index) =>
    stringValue(line, `Presentation line ${index + 1}`),
  );
  return {
    presentationId: stringValue(
      value.presentationId,
      "Presentation presentationId",
    ),
    headline: stringValue(value.headline, "Presentation headline"),
    lines,
    footer: optionalString(value.footer, "Presentation footer"),
    qrCodeUrl: optionalString(value.qrCodeUrl, "Presentation qrCodeUrl"),
    expiresAt: optionalString(value.expiresAt, "Presentation expiresAt"),
  };
}
