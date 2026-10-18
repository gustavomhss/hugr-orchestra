# Atomic writes

## Applicability

Assigned writes or invariants that must share a supplied transaction.

## Non-trigger

- A read-only mapping.
- A remote HTTP call assumed to join a SQL transaction. It never does.
- Choosing the isolation level or the persistence topology.

## Inputs

- The exact database and adapter.
- Whether the transaction already exists and is passed in, or is owned by your code.
- Required affected-row, cardinality and conflict behavior.
- The supplied error and result mapping.

## Steps

1. Validate the supplied input contract.
2. Acquire or receive the correct handle. A typed query object alone does not tell you which transaction it runs in.
3. Run every parameterized write, and every required result check, through that handle.
4. Propagate failure. Only the transaction owner commits or rolls back; a borrowed handle never authorizes a nested begin or an independent commit.

## Tools and outputs

- The selected driver or ORM, and the query generator when assigned.
- Output: a repository or helper bound to the client or transaction, its error mapping, and fixture cases. Generated types stay native artifacts, never hand-faked transaction proof.

## Limits and checks

- Async drivers: await every statement, including begin and commit, on one checked-out client; generated query objects must be bound to the transaction.
- Some synchronous adapters run the transaction callback without awaiting it. Then every participating write is synchronous and finishes before the callback returns; copying an async callback from another adapter silently breaks atomicity. Follow your adapter's reference.
- Using the pool or an outer handle for one write escapes the transaction while still compiling.
- Checks: the commit path persists every write; an injected later failure leaves none of them, observed from a second connection. The assertion must tell an escaped write apart from a rollback.
- SQL and helper layout are yours. Writes spanning stores without a supplied design, conflicting transaction ownership, or unspecified retry semantics where retry is assigned, is a `packet` blocker.
