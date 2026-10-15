import { test } from "node:test";
import { assertEquals } from "../../../scripts/assert.ts";
import { parseCallList, providerDateToIso } from "./call-list.ts";

test("call list is normalized to provider-neutral call metadata", () => {
  const result = parseCallList(
    `<?xml version="1.0"?>
    <root>
      <timestamp>1722423600</timestamp>
      <Call>
        <Id>42</Id>
        <Type>3</Type>
        <Called>+49 30 1234</Called>
        <Caller>SIP: 4930555</Caller>
        <CallerNumber>4930555</CallerNumber>
        <Name>Example AG</Name>
        <Numbertype>sip</Numbertype>
        <Device>Sales desk</Device>
        <Port>10</Port>
        <Date>31.07.24 12:03</Date>
        <Duration>0:05</Duration>
      </Call>
      <Call>
        <Id>43</Id>
        <Type>2</Type>
        <Caller>0309876</Caller>
        <Called>SIP: 4930555</Called>
        <CalledNumber>4930555</CalledNumber>
        <Date>31.07.24 13:03</Date>
        <Duration>0:00</Duration>
      </Call>
    </root>`,
    "Europe/Berlin",
  );

  assertEquals(result.cursor, {
    timestamp: "1722423600",
    latestCallId: "43",
  });
  assertEquals(result.calls[0], {
    callIntentId: null,
    externalRecordId: "42",
    externalCallId: null,
    providerRecordType: "3",
    direction: "OUTBOUND",
    category: "USER_PSTN",
    callerNumber: "4930555",
    calleeNumber: "+49 30 1234",
    actorExternalId: null,
    actorAddress: null,
    actorDisplayName: null,
    startedAt: "2024-07-31T10:03:00.000Z",
    endedAt: "2024-07-31T10:08:00.000Z",
    connectedDurationSeconds: 300,
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
      status: "completed",
      localNumber: "4930555",
      remoteNumber: "+49 30 1234",
      remoteName: "Example AG",
      timePrecision: "minute",
      deviceName: "Sales desk",
      source: {
        date: "31.07.24 12:03",
        duration: "0:05",
        numberType: "sip",
        port: "10",
      },
    },
  });
  assertEquals(result.calls[1], {
    callIntentId: null,
    externalRecordId: "43",
    externalCallId: null,
    providerRecordType: "2",
    direction: "INBOUND",
    category: "USER_PSTN",
    callerNumber: "0309876",
    calleeNumber: "4930555",
    actorExternalId: null,
    actorAddress: null,
    actorDisplayName: null,
    startedAt: "2024-07-31T11:03:00.000Z",
    endedAt: "2024-07-31T11:03:00.000Z",
    connectedDurationSeconds: 0,
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
      status: "missed",
      localNumber: "4930555",
      remoteNumber: "0309876",
      remoteName: null,
      timePrecision: "minute",
      deviceName: null,
      source: {
        date: "31.07.24 13:03",
        duration: "0:00",
        numberType: null,
        port: null,
      },
    },
  });
});

test("provider date conversion respects daylight-saving time", () => {
  assertEquals(
    providerDateToIso("31.01.24 12:00", "Europe/Berlin"),
    "2024-01-31T11:00:00.000Z",
  );
  assertEquals(
    providerDateToIso("31.07.24 12:00", "Europe/Berlin"),
    "2024-07-31T10:00:00.000Z",
  );
  assertEquals(providerDateToIso("not-a-date", "Europe/Berlin"), null);
});
