export function renderEffectMake(api: string) {
  return `export const make = (options?: { readonly baseUrl?: URL | string; readonly headers?: Readonly<Record<string, string>> }) => {
  if (options?.headers === undefined) return HttpApiClient.make(${api}, options).pipe(Effect.map(adaptClient))
  // Snapshot and validate host configuration now, before this Effect can be executed or reused.
  const headers = snapshotHeaders(options.headers)
  if (Object.keys(headers).length === 0) return HttpApiClient.make(${api}, options).pipe(Effect.map(adaptClient))
  // Fetch must supply the multipart boundary; only explicit request headers may override it.
  const formHeaders = Object.fromEntries(Object.entries(headers).filter(([name]) => name !== "content-type"))
  return HttpApiClient.make(${api}, {
    baseUrl: options.baseUrl,
    transformClient: (client) => HttpClient.mapRequest(client, (request) =>
      HttpClientRequest.setHeaders(request, { ...(request.body._tag === "FormData" ? formHeaders : headers), ...request.headers })),
  }).pipe(Effect.map(adaptClient))
}

function snapshotHeaders(input: Readonly<Record<string, string>>) {
  if (typeof input !== "object" || input === null ||
    (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)) {
    throw new TypeError("Invalid client headers")
  }
  const entries = Object.entries(Object.getOwnPropertyDescriptors(input)).flatMap(([name, descriptor]) => {
    if (!/^[!#$%&'*+.^_|~0-9A-Za-z\\x60-]+$/.test(name) || !("value" in descriptor) ||
      typeof descriptor.value !== "string" || /[\\r\\n]/.test(descriptor.value)) {
      throw new TypeError("Invalid client headers")
    }
    return descriptor.enumerable ? [[name, descriptor.value] as const] : []
  })
  try {
    return Object.freeze(Object.fromEntries(new Headers(Object.fromEntries(entries))))
  } catch (error) {
    if (error instanceof TypeError) throw new TypeError("Invalid client headers")
    throw error
  }
}`
}

export function renderInputField(
  field: { readonly name: string; readonly source: string; readonly optional?: boolean },
  inputMode: "none" | "optional" | "required",
) {
  const key = JSON.stringify(field.name)
  const value = `input${inputMode === "optional" ? "?." : ""}[${key}]`
  // Strict optional keys accept absence, not an own property whose value is undefined.
  return field.source === "query" && field.optional
    ? `...(${value} === undefined ? {} : { ${key}: ${value} })`
    : `${key}: ${value}`
}
