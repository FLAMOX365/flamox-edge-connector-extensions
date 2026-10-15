import { parseCallList } from "./call-list.ts";
import { CONTACT_SERVICE, Tr064Client, VOIP_SERVICE } from "./tr064.ts";
import {
  defineTelephonyProvider,
  type ExtensionActionContext,
  type JsonValue,
  type TelephonySynchronizeCallsRequest,
} from "@edge-connector/sdk";
import { elementText } from "./xml.ts";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type Clock = () => Date;

type Configuration = {
  readonly baseUrl: URL;
  readonly phoneName: string | null;
  readonly timeZone: string;
  readonly defaultCallListDays: number;
  readonly defaultCallListLimit: number;
  readonly requestTimeoutMilliseconds: number;
};

export function createExtension(
  fetcher: FetchLike = globalThis.fetch,
  clock: Clock = () => new Date(),
) {
  return defineTelephonyProvider({
    startCall: {
      action: "dial",
      handler: async (context, input) => {
        const phoneNumber = normalizePhoneNumber(input.phoneNumber);
        const { client, configuration } = clientFrom(context, fetcher);
        await requiredDescription(client);
        const dialingDevice = await configureDialingDevice(
          client,
          configuration.phoneName,
        );
        await client.invoke(VOIP_SERVICE, "X_AVM-DE_DialNumber", {
          "NewX_AVM-DE_PhoneNumber": phoneNumber,
        });
        return {
          status: "ACCEPTED",
          providerCallId: null,
          occurredAt: clock().toISOString(),
          providerData: {
            provider: "fritzbox",
            phoneNumber,
            dialingDevice,
          },
        };
      },
    },
    endCall: {
      action: "hangup",
      handler: async (context) => {
        const { client } = clientFrom(context, fetcher);
        await requiredDescription(client);
        await client.invoke(VOIP_SERVICE, "X_AVM-DE_DialHangup");
        return {
          status: "ENDED",
          occurredAt: clock().toISOString(),
          providerData: { provider: "fritzbox" },
        };
      },
    },
    synchronizeCalls: {
      action: "list-calls",
      handler: async (context, input) => {
        const { client, configuration } = clientFrom(context, fetcher);
        await requiredDescription(client);
        const query = callListQuery(input, configuration);
        const response = await client.invoke(CONTACT_SERVICE, "GetCallList");
        const callListUrl = elementText(response, "NewCallListURL");
        if (!callListUrl) {
          throw new Error(
            "The call list is disabled or unavailable on the FRITZ!Box.",
          );
        }
        const xml = await client.downloadCallList(callListUrl, query);
        const parsed = parseCallList(xml, configuration.timeZone);
        return { calls: [...parsed.calls], cursor: parsed.cursor };
      },
    },
    health: {
      action: "health",
      handler: async (context) => {
        try {
          const { client } = clientFrom(context, fetcher);
          const description = await requiredDescription(client);
          const response = await client.invoke(
            VOIP_SERVICE,
            "X_AVM-DE_DialGetConfig",
          );
          return {
            healthy: true,
            message: null,
            providerData: {
              provider: "fritzbox",
              protocol: "TR-064",
              modelName: description.modelName,
              dialingDevice: nullable(
                elementText(response, "NewX_AVM-DE_PhoneName"),
              ),
              services: {
                clickToCall: true,
                callHistory: true,
              },
            },
          };
        } catch (error) {
          return {
            healthy: false,
            message:
              error instanceof Error
                ? error.message
                : "FRITZ!Box health check failed.",
          };
        }
      },
    },
    actions: {
      configure: async (context) => {
        const { client, configuration } = clientFrom(context, fetcher);
        const description = await requiredDescription(client);
        const dialingDevice = await configureDialingDevice(
          client,
          configuration.phoneName,
        );
        return {
          configured: true,
          provider: "fritzbox",
          protocol: "TR-064",
          modelName: description.modelName,
          dialingDevice,
        };
      },
    },
  });
}

export default createExtension();

async function requiredDescription(client: Tr064Client) {
  const description = await client.describe();
  const missing = [VOIP_SERVICE, CONTACT_SERVICE].filter(
    (service) => !description.services.has(service),
  );
  if (missing.length > 0) {
    throw new Error(
      `The FRITZ!Box does not expose the required telephony service${
        missing.length === 1 ? "" : "s"
      }: ${missing.join(", ")}.`,
    );
  }
  return description;
}

async function configureDialingDevice(
  client: Tr064Client,
  requestedName: string | null,
): Promise<string | null> {
  if (requestedName !== null) {
    await client.invoke(VOIP_SERVICE, "X_AVM-DE_DialSetConfig", {
      "NewX_AVM-DE_PhoneName": requestedName,
    });
  }
  const response = await client.invoke(VOIP_SERVICE, "X_AVM-DE_DialGetConfig");
  return nullable(elementText(response, "NewX_AVM-DE_PhoneName"));
}

function clientFrom(
  context: ExtensionActionContext,
  fetcher: FetchLike,
): { readonly client: Tr064Client; readonly configuration: Configuration } {
  const configuration = parseConfiguration(context.configuration);
  return {
    configuration,
    client: new Tr064Client({
      baseUrl: configuration.baseUrl,
      username: context.secrets.DEVICE_USERNAME ?? "",
      password: context.secrets.DEVICE_PASSWORD ?? "",
      timeoutMilliseconds: configuration.requestTimeoutMilliseconds,
      fetch: fetcher,
    }),
  };
}

function parseConfiguration(
  value: Readonly<Record<string, JsonValue>>,
): Configuration {
  const baseUrlValue = stringValue(
    value.baseUrl,
    "Configuration baseUrl",
    "http://fritz.box:49000",
  );
  let baseUrl: URL;
  try {
    baseUrl = new URL(baseUrlValue);
  } catch (error) {
    throw new Error("Configuration baseUrl must be a valid URL.", {
      cause: error,
    });
  }
  const timeZone = stringValue(
    value.timeZone,
    "Configuration timeZone",
    "Europe/Berlin",
  );
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
  } catch (error) {
    throw new Error(`Configuration timeZone '${timeZone}' is invalid.`, {
      cause: error,
    });
  }
  const phoneName =
    value.phoneName === undefined
      ? null
      : stringValue(value.phoneName, "Configuration phoneName");
  return {
    baseUrl,
    phoneName,
    timeZone,
    defaultCallListDays: integerValue(
      value.defaultCallListDays,
      "Configuration defaultCallListDays",
      30,
      0,
      999,
    ),
    defaultCallListLimit: integerValue(
      value.defaultCallListLimit,
      "Configuration defaultCallListLimit",
      250,
      1,
      999,
    ),
    requestTimeoutMilliseconds:
      integerValue(
        value.requestTimeoutSeconds,
        "Configuration requestTimeoutSeconds",
        15,
        1,
        60,
      ) * 1_000,
  };
}

function normalizePhoneNumber(value: string): string {
  const normalized = value.replace(/[\s()\-/.]/gu, "");
  if (
    normalized.length > 40 ||
    !/^(?:\+[0-9][0-9*#]*|[0-9*#]+)$/u.test(normalized)
  ) {
    throw new Error(
      "Dial input phoneNumber contains unsupported characters or is too long.",
    );
  }
  return normalized;
}

function callListQuery(
  input: TelephonySynchronizeCallsRequest,
  configuration: Configuration,
): {
  readonly days: number;
  readonly max: number;
  readonly id?: number;
  readonly timestamp?: number;
} {
  const days = configuration.defaultCallListDays;
  const max = Math.min(
    integerValue(
      input.maximumRecords,
      "Telephony synchronization maximumRecords",
      undefined,
      1,
      1_000,
    ),
    configuration.defaultCallListLimit,
  );
  if (input.cursor === null) return { days, max };
  const cursor = record(input.cursor, "Telephony synchronization cursor");
  exactKeys(
    cursor,
    ["latestCallId", "timestamp"],
    "Telephony synchronization cursor",
  );
  const hasId = cursor.latestCallId !== null;
  const hasTimestamp = cursor.timestamp !== null;
  if (hasId !== hasTimestamp) {
    throw new Error(
      "Telephony synchronization cursor values must be supplied together.",
    );
  }
  if (!hasId) return { days, max };
  return {
    days,
    max,
    id: cursorInteger(cursor.latestCallId, "latestCallId"),
    timestamp: cursorInteger(cursor.timestamp, "timestamp"),
  };
}

function cursorInteger(value: JsonValue, name: string): number {
  if (typeof value !== "string" || !/^\d+$/u.test(value)) {
    throw new Error(
      `Telephony synchronization cursor ${name} must be a decimal string.`,
    );
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(
      `Telephony synchronization cursor ${name} exceeds the supported range.`,
    );
  }
  return parsed;
}

function record(value: JsonValue, label: string): Record<string, JsonValue> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function exactKeys(
  value: Readonly<Record<string, JsonValue>>,
  requiredKeys: readonly string[],
  label: string,
  optionalKeys: readonly string[] = [],
): void {
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  const missing = requiredKeys.filter((key) => value[key] === undefined);
  if (unknown.length > 0 || missing.length > 0) {
    throw new Error(`${label} contains missing or unsupported fields.`);
  }
}

function stringValue(
  value: JsonValue | undefined,
  label: string,
  fallback?: string,
): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function integerValue(
  value: JsonValue | undefined,
  label: string,
  fallback: number | undefined,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `${label} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return value;
}

function nullable(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}
