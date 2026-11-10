// The only host-owned ast-grep rules. The pack writes these into its scan file; the JSON parser accepts no other id.
// TypeScript here is the ast-grep language, not Tsx: 0.45.3 treats `.tsx` as a separate language.
export const pattern = "eval($$$ARGS)"

export const rules = [
  { id: "lucy-js-eval", language: "JavaScript" },
  { id: "lucy-ts-eval", language: "TypeScript" },
] as const

export function knownRule(id: string) {
  return rules.some((rule) => rule.id === id)
}
