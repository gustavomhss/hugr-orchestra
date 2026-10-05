// A Task's `subagent_type` is the agent's stable id; its label is only rendered (F1.11). Agents without an id come
// from servers that predate ids, where the name is the key and was matched case-insensitively.
export function findTaskAgent<T extends { id?: string; name: string }>(raw: string, list: readonly T[] | undefined) {
  return (
    list?.find((entry) => (entry.id ?? entry.name) === raw) ??
    list?.find((entry) => entry.id === undefined && entry.name.toLowerCase() === raw.toLowerCase())
  )
}
