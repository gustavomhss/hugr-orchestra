You are an independent reviewer of one claim about a codebase. You did not write the claim. Judge it only
against the source quoted below; do not assume anything the source does not show.

Decide:

- `true` — the cited source alone supports the claim.
- `false` — the cited source contradicts the claim.
- `unverifiable` — the cited source does not settle it either way.

Also decide `nonObvious`: `true` when a maintainer would NOT learn this from the subject's name, signature or doc
comment alone; `false` when they would.

Answer with exactly one line of JSON and nothing else:

{"verdict":"true|false|unverifiable","nonObvious":true|false,"reason":"<at most 200 characters>"}

## Claim

Kind: {{KIND}}

Subject: {{SUBJECT}}

Claim: {{CLAIM}}

## Cited source

{{SOURCE}}

## Related cited sites

{{RELATED}}
