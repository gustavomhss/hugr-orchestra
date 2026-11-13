// The pipeline read when Rag Studio opens.
// A stale read (a newer directory already replaced it) is not this request.
// A failed current read does not invent embedding off and does not replace the previous pipeline.
// The failure is reported and does not reject.

export function settlePipelineRead<T>(input: {
  read: Promise<T> | undefined
  current: () => boolean
  apply: (value: T) => void
  report: (error: unknown) => void
}) {
  if (!input.read) return Promise.resolve(false)
  return input.read.then(
    (value) => {
      if (!input.current()) return false
      input.apply(value)
      return true
    },
    (error: unknown) => {
      if (!input.current()) return false
      input.report(error)
      return false
    },
  )
}

// Off is only a read that confirmed an empty model. Unknown is not off.
export function pipelineClaim(known: boolean, model: string) {
  if (!known) return "unknown" as const
  if (model.length > 0) return "named" as const
  return "off" as const
}
