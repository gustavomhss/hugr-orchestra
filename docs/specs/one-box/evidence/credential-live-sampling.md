# Actual task grant — bounded non-disclosure/storage sample

After visual approval the technical campaign resumed without changing approved materials. A guarded script used
the production Credential service against exactly the existing disposable `inbox-slack-consent-iy50xfl2` database,
credential key and XDG roots, with inheritance disabled. It refused a different root/database, an inherited grant,
anything other than the single actual task OAuth grant or absent/implausibly short secret controls.

The scanner held the actual access/refresh strings only in process memory. Before trusting absence, it detected
each actual value inside an independent synthetic prefix/value/suffix buffer. It then checked:

- Four successful authenticated production API responses: `/api/inbox`, `/api/inbox/slack`,
  `/api/inbox/slack/scope` and `/api/inbox/feeds`, scoped to the populated disposable project.
- The actual `inbox.db`, `inbox.db-wal` and `inbox.db-shm` bytes. Presence of the real database was required.
- A final production Credential reread confirmed both strings remained equal, so concurrent rotation did not
  invalidate the values used in the scan.

Neither secret string appeared in these sampled API responses or SQLite files. The script printed only control
booleans and route/file totals, never secret values or hashes. It did not call a refresh endpoint, change expiry,
export browser cookies, modify the database, restart a service or send a message.

This samples these exact values and artifacts at this time. It does not inspect all logs/browser storage, cover
transformed/encoded representations or prove a universal absence of leaks. The successful Credential reads prove
that the grant remains decryptable; the file scan checks that the same plaintext values are not present in the
sampled SQLite artifacts, rather than independently reviewing the cipher implementation.
