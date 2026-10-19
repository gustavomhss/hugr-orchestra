export const kebab = (value: string) =>
  value
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()

export const missingEnv = (names: ReadonlyArray<string>) => names.filter((name) => !process.env[name])

export const envList = (name: string) =>
  (process.env[name] ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item !== "")

export const unique = (items: ReadonlyArray<string>) => Array.from(new Set(items))

export const classifiedTags = (input: {
  readonly prefix?: string
  readonly provider?: string
  readonly protocol?: string
  readonly tags?: ReadonlyArray<string>
}) =>
  unique([
    ...(input.prefix ? [`prefix:${input.prefix}`] : []),
    ...(input.provider ? [`provider:${input.provider}`] : []),
    ...(input.protocol ? [`protocol:${input.protocol}`] : []),
    ...(input.tags ?? []),
  ])

export const matchesSelected = (input: {
  readonly prefix: string
  readonly name: string
  readonly cassette: string
  readonly tags: ReadonlyArray<string>
}) => {
  const prefixes = envList("RECORDED_PREFIX")
  const providers = envList("RECORDED_PROVIDER")
  const requiredTags = envList("RECORDED_TAGS")
  const tests = envList("RECORDED_TEST")
  const tags = input.tags.map((tag) => tag.toLowerCase())
  const names = [input.name, kebab(input.name), input.cassette].map((item) => item.toLowerCase())

  if (prefixes.length > 0 && !prefixes.includes(input.prefix.toLowerCase())) return false
  if (providers.length > 0 && !providers.some((provider) => tags.includes(`provider:${provider}`))) return false
  if (requiredTags.length > 0 && !requiredTags.every((tag) => tags.includes(tag))) return false
  if (tests.length > 0 && !tests.some((test) => names.some((name) => name.includes(test)))) return false
  return true
}

// Recorded cases that have no cassette yet, each with its reason. Replay fails a case whose cassette is missing unless
// it is here, and fails an entry here whose cassette now exists. Shrink-only: record a case (RECORD=true) and delete
// its entry. Until this ledger existed these cases skipped silently, so a deleted or renamed cassette looked green.
const renamed =
  "the case was renamed after recording: a cassette under its older name sits in the same prefix, unverified as matching this request; re-record"
const never = "never recorded: no cassette was committed for this case"
export const unrecorded: Record<string, string> = {
  "anthropic-messages/rejects-malformed-assistant-tool-order": renamed,
  "bedrock-converse-cache/writes-then-reads-cachepoint-on-identical-second-call": never,
  "openai-chat/openai-chat-gpt-4o-mini-text": renamed,
  "openai-chat/openai-chat-gpt-4o-mini-tool-call": renamed,
  "openai-chat/openai-chat-gpt-4o-mini-tool-loop": renamed,
  "openai-chat/openai-chat-gpt-4o-mini-image-tool-result": never,
  "openai-responses/openai-responses-gpt-5-5-text": renamed,
  "openai-responses/openai-responses-gpt-5-5-tool-call": renamed,
  "openai-responses/openai-responses-gpt-5-5-tool-loop": renamed,
  "openai-responses-websocket/openai-responses-websocket-gpt-4-1-mini-tool-loop": never,
  "anthropic-messages/anthropic-haiku-4-5-text": renamed,
  "anthropic-messages/anthropic-haiku-4-5-tool-call": renamed,
  "anthropic-messages/anthropic-opus-4-7-tool-loop": renamed,
  "gemini/gemini-2-5-flash-text": renamed,
  "gemini/gemini-2-5-flash-tool-call": renamed,
  "gemini/gemini-2-5-flash-image-tool-result": never,
  "xai/xai-grok-3-mini-text": never,
  "xai/xai-grok-3-mini-tool-call": never,
  "xai/xai-grok-4-3-tool-loop": never,
  "openai-compatible-chat/deepseek-chat-text": renamed,
  "openai-compatible-chat/togetherai-llama-3-3-70b-text": renamed,
  "openai-compatible-chat/togetherai-llama-3-3-70b-tool-call": renamed,
  "openai-compatible-chat/groq-llama-3-3-70b-text": renamed,
  "openai-compatible-chat/groq-llama-3-3-70b-tool-call": renamed,
  "openai-compatible-chat/groq-llama-3-3-70b-tool-loop": renamed,
  "openai-compatible-chat/openrouter-gpt-4o-mini-text": renamed,
  "openai-compatible-chat/openrouter-gpt-4o-mini-tool-call": renamed,
  "openai-compatible-chat/openrouter-gpt-4o-mini-tool-loop": renamed,
  "openai-compatible-chat/openrouter-gpt-5-5-tool-loop": renamed,
  "openai-compatible-chat/openrouter-claude-opus-4-7-tool-loop": renamed,
}

export const cassetteName = (
  prefix: string,
  name: string,
  options: { readonly cassette?: string; readonly id?: string },
) => options.cassette ?? `${prefix}/${options.id ?? kebab(name)}`
