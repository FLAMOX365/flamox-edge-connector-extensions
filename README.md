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

| Extension            | Purpose                                    | Status      |
| -------------------- | ------------------------------------------ | ----------- |
| `hello-world`        | Minimal host-UI reference implementation   | Reference   |
| `telephony-fritzbox` | Telephony provider contract v1 over TR-064 | Pre-release |

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
```

Publisher private keys, FLAMOX365 Cloud credentials, generated `dist`
directories, `.edge` state, and `.fmx` artifacts remain outside this repository.
See [CONTRIBUTING.md](CONTRIBUTING.md), [SUPPORT.md](SUPPORT.md), and
[the security policy](SECURITY.md) before contributing or reporting a problem.
