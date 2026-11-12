import { Cause } from "effect"

/** Convert typed failures without dropping adjacent defects, interruption or reason annotations. */
export function dieFailures<E>(cause: Cause.Cause<E>): Cause.Cause<never> {
  return Cause.fromReasons(cause.reasons.map((reason) =>
    reason._tag === "Fail"
      ? Cause.makeDieReason(reason.error).annotate(reason.annotations)
      : reason))
}
