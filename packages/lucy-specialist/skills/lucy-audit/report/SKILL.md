---
name: lucy-audit-report
description: "Audit report and fix review."
when: "An audit or diligence engagement is ready to report or retest a finding."
not-when: "The brief requests a governed merge verdict rather than an audit report."
---

# Audit report and fix review

State scope, revision, time box, threat model and exclusions. Separate confirmed findings from questions, observations and unexamined coverage. A finding needs its rule or property, location, trigger and labelled quote, tool or probe evidence; include source and version where applicable. Distinguish a direct record from an inference or interview. Do not say no deficiencies or imply the unexamined area is safe.

Map P0, P1, P2 and P3 respectively to audit material weakness, significant deficiency, deficiency and observation; for diligence they map to deal-breaker, price or structure item, condition or remediation and observation. Label confidence high, medium or low as uncalibrated, with the evidence kind that sets it. Security difficulty is separate from impact severity. Human judgment retains legal, risk and business decisions; no developer rating or legal certification.

## Fix-review slot

Keep the finding ID, original revision, trigger and actual evidence alongside the proposed fix revision. Re-examine the same quote path and relevant guards, or have the host replay the original offered tool or probe evidence with the same relevant input. A different passing test does not settle the original trigger. Mark resolved only when the same evidence kind shows that trigger no longer fires; a dismissal needs the accepted reason and supporting evidence. If replay is unavailable, refused or cannot be bound to the right revisions, record a question or not examined, not resolved. An unbuilt host replay capability is not authority to run a command.

Return the audit or diligence report without a merge verdict; no receipt or external posting follows from this skill.
