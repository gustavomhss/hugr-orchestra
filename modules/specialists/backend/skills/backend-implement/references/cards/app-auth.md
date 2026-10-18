# Application authorization

## Applicability

The packet assigns implementing supplied application identity and resource rules: an allow and deny matrix, resource or tenant binding, or token verification for the application's users.

## Non-trigger

- Preserving existing auth unchanged while doing other work.
- Auditing security, choosing an identity architecture, or changing your own or the harness's grants.

## Inputs

- The trusted principal source.
- The allow and deny matrix, and the resource or tenant binding.
- The selected auth library and version.
- When JWT is used: the algorithm allowlist, issuer and audience profile.
- The denial status and effects for each case.

## Steps

1. Wire the existing verifier.
2. Place the prescribed resource checks before protected effects.
3. Map each denial to the prescribed status and effects.

## Tools and outputs

- The selected auth library and existing fixtures.
- Output: the enforcement code.

## Limits and checks

- Framework hooks, list filtering, create policy and token verification are different enforcement points. An object-level check does not filter list results or authorize creation.
- Validation is not authorization.
- A JWT algorithm allowlist and audience validation are separate obligations; do not assume the library already enforces the supplied profile.
- Checks: the authorized control succeeds; each specified wrong principal, resource or token is denied with the prescribed status and no effect.
- Guards and mappers within the policy are yours. A missing trust profile or contradictory permissions is a `packet` blocker naming the policy owner.
