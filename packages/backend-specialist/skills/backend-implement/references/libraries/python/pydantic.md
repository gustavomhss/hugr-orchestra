# Pydantic v2

## Applicability

Request, response or settings models on Pydantic `2.11.7` (`pydantic.BaseModel`, `ConfigDict`, `Field`, `TypeAdapter`). Read [Python](../../languages/python.md) first. On FastAPI the framework calls validation and serialization for you; the model semantics below are the same.

## Non-trigger

- Pydantic v1 code, or the `pydantic.v1` compatibility namespace: its validators, config class and coercion differ. Never convert it.
- A DTO edit only: it does not load the ORM or transaction references.
- Choosing a global strictness, alias or extra-field policy. That is the packet's contract.

## Inputs

- Per field: required or omittable, nullable or not, default, strictness and bounds.
- The policy for unknown fields (ignore, forbid or keep) and the wire names (aliases).
- For PATCH: how omission and explicit `null` differ.

## Steps

1. Declare the input model with the contract's extra-field policy:
   ```python
   class DebitIn(BaseModel):
       model_config = ConfigDict(extra="forbid")
       amount: int = Field(strict=True, ge=1, le=1000000)
   ```
   The default is `extra="ignore"`, which drops unknown keys silently.
2. Separate presence from nullability. `name: str | None` with no default is required and accepts `null`; it becomes omittable only with a default (`= None`). Optional does not mean omittable in v2.
3. Choose strictness per contract. Lax mode converts some input, such as the string `"70"` to `70`; `Field(strict=True)` or `ConfigDict(strict=True)` refuses it. Test each conversion the contract forbids.
4. Validate with the v2 entry points: `Model.model_validate(obj)` for Python objects, `Model.model_validate_json(raw)` for JSON text, `TypeAdapter(T).validate_python(...)` for non-model types. JSON-mode and Python-mode strictness differ for some types (a UUID string is accepted in strict JSON mode, not in strict Python mode); use the entry point that matches the source.
5. For PATCH, apply only sent fields: `patch.model_dump(exclude_unset=True)` keeps an explicit `null` and drops omitted fields. `patch.model_fields_set` names the fields that were sent.
6. Serialize with `model_dump(mode="json")` or `model_dump_json()`, honoring `by_alias=True` when the wire uses aliases.
7. Build from ORM objects with `ConfigDict(from_attributes=True)` and `model_validate(row)` only when every read attribute is already loaded; reading an unloaded async attribute fails.
8. Custom checks use `@field_validator("field")` and `@model_validator(mode="after")`. Raise `ValueError` inside them; Pydantic wraps it in `ValidationError`.

## Tools and outputs

- `BaseModel`, `ConfigDict`, `Field`, `TypeAdapter`, `ValidationError` (`.errors()` lists `type`, `loc`, `msg`), `field_validator`, `model_validator`.
- Outputs: handwritten models and tests. Models generated from a schema by a generator are regenerated, never edited.

## Limits and checks

- v1 names (`.dict()`, `.json()`, `parse_obj`, `class Config`, `@validator`) are deprecated in v2. Never introduce them; follow the file's existing style only where it already uses them.
- A response model with `extra="ignore"` still drops undeclared fields, which can hide a projection bug; assert exact keys.
- `ge`, `le` and `max_length` are validation, not serialization: a value built with `model_construct()` skips them.
- Checks: a valid payload; each forbidden conversion (`"70"`, `70.5`, `true`, `null`); a missing required field; an unknown field; and for PATCH, omitted versus explicit `null`.
