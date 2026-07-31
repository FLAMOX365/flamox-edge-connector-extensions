# Telephony for FRITZ!Box

This Edge Connector extension integrates a customer-local FRITZ!Box through its
official TR-064 interface. It implements:

- connection and credential health checks;
- Click-to-Call through the configured dialing device;
- ending the active dialing process;
- call-list retrieval with incremental cursors;
- provider-neutral normalization of direction, status, participants, start, end
  and connected duration.

The extension runs in the isolated Edge Connector worker. Its network grant is
derived from `baseUrl` and permits only the official TR-064 ports `49000` and
`49443`. Credentials are declared write-only secrets and never belong in
configuration or source control.

The SDK is imported from the commit-pinned Edge Connector Git submodule; it is
not copied into this project. XML parsing uses `@std/xml` and the MD5 operation
mandated by TR-064 uses `@noble/hashes`. Exact runtime provenance is recorded in
`runtime-dependencies.json`, included in the signed `.fmx`, and covered by the
release digest. Required redistributed-license text is included through
`THIRD_PARTY_NOTICES.md`. The executable worker itself is one offline bundle.

## FRITZ!Box preparation

Create a dedicated FRITZ!Box user with the `Phone` permission. Enable access for
applications in the home network and select the telephony device used by the
dialing assistant. Configure these values in FLAMOX365:

```json
{
  "baseUrl": "http://fritz.box:49000",
  "phoneName": "Sales desk",
  "timeZone": "Europe/Berlin",
  "defaultCallListDays": 30,
  "defaultCallListLimit": 250,
  "requestTimeoutSeconds": 15
}
```

Store the user name as `DEVICE_USERNAME` and the password as `DEVICE_PASSWORD`.
HTTPS on port `49443` is supported when the FRITZ!Box certificate is trusted by
the host running the Edge Connector.

## Actions

`dial` accepts:

```json
{
  "callIntentId": "00000000-0000-4000-8000-000000000000",
  "phoneNumber": "+49 30 12345678",
  "actor": {
    "userId": "example-user",
    "address": "developer@example.com",
    "displayName": "Developer"
  }
}
```

`hangup` accepts the original `callIntentId` and the nullable provider call id.
`list-calls` accepts the maximum requested record count and an opaque provider
cursor. For incremental reads, pass the complete cursor returned by the previous
result:

```json
{
  "cursor": {
    "latestCallId": "123",
    "timestamp": "1722423600"
  },
  "maximumRecords": 100
}
```

The FRITZ!Box call list stores timestamps with minute precision and reports
durations rounded up to full minutes. The normalized response preserves that
precision explicitly.

## Development

From this directory:

```sh
deno task check
deno task test
extension validate .
extension pack .
```

The automated tests simulate the customer-local device and do not require a
FRITZ!Box.

## Trademark notice

FRITZ! and FRITZ!Box are protected marks of FRITZ! GmbH. This independent
extension is not manufactured, sponsored, partnered with, or endorsed by FRITZ!
GmbH.
