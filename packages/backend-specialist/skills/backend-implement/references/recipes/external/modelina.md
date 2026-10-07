# modelina

## Applicability

The packet assigns typed message models (the payload types of Kafka topics or other event channels) generated from a local AsyncAPI document, names the output directory as part of the write paths, and supplies the target language with its package or namespace. The engine is the AsyncAPI Modelina CLI `5.10.1`, the same engine behind the AsyncAPI CLI's `generate models`, on a host-provided Node.js runtime and run only as `"$BACKEND_TOOLKIT_BIN/modelina"`.

## Non-trigger

- Producer and consumer code, broker wiring, serializers or schema-registry settings: handwritten work around the models.
- A document fetched from a URL, a remote `$ref`, or a CLI context name: the shell has no network.
- Payloads declared with an Avro or Protobuf `schemaFormat`: use the generator the packet names for that format.
- Choosing the language, the package or namespace, or the language options. Those are supplied.

## Inputs

- The AsyncAPI document, every local file it references, and the output directory.
- The language (`typescript`, `golang`, `java`, `kotlin`, `python`, `csharp`, `rust` and others) and its `--packageName` (Go, Java, Kotlin) or `--namespace` (C#, C++, PHP).
- The language options the existing generated models were produced with, such as `--tsModelType interface` or `--pyDantic`.
- The `@asyncapi/modelina` or `@asyncapi/modelina-cli` version in the project's manifest, when it pins one.

## Steps

1. Check the project's pin first. A project manifest that pins Modelina at a version other than `5.10.1` means the project generates with another engine: report `engine-version-mismatch(project=<v>, bundled=5.10.1)` and do not regenerate. The output carries no version header; without a pin, follow the packet.
2. Edit only the message payload schemas the change needs. Keep each payload a named schema under `components/schemas`; an inline payload becomes `AnonymousSchema_<n>`, whose number shifts as schemas are added.
3. Generate into the output directory, with the packet's options:
   ```sh
   "$BACKEND_TOOLKIT_BIN/modelina" generate <language> <asyncapi.yaml> --output <dir> --packageName <pkg>
   ```
   Without `--output` it prints to stdout. Pass only the options the packet or the existing output fixes.
4. Read the diff. One file per model; only the models for the changed payloads, and the models that reference them, may move. Modelina never deletes: a model the change removed leaves its old file, which is deleted only when the packet assigns the removal.
5. Go output is not `gofmt`-formatted. When the packet's checks include a formatter, run it on the generated files only.
6. Compile, then run the packet's checks, including one message per changed payload through the project's serializer.

## Tools and outputs

- The host fetches the engine and its Node.js runtime on first use; the seat's shell has no network. Never install, download or substitute it (`npm install`, `npx @asyncapi/modelina-cli`, `asyncapi generate models`, a container, a copy on `PATH`).
- When the shell output reports `toolkit-not-ready:...` or `unsupported-target:...`, stop and return a `tool` blocker whose code is that text verbatim.
- Generated and owned by Modelina: the model files in the output directory. Never edit them. Handwritten and yours: the AsyncAPI change, the code that sends and receives the messages, and tests.
- Project prerequisites outside the toolkit: the language toolchain and any library the chosen options import (Jackson, Pydantic, Newtonsoft); adding one is a `packet` decision.

## Limits and checks

- `Unable to read input file content` is `project-prerequisite-missing:<path>`. A document the parser rejects prints its diagnostics: a defect in the change is fixed inside scope, otherwise a `packet` blocker quoting them. Any other nonzero exit is `engine-failure:modelina:<exit>`.
- Models prove the payload shapes match the document. They prove neither topic names, broker settings, nor compatibility with schemas already registered.
- Checks: the diff stays inside the output directory and the packet's compile and tests pass.
