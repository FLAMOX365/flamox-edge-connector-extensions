import type { TelephonyCallRecord } from "@edge-connector/sdk";
import { elements, elementText, type XmlElement } from "./xml.ts";

type Direction = "incoming" | "outgoing" | "unknown";
type CallStatus =
  | "active"
  | "answered"
  | "completed"
  | "missed"
  | "rejected"
  | "unknown";

const typeMappings = new Map<
  number,
  { readonly direction: Direction; readonly status: CallStatus }
>([
  [1, { direction: "incoming", status: "answered" }],
  [2, { direction: "incoming", status: "missed" }],
  [3, { direction: "outgoing", status: "completed" }],
  [9, { direction: "incoming", status: "active" }],
  [10, { direction: "incoming", status: "rejected" }],
  [11, { direction: "outgoing", status: "active" }],
]);

export type CallList = {
  readonly calls: readonly TelephonyCallRecord[];
  readonly cursor: {
    readonly timestamp: string | null;
    readonly latestCallId: string | null;
  };
};

export function parseCallList(xml: string, timeZone: string): CallList {
  assertTimeZone(timeZone);
  const calls = elements(xml, "Call").map((entry) =>
    normalizeCall(entry, timeZone),
  );
  const latestCallId =
    calls
      .map((call) => call.externalRecordId)
      .sort(compareIds)
      .at(-1) ?? null;
  return {
    calls,
    cursor: {
      timestamp: textOrNull(elementText(xml, "timestamp")),
      latestCallId,
    },
  };
}

function normalizeCall(xml: XmlElement, timeZone: string): TelephonyCallRecord {
  const providerType = integerOrNull(elementText(xml, "Type"));
  const mapping =
    providerType === null ? undefined : typeMappings.get(providerType);
  const direction = mapping?.direction ?? "unknown";
  const status = mapping?.status ?? "unknown";
  const caller = cleanNumber(
    elementText(xml, direction === "outgoing" ? "CallerNumber" : "Caller"),
  );
  const callee = cleanNumber(
    elementText(xml, direction === "incoming" ? "CalledNumber" : "Called"),
  );
  const remoteNumber =
    direction === "incoming"
      ? caller
      : direction === "outgoing"
        ? callee
        : null;
  const localNumber =
    direction === "incoming"
      ? callee
      : direction === "outgoing"
        ? caller
        : null;
  const rawDate = textOrNull(elementText(xml, "Date"));
  const startedAt =
    rawDate === null ? null : providerDateToIso(rawDate, timeZone);
  if (startedAt === null) {
    throw new Error("FRITZ!Box call record has no valid start timestamp.");
  }
  const rawDuration = textOrNull(elementText(xml, "Duration"));
  const durationSeconds = parseDuration(rawDuration);
  const endedAt =
    startedAt !== null && status !== "active"
      ? new Date(Date.parse(startedAt) + durationSeconds * 1_000).toISOString()
      : null;

  const externalRecordId = textOrNull(elementText(xml, "Id"));
  if (externalRecordId === null) {
    throw new Error("FRITZ!Box call record has no provider record id.");
  }
  return {
    callIntentId: null,
    externalRecordId,
    externalCallId: null,
    providerRecordType:
      providerType === null ? "unknown" : String(providerType),
    direction:
      direction === "incoming"
        ? "INBOUND"
        : direction === "outgoing"
          ? "OUTBOUND"
          : "UNKNOWN",
    category: "USER_PSTN",
    callerNumber: caller,
    calleeNumber: callee,
    actorExternalId: null,
    actorAddress: null,
    actorDisplayName: null,
    startedAt,
    endedAt,
    connectedDurationSeconds: durationSeconds,
    conferenceExternalId: null,
    carrier: null,
    charge: null,
    connectionCharge: null,
    currency: null,
    tenantCountryCode: null,
    usageCountryCode: null,
    destinationCountryCode: null,
    extensions: {
      provider: "fritzbox",
      status,
      localNumber,
      remoteNumber,
      remoteName: textOrNull(elementText(xml, "Name")),
      timePrecision: "minute",
      deviceName: textOrNull(elementText(xml, "Device")),
      source: {
        date: rawDate,
        duration: rawDuration,
        numberType: textOrNull(elementText(xml, "Numbertype")),
        port: textOrNull(elementText(xml, "Port")),
      },
    },
  };
}

export function providerDateToIso(
  value: string,
  timeZone: string,
): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{2}|\d{4})\s+(\d{2}):(\d{2})$/u.exec(
    value,
  );
  if (!match) return null;
  const yearValue = Number.parseInt(match[3]!, 10);
  const desired = {
    year: yearValue < 100 ? 2_000 + yearValue : yearValue,
    month: Number.parseInt(match[2]!, 10),
    day: Number.parseInt(match[1]!, 10),
    hour: Number.parseInt(match[4]!, 10),
    minute: Number.parseInt(match[5]!, 10),
  };
  if (!validDateParts(desired)) return null;

  let timestamp = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
  );
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  for (let iteration = 0; iteration < 3; iteration++) {
    const actual = Object.fromEntries(
      formatter
        .formatToParts(new Date(timestamp))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number.parseInt(part.value, 10)]),
    );
    const rendered = Date.UTC(
      actual.year!,
      actual.month! - 1,
      actual.day!,
      actual.hour!,
      actual.minute!,
    );
    const expected = Date.UTC(
      desired.year,
      desired.month - 1,
      desired.day,
      desired.hour,
      desired.minute,
    );
    const correction = expected - rendered;
    timestamp += correction;
    if (correction === 0) break;
  }
  return new Date(timestamp).toISOString();
}

function parseDuration(value: string | null): number {
  if (value === null) return 0;
  const match = /^(\d+):(\d{2})$/u.exec(value);
  if (!match) return 0;
  return (
    Number.parseInt(match[1]!, 10) * 3_600 + Number.parseInt(match[2]!, 10) * 60
  );
}

function cleanNumber(value: string | undefined): string | null {
  if (value === undefined) return null;
  const stripped = value.trim().replace(/^(?:SIP|POTS|ISDN|UMTS):\s*/iu, "");
  return stripped.length > 0 ? stripped : null;
}

function textOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function integerOrNull(value: string | undefined): number | null {
  if (!value || !/^\d+$/u.test(value)) return null;
  return Number.parseInt(value, 10);
}

function compareIds(left: string, right: string): number {
  if (/^\d+$/u.test(left) && /^\d+$/u.test(right)) {
    return Number.parseInt(left, 10) - Number.parseInt(right, 10);
  }
  return left.localeCompare(right);
}

function assertTimeZone(value: string): void {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
  } catch (error) {
    throw new Error(`Invalid call-list time zone '${value}'.`, {
      cause: error,
    });
  }
}

function validDateParts(value: {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}): boolean {
  if (
    value.year < 2_000 ||
    value.year > 9_999 ||
    value.month < 1 ||
    value.month > 12 ||
    value.day < 1 ||
    value.day > 31 ||
    value.hour < 0 ||
    value.hour > 23 ||
    value.minute < 0 ||
    value.minute > 59
  )
    return false;
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day));
  return (
    date.getUTCFullYear() === value.year &&
    date.getUTCMonth() === value.month - 1 &&
    date.getUTCDate() === value.day
  );
}
