import { basicAuthorization, childUrl } from "./json.ts";
import { assertSuccessful, type FetchLike, fetchWithTimeout } from "./http.ts";

export type WebDavEntry = {
  readonly name: string;
  readonly href: string;
  readonly etag: string | null;
  readonly size: number | null;
  readonly modifiedAt: string | null;
  readonly collection: boolean;
};

export class WebDavClient {
  readonly #baseUrl: URL;
  readonly #fetcher: FetchLike;
  readonly #headers: Headers;
  readonly #timeoutMilliseconds: number;

  constructor(options: {
    readonly baseUrl: URL;
    readonly username: string;
    readonly password: string;
    readonly timeoutMilliseconds: number;
    readonly fetcher: FetchLike;
  }) {
    this.#baseUrl = options.baseUrl;
    this.#fetcher = options.fetcher;
    this.#timeoutMilliseconds = options.timeoutMilliseconds;
    this.#headers = new Headers({
      authorization: basicAuthorization(options.username, options.password),
    });
  }

  async health(path: string): Promise<void> {
    const response = await this.request(path, {
      method: "PROPFIND",
      headers: { depth: "0" },
    });
    if (response.status !== 207 && !response.ok) {
      throw new Error(
        `WebDAV health check failed with HTTP status ${response.status}.`,
      );
    }
  }

  async exists(path: string): Promise<boolean> {
    const response = await this.request(path, { method: "HEAD" });
    if (response.status === 404) return false;
    assertSuccessful(response, "WebDAV existence check");
    return true;
  }

  async list(path: string): Promise<readonly WebDavEntry[]> {
    const response = await this.request(path, {
      method: "PROPFIND",
      headers: { depth: "1" },
    });
    if (response.status !== 207) {
      throw new Error(
        `WebDAV listing failed with HTTP status ${response.status}.`,
      );
    }
    return parseMultiStatus(await response.text()).slice(1);
  }

  async read(
    path: string,
    maximumBytes = 768 * 1024,
  ): Promise<{ readonly content: string; readonly etag: string | null }> {
    const response = await this.request(path, { method: "GET" });
    assertSuccessful(response, "WebDAV download");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > maximumBytes) {
      throw new Error(`WebDAV file exceeds ${maximumBytes} bytes.`);
    }
    return {
      content: new TextDecoder().decode(bytes),
      etag: response.headers.get("etag"),
    };
  }

  async write(
    path: string,
    content: BodyInit,
    contentType: string,
  ): Promise<string | null> {
    const response = await this.request(path, {
      method: "PUT",
      headers: { "content-type": contentType, "if-none-match": "*" },
      body: content,
    });
    assertSuccessful(response, "WebDAV upload");
    return response.headers.get("etag");
  }

  async remove(path: string): Promise<void> {
    const response = await this.request(path, { method: "DELETE" });
    if (response.status !== 404) assertSuccessful(response, "WebDAV deletion");
  }

  async move(sourcePath: string, destinationPath: string): Promise<void> {
    const response = await this.request(sourcePath, {
      method: "MOVE",
      headers: {
        destination: childUrl(this.#baseUrl, destinationPath).href,
        overwrite: "F",
      },
    });
    assertSuccessful(response, "WebDAV move");
  }

  private request(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(this.#headers);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    return fetchWithTimeout(
      this.#fetcher,
      childUrl(this.#baseUrl, path),
      { ...init, headers },
      this.#timeoutMilliseconds,
    );
  }
}

export function parseMultiStatus(xml: string): readonly WebDavEntry[] {
  const responses = xml.match(
    /<(?:[A-Za-z0-9_-]+:)?response\b[\s\S]*?<\/(?:[A-Za-z0-9_-]+:)?response>/giu,
  ) ?? [];
  return responses.map((response) => {
    const href = decodeXml(text(response, "href") ?? "");
    const decodedPath = decodeURIComponent(
      new URL(href, "http://webdav.local").pathname,
    );
    const name = decodedPath.replace(/\/+$/u, "").split("/").at(-1) ?? "";
    const size = text(response, "getcontentlength");
    return {
      name,
      href,
      etag: nullable(text(response, "getetag")),
      size: size && /^\d+$/u.test(size) ? Number.parseInt(size, 10) : null,
      modifiedAt: nullable(text(response, "getlastmodified")),
      collection: /<(?:[A-Za-z0-9_-]+:)?collection\s*\/?\s*>/iu.test(response),
    };
  });
}

function text(xml: string, name: string): string | null {
  return xml.match(
    new RegExp(
      `<(?:[A-Za-z0-9_-]+:)?${name}[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${name}>`,
      "iu",
    ),
  )?.[1]?.trim() ?? null;
}

function nullable(value: string | null): string | null {
  return value && value.trim() ? decodeXml(value.trim()) : null;
}

function decodeXml(value: string): string {
  return value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll(
    "&quot;",
    '"',
  )
    .replaceAll("&apos;", "'").replaceAll("&amp;", "&");
}
