# Review R1

Frozen. If a cited file changes, this review is void and a new id starts. The demand does not change during R1.

## Goal

One question per seam: does B cover A, and does B add a rule A did not state? Pass means zero findings marked accept.

## Seams

| Id | A (frozen) | B (frozen) | Agent sees |
|---|---|---|---|
| S1 | `docs/specs/live-seat/one-box.md` | `docs/specs/one-box/REQUIREMENTS.md` | those two only |
| S2 | `REQUIREMENTS.md` | `SPEC.md` | those two only |
| S3 | `one-box.md` | `DESIGN.md` | those two only |
| S4 | `REQUIREMENTS.md` | `WPS.md` | those two only |
| S5 | `SPEC.md` | `CONTRACT.md` | those two only |
| S6 | `one-box.md` | the other four pack files | contradiction only |

Out of every seam: implementation, file layout as a product rule, a previous verdict, and any sentence that tells the agent what verdict to return.

## What a finding is

| Mark | Rule |
|---|---|
| accept | The clause is in frozen A, and no item in B covers it. |
| sharpen | An item exists and cannot pass or fail. |
| reject | The clause is not in frozen A. It does not become a requirement. It does not start another review. |

## Stop

Two consecutive passes of the same frozen texts with zero accept. Sharpen is fixed once, then that seam is run again. Reject does not reopen the loop. The lead writes the disposition table. The agent does not.

## R1 disposition

Inputs were the files named above. S2, S4, S5, and S6 returned covers. S1 and S3 returned findings. Marks are against `docs/specs/live-seat/one-box.md`, not against a rewritten prompt.

| Finding | Mark | Why |
|---|---|---|
| Meeting data must be in the local database, not only barred from git, Atlas, Relay, sync, and telemetry | accept | The record says meeting data stays in the local database. A28 only failed an external write. |
| Discord is not the reason to start | accept | The record says that. J2 allowed Discord with Slack and did not say it. |
| Deep link must open the original, and reactions, presence, typing, huddles, calls, and screen share must not be shown | sharpen | A22 banned actions and did not say the link opens the original. The record bans the features, not only buttons. |
| J1 must use the record's words: not a client that replaces Slack, Teams, or mail | sharpen | "Rebuilt" was a different criterion. |
| Agent does not send. The pane draft is the user's action, not an agent tool | sharpen | A9 forbade the seat from drafting, which collides with the pane draft the record requires. |
| Handoff carries item ids and never transcript | sharpen | A23 also forbade promise text. The record does not. |
| A26 names a macOS notification feed, not every notification feed | sharpen | The record names macOS. |
| Waiting is not "latest message from the other party" | reject | The record says who is waiting, and names the actions that empty the list. It does not define waiting as the last speaker. Removed from A4. |
| A message that mentions payment, health, or a password is still an item | reject | Not in the record. Removed from A27. |
| Send does not change the stored inbound | reject | The record says send is a new egress. It does not say the inbound row is immutable. Removed from A32. |
| A review or mention off the user's PR is an item | reject | The record says "review, mention, CI on the user's PR". It does not require the off-PR case. Removed A34. |
| Reply-capability as a required field | reject | The record says a source can reply. It does not name a field. The flag stays in the contract as the encoding of that reply, not as a new demand. |

## R1b

S3 returned covers on the sentences that R1 had marked accept. S1 returned gaps. Checked against `REQUIREMENTS.md`, not against the shortened prompt.

| Finding | Mark | Why |
|---|---|---|
| WhatsApp is not a source; door does not type, scrape, or send; ban evasion, proxy, hidden scraper | reject | Already in A21 and A26. The confirmation prompt omitted those clauses. A shortened prompt is not a gap in the file. |
| A2, A10, A21, A22 conditions | reject | The file already names the key, the return of remind-tomorrow, the provenance, and "when richer than text". The prompt did not. |
| A23 requires every item to carry both ids | reject | The file is conditional: only when the actor is already that person, and only when that person has an open commitment. |
| Two items still open are not ordered by which source is newer | sharpen | A4 already said order is not by source. The "including between two items still open" clause is now in A4 so that reading can fail. |

No further review is open. A finding from a shortened prompt does not start another pass.
