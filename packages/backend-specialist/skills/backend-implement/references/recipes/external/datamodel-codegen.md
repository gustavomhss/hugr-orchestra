# datamodel-codegen

## Applicability

The packet assigns Pydantic v2 models generated from a local OpenAPI document or JSON Schema, names the generated module or package as part of the write paths, and supplies the generation options (in `[tool.datamodel-codegen]` of `pyproject.toml`, or as flags in the packet). The engine is datamodel-code-generator `0.83.0` on a host-provided CPython `3.13`, run only as `"$BACKEND_TOOLKIT_BIN/datamodel-codegen"`. Writing code against the generated models is covered by [Pydantic v2](../../libraries/python/pydantic.md).

## Non-trigger

- Handwritten models, or a change that only uses existing generated models without touching the schema: nothing to generate.
- A packet that forbids regeneration or leaves the generated module outside the write paths: never regenerate; a change that would need it is a `packet` blocker.
- A schema fetched from a URL (`--url`) or with remote `$ref`s: the shell has no network.
- Choosing the output model type, the target Python version, the formatters or naming options. Those are supplied.

## Inputs

- The schema path, every local file it references through `$ref`, and its type (`openapi` or `jsonschema`).
- The generated module or package path, and the options the project already uses.
- The version on the generated header's `version:` line, when the project enables it.
- The packet's type-check and test commands for the code that uses the models.

## Steps

1. Check the generated header first. A `version:` line other than `0.83.0` means the project pins another generator: report `engine-version-mismatch(project=<v>, bundled=0.83.0)` and do not regenerate. A header without a version line is not evidence of a match; follow the packet.
2. Edit only the schema components the change needs.
3. Generate only the output whose schema changed, offline, from the directory that holds the project's `pyproject.toml`:
   ```sh
   "$BACKEND_TOOLKIT_BIN/datamodel-codegen" --input <schema> --input-file-type openapi --output <models.py> --output-model-type pydantic_v2.BaseModel --no-allow-remote-refs
   ```
   Use `--input-file-type jsonschema` for a JSON Schema. Options from `[tool.datamodel-codegen]` apply on their own; pass a flag only when the packet supplies it and the config does not.
4. Confirm the output is current: rerun the exact command of step 3 with `--check` appended. Exit 1 with a diff means the generated file differs from what the inputs produce. Unless the project passes `--disable-timestamp`, the header's `timestamp:` line always differs; a diff limited to that line is current.
5. Read the generated diff. Only the models for the changed components, and the models that reference them, may move. The header's `timestamp:` line moves on every run. Renamed classes or reordered unrelated models mean the options differ from the project's: a `packet` blocker.
6. Type-check and run the packet's tests for the code that uses the changed models.

## Tools and outputs

- The host fetches the engine and its Python runtime on first use; the seat's shell has no network. Never install, download or substitute it (`pip install`, `pipx`, `uvx`, a virtualenv, a container, a copy on `PATH`).
- When the shell output reports `toolkit-not-ready:...` or `unsupported-target:...`, stop and return a `tool` blocker whose code is that text verbatim.
- Generated and owned by datamodel-codegen: the output module or package. Never edit it. Handwritten and yours: the schema change, the code that uses the models, and tests.
- Project prerequisites outside the toolkit: the project's own Python and its Pydantic, which the generated code imports at runtime.

## Limits and checks

- A broken local `$ref` or an unreadable schema fails generation: `project-prerequisite-missing:<path>`. Any other nonzero exit is `engine-failure:datamodel-codegen:<exit>`. Deprecation warnings on stderr are not failures; quote them as risks.
- The bundled formatters are black and isort. A project that formats generated code with Ruff needs a toolkit change: `project-prerequisite-missing:ruff`.
- Generation proves the models match the schema. It proves neither the API's runtime behavior nor that the project's Pydantic accepts every generated construct; the packet's type check and tests do.
