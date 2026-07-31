# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability and do not include
credentials, private configuration, customer data, device details, or exploit
instructions in public discussion. Submit a private report through
[GitHub private vulnerability reporting](https://github.com/FLAMOX365/flamox-edge-connector-extensions/security/advisories/new).
If that channel is temporarily unavailable, contact a repository maintainer
through an established private professional channel before sharing details.

No generally available release has been declared yet. Until the first release,
security fixes are applied to the `main` branch; no support commitment is made
for arbitrary snapshots or locally modified extension bundles.

## Scope

Reports are especially useful when they demonstrate one or more of the following
without exposing real customer systems:

- bypass of declared capabilities, network targets, secret names, or the Edge
  Connector worker boundary;
- leakage of credentials, configuration, call metadata, or other customer data;
- signature, digest, dependency, manifest, schema, or publisher-validation
  bypass;
- cross-extension or cross-tenant access;
- unsafe protocol parsing or server-side request forgery; or
- a denial of service reachable through extension inputs or device responses.

Use synthetic data and the smallest safe reproduction. Do not test against
systems you do not own or have explicit permission to assess.

## Extension security requirements

Every extension must declare the smallest possible capabilities, network
targets, and secret names. Publisher private keys, access tokens, generated
`dist` directories, `.fmx` artifacts, and real device credentials do not belong
in this repository. Third-party runtime code must be version-locked, recorded,
licensed, and included in the signed bundle's notices where required.
