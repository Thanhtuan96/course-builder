# bridge-origin-isolation Specification

## Purpose

Define the real-browser proof that a page served from a non-Studio origin cannot reach the local
bridge, with or without the pairing token, while the same call from the Studio origin succeeds
against unweakened guards.

## Requirements
### Requirement: A foreign origin cannot reach the bridge in a real browser

The suite SHALL serve a minimal page from a third origin (a port inside 3010–3099 that is neither
the Studio origin nor the bridge origin). From that page in Chromium it SHALL call the bridge health
endpoint both with the valid pairing token and without it, and SHALL assert that both calls are
blocked by the browser or rejected by the bridge. No Node-only shortcut MAY replace this proof.

#### Scenario: Foreign origin with the token is blocked

- **WHEN** the foreign page fetches `<bridge>/api/studio/health` with the valid `X-Studio-Token`
- **THEN** the fetch rejects (CORS failure) or resolves with status 403, and no agent/capability
  payload is exposed

#### Scenario: Foreign origin without the token is blocked

- **WHEN** the foreign page fetches `<bridge>/api/studio/health` with no token
- **THEN** the fetch rejects or resolves with status 401/403, and no agent/capability payload is
  exposed

### Requirement: The Studio origin can reach the same bridge

In the same run, the Studio origin SHALL call the same bridge endpoint with the same token and
SHALL receive a successful response. This control proves the block is origin-based, not a general
outage.

#### Scenario: Studio origin succeeds

- **WHEN** the Studio page calls `<bridge>/api/studio/health` with the valid token
- **THEN** the response is 200 and the JSON body contains `ok: true`

### Requirement: The isolation proof runs against unweakened guards

The bridge under test SHALL run with `STUDIO_ORIGINS` set to exactly the Studio test origin and SHALL
NOT set `STUDIO_ALLOW_NON_LOOPBACK` or a wildcard origin for the spec. The spec MUST NOT patch or
disable product guards.

#### Scenario: Bridge environment keeps the default denial

- **WHEN** the bridge process for the isolation spec starts
- **THEN** `STUDIO_ORIGINS` equals the Studio test origin only, `STUDIO_ALLOW_NON_LOOPBACK` is unset,
  and the foreign origin is not listed

#### Scenario: Spec uses no guard bypass

- **WHEN** the isolation spec is inspected
- **THEN** it uses only browser fetches and visible assertions; it does not stub the bridge, alter
  Origin headers from Node, or edit `web/studio-api/**`

