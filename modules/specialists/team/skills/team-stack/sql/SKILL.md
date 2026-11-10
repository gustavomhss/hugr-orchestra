---
name: team-stack-sql
description: "PostgreSQL migration review cues: deployed version, data contracts and lock-sensitive changes."
when: "The assigned change includes a PostgreSQL schema or migration operation."
not-when: "SQL appears only in an unrelated dependency or the database dialect is unknown."
---

# PostgreSQL migrations

Identify the actual deployed PostgreSQL version, affected table size, concurrent workload and before/after data contract. Squawk's default version is not evidence of the project's deployed version. Compare the changed migration with callers and existing data; cite the relevant contract, operation and concrete impact before proposing a `class:contracts.data` candidate. Unknown workload or deployment details are questions, not findings.

- The Squawk `require-concurrent-index-creation` cue concerns index creation: its tagged documentation says, "During normal index creation, table updates are blocked, but reads are still allowed." Assess the actual operation and workload, not a blanket claim that every index change is unsafe. Source: https://github.com/sbdchd/squawk/blob/v2.67.0/README.md#usage
- The `disallowed-unique-constraint` cue concerns the documented UNIQUE example: "Adding a UNIQUE constraint requires an ACCESS EXCLUSIVE lock which blocks reads and writes to the table while the index is built." Check the exact statement, version and affected traffic; do not generalize the example to every constraint. Source: https://github.com/sbdchd/squawk/blob/v2.67.0/README.md#usage

`pack:squawk` output is a candidate to inspect, not a confirmed finding or a guarantee that other SQL is reliable. Evidence comes from the changed statement, relevant caller or data contract and actual conditions. The host controls available checks and configuration; this skill grants no command or build authority. If a check cannot run, report it as not run. Never install or download tools during review.
