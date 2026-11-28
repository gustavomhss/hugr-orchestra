# L1: Client projections and raw transfer boundary

Key: `s1.api.client-projection`. Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Shared contract, different value models

The Client package constructs `ClientApi` from Protocol with local location middleware tags and matching error declarations. Product group/endpoint names and omissions live in `src/contract.ts`; generated output is not the authoring authority. The public Promise entrypoint exports generated clients and the handwritten transfer extension. The Effect entrypoint uses the generated imported-contract adapter. Schema/Protocol types are allowed at this boundary; Core/Server runtime imports are prohibited by root maintenance authority.

The Promise projection returns encoded wire values. For example, timestamps are epoch numbers. Its `wire.ts` exposes the encoded durable-session event view. The imported Effect projection runs the actual API schema codecs, returning decoded Effect values such as DateTime. These projections must not be described as interchangeable merely because their method groups match.

The build explicitly omits six names: `pty.connect`, `pty.connectToken`, `actions.transfer.read`, `actions.transfer.upload`, `capability.artifact.content`, and `capability.content.read`. This is policy input, not proof that every omitted name is present in the current reflected API. Current Actions transfer Protocol/Server sources expose info and download; the handwritten upload extension targets an upload route without a corresponding declaration in that inspected group/handler. Its server support is unproved here.

The README says raw file reads are omitted, but `fs.read` is absent from the actual omission set. Protocol declares it as Uint8Array, and generated `files.read` is emitted with `binary: true`. The current generated source therefore supports a binary file-read method; documentation and implementation disagree at this pin. No source was edited to reconcile the disagreement.

## Promise transport and errors

The inspected runtime composes URL/path/query values, applies client then endpoint then request headers, encodes JSON bodies, and invokes fetch. It distinguishes transport failures, malformed responses, unsupported content types, unexpected statuses, and declared JSON error statuses through `ClientError` plus declared error shapes. A declared error response is parsed and thrown; this code does not independently validate its full declared schema.

JSON success requires a JSON or `+json` media type, nonempty well-formed JSON, and maps read failures into transport errors. No-content cancels any response body and returns undefined. Binary success reads an ArrayBuffer into Uint8Array, but that await is not wrapped by the JSON reader's catch; this packet does not claim that every binary-body failure becomes a `ClientError`. The SSE reader is described in the streaming artifact.

The imported Effect emitter calls `HttpApiClient.make` with the authoritative API value, preserving transformations rather than serializing guessed codecs. Its client-error mapping preserves unrelated errors. Default header snapshots are validated/frozen; unsafe descriptors, invalid header names/values, and CRLF are rejected by the implementation. A default content type is removed for FormData unless explicitly supplied by the request.

## Handwritten streaming transfers

`actions-transfer.ts` shares base URL/fetch/header configuration with the generated client but keeps successful response bodies streaming. The caller owns response-body consumption and cancellation. Requests use manual redirect handling so credentials are not automatically forwarded to a provider-signed redirect. Upload accepts streaming bodies through a duplex support probe and returns an explicit unsupported-streaming reason when the probe fails; this source probe is not a cross-browser compatibility result.

Transfer errors use bounded capture: at most 16 KiB and a five-second read deadline, with truncation and structured reasons retained. They preserve an unknown-outcome state and parse retry information. This specialized error contract is not identical to every generated endpoint's declared error union.

## Evidence and gaps

Full reads: `src/contract.ts`, `src/index.ts`, `src/effect.ts`, `src/wire.ts`, handwritten transfer/error files, build script, package manifest, README, small generated request/client-error modules and both generation manifests. Representative regions of the large generated clients were read; `generated/types.ts` and `generated/errors.ts` were captured without claiming full semantic inspection. Their identities and all omitted generated family members remain explicit in coverage.

`generated/types.ts` is 462,732 bytes. The protocol's current runtime input observer refuses files over 256,000 bytes, so faithful runtime binding of that input needs an explicit later solution. The source is retained and not split to evade the boundary. No code generation, type conformance test, Promise/Effect test, transfer request, or browser execution occurred. Source-supported projection claims do not certify generated-output freshness or client interoperability.
