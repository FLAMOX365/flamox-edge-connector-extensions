import { md5 } from "./md5.ts";
import { elements, elementText, escapeXml, soapFault } from "./xml.ts";

export const VOIP_SERVICE = "urn:dslforum-org:service:X_VoIP:1";
export const CONTACT_SERVICE = "urn:dslforum-org:service:X_AVM-DE_OnTel:1";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type Service = {
  readonly serviceType: string;
  readonly controlUrl: URL;
};

type AuthState = {
  readonly nonce: string;
  readonly realm: string;
};

export type DeviceDescription = {
  readonly modelName: string | null;
  readonly services: ReadonlyMap<string, Service>;
};

export type ClientOptions = {
  readonly baseUrl: URL;
  readonly username: string;
  readonly password: string;
  readonly timeoutMilliseconds: number;
  readonly fetch: FetchLike;
};

export class Tr064Client {
  readonly #baseUrl: URL;
  readonly #username: string;
  readonly #password: string;
  readonly #timeoutMilliseconds: number;
  readonly #fetch: FetchLike;
  #description?: Promise<DeviceDescription>;
  #authState?: AuthState;

  constructor(options: ClientOptions) {
    this.#baseUrl = normalizeBaseUrl(options.baseUrl);
    this.#username = required(options.username, "Device username");
    this.#password = required(options.password, "Device password");
    this.#timeoutMilliseconds = options.timeoutMilliseconds;
    this.#fetch = options.fetch;
  }

  describe(): Promise<DeviceDescription> {
    this.#description ??= this.#readDescription();
    return this.#description;
  }

  async invoke(
    serviceType: string,
    action: string,
    argumentsValue: Readonly<Record<string, string>> = {},
  ): Promise<string> {
    const description = await this.describe();
    const service = description.services.get(serviceType);
    if (!service) {
      throw new Error(
        `The TR-064 device does not expose required service '${serviceType}'.`,
      );
    }

    if (this.#authState) {
      const authenticated = await this.#postAction(
        service,
        action,
        argumentsValue,
        clientAuthHeader(this.#username, this.#password, this.#authState),
      );
      if (authenticated.ok && !soapFault(authenticated.body)) {
        this.#rememberNextChallenge(authenticated.body);
        return authenticated.body;
      }
      this.#authState = undefined;
    }

    const initial = await this.#postAction(
      service,
      action,
      argumentsValue,
      initChallengeHeader(this.#username),
    );
    const challenge = parseChallenge(initial.body);
    if (!challenge) {
      if (initial.ok && !soapFault(initial.body)) return initial.body;
      throw responseError(action, initial.status, initial.body);
    }

    const authenticated = await this.#postAction(
      service,
      action,
      argumentsValue,
      clientAuthHeader(this.#username, this.#password, challenge),
    );
    if (!authenticated.ok || soapFault(authenticated.body)) {
      throw responseError(action, authenticated.status, authenticated.body);
    }
    this.#rememberNextChallenge(authenticated.body);
    return authenticated.body;
  }

  async downloadCallList(
    callListUrl: string,
    parameters: {
      readonly days: number;
      readonly max: number;
      readonly id?: number;
      readonly timestamp?: number;
    },
  ): Promise<string> {
    let providerUrl: URL;
    try {
      providerUrl = new URL(callListUrl, this.#baseUrl);
    } catch (error) {
      throw new Error("The device returned an invalid call-list URL.", {
        cause: error,
      });
    }
    if (providerUrl.protocol !== "http:" && providerUrl.protocol !== "https:") {
      throw new Error("The device returned an unsupported call-list URL.");
    }

    const target = new URL(
      `${providerUrl.pathname}${providerUrl.search}`,
      this.#baseUrl,
    );
    target.searchParams.set("type", "xml");
    target.searchParams.set("days", String(parameters.days));
    target.searchParams.set("max", String(parameters.max));
    if (parameters.id !== undefined && parameters.timestamp !== undefined) {
      target.searchParams.set("id", String(parameters.id));
      target.searchParams.set("timestamp", String(parameters.timestamp));
    }

    const response = await this.#fetch(target, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(this.#timeoutMilliseconds),
      headers: { accept: "application/xml, text/xml" },
    });
    const body = await readBody(response, 5 * 1024 * 1024);
    if (!response.ok) {
      throw new Error(
        `Call-list download failed with HTTP status ${response.status}.`,
      );
    }
    return body;
  }

  async #readDescription(): Promise<DeviceDescription> {
    const target = new URL("/tr64desc.xml", this.#baseUrl);
    const response = await this.#fetch(target, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(this.#timeoutMilliseconds),
      headers: { accept: "application/xml, text/xml" },
    });
    const body = await readBody(response, 1024 * 1024);
    if (!response.ok) {
      throw new Error(
        `TR-064 discovery failed with HTTP status ${response.status}.`,
      );
    }

    const services = new Map<string, Service>();
    for (const serviceXml of elements(body, "service")) {
      const serviceType = elementText(serviceXml, "serviceType");
      const controlPath = elementText(serviceXml, "controlURL");
      if (!serviceType || !controlPath) continue;
      const controlUrl = new URL(controlPath, `${this.#baseUrl.origin}/`);
      if (controlUrl.origin !== this.#baseUrl.origin) {
        throw new Error(
          `TR-064 service '${serviceType}' points outside the configured device.`,
        );
      }
      services.set(serviceType, { serviceType, controlUrl });
    }
    return {
      modelName: nullable(elementText(body, "modelName")),
      services,
    };
  }

  async #postAction(
    service: Service,
    action: string,
    argumentsValue: Readonly<Record<string, string>>,
    authenticationHeader: string,
  ): Promise<{
    readonly ok: boolean;
    readonly status: number;
    readonly body: string;
  }> {
    const response = await this.#fetch(service.controlUrl, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(this.#timeoutMilliseconds),
      headers: {
        "content-type": 'text/xml; charset="utf-8"',
        soapaction: `"${service.serviceType}#${action}"`,
      },
      body: soapEnvelope(
        service.serviceType,
        action,
        argumentsValue,
        authenticationHeader,
      ),
    });
    return {
      ok: response.ok,
      status: response.status,
      body: await readBody(response, 1024 * 1024),
    };
  }

  #rememberNextChallenge(xml: string): void {
    const next = elements(xml, "NextChallenge")[0];
    const nonce = next === undefined ? undefined : elementText(next, "Nonce");
    const realm = next === undefined ? undefined : elementText(next, "Realm");
    this.#authState = nonce && realm ? { nonce, realm } : undefined;
  }
}

function soapEnvelope(
  serviceType: string,
  action: string,
  argumentsValue: Readonly<Record<string, string>>,
  authenticationHeader: string,
): string {
  const argumentsXml = Object.entries(argumentsValue)
    .map(([name, value]) => `<${name}>${escapeXml(value)}</${name}>`)
    .join("");
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ` +
    `s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
    `<s:Header>${authenticationHeader}</s:Header>` +
    `<s:Body><u:${action} xmlns:u="${escapeXml(serviceType)}">` +
    `${argumentsXml}</u:${action}></s:Body></s:Envelope>`
  );
}

function initChallengeHeader(username: string): string {
  return (
    `<h:InitChallenge ` +
    `xmlns:h="http://soap-authentication.org/digest/2001/10/" ` +
    `s:mustUnderstand="1"><UserID>${escapeXml(username)}</UserID>` +
    `</h:InitChallenge>`
  );
}

function clientAuthHeader(
  username: string,
  password: string,
  state: AuthState,
): string {
  const secret = md5(`${username}:${state.realm}:${password}`);
  const authentication = md5(`${secret}:${state.nonce}`);
  return (
    `<h:ClientAuth ` +
    `xmlns:h="http://soap-authentication.org/digest/2001/10/" ` +
    `s:mustUnderstand="1"><Nonce>${escapeXml(state.nonce)}</Nonce>` +
    `<Auth>${authentication}</Auth><UserID>${escapeXml(username)}</UserID>` +
    `<Realm>${escapeXml(state.realm)}</Realm></h:ClientAuth>`
  );
}

function parseChallenge(xml: string): AuthState | undefined {
  const challenge = elements(xml, "Challenge")[0];
  const nonce =
    challenge === undefined ? undefined : elementText(challenge, "Nonce");
  const realm =
    challenge === undefined ? undefined : elementText(challenge, "Realm");
  return nonce && realm ? { nonce, realm } : undefined;
}

async function readBody(
  response: Response,
  maximumBytes: number,
): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    await response.body?.cancel();
    throw new Error("The TR-064 response exceeds the permitted size.");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maximumBytes) {
        await reader.cancel();
        throw new Error("The TR-064 response exceeds the permitted size.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(body);
}

function responseError(action: string, status: number, xml: string): Error {
  const fault = soapFault(xml);
  return fault
    ? new Error(
        `TR-064 action '${action}' failed (${fault.code}: ${fault.description}).`,
      )
    : new Error(`TR-064 action '${action}' failed with HTTP status ${status}.`);
}

function normalizeBaseUrl(value: URL): URL {
  if (
    (value.protocol !== "http:" && value.protocol !== "https:") ||
    value.username ||
    value.password ||
    value.pathname !== "/" ||
    value.search ||
    value.hash
  ) {
    throw new Error(
      "TR-064 base URL must contain only an HTTP(S) origin without credentials.",
    );
  }
  const expectedPort = value.protocol === "https:" ? "49443" : "49000";
  if (value.port !== expectedPort) {
    throw new Error(
      `TR-064 base URL must use port ${expectedPort} for ${value.protocol
        .slice(0, -1)
        .toUpperCase()}.`,
    );
  }
  return new URL(value.origin);
}

function required(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

function nullable(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}
