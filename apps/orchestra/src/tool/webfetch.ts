import { Effect, Schema, Stream } from "effect"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"
import { Parser } from "htmlparser2"
import { Tool } from "./tool"
import TurndownService from "turndown"
import DESCRIPTION from "./webfetch.txt"
import { isImageAttachment } from "@/util/media"
import { ResearchSourceCapture } from "@/research/source-capture"

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024 // 5MB
const DEFAULT_TIMEOUT_SECONDS = 30
// A zero, negative or unbounded timeout would fail every request at once or hold the turn open indefinitely.
const MIN_TIMEOUT_SECONDS = 1
const MAX_TIMEOUT_SECONDS = 120

export const Parameters = Schema.Struct({
  url: Schema.String.annotate({ description: "The URL to fetch content from" }),
  format: Schema.Literals(["text", "markdown", "html"])
    .annotate({
      description: "The format to return the content in (text, markdown, or html). Defaults to markdown.",
      default: "markdown",
    })
    .pipe(Schema.withDecodingDefault(Effect.succeed("markdown" as const))),
  timeout: Schema.optional(
    Schema.Number.check(Schema.isBetween({ minimum: MIN_TIMEOUT_SECONDS, maximum: MAX_TIMEOUT_SECONDS })),
  ).annotate({ description: `Optional timeout in seconds (${MIN_TIMEOUT_SECONDS} to ${MAX_TIMEOUT_SECONDS}, default ${DEFAULT_TIMEOUT_SECONDS})` }),
})

export const WebFetchTool = Tool.define(
  "webfetch",
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    const httpOk = HttpClient.filterStatusOk(http)

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          if (!params.url.startsWith("http://") && !params.url.startsWith("https://")) {
            throw new Error("URL must start with http:// or https://")
          }

          yield* ctx.ask({
            permission: "webfetch",
            patterns: [params.url],
            always: ["*"],
            metadata: {
              url: params.url,
              format: params.format,
              timeout: params.timeout,
            },
          })

          const timeout = (params.timeout ?? DEFAULT_TIMEOUT_SECONDS) * 1000

          // Build Accept header based on requested format with q parameters for fallbacks
          let acceptHeader = "*/*"
          switch (params.format) {
            case "markdown":
              acceptHeader = "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1"
              break
            case "text":
              acceptHeader = "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1"
              break
            case "html":
              acceptHeader =
                "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1"
              break
            default:
              acceptHeader =
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
          }
          const headers = {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
            Accept: acceptHeader,
            "Accept-Language": "en-US,en;q=0.9",
          }

          const request = HttpClientRequest.get(params.url).pipe(HttpClientRequest.setHeaders(headers))

          // Retry with honest UA if blocked by Cloudflare bot detection (TLS fingerprint mismatch)
          const response = yield* httpOk.execute(request).pipe(
            Effect.catchIf(
              (err) =>
                err.reason._tag === "StatusCodeError" &&
                err.reason.response.status === 403 &&
                err.reason.response.headers["cf-mitigated"] === "challenge",
              () =>
                httpOk.execute(
                  HttpClientRequest.get(params.url).pipe(
                    HttpClientRequest.setHeaders({ ...headers, "User-Agent": "orchestra" }),
                  ),
                ),
            ),
            Effect.timeoutOrElse({ duration: timeout, orElse: () => Effect.die(new Error("Request timed out")) }),
          )

          // Check content length
          const contentLength = response.headers["content-length"]
          if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
            throw new Error("Response too large (exceeds 5MB limit)")
          }

          const chunks = yield* Stream.runFoldEffect(response.stream,
            () => ({ chunks: Array<Uint8Array>(), bytes: 0 }), (state, chunk) => {
              if (state.bytes + chunk.byteLength > MAX_RESPONSE_SIZE)
                return Effect.die(new Error("Response too large (exceeds 5MB limit)"))
              state.chunks.push(chunk)
              return Effect.succeed({ chunks: state.chunks, bytes: state.bytes + chunk.byteLength })
            }).pipe(Effect.timeoutOrElse({ duration: timeout, orElse: () => Effect.die(new Error("Request timed out")) }))
          const arrayBuffer = Buffer.concat(chunks.chunks)

          const contentType = response.headers["content-type"] || ""
          const mime = contentType.split(";")[0]?.trim().toLowerCase() || ""
          const title = `${params.url} (${contentType})`
          const capture = yield* ResearchSourceCapture.Current
          const received = capture ? yield* capture({
            origin: { kind: "url", uri: response.request.url }, representation: "received", mediaType: contentType || "application/octet-stream",
            content: arrayBuffer, complete: true,
          }) : undefined

          if (isImageAttachment(mime)) {
            const base64Content = Buffer.from(arrayBuffer).toString("base64")
            return {
              title,
              output: "Image fetched successfully",
              metadata: { ...(received ? { researchSource: received } : {}) },
              attachments: [
                {
                  type: "file" as const,
                  mime,
                  url: `data:${mime};base64,${base64Content}`,
                },
              ],
            }
          }

          const content = yield* Effect.try({
            try: () => new TextDecoder("utf-8", { fatal: capture !== undefined }).decode(arrayBuffer),
            catch: () => new Error("Research response is not lossless UTF-8 text"),
          })

          // Handle content based on requested format and actual content type
          const html = contentType.includes("text/html")
          const output = html && params.format === "markdown" ? convertHTMLToMarkdown(content)
            : html && params.format === "text" ? extractTextFromHTML(content) : content
          const selected = capture && received ? yield* capture({
            origin: received.origin, representation: params.format,
            mediaType: params.format === "html" ? "text/html" : params.format === "markdown" ? "text/markdown" : "text/plain",
            content: output, complete: true, derivedFrom: received.ref,
            transformation: html && params.format !== "html" ? `webfetch-${params.format}-v1` : "utf8-decode-v1",
          }) : undefined
          return { output, title, metadata: { ...(selected ? { researchSource: selected, researchReceived: received } : {}) } }
        }).pipe(Effect.orDie),
    }
  }),
)

export function extractTextFromHTML(html: string) {
  let text = ""
  let skipDepth = 0

  const parser = new Parser({
    onopentag(name) {
      if (skipDepth > 0 || ["script", "style", "noscript", "iframe", "object", "embed"].includes(name)) {
        skipDepth++
      }
    },
    ontext(input) {
      if (skipDepth === 0) text += input
    },
    onclosetag() {
      if (skipDepth > 0) skipDepth--
    },
  })

  parser.write(html)
  parser.end()

  return text.trim()
}

export function convertHTMLToMarkdown(html: string): string {
  const turndownService = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  })
  turndownService.remove(["script", "style", "meta", "link"])
  return turndownService.turndown(html)
}
