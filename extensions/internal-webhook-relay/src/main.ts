import { defineExtension, type JsonValue } from "@edge-connector/sdk";
import {
  bearerHeaders,
  type FetchLike,
  fetchWithTimeout,
  responseJson,
} from "../../../shared/http.ts";
import {
  integerValue,
  objectValue,
  stringValue,
  urlValue,
} from "../../../shared/json.ts";

export function createExtension(fetcher: FetchLike = globalThis.fetch) {
  return defineExtension({
    actions: {
      health: async ({ configuration, secrets }) => {
        const settings = parseConfiguration(configuration);
        try {
          const response = await fetchWithTimeout(
            fetcher,
            settings.endpointUrl,
            {
              method: "HEAD",
              headers: bearerHeaders(secrets.WEBHOOK_TOKEN),
            },
            settings.timeoutMilliseconds,
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
            message: error instanceof Error
              ? error.message
              : "Webhook receiver is unavailable.",
          };
        }
      },
      deliver: async ({ configuration, secrets }, input) => {
        const settings = parseConfiguration(configuration);
        const event = parseEvent(input);
        const headers = bearerHeaders(secrets.WEBHOOK_TOKEN);
        headers.set("content-type", "application/json");
        headers.set("x-edge-event", event.event);
        headers.set("x-edge-event-id", event.eventId);
        const response = await fetchWithTimeout(fetcher, settings.endpointUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(event),
        }, settings.timeoutMilliseconds);
        if (!response.ok) {
          throw new Error(
            `Webhook delivery failed with HTTP status ${response.status}.`,
          );
        }
        return {
          accepted: true,
          status: response.status,
          response: await responseJson(response, "Webhook receiver"),
        };
      },
    },
  });
}

export default createExtension();

function parseConfiguration(
  configuration: Readonly<Record<string, JsonValue>>,
) {
  return {
    endpointUrl: urlValue(
      configuration.endpointUrl,
      "Configuration endpointUrl",
    ),
    timeoutMilliseconds: integerValue(
      configuration.requestTimeoutSeconds,
      "Configuration requestTimeoutSeconds",
      15,
      1,
      60,
    ) * 1_000,
  };
}

function parseEvent(input: JsonValue) {
  const value = objectValue(input, "Delivery input");
  return {
    event: stringValue(value.event, "Delivery event"),
    eventId: stringValue(value.eventId, "Delivery eventId"),
    occurredAt: stringValue(value.occurredAt, "Delivery occurredAt"),
    payload: value.payload ?? null,
  };
}
