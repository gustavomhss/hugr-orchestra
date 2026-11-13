---
name: lucy-audit-spec-map
description: "Spec-to-code mapping."
when: "An audit has a written requirement and a relevant implementation to map."
not-when: "There is no identifiable requirement or the work is outside the engagement scope."
---

# Spec-to-code mapping

Read each in-scope requirement from its authoritative revision and cite its exact text and location. Trace it to the implementing path, callers and guards. For each requirement record one status with evidence:

- **implemented**: the inspected implementation supports the stated requirement;
- **partial**: some stated cases are supported and identified cases remain unmet or uncovered;
- **contradicted**: a concrete path conflicts with the requirement;
- **stronger-than-spec**: the implementation demonstrably imposes a stronger condition; do not assume it is a defect;
- **absent**: the scoped, positively controlled search establishes the relevant implementation is absent;
- **undecidable**: evidence is inaccessible, ambiguous or insufficient to choose.

Give each status its source and inspected scope. A search yielding no hits is not proof unless it also finds a known relevant item. A mapping status is not itself a finding: a reportable defect still needs a rule, location, trigger and labelled evidence; otherwise record a question. Do not infer that unexamined requirements are implemented.
