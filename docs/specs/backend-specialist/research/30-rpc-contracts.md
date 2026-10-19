# R30 — Supplied contracts → backend application code

Research date: 2026-10-03. Evidence: official documentation, release metadata, tagged source, generated fixtures, upstream test bodies. Commands below are documentary; generation/tests were not executed. Package combinations were not locally validated.

## Decision and scope

Use codegen where supplied application contract already fixes protocol and stack. Concrete gain: replace handwritten wire types, serialization plumbing, RPC dispatch, or event-model mapping with reproducible generated artifacts.

The backend specialist remains CLOSED-SCOPE implementer. Inputs already contain design/protocol/schema, target files, versions, and checks. The backend specialist implements assigned handlers/adapters against generated boundary. Discovery, diagnosis, architecture, scope, and permission decisions retain existing Maestro/harness/Atlas ownership. Ecosystem survey belongs to researcher. Target is backend application code, not the backend specialist's agent runtime.

| Rank | Mechanism | Best supplied assignment | Generated boundary |
| --- | --- | --- | --- |
| 1 | Buf + Protobuf-ES + Connect-ES | TypeScript/Node Protobuf RPC; Protobuf event payloads | Typed messages/descriptors; shared codec runtime; descriptor-driven RPC adapter |
| 2 | tonic-prost-build + prost | Rust gRPC endpoint | Message structs/derives, service trait, server dispatch, client stubs |
| 3 | Apache Avro SpecificCompiler | Java backend with Avro event contract | SpecificRecord classes, builders, binary codec hooks/helpers |
| 4 | AsyncAPI Modelina | TypeScript event DTOs with separately supplied validation | Classes and JSON marshal/unmarshal code |

Rank reflects concrete generated work and evidence strength within matching stack. It does not recommend changing project language, introducing RPC, or adopting brokers. Protobuf-ES belongs inside #1; tonic supplies concrete gRPC-codegen instance rather than counting overlapping products twice.

## 1. Buf + Protobuf-ES + Connect-ES — strongest TypeScript RPC fit

**Reviewed releases:** [Buf 1.73.0](https://github.com/bufbuild/buf/releases/tag/v1.73.0), [Protobuf-ES 2.16.0](https://github.com/bufbuild/protobuf-es/releases/tag/v2.16.0), [Connect-ES 2.2.0](https://github.com/connectrpc/connect-es/releases/tag/v2.2.0).
**Licenses:** Apache-2.0: [Buf](https://github.com/bufbuild/buf/blob/v1.73.0/LICENSE), [Protobuf-ES](https://github.com/bufbuild/protobuf-es/blob/v2.16.0/LICENSE), [Connect-ES](https://github.com/connectrpc/connect-es/blob/v2.2.0/LICENSE).

**INPUT → operation:** supplied `.proto` messages/services, resolved imports, target directory, pinned local generator/runtime, and Buf template. Example equivalent template, assuming package-local executables already provisioned:

```yaml
version: v2
inputs:
  - directory: proto
plugins:
  - local: ./node_modules/.bin/protoc-gen-es
    out: src/gen
    opt: [target=ts, import_extension=js]
```

```sh
./node_modules/.bin/buf generate --template buf.gen.yaml
```

**OUTPUT:** `_pb.ts` files containing message types, enum definitions, `GenMessage` schemas, and `GenService` descriptors. `@bufbuild/protobuf` supplies `toBinary/fromBinary` and `toJson/fromJson`; generator emits their schema data, not bespoke codec functions per message. Connect consumes service descriptors to build transport handlers at runtime. Business handler bodies remain handwritten. [Generator options/source](https://github.com/bufbuild/protobuf-es/blob/v2.16.0/packages/protoc-gen-es/README.md), [generated-code reference](https://protobufes.com/reference/generated-code/).

**Remaining assigned coding:** implement supplied methods with `router.service(OrdersService, implementations)`; map DTOs to existing domain operations; implement prescribed error, authorization, transaction, and cancellation behavior. These are implementations of supplied decisions, not new backend specialist policy choices.

**Minimal integration:** existing package generation task invokes local Buf; assigned server module mounts `connectNodeAdapter({ routes })`. For an already-specified Protobuf event payload, use generated message schema and protobuf codec functions inside existing publisher/consumer instead. [Node walkthrough](https://connectrpc.com/docs/node/getting-started/).

**Output inspected:** tagged [Eliza proto](https://github.com/connectrpc/connect-es/blob/v2.2.0/packages/example/eliza.proto) → [generated `eliza_pb.ts`](https://github.com/connectrpc/connect-es/blob/v2.2.0/packages/example/src/gen/eliza_pb.ts) → [handwritten server](https://github.com/connectrpc/connect-es/blob/v2.2.0/packages/example/src/server.ts). Fixture contains unary, server-streaming, and bidirectional descriptors; server supplies actual method bodies. Fixture header records protoc-gen-es **2.10.1**, not reviewed release 2.16.0; it demonstrates artifact shape, not a fresh 2.16.0 generation run.

**Constraint/counterexample:** reviewed [generator](https://github.com/bufbuild/protobuf-es/blob/v2.16.0/packages/protoc-gen-es/package.json) and [Node adapter](https://github.com/connectrpc/connect-es/blob/v2.2.0/packages/connect-node/package.json) require Node >=22; pin Protobuf-ES generator/runtime together. A handler that credits instead of debits can preserve identical schema and wire bytes. [Buf breaking checks](https://buf.build/docs/breaking/) compare schema/source/wire compatibility, not domain behavior.

## 2. tonic + prost — strongest Rust gRPC fit

**Reviewed releases:** [tonic 0.14.6](https://github.com/grpc/grpc-rust/releases/tag/tonic-v0.14.6), [prost 0.14.4](https://github.com/tokio-rs/prost/releases/tag/v0.14.4). Official tonic repository now resolves to `grpc/grpc-rust`.
**Licenses:** [tonic MIT](https://github.com/grpc/grpc-rust/blob/tonic-v0.14.6/LICENSE); [prost Apache-2.0](https://github.com/tokio-rs/prost/blob/v0.14.4/LICENSE).

**INPUT → operation:** supplied proto3 service/messages, include roots, `protoc`, Cargo lockfile, and build script. Existing Cargo build invokes this library operation:

```rust
fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_prost_build::configure()
        .compile_protos(&["proto/orders.proto"], &["proto"])?;
    Ok(())
}
```

**OUTPUT:** package-named Rust source in Cargo `OUT_DIR`; message structs with `prost::Message` derives, service trait, server wrapper/dispatch, and client module. Both server/client generation default on. Generated services use `tonic_prost::ProstCodec`; runtime dependencies include `tonic`, `tonic-prost`, and `prost`. [Build API/source](https://github.com/grpc/grpc-rust/blob/tonic-v0.14.6/tonic-prost-build/src/lib.rs).

**Remaining assigned coding:** implement generated service trait, call existing domain/storage operations, map failures to prescribed `tonic::Status`, and implement assigned stream/cancellation behavior. Trait signatures encode call shape, not transaction semantics.

**Minimal integration:** existing `build.rs` uses `tonic-prost-build`; assigned module includes generated package with `tonic::include_proto!("orders.v1")` for `package orders.v1`; existing server adds generated `OrdersServer::new(implementation)` for `service Orders`. [Official handler example](https://github.com/grpc/grpc-rust/blob/tonic-v0.14.6/examples/src/helloworld/server.rs).

**Tests/output inspected:** [prost address-book generated example](https://github.com/tokio-rs/prost/blob/v0.14.4/README.md#generated-code-example) shows nested messages, enum storage, repeated fields, and derives. tonic's [build fixture](https://github.com/grpc/grpc-rust/blob/tonic-v0.14.6/tests/default_stubs/build.rs) generates normal and opt-in default-stub services; [test body](https://github.com/grpc/grpc-rust/blob/tonic-v0.14.6/tests/default_stubs/tests/default.rs) asserts explicit implementation returns `PermissionDenied`, default stubs return `Unimplemented`, across unary and streaming calls. Source assertions inspected, not executed.

**Constraint/counterexample:** `.generate_default_stubs(true)` permits an empty service implementation that still returns `Unimplemented`; compiling server does not complete assigned endpoint. Reviewed [tonic workspace](https://github.com/grpc/grpc-rust/blob/tonic-v0.14.6/Cargo.toml) requires Rust >=1.88. [prost docs](https://github.com/tokio-rs/prost/blob/v0.14.4/README.md) require external `protoc` for normal compilation and explicitly label project passively maintained. Suitable for existing supplied stack; not grounds for an unassigned migration.

## 3. Apache Avro — strongest Java event-codec fit

**Reviewed release:** [Apache download/release page: 1.12.2](https://avro.apache.org/project/download/); source pinned `release-1.12.2`. **License:** [Apache-2.0, bundled notices listed separately](https://github.com/apache/avro/blob/release-1.12.2/LICENSE.txt).

**INPUT → operation:** supplied `.avsc` record/enum schemas, namespace, logical-type/default conventions, Java target directory, and already-provisioned tools JAR:

```sh
java -jar tools/avro-tools-1.12.2.jar compile schema contracts/order-placed.avsc src/generated/java
```

**OUTPUT:** namespace-qualified Java `SpecificRecord` classes, typed accessors/builders, embedded `SCHEMA$`, datum reader/writer hooks, binary encoder/decoder helpers, and generated custom coding methods. Compiler replaces repetitive record/wire mapping; runtime library still performs supporting codec work. [Official generation guide](https://avro.apache.org/docs/1.12.0/getting-started-java/) documents CLI form at 1.12.0; 1.12.2 source tests confirm same operation.

**Remaining assigned coding:** map domain objects to generated records; connect prescribed payload framing/schema lookup to existing event transport; implement assigned consumer effects, transaction boundaries, deduplication, and acknowledgement behavior.

**Minimal integration:** existing Java build includes assigned generated source root and matching `org.apache.avro:avro` runtime. Existing publisher/consumer uses generated records with supplied serialization path. `toByteBuffer/fromByteBuffer` helpers are usable when contract calls for their header-plus-fingerprint encoding; they are not interchangeable with arbitrary event envelopes. [Encoder source](https://github.com/apache/avro/blob/release-1.12.2/lang/java/avro/src/main/java/org/apache/avro/message/BinaryMessageEncoder.java).

**Output/tests inspected:** [generated `Player.java`](https://github.com/apache/avro/blob/release-1.12.2/lang/java/tools/src/test/compiler/output/Player.java) includes enum arrays, builders, `BinaryMessageEncoder/Decoder`, and custom field coding. [Compiler tool test](https://github.com/apache/avro/blob/release-1.12.2/lang/java/tools/src/test/java/org/apache/avro/tool/TestSpecificCompilerTool.java) invokes real `SpecificCompilerTool` and compares generated Java fixtures; comparison alone is not behavioral proof.

**Constraint/counterexample:** schema-compatible binary message can still fail when writer schema fingerprint cannot be resolved. [Message tests](https://github.com/apache/avro/blob/release-1.12.2/lang/java/avro/src/test/java/org/apache/avro/message/TestBinaryMessageEncoding.java) explicitly pair `compatibleReadFailsWithoutSchema` (`MissingSchemaException`) with successful lookup cases. Even successful decoding does not prove correct consumer side effects or duplicate handling.

## 4. AsyncAPI Modelina — useful bounded DTO generation; weaker runtime guarantee

**Reviewed release:** [5.10.1, 2025-10-19](https://github.com/asyncapi/modelina/releases/tag/v5.10.1), fixing multi-message model generation. **License:** [Apache-2.0](https://github.com/asyncapi/modelina/blob/v5.10.1/LICENSE). [Published package metadata](https://registry.npmjs.org/@asyncapi/modelina/5.10.1) confirms version 5.10.1 and Node >=18; tagged repository manifest still says 5.10.0.

**INPUT → operation:** supplied parsed AsyncAPI 2.x document object or JSON Schema draft-07 payload, fixed naming/module options, and destination map. Narrow library call, using already-provisioned package:

```ts
import { TypeScriptGenerator, TS_COMMON_PRESET } from "@asyncapi/modelina";

const models = await new TypeScriptGenerator({
  modelType: "class",
  moduleSystem: "ESM",
  presets: [{ preset: TS_COMMON_PRESET, options: { marshalling: true } }],
}).generateCompleteModels(suppliedDocument, { exportType: "named" });
```

**OUTPUT:** returned `.result` source strings containing TypeScript classes, dependencies/exports, and `marshal()/unmarshal()` methods. Existing generation script writes results to supplied filenames. [Input/output docs](https://github.com/asyncapi/modelina/blob/v5.10.1/docs/usage.md), [ESM generation example](https://github.com/asyncapi/modelina/blob/v5.10.1/examples/typescript-use-esm/index.ts), [TypeScript renderer](https://github.com/asyncapi/modelina/blob/v5.10.1/src/generators/typescript/TypeScriptGenerator.ts).

**Remaining assigned coding:** wire supplied runtime validator and failure mapping before consuming payload; map model into assigned business handler; implement prescribed publish/consume and acknowledgement logic. Generated class typing does not validate arriving JSON.

**Minimal integration:** generation-time Modelina call in existing package script; generated modules imported by assigned publisher/consumer. Payload modeling works independently of broker scaffolding. [Marshalling preset docs](https://modelina.org/docs/languages/typescript#generate-marshalling-and-unmarshalling-functions).

**Output inspected:** official [email-schema input](https://github.com/asyncapi/modelina/blob/v5.10.1/examples/typescript-generate-marshalling/index.ts) declares string `format: email`; [generated snapshot](https://github.com/asyncapi/modelina/blob/v5.10.1/examples/typescript-generate-marshalling/__snapshots__/index.spec.ts.snap) emits class getter/setter and JSON conversion. Its [test](https://github.com/asyncapi/modelina/blob/v5.10.1/examples/typescript-generate-marshalling/index.spec.ts) checks logged source against snapshot, not payload rejection.

**Constraint/counterexample:** snapshot `unmarshal` parses JSON, constructs `new Test({} as any)`, then assigns `obj["email"]` directly. Static trace of `Test.unmarshal('{"email":42}')` reaches assignment despite string/email schema; this is source-derived counterexample, not an executed probe. Tagged [unmarshal generator](https://github.com/asyncapi/modelina/blob/v5.10.1/src/generators/typescript/presets/utils/UnmarshalFunction.ts) confirms primitive pass-through. Rank below actual binary codecs; don't present this preset as runtime schema validation.

## Why not generic AsyncAPI server scaffolding as default?

[AsyncAPI Generator docs](https://www.asyncapi.com/docs/tools/generator) recommend Modelina when goal is model/class generation. Generator output depends on chosen template. Surveyed [official Node.js template README](https://github.com/asyncapi/nodejs-template/blob/master/README.md) specifies Hermesjs application scaffolding, AMQP/MQTT/Kafka/WebSocket support, and Generator `>=0.50.0 <2.0.0`; it also separates custom handlers from regenerated output. Those concrete framework/version commitments must already match assignment. Modelina is narrower integration for payload-only work; template survey is not a recommendation to introduce Hermesjs or a broker.

## Behavior boundary and closed-scope use

- Schema compatibility answers selected source/wire evolution questions. Codec round-trip answers representation questions. Neither proves handler business behavior.
- For supplied checks, distinguish regeneration/typecheck evidence from codec fixtures and business assertions. Relevant assertions include intended state mutation/status, malformed payload handling, and assigned duplicate/cancellation semantics. The backend specialist executes supplied check set during implementation; research does not expand it.
- Keep generated artifacts in supplied generation targets; assigned business logic consumes them from handwritten files. Version/toolchain mismatches are evidence for existing owners, not permission for the backend specialist to redesign protocol or widen scope.
- Practical shortlist: #1 for supplied TypeScript/Node Protobuf work; #2 for supplied Rust gRPC; #3 for supplied Java Avro; #4 only when event-model generation is task and validation boundary is already supplied.
