# Extensions for the Edge Connector

[![CI](https://github.com/FLAMOX365/flamox-edge-connector-extensions/actions/workflows/ci.yml/badge.svg)](https://github.com/FLAMOX365/flamox-edge-connector-extensions/actions/workflows/ci.yml)

This repository contains source projects for extensions executed by the Edge
Connector. Each directory below `extensions/` is independently versioned,
tested, signed and published as an immutable `.fmx` bundle.

Clone the repository together with its commit-pinned SDK source:

```sh
git clone --recurse-submodules \
  https://github.com/FLAMOX365/flamox-edge-connector-extensions.git
```

`dependencies/edge-connector` is a Git submodule pointing at the authoritative
Edge Connector repository. Extensions reference its public SDK directly during
development. The Extension CLI bundles that SDK and all locked third-party
dependencies into the `.fmx`; no dependency is downloaded in the customer
network.

## Included extensions

| Extension                | Purpose                                                 | Status      |
| ------------------------ | ------------------------------------------------------- | ----------- |
| `customer-display`       | Fixed customer-local showroom display receiver          | Pre-release |
| `customer-owned-backup`  | Bounded exports to a customer-owned WebDAV collection   | Pre-release |
| `data-hotfolder`         | Bounded CSV/XML exchange through WebDAV                 | Pre-release |
| `dms-nas-archive`        | Immutable document writes to WebDAV-backed DMS or NAS   | Pre-release |
| `erp-rest-odata`         | Fixed REST/OData product, availability and order routes | Pre-release |
| `hello-world`            | Minimal host-UI reference implementation                | Reference   |
| `internal-webhook-relay` | Signed events to one internal HTTP receiver             | Pre-release |
| `network-printer`        | Bounded IPP print jobs to one local printer             | Pre-release |
| `sqlserver-readonly`     | Named read-only Microsoft SQL Server queries            | Pre-release |
| `telephony-fritzbox`     | Telephony provider contract v1 over TR-064              | Pre-release |

The `hello-world` reference extension proves the complete developer path:

```sh
deno task extension -- test extensions/hello-world
deno task extension -- dev extensions/hello-world --once \
  --input-file extensions/hello-world/examples/show-message.json
deno task extension -- pack extensions/hello-world
deno task extension -- publish extensions/hello-world
```

The first production-oriented integration is `telephony-fritzbox`. It connects
customer-local telephony through the Edge Connector and exposes Click-to-Call,
hangup, health and normalized call-history actions:

```sh
deno task extension -- validate extensions/telephony-fritzbox
deno task extension -- test extensions/telephony-fritzbox
deno task extension -- pack extensions/telephony-fritzbox
```

Create another complete project through the guided wizard:

```sh
deno task extension -- init extensions/my-extension
```

Use Deno 2.9.4 or newer. From the repository root, the complete local gate is:

```sh
deno install --frozen
deno task check
deno task lint
deno task test
deno task fmt
deno task audit
deno task validate
deno task build
```

Every pushed commit runs this gate for every direct child of `extensions/` that
contains both `extension-manifest.json` and `deno.json`. The workspace and the
build inventory use directory patterns, so adding another complete extension
does not require a CI or root-task change.

After a successful run, open the corresponding
[CI workflow run](https://github.com/FLAMOX365/flamox-edge-connector-extensions/actions/workflows/ci.yml)
and download `edge-connector-extensions-<commit-sha>` from its **Artifacts**
section. The archive is retained for 90 days and contains the compiled `dist`
directory for every extension plus `extension-artifact-inventory.json` with the
extension ids and versions. These CI artifacts are compiled review outputs;
production `.fmx` bundles remain separately signed and published through the
Extension CLI.

Publisher private keys, FLAMOX365 Cloud credentials, generated `dist`
directories, `.edge` state, and `.fmx` artifacts remain outside this repository.
Each project also contains a `store-image.webp` generated from the shared visual
contract in [STORE_IMAGE_PROMPT.md](STORE_IMAGE_PROMPT.md); its bytes are
covered by the containing FMX package signature. See
[CONTRIBUTING.md](CONTRIBUTING.md), [SUPPORT.md](SUPPORT.md), and
[the security policy](SECURITY.md) before contributing or reporting a problem.

## Operational boundaries

These extensions transport data only to customer-selected systems and do not
choose a legal basis, retention period or records-management classification.
Before activation, the operator must document the permitted purpose, data
categories, responsible roles, destination, deletion or hold rules and incident
process for the concrete deployment. Destination accounts and network grants
must be limited to the declared action; a successful technical health check is
not a statement that the destination is suitable for personal, confidential, tax
or other regulated records.

Actions that print, replace a customer display, submit an order or prune a
backup have an external side effect. Callers must follow the action's declared
idempotency and reconcile ambiguous timeouts with the destination before
retrying.
