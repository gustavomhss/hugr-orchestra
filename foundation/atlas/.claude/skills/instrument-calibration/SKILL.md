---
name: instrument-calibration
description: >
  Before you believe a measurement, prove the instrument can see. The protocol for every claim of the form
  "there are none", "nothing references it", "it is clean", "the test passes" — the positive control, the
  named shell traps that return empty instead of failing, and the rule that a fail-closed default only
  protects against inputs you did not enumerate. Invoke before reporting ANY absence, any count, or any
  green result you have not falsified.
---

# instrument-calibration — prove the instrument can see before you believe what it says

> Every incident below is real, from one session, in one repository. None of them was a subtle bug. Every
> single one returned a **plausible, confident, wrong answer** that would have been reported as fact.

## The law

**Never conclude absence from an empty result.** Run the same query against a case you KNOW exists and show
that the instrument returns rows when rows exist. An empty output has two causes — _there is nothing_, and
_the instrument is broken_ — and they are indistinguishable without the control.

The same law in the other direction: **never conclude presence from a green test.** Break the thing the
test is supposed to be protecting and confirm the test goes red. A test that passes against a broken
implementation is a decoration.

## The positive control, concretely

```
# WRONG — the entire finding rests on an empty result
matches = intersect(A, B)          # → 0. Report "no overlap."

# RIGHT — inject a known member first
probe = any_member_of(B)
assert len(intersect(A ∪ {probe}, B)) == 1     # the instrument CAN see
assert len(intersect(A, B)) == 0               # …so the zero is real
```

Do this **before** the finding leaves your mouth, not after someone doubts it. A zero you have not
calibrated is not a measurement, it is a hope.

**A control must be measured, not assumed.** Checking a secret scanner, the obvious control is a synthetic
AWS or GitHub token — and those are _allowlisted example values that do not fire_. A control you assumed
would trip, and did not, silently converts your test into a tautology.

## Shell traps that return empty instead of failing

Each of these produced a wrong answer that looked like a finding:

| trap                        | what it does                                                                         | defense                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| unmatched glob (zsh)        | **aborts the whole command** — `ls COPYING*` with no match runs nothing              | quote every glob passed to a program: `--include='*.ts'`                         |
| `sed` with a bad expression | swallows the pipeline's output; hid **63 real matches** behind a clean-looking empty | check the exit code, not just the output                                         |
| pattern starting with `-`   | `grep -----BEGIN` parses as options; the class goes silently unsearched              | `grep -e "$pattern"` or `--`                                                     |
| exclusion by basename       | excluding `foo.ts` also excludes `other/dir/foo.ts`                                  | anchor the path                                                                  |
| `cmd \| head` exit code     | `$?` is **head's** status, not the command's                                         | `${PIPESTATUS[0]}`, or check the text                                            |
| `A && echo done`            | prints `error` and `done` on the same line when A partly fails                       | verify by **listing the resulting state**, never by the word you told it to echo |
| zsh word-splitting          | unquoted `$var` holding `"a b"` passes ONE argument, not two                         | arrays, or `${=var}` deliberately                                                |
| `git add -A`                | swept **1300 untracked store blobs** into a commit, twice                            | stage by NAME; `git show --stat` before every push                               |

## Fail-closed has a hole, and it is the expensive one

> **A fail-closed default only protects you against inputs you did NOT enumerate. Enumerating a value
> assigns it a meaning — and a broken call is free to land on it.**

Measured: an adapter invoked `gitleaks detect --source -`. That is not a stdin spelling, so gitleaks
resolved `-` as a path, failed, and exited **1**. The adapter's table documented exit 1 as _a finding_. So a
wrong invocation arrived wearing the one code that means "secret detected", and the door refused **every**
write on any machine with the tool installed. The unknown-exit fallback never ran.

Eleven gates were green. The whole suite was green. **Every test of that adapter injected a fake scanner.**

The generalization: when a component's job is to interpret an external tool's result, a test that fakes the
tool tests your wiring and nothing else. One conformance test against the real binary, **in both
directions**, is worth the entire fake-driven suite.

## A claim about a gate is the most dangerous claim in a repository

A wrong number invites doubt. **"This is protected by a gate" switches the reader's doubt off.**

Measured: a README said `command-doc-guard` fails the build when its command table and the code disagree.
The gate never read the README — it checked the code against the reference pages, which were complete. The
table sat at **ten commands against a shipped surface of twenty-three**, green the entire time.

So: **before writing that a gate guards something, open the gate and confirm it reads that file.** And when
you write the prose around a gate, the sentence's reach must equal the gate's reach — not one metre more.
A separate incident the same day: a ledger row said nothing referenced a package "anywhere outside itself";
the gate's scope was `packages/*/src` by design, and a test suite did exercise it. The gate was right; the
sentence around it was false.

## Artifacts have dates, and open findings get closed

A committed artifact records what was true when it was written. Before publishing a limitation you read in
one, check `git log` on the file the artifact accuses — an "open finding" may have been closed by a commit
made the same day.

## The checklist

Before reporting a measurement:

- [ ] Did I run a **positive control** in the direction of my finding?
- [ ] For a negative result: does the instrument return rows when rows exist?
- [ ] For a green test: does it go **red** when I break the thing it protects?
- [ ] Did I verify the effect by **listing state**, rather than by an echoed word or an exit code through a pipe?
- [ ] If the claim is about a gate: did I open the gate and confirm its scope?
- [ ] Does the reach of my sentence equal the reach of my evidence?
