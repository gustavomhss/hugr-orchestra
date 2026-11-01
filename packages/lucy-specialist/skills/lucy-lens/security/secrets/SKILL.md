---
name: lucy-lens-security-secrets
description: "Secrets: triage `pack:gitleaks` items on added lines, and read for credentials reaching logs, errors, URLs and committed config."
when: "Your brief carries `pack:gitleaks` items, or the change handles a token, key, password, credential file, environment value or auth header."
not-when: "A boundary without a credential in it (lucy-lens-security), or a placeholder already marked as one in a test fixture."
---

# Secrets

## Applicability

Every added line in a tracked file, and every path a credential travels in the changed code.

## How to look

1. **Triage each `pack:gitleaks` item.** Open the line. A real secret has a live provider format (a known prefix, length and alphabet), sits outside an example or placeholder, and is not obviously fake (`xxxx`, `changeme`, a repeated character). A test fixture holding a real-format credential still counts: it is in the history once committed. Record each item as pursued with your reason.
2. **Read beyond the pack.** Credentials reaching: a log line or an error message (a header dump, a request object, an environment dump); a URL with userinfo or a token query parameter; an added `.env`, key file or config default; telemetry or a crash report; a model prompt.
3. **Read the removal side.** A secret the change deletes from a file is still in the git history of the commits that added it; that is a finding against the commit, not a fix.

## Classes

- `class:security.secret`: a credential committed, logged, sent or exposed by the change.

## Severity

A live-format credential on an added line is P0. A credential reaching a log or an error message on a main path is P1.

## Limits

- Never repeat the secret's value in a candidate, quote or card. Quote `path:line`, the provider or format, and the line with the value redacted.
- Rotation and history rewriting are not yours to decide; the finding states the exposure.
- An item the pack raised on an unchanged line belongs to debt, not to this change.
