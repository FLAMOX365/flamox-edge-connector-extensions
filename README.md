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
Edge Connector repository. Build the pinned connector with `yarn prepare:connector` before installing this
workspace. Extensions consume its built public npm SDK through locked `file:`
dependencies during development. The Extension CLI bundles that SDK and all locked third-party
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
yarn extension test extensions/hello-world
yarn extension dev extensions/hello-world --once \
  --input-file extensions/hello-world/examples/show-message.json
yarn extension pack extensions/hello-world
yarn extension publish extensions/hello-world
```

The first production-oriented integration is `telephony-fritzbox`. It connects
customer-local telephony through the Edge Connector and exposes Click-to-Call,
hangup, health and normalized call-history actions:

```sh
yarn extension validate extensions/telephony-fritzbox
yarn extension test extensions/telephony-fritzbox
yarn extension pack extensions/telephony-fritzbox
```

Create another complete project through the guided wizard:

```sh
yarn extension init extensions/my-extension
```

Use Node.js 26.12.0, TypeScript 7.0.2 and Yarn 4.18.1. No Deno toolchain is required. From the repository root, the complete local gate is:

```sh
yarn prepare:connector
yarn install --immutable
yarn check
yarn lint
yarn test
yarn fmt
yarn audit
yarn validate
yarn build
```

Every pushed commit runs this gate for every direct child of `extensions/` that
contains both `extension-manifest.json` and `package.json`. The workspace and the
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

## Runtime compatibility

Every manifest declares `node-process`; the canonical connector CLI compiles
Node.js 26 ESM bundles after TypeScript 7 validation and loads each bundle in
its OS sandbox. HTTP integrations retain their contracts. SQL Server uses
Tedious 20.3.7 with the SDK's authenticated SOCKS connector; direct TCP bypasses
are unavailable. FRITZ!Box XML uses `saxes` and TR-064 MD5 uses the npm
`@noble/hashes` package. There are no JSR/remote code imports.

Historical Deno artifacts cannot be converted by changing their manifest:
rebuild and sign a distinct release. Version assignment and publication remain
with the human owner. The pinned connector commit must be made available before
publishing this repository's updated submodule reference.
