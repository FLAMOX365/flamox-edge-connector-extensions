# Contributing

Clone the repository with its commit-pinned Edge Connector dependency and use
Node.js 26.12.0 and Yarn 4.18.1:

```bash
git clone --recurse-submodules \
  https://github.com/FLAMOX365/flamox-edge-connector-extensions.git
cd flamox-edge-connector-extensions
yarn install --immutable
```

Run the complete local gate before opening a pull request:

```bash
yarn check
yarn lint
yarn test:coverage
yarn fmt
yarn audit
yarn validate
yarn build
```

The root tests include shared HTTP/WebDAV/IPP and XML contracts plus a compiled
sandbox scenario for every manifest action. They need the same OS sandbox as the
connector. Local TR-064 and SQL fixtures reserve ports 49000 and 14330; the SQL
scenario verifies TDS pre-login and connection-failure handling, not successful
queries against a real database. Real devices, SQL credentials/TLS and target-OS
packaging require separate qualification. CI executes the tests on Linux, macOS
and Windows. See the pinned connector's `docs/TESTING.md` for the complete matrix.

The root tasks discover complete extension projects below `extensions/`
automatically. A new extension must contain both `extension-manifest.json` and
`package.json`; incomplete directories and duplicate extension ids fail the gate.

Each extension must include focused automated tests and declare the smallest
possible capabilities, network targets, and secret names. Keep the manifest,
configuration schema, UI schema, translations, examples, runtime dependency
record, documentation, and signed-bundle notices synchronized with executable
behavior.

Pin runtime dependencies. Update the Edge Connector submodule only to a public,
reviewed commit and regenerate `yarn.lock` afterwards. Never commit publisher
private keys, access tokens, real device credentials, generated `dist`
directories, `.edge` state, or `.fmx` artifacts.

Use `FLAMOX365` and `Edge Connector` exactly in human-readable text; do not
combine them into one product name. Third-party product names must remain
accurate and must not imply affiliation or endorsement.

By contributing, you agree that your contribution is licensed under the MIT
license in `LICENSE`.
