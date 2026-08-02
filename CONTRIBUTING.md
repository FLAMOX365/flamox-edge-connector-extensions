# Contributing

Clone the repository with its commit-pinned Edge Connector dependency and use
Deno 2.9.4 or newer:

```bash
git clone --recurse-submodules \
  https://github.com/FLAMOX365/flamox-edge-connector-extensions.git
cd flamox-edge-connector-extensions
deno install --frozen
```

Run the complete local gate before opening a pull request:

```bash
deno task check
deno task lint
deno task test
deno task fmt
deno task audit
deno task validate
deno task build
```

The root tasks discover complete extension projects below `extensions/`
automatically. A new extension must contain both `extension-manifest.json` and
`deno.json`; incomplete directories and duplicate extension ids fail the gate.

Each extension must include focused automated tests and declare the smallest
possible capabilities, network targets, and secret names. Keep the manifest,
configuration schema, UI schema, translations, examples, runtime dependency
record, documentation, and signed-bundle notices synchronized with executable
behavior.

Pin runtime dependencies. Update the Edge Connector submodule only to a public,
reviewed commit and regenerate `deno.lock` afterwards. Never commit publisher
private keys, access tokens, real device credentials, generated `dist`
directories, `.edge` state, or `.fmx` artifacts.

Use `FLAMOX365` and `Edge Connector` exactly in human-readable text; do not
combine them into one product name. Third-party product names must remain
accurate and must not imply affiliation or endorsement.

By contributing, you agree that your contribution is licensed under the MIT
license in `LICENSE`.
