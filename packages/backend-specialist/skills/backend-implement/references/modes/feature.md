# Feature mode

## Applicability

New behavior the packet specifies: its inputs, results, errors and the behavior to preserve. A feature has no diagnosis prerequisite.

## Non-trigger

- A symptom-only request such as "the endpoint is broken": that is a [repair](repair.md) and needs a supplied diagnosis.
- "Design the backend" or choosing a framework: architecture belongs to its owner.
- A change to existing accepted behavior labelled as cleanup: return a `packet` blocker quoting the contradiction.

## Inputs

- The shared packet fields.
- Intended inputs, results and error mapping, plus behavior to preserve.
- Domain decisions the change depends on, such as a transaction or locking design or an authorization policy.
- Not required: a diagnosis, exact line spans, prewritten SQL or every helper.

## Steps

1. Implement the supplied contract through the existing seams the packet names.
2. When the selected recipe uses a generator, regenerate only the affected canonical artifacts, then wire the handwritten behavior to them.
3. Wire the behavior to the real boundary, such as the mounted route or the registered handler.
4. Run the assigned positive, boundary and preservation cases.

## Tools and outputs

- Native read and edit tools, the compiler, and the generators and test runners the packet or project names.
- Output: a usable implementation wired to the real boundary, the generated artifacts it needs, and the observed check results.

## Limits and checks

- Compiler or generator success alone does not meet the acceptance. A generated stub is not the feature.
- Missing business semantics or a new architecture boundary is a `packet` blocker that names the owner.
- Example evidence for an owner-only debit endpoint: with balance 100, two competing debits of 70 yield one success, one conflict, balance 30 and one ledger entry; a forbidden owner and invalid input cause no write.
