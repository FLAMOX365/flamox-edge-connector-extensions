export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = Record<string, JsonValue>;

export function objectValue(value: JsonValue, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

export function stringValue(
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

export function optionalString(
  value: JsonValue | undefined,
  label: string,
): string | null {
  if (value === undefined || value === null) return null;
  return stringValue(value, label);
}

export function integerValue(
  value: JsonValue | undefined,
  label: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) return fallback;
  if (
    !Number.isInteger(value) ||
    Number(value) < minimum ||
    Number(value) > maximum
  ) {
    throw new Error(
      `${label} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return Number(value);
}

export function booleanValue(
  value: JsonValue | undefined,
  label: string,
  fallback: boolean,
): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

export function safeSegment(value: JsonValue, label: string): string {
  const result = stringValue(value, label);
  if (
    result.length > 240 ||
    result === "." ||
    result === ".." ||
    result.includes("/") ||
    result.includes("\\") ||
    result.includes("\0")
  ) {
    throw new Error(`${label} must be one safe path segment.`);
  }
  return result;
}

export function safeConfiguredPath(
  value: JsonValue | undefined,
  label: string,
  fallback = "",
): string {
  const result = value === undefined ? fallback : stringValue(value, label);
  const normalized = result.replace(/^\/+|\/+$/gu, "");
  if (
    normalized
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..") ||
    normalized.includes("\\") ||
    normalized.includes("\0")
  ) {
    throw new Error(`${label} contains an unsafe path.`);
  }
  return normalized;
}

export function urlValue(value: JsonValue | undefined, label: string): URL {
  const raw = stringValue(value, label);
  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `http://${raw}`);
  } catch (error) {
    throw new Error(`${label} must be a valid URL or host.`, { cause: error });
  }
  if (
    !url.hostname ||
    url.username ||
    url.password ||
    !["http:", "https:"].includes(url.protocol)
  ) {
    throw new Error(`${label} must use HTTP(S) without embedded credentials.`);
  }
  return url;
}

export function childUrl(baseUrl: URL, ...segments: readonly string[]): URL {
  const url = new URL(
    baseUrl.href.endsWith("/") ? baseUrl.href : `${baseUrl.href}/`,
  );
  const encoded = segments
    .filter(Boolean)
    .flatMap((segment) => segment.split("/"))
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  url.pathname = `${url.pathname.replace(/\/+$/u, "")}/${encoded}`;
  return url;
}

export function decodeBase64(
  value: JsonValue,
  label: string,
  maximumBytes = 512 * 1024,
): Uint8Array {
  const encoded = stringValue(value, label);
  let binary: string;
  try {
    binary = atob(encoded);
  } catch (error) {
    throw new Error(`${label} must be valid base64.`, { cause: error });
  }
  if (binary.length === 0 || binary.length > maximumBytes) {
    throw new Error(
      `${label} must contain between 1 and ${maximumBytes} decoded bytes.`,
    );
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function basicAuthorization(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}
