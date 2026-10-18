# Query and result mapping

## Applicability

An assigned query or write, result mapping or repository change on the existing schema.

## Non-trigger

- A persisted schema or data transition: that is an [assigned migration phase](migration-phase.md).
- A read-time substitution is not a backfill. Exposing `name` as `display_name` with `COALESCE(name, 'Unknown')` changes reads only; stored NULLs stay NULL. Select by the assigned outcome, not by the presence of a `.sql` file.

## Inputs

- The schema revision.
- Result, cardinality, null and conflict rules.
- Predicates and tenant authority.
- The transaction owner, and isolation and retry semantics where relevant.

## Steps

1. Write the SQL or builder expression with parameters, never string interpolation of input.
2. Regenerate the selected typed bindings when the query changes.
3. Bind each call to the supplied transaction handle, when there is one. Begin and commit ownership follows the packet; see [atomic writes](transaction.md).
4. Map results into the supplied DTO, including empty and NULL results.

## Tools and outputs

- The selected query generator and driver.
- Toolkit checks, only when the packet assigns them: [postgres-language-server](../recipes/external/postgres-language-server.md) type-checks PostgreSQL SQL against a supplied database; [sqlglot](../recipes/external/sqlglot.md) parses or transpiles Spark and other-dialect SQL.
- Output: the query, the bindings and the repository delta.

## Limits and checks

- Typed output is not evidence that row, NULL, tenant or atomicity assertions passed.
- A generated "many" query usually returns a materialized list. It is not a streaming API; streaming needs [streams and batches](../lifetimes/streams.md).
- Checks run on the actual engine: expected rows, empty and NULL cases, tenant isolation, and atomicity where assigned.
- Joins, expressions and parameterization are yours. Unclear isolation or business semantics, or a schema that is unavailable, is a `packet` blocker naming the data owner.
