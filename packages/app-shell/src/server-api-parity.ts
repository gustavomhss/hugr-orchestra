// The drift gate: the contract (`@/server-api`) and the adapter (`@/utils/server`) must describe one API.
//
// The contract is hand-written and the adapter is built from the generated client, so the two can drift apart:
// a group or method that only one side has, or an input that accepts what the wire rejects. These assertions
// make that a compile error instead of a runtime surprise. The outputs stay out of the gate on purpose: the
// contract keeps the app's legacy view of them (mutable envelopes, optional fields), and only the outputs that
// are wrong about the wire are fixed by hand.

import type { ServerApi } from "@/server-api"
import type { ServerAdapter } from "@/utils/server"

type Assert<T extends true> = T

type Fn = (...args: never[]) => unknown

type FirstArg<F> = F extends (first: infer First, ...rest: never[]) => unknown ? First : never

/** Where the contract and the adapter disagree. `never` when they agree. */
export type ServerApiDrift = Drift<ServerAdapter, ServerApi, "api">

type Drift<A, D, Path extends string> = [A] extends [Fn]
  ? [D] extends [Fn]
    ? [FirstArg<D>] extends [FirstArg<A>]
      ? [FirstArg<A>] extends [FirstArg<D>]
        ? never
        : `${Path}: the adapter accepts an input the contract rejects`
      : `${Path}: the contract accepts an input the adapter rejects`
    : `${Path}: the contract declares a callable the adapter does not provide`
  : [D] extends [Fn]
    ? `${Path}: the adapter provides a callable the contract does not declare`
    : GroupDrift<A, D, Path>

type GroupDrift<A, D, Path extends string> = {
  [K in keyof A | keyof D]: K extends keyof A
    ? K extends keyof D
      ? Drift<A[K], D[K], `${Path}.${K & string}`>
      : `${Path}.${K & string}: the adapter provides it but the contract does not declare it`
    : `${Path}.${K & string}: the contract declares it but the adapter does not provide it`
}[keyof A | keyof D]

export type ServerApiParity = Assert<
  [ServerApiDrift] extends [never]
    ? true
    : { "the contract and the adapter disagree": { [K in ServerApiDrift]: true } }
>
