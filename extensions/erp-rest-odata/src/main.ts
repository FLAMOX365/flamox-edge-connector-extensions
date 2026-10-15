import { defineExtension, type JsonValue } from "@edge-connector/sdk";
import {
  assertSuccessful,
  bearerHeaders,
  type FetchLike,
  fetchWithTimeout,
  responseJson,
} from "../../../shared/http.ts";
import {
  childUrl,
  integerValue,
  objectValue,
  optionalString,
  safeConfiguredPath,
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
            context.secrets.ERP_API_TOKEN,
            settings.baseUrl,
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
              error instanceof Error ? error.message : "ERP is unavailable.",
          };
        }
      },
      "list-products": async (context, input) => {
        const settings = settingsFrom(context.configuration);
        const value = objectValue(input, "Product query");
        const url = childUrl(settings.baseUrl, settings.productsPath);
        const search = optionalString(value.search, "Product query search");
        if (search) url.searchParams.set("$search", search);
        url.searchParams.set(
          "$top",
          String(
            integerValue(
              value.maximumRecords,
              "Product query maximumRecords",
              100,
              1,
              500,
            ),
          ),
        );
        const response = await request(
          fetcher,
          settings,
          context.secrets.ERP_API_TOKEN,
          url,
          { method: "GET" },
        );
        assertSuccessful(response, "ERP product query");
        return { data: await responseJson(response, "ERP product query") };
      },
      "get-availability": async (context, input) => {
        const settings = settingsFrom(context.configuration);
        const value = objectValue(input, "Availability query");
        const url = childUrl(settings.baseUrl, settings.availabilityPath);
        url.searchParams.set(
          "sku",
          stringValue(value.sku, "Availability query sku"),
        );
        const response = await request(
          fetcher,
          settings,
          context.secrets.ERP_API_TOKEN,
          url,
          { method: "GET" },
        );
        assertSuccessful(response, "ERP availability query");
        return { data: await responseJson(response, "ERP availability query") };
      },
      "submit-order": async (context, input) => {
        const settings = settingsFrom(context.configuration);
        const value = objectValue(input, "Order submission");
        const idempotencyKey = stringValue(
          value.idempotencyKey,
          "Order submission idempotencyKey",
        );
        const order = objectValue(
          value.order ?? null,
          "Order submission order",
        );
        const response = await request(
          fetcher,
          settings,
          context.secrets.ERP_API_TOKEN,
          childUrl(settings.baseUrl, settings.ordersPath),
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "idempotency-key": idempotencyKey,
            },
            body: JSON.stringify(order),
          },
        );
        assertSuccessful(response, "ERP order submission");
        return {
          accepted: true,
          status: response.status,
          data: await responseJson(response, "ERP order submission"),
        };
      },
    },
  });
}

export default createExtension();

function settingsFrom(configuration: Readonly<Record<string, JsonValue>>) {
  return {
    baseUrl: urlValue(configuration.baseUrl, "Configuration baseUrl"),
    productsPath: safeConfiguredPath(
      configuration.productsPath,
      "Configuration productsPath",
      "api/products",
    ),
    availabilityPath: safeConfiguredPath(
      configuration.availabilityPath,
      "Configuration availabilityPath",
      "api/availability",
    ),
    ordersPath: safeConfiguredPath(
      configuration.ordersPath,
      "Configuration ordersPath",
      "api/orders",
    ),
    timeoutMilliseconds:
      integerValue(
        configuration.requestTimeoutSeconds,
        "Configuration requestTimeoutSeconds",
        30,
        1,
        90,
      ) * 1_000,
  };
}

function request(
  fetcher: FetchLike,
  settings: ReturnType<typeof settingsFrom>,
  token: string | undefined,
  url: URL,
  init: RequestInit,
) {
  const headers = bearerHeaders(token);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  return fetchWithTimeout(
    fetcher,
    url,
    { ...init, headers },
    settings.timeoutMilliseconds,
  );
}
