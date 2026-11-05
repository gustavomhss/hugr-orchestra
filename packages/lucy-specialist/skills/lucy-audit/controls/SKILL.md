---
name: lucy-audit-controls
description: "Control evidence."
when: "An audit brief includes change, access or supply-chain controls."
not-when: "No control or relevant evidence is in scope."
---

# Control evidence

Identify the written control, scope, period and population before examining evidence. Inspect design separately from operation: a policy can specify separation of duties while actual approvals show whether it operated. For machine-readable PR, merge or deployment records, examine the whole available population; sample only where judgment is needed, and disclose the sample, population and missing records. A person's assertion or interview alone is not evidence that a control operated.

Compare original records against the control: author versus approver, branch protection, required checks, changed tests, dependency pinning and token permissions where relevant. Prefer independent over internal, direct over indirect and original over converted evidence. An unavailable record is not a clean population. A concrete exception requires rule, location, trigger and labelled evidence; a mere exposure or tool hit remains a question until verified.

For provenance, use only the supported SLSA Build L2/L3 facts established in the engagement's sources. SSDF v1.1 is identified in the verified research; its detailed practice tables and Scorecard are not captured. ISO 27001/27002 and SOC 2 wording is inferred, not quoted authoritative text; ask a human to assess applicability and interpretation. Do not assert certification, attestation or overall compliance. If population access or a host technique is unavailable, record not run and its reason.
