# Supplied binary grammar or codec

## Applicability

- Assigned parser or serializer integration for an exact supplied grammar or schema, its imports and the selected codec.
- Assigned message framing, field presence, binary or JSON mapping, or protocol evolution between old and new payloads.

## Non-trigger

- An ordinary HTTP handler using an unchanged serialization recipe.
- Reverse engineering a format, inferring a schema from samples, or choosing a different format to replace a fixed external layout.

## Inputs

- The chosen format or dialect, the canonical schema, and the generator and runtime versions.
- Endian, bit, length and version rules; envelope and packing; record boundaries and the trailing-byte policy; checksum and semantic rules.
- Byte, count, depth and decompression budgets, and the malformed-input policy.
- Parser and buffer lifetime, and independent golden bytes.
- For compatibility work: old and new payloads and the support direction.

## Steps

1. Edit the schema or the handwritten codec only as assigned, and regenerate existing bindings through the permitted entrypoint.
2. Assemble a bounded frame with cancellation. Tell "need more input" apart from terminal truncation.
3. Call the selected generated parser or verifier with its supported buffer ownership. Force required lazy validation before effects.
4. Apply the semantic and resource policy and the exact-consumption rule.
5. Map malformed or unsupported input to the supplied error, never to success or default values. When writing, emit only a completed, valid frame.

## Tools and outputs

- The provided grammar compiler, the existing byte-fixture runner and diff.
- Output: generated parser or accessors plus the handwritten framing and domain adapter. The compiler owns the layout; you own the integration.

## Limits and checks

- Deleted Protobuf field numbers stay reserved, never reused.
- A structural parser is neither authentication nor domain validation. A bare length field is not an application quota.
- Round trip alone is not evidence: a paired encoder and decoder can share one mistake. Check independent goldens, short and hostile-length input, forbidden trailing bytes, a structurally valid but semantically forbidden body, and old/new directional cases.
- Input adapter, buffer lifetime and error classification are yours. An absent grammar or import, ambiguous framing, an unsupported target writer, or unresolved wire identity or version policy is a `packet` blocker.
