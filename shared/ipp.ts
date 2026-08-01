import { basicAuthorization } from "./json.ts";
import { assertSuccessful, type FetchLike, fetchWithTimeout } from "./http.ts";

const encoder = new TextEncoder();

export class IppClient {
  readonly #fetcher: FetchLike;
  readonly #printerUrl: URL;
  readonly #timeoutMilliseconds: number;
  readonly #authorization: string;

  constructor(options: {
    readonly printerUrl: URL;
    readonly username: string;
    readonly password: string;
    readonly timeoutMilliseconds: number;
    readonly fetcher: FetchLike;
  }) {
    this.#printerUrl = options.printerUrl;
    this.#fetcher = options.fetcher;
    this.#timeoutMilliseconds = options.timeoutMilliseconds;
    this.#authorization = basicAuthorization(
      options.username,
      options.password,
    );
  }

  async health(): Promise<{ readonly status: number }> {
    return await this.execute(0x000b, [
      attribute(0x45, "printer-uri", this.#printerUrl.href),
      attribute(0x44, "requested-attributes", "printer-state"),
      attribute(0x44, "requested-attributes", "printer-state-reasons", false),
    ]);
  }

  async print(options: {
    readonly content: Uint8Array;
    readonly documentFormat: string;
    readonly jobName: string;
    readonly userName: string;
  }): Promise<{ readonly status: number; readonly jobId: number | null }> {
    return await this.execute(0x0002, [
      attribute(0x45, "printer-uri", this.#printerUrl.href),
      attribute(0x42, "requesting-user-name", options.userName),
      attribute(0x42, "job-name", options.jobName),
      attribute(0x49, "document-format", options.documentFormat),
    ], options.content);
  }

  private async execute(
    operation: number,
    attributes: readonly Uint8Array[],
    document?: Uint8Array,
  ): Promise<{ readonly status: number; readonly jobId: number | null }> {
    const requestId = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
    const body = concatenate([
      new Uint8Array([0x02, 0x00, operation >> 8, operation & 0xff]),
      uint32(requestId),
      new Uint8Array([0x01]),
      attribute(0x47, "attributes-charset", "utf-8"),
      attribute(0x48, "attributes-natural-language", "en"),
      ...attributes,
      new Uint8Array([0x03]),
      ...(document ? [document] : []),
    ]);
    const response = await fetchWithTimeout(this.#fetcher, this.#printerUrl, {
      method: "POST",
      headers: {
        authorization: this.#authorization,
        "content-type": "application/ipp",
      },
      body: Uint8Array.from(body).buffer,
    }, this.#timeoutMilliseconds);
    assertSuccessful(response, "IPP request");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 8) throw new Error("IPP response is incomplete.");
    const status = (bytes[2]! << 8) | bytes[3]!;
    if (status >= 0x0400) {
      throw new Error(`IPP printer returned status 0x${status.toString(16)}.`);
    }
    return { status, jobId: integerAttribute(bytes, "job-id") };
  }
}

function attribute(
  tag: number,
  name: string,
  value: string,
  includeName = true,
): Uint8Array {
  const nameBytes = includeName ? encoder.encode(name) : new Uint8Array();
  const valueBytes = encoder.encode(value);
  return concatenate([
    new Uint8Array([tag]),
    uint16(nameBytes.length),
    nameBytes,
    uint16(valueBytes.length),
    valueBytes,
  ]);
}

function integerAttribute(bytes: Uint8Array, name: string): number | null {
  const target = encoder.encode(name);
  for (let index = 8; index + 5 < bytes.length;) {
    const tag = bytes[index++]!;
    if (tag === 0x03) break;
    if (tag <= 0x0f) continue;
    const nameLength = (bytes[index++]! << 8) | bytes[index++]!;
    const currentName = bytes.subarray(index, index + nameLength);
    index += nameLength;
    const valueLength = (bytes[index++]! << 8) | bytes[index++]!;
    const value = bytes.subarray(index, index + valueLength);
    index += valueLength;
    if (tag === 0x21 && equals(currentName, target) && value.length === 4) {
      return new DataView(value.buffer, value.byteOffset, 4).getInt32(0, false);
    }
  }
  return null;
}

function uint16(value: number): Uint8Array {
  return new Uint8Array([value >> 8, value & 0xff]);
}

function uint32(value: number): Uint8Array {
  return new Uint8Array(
    [value >>> 24, value >>> 16, value >>> 8, value].map((part) => part & 0xff),
  );
}

function concatenate(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function equals(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}
