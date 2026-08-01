import type { JsonValue } from "./json.ts";

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export async function fetchWithTimeout(
  fetcher: FetchLike,
  input: string | URL,
  init: RequestInit,
  timeoutMilliseconds: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function responseJson(
  response: Response,
  label: string,
): Promise<JsonValue> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as JsonValue;
  } catch (error) {
    throw new Error(`${label} returned invalid JSON.`, { cause: error });
  }
}

export function assertSuccessful(response: Response, label: string): void {
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP status ${response.status}.`);
  }
}

export function bearerHeaders(token: string | undefined): Headers {
  const headers = new Headers({ accept: "application/json" });
  if (token) headers.set("authorization", `Bearer ${token}`);
  return headers;
}
