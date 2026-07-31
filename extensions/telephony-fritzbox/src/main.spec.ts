import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import type {
  ExtensionActionContext,
  JsonValue,
  TelephonyStartCallRequest,
} from "@edge-connector/sdk";
import { createExtension } from "./main.ts";

const discovery = `<?xml version="1.0"?>
  <root>
    <device>
      <modelName>FRITZ!Box Test</modelName>
      <serviceList>
        <service>
          <serviceType>urn:dslforum-org:service:X_VoIP:1</serviceType>
          <controlURL>/upnp/control/x_voip</controlURL>
        </service>
        <service>
          <serviceType>urn:dslforum-org:service:X_AVM-DE_OnTel:1</serviceType>
          <controlURL>/upnp/control/x_contact</controlURL>
        </service>
      </serviceList>
    </device>
  </root>`;

class DeviceMock {
  readonly requests: {
    readonly url: string;
    readonly method: string;
    readonly body: string;
  }[] = [];
  nonce = 1;

  fetch = (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? init.body : "";
    this.requests.push({ url, method, body });

    if (url.endsWith("/tr64desc.xml")) {
      return Promise.resolve(xmlResponse(discovery));
    }
    if (url.includes("/calllist.lua")) {
      return Promise.resolve(xmlResponse(`<root>
        <timestamp>101</timestamp>
        <Call>
          <Id>7</Id><Type>1</Type><Caller>030123</Caller>
          <CalledNumber>4930555</CalledNumber>
          <Date>31.07.24 12:03</Date><Duration>0:02</Duration>
        </Call>
      </root>`));
    }
    if (body.includes("<h:InitChallenge")) {
      return Promise.resolve(xmlResponse(
        `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
          xmlns:h="http://soap-authentication.org/digest/2001/10/">
        <s:Header><h:Challenge>
        <Status>Unauthenticated</Status>
        <Nonce>NONCE-${this.nonce}</Nonce><Realm>F!Box SOAP-Auth</Realm>
      </h:Challenge></s:Header><s:Body>
        <errorCode>503</errorCode><errorDescription>Auth. failed</errorDescription>
      </s:Body></s:Envelope>`,
        500,
      ));
    }
    if (!body.includes("<h:ClientAuth")) {
      return Promise.resolve(
        xmlResponse("<errorCode>401</errorCode>", 500),
      );
    }

    const actionResponse = body.includes("<u:X_AVM-DE_DialGetConfig")
      ? "<NewX_AVM-DE_PhoneName>Sales desk</NewX_AVM-DE_PhoneName>"
      : body.includes("<u:GetCallList")
      ? "<NewCallListURL>http://untrusted.invalid:49000/calllist.lua?sid=abc&amp;foo=bar</NewCallListURL>"
      : "";
    this.nonce++;
    return Promise.resolve(xmlResponse(`<s:Envelope
      xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
      xmlns:h="http://soap-authentication.org/digest/2001/10/">
    <s:Header><h:NextChallenge>
      <Status>Authenticated</Status>
      <Nonce>NONCE-${this.nonce}</Nonce><Realm>F!Box SOAP-Auth</Realm>
    </h:NextChallenge></s:Header><s:Body>${actionResponse}</s:Body></s:Envelope>`));
  };
}

Deno.test("dial configures the device and starts a normalized number", async () => {
  const device = new DeviceMock();
  const extension = createExtension(device.fetch, fixedClock);
  const result = await extension.actions.dial(
    context({ phoneName: "Sales desk" }),
    startCallInput("+49 (30) 123-45/67"),
  );

  assertEquals(result, {
    status: "ACCEPTED",
    providerCallId: null,
    occurredAt: "2026-07-31T12:00:00.000Z",
    providerData: {
      provider: "fritzbox",
      phoneNumber: "+49301234567",
      dialingDevice: "Sales desk",
    },
  });
  const soapBodies = device.requests.map((request) => request.body).join("\n");
  assertStringIncludes(soapBodies, "<u:X_AVM-DE_DialSetConfig");
  assertStringIncludes(
    soapBodies,
    "<NewX_AVM-DE_PhoneNumber>+49301234567</NewX_AVM-DE_PhoneNumber>",
  );
});

Deno.test("hangup returns the canonical telephony result", async () => {
  const device = new DeviceMock();
  const extension = createExtension(device.fetch, fixedClock);
  const result = await extension.actions.hangup(context(), {
    callIntentId: "call-intent-1",
    providerCallId: null,
  });

  assertEquals(result, {
    status: "ENDED",
    occurredAt: "2026-07-31T12:00:00.000Z",
    providerData: { provider: "fritzbox" },
  });
});

Deno.test("health verifies both services and credentials", async () => {
  const device = new DeviceMock();
  const extension = createExtension(device.fetch);
  const result = await extension.actions.health(context(), null);
  assertEquals(result, {
    healthy: true,
    message: null,
    providerData: {
      provider: "fritzbox",
      protocol: "TR-064",
      modelName: "FRITZ!Box Test",
      dialingDevice: "Sales desk",
      services: {
        clickToCall: true,
        callHistory: true,
      },
    },
  });
});

Deno.test("call history is downloaded only from the configured network target", async () => {
  const device = new DeviceMock();
  const extension = createExtension(device.fetch);
  const result = await extension.actions["list-calls"](
    context(),
    {
      cursor: { latestCallId: "6", timestamp: "100" },
      maximumRecords: 25,
    },
  );

  const callListRequest = device.requests.find((request) =>
    request.url.includes("/calllist.lua")
  );
  const target = new URL(callListRequest!.url);
  assertEquals(target.origin, "http://fritz.box:49000");
  assertEquals(target.searchParams.get("sid"), "abc");
  assertEquals(target.searchParams.get("days"), "30");
  assertEquals(target.searchParams.get("max"), "25");
  assertEquals(target.searchParams.get("id"), "6");
  assertEquals(target.searchParams.get("timestamp"), "100");
  assertEquals(
    typeof result === "object" && result !== null && !Array.isArray(result) &&
      Array.isArray(result.calls)
      ? result.calls.length
      : null,
    1,
  );
});

Deno.test("dial rejects unsupported input before contacting the device", async () => {
  const device = new DeviceMock();
  const extension = createExtension(device.fetch);
  await assertRejects(
    async () =>
      await extension.actions.dial(
        context(),
        startCallInput("030;shutdown"),
      ),
    Error,
    "unsupported characters",
  );
  assertEquals(device.requests.length, 0);
});

function fixedClock(): Date {
  return new Date("2026-07-31T12:00:00.000Z");
}

function startCallInput(phoneNumber: string): TelephonyStartCallRequest {
  return {
    callIntentId: "call-intent-1",
    phoneNumber,
    actor: {
      userId: "user-1",
      address: "developer@example.com",
      displayName: "Developer",
    },
  };
}

function context(
  configuration: Readonly<Record<string, JsonValue>> = {},
): ExtensionActionContext {
  return {
    requestId: "test-request",
    configuration: {
      baseUrl: "http://fritz.box:49000",
      timeZone: "Europe/Berlin",
      ...configuration,
    },
    secrets: {
      DEVICE_USERNAME: "extension-user",
      DEVICE_PASSWORD: "correct horse battery staple",
    },
    host: {
      ui: {
        showMessage: () => Promise.resolve({ displayed: true }),
      },
    },
  };
}

function xmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}
