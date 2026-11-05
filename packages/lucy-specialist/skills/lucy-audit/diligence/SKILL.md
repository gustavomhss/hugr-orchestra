---
name: lucy-audit-diligence
description: "Technical due diligence."
when: "The brief requests repository-scoped technical diligence."
not-when: "The engagement is a standard diff review or asks for a human-only diligence conclusion."
---

# Technical due diligence

Scope the repository evidence and time box. Organize observations across team, delivery, codebase, security/compliance and fit with the stated business context. For each, distinguish directly observed facts from estimates and unanswered questions. Git history, dependency inventory and CI records can inform a picture; they cannot establish production practice or explain why a decision was made. Never score individual developers.

Interviews, pricing, live-system penetration tests, production access and commercial or legal decisions require humans. List these as human decisions or not examined, not as checks passed. A licence inventory or scan is not a legal certification.

Use P0–P3 for evidenced findings and the due-diligence labels deal-breaker, price or structure item, condition or remediation, and observation respectively. Those are impact mappings, not a deal or valuation decision. Include the evidence kind and uncalibrated confidence. Return a report without a merge verdict; report unsupported claims as questions and scope limits explicitly.
