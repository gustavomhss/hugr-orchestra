# JavaScript and TypeScript

## Applicability

An assigned change to a JavaScript or TypeScript HTTP service component. The frozen tuple is Node.js `22.18.0`, Express `5.1.0` (router `2.2.0`) or Fastify `5.6.1`, Zod `4.1.8` for wire validation, and pg `8.16.3` for PostgreSQL. Bun `1.3.14` applies only where the packet selects Bun as the runtime. The lock file governs; where it differs from this tuple, the version notes below are unverified for that project. Express 4 and Fastify 4 components are covered as delta sections inside the framework references.

After this card, read only the references the assigned component uses:

- [Express](../frameworks/js-ts/express.md): routes and middleware on Express 5 or 4.
- [Fastify](../frameworks/js-ts/fastify.md): plugin routes, hooks and schemas on Fastify 5 or 4.

The general procedures in [cancellation](../lifetimes/cancellation.md) and [atomic writes](../data/transaction.md) still apply; this card gives their JavaScript form.

## Non-trigger

- A package in the lock file, a Bun lockfile or a package script. Select by the component and runtime the packet assigns; Bun as package manager does not select Bun as runtime.
- Converting JavaScript to TypeScript, switching module format (ESM or CommonJS), framework, validator or driver. Each is a `packet` blocker.
- Hono, NestJS, Effect or Next.js components: no reference here covers them.

## Inputs

- Runtime and version, module format, the build or loader path, and the package's typecheck and test commands.
- The files and mount points to change, the auth and error boundaries, and the existing schema module.
- The database driver and who owns transactions.

## Steps

1. Treat wire input as `unknown` and parse it at runtime: `const result = Input.safeParse(body)`, then use only `result.data`. Types, `as` casts and generics validate nothing. A Zod `z.object` strips unknown keys by default; `z.strictObject` rejects them.
2. In TypeScript use `import type` for type-only imports where the project's `verbatimModuleSyntax` or type stripping needs it.
3. Await every promise in the request path. A promise neither awaited nor returned (`void work()`) is detached: its failure never reaches the error mapper and its effect may land after the response.
4. Classify errors by `instanceof` or a stable `code` property (pg reports SQLSTATE in `err.code` and the constraint in `err.constraint`), never by message text.
5. With pg, run a transaction on one checked-out client:
   ```ts
   const client = await pool.connect()
   try {
     await client.query("BEGIN")
     // every statement: client.query(text, values)
     await client.query("COMMIT")
   } catch (err) {
     await client.query("ROLLBACK")
     throw err
   } finally {
     client.release()
   }
   ```
   `pool.query` may use a different connection per call, so it never belongs inside a transaction. Pass values as parameters (`$1`), never by string concatenation.
6. Propagate cancellation with an `AbortSignal` to work that accepts one. Aborting the HTTP request cancels neither a running SQL statement nor a committed write.
7. Answer success only after the commit resolved; project the response from the parsed result, never the raw row.

## Tools and outputs

- Scoped to the package: its typecheck (for example `bun typecheck`, `tsc --noEmit` through the package script) and its test runner on the assigned files.
- Outputs: handwritten routes, schemas, services and tests. Generated clients and schemas are regenerated, never edited.
- Toolkit engines ([recipes](../recipes/external/index.md)), only for the artifacts the packet assigns: ast-grep for bounded syntax rewrites, buf for Protobuf schema checks, kiota for API clients from an OpenAPI description, orval for TypeScript clients and Zod schemas from an OpenAPI description, protoc-gen-es for TypeScript code from Protobuf schemas, kysely-codegen for Kysely table types from a supplied database.

## Limits and checks

- Node.js `22.18.0` strips erasable TypeScript types without typechecking; it ignores `tsconfig` paths and rejects enums and parameter properties unless a transform is configured. Running a file is not a typecheck.
- Bun `1.3.14` also skips typechecking. Its Node compatibility is partial (`node:http` client request bodies are buffered, `module.register` is missing, Node-API and `node:test` are partial), so Node evidence does not cover a Bun deployment.
- A mocked repository proves nothing about SQL, binding or rollback; data changes need the supplied real database.
