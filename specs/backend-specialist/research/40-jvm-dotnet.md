# R40 — JVM / .NET backend implementation generators

Research date: 2026-10-03. Evidence: primary documentation, release metadata, pinned source and upstream test inspection. Checks below are prospective assignments; this research executed no builds, generators, tests, or benchmarks.

## Ranked shortlist

Rank measures implementation leverage when existing target already fits; not permission to select architecture or migrate frameworks.

| Rank | Candidate | Generated implementation / guarantee | Best bounded assignment |
| --- | --- | --- | --- |
| 1 | jOOQ | Schema-specific DB types, records, POJOs, CRUD DAOs; typed query surface | Generate frozen schema; implement specified queries/transactions |
| 2 | MapStruct | Java mapper implementations; configurable compilation errors | Implement supplied Java model↔DTO mapping matrix |
| 3 | Mapperly | C# mapper implementations; configurable Roslyn diagnostics | Implement supplied C# model↔DTO mapping matrix |
| 4 | System.Text.Json source generation | Serialization metadata and eligible fast-path writers | Implement closed JSON contracts for selected .NET target |

MapStruct and Mapperly solve same mapping problem on different platforms; benefits are alternatives, not cumulative savings. Existing types justify mappings; generators do not justify adding DTO/repository/service layers.

## The backend specialist packet contract

Lead supplies complete packet before implementation:
- **Design/API:** selected tool/framework, exact method signatures and call sites, business rules, transaction/error behavior, allowed handwritten files, generated-output ownership.
- **Schema:** immutable schema/migration revision or model files; field mapping/ignore table; null, missing-value, enum, numeric, date/time, copy/update and polymorphism rules; representative fixtures and expected outputs.
- **Target/version:** exact JDK/compiler/build wrapper or .NET SDK/TFM/RID; generator/runtime/package pins; DB engine/version/driver/edition where relevant; prepared build configuration and available dependencies.
- **Checks:** exact working directory and commands, named positive fixtures, intentional negative controls, expected diagnostics/results, generated-file policy and artifact paths. Packet gives these values; the backend specialist does not discover them.

The backend specialist adds prescribed declarations/annotations and specified business code, invokes assigned build/check steps, returns generated diff plus check evidence. Missing packet facts or failed checks return exact blocker/diagnostic to lead; investigation, diagnosis, architecture/framework selection, permissions and harness changes stay outside the backend specialist assignment. Build configuration mentioned below is lead-prepared input. Current assignment is research-only.

## 1. jOOQ — broadest DB implementation yield

**Pin:** `org.jooq:jooq`, `jooq-meta`, `jooq-codegen` and `jooq-codegen-maven` **3.21.9**; [release][j-release] 2026-09-25; source SHA `d28bb64e08ad218e9caba2c0c43e72916509f5d8`.

**Input → mechanism → output**
- Supplied database schema at fixed migration revision, schema/table include list, PK/FK metadata, naming/package rules, forced types/converters and JDBC connection to prepared schema.
- Existing Maven `generate-sources` execution runs `org.jooq:jooq-codegen-maven:3.21.9:generate`; `<pojos>true</pojos><daos>true</daos>` requests optional POJOs/DAOs. `mvn generate-sources` invokes configured lifecycle; `mvn compile` also includes it. [Build docs][j-build], [generated DAOs][j-daos].
- Output: table/field constants with Java types, records, keys, POJOs and `*Dao extends DAOImpl<...>` with inherited CRUD and column-specific fetch methods. Query callers compile against generated schema. Generated runtime code still depends on jOOQ/JDBC.

**Manual business code:** joins and predicates, tenant authorization, transaction boundaries/isolation, locking/retry policy, custom converters and application error translation. Generic DAO lookup by PK is not tenant-scoped application authorization.

**Semantic/runtime caveats:** regeneration detects removed/renamed referenced columns; stale generated code cannot detect deployment schema drift. Java types do not prove SQL null behavior, DB constraints or query semantics. Actual DB/driver integration remains necessary.
- **Source beats stale prose:** [JavaGenerator.java:5807–5849][j-generator] skips DAO generation without PK and supports composite keys using `RecordN`/`Record`; [DAOImpl.java:417–436][j-daoimpl] implements composite-key predicates. [SQL execution manual][j-execution] still says single-column only; do not carry that restriction into 3.21.9 packet.
- **Actual license/target constraint:** Open Source Edition is Apache-2.0; commercial editions use jOOQ license. OSS 3.21 requires Java 21+; supported minimum PostgreSQL dialect is 18, versus versioned older dialect support in commercial editions. Oracle/SQL Server support is edition-dependent: Express covers their Express editions; other editions require Professional/Enterprise as listed. Lead pins DB edition/version and matching artifact group/JDK distribution. [Edition/license table][j-editions], [DB matrix][j-db], [JDK matrix][j-jdk].

**Concrete assigned check — `JooqOrderContract`:** packet supplies `orders(id PK, tenant_id, total decimal(12,2), note nullable)` and generated API names. Generate into clean assigned output, compile known caller, then execute create/read/update/delete against selected DB/version; `19.99` survives exactly, SQL NULL note stays null, rollback leaves no inserted row, tenant A query excludes tenant B. Separate supplied mutation renames `total`; regenerate and require old `ORDERS.TOTAL` caller to fail compilation. If packet includes composite PK, add lookup matching every key component. Capture schema revision, generated files, compiler diagnostic and DB assertions.

## 2. MapStruct — narrow Java mapping work with compiler feedback

**Pin:** `org.mapstruct:mapstruct` and `mapstruct-processor` **1.6.3**; [release][m-release] 2024-11-09; SHA `b4e25e49deae707b50ce061172e114292b414a23`; [Apache-2.0][m-license]. Java 8+ supported; exact selected JDK/compiler remains packet input.

**Input → mechanism → output**
- Existing source/target Java types plus complete mapping matrix, approved exclusions/converters and method signatures; create versus `@MappingTarget` update semantics fixed beforehand.
- Explicit annotation-processor path for `mapstruct-processor`; `@Mapper`, `@Mapping(source = "reference", target = "displayReference")` and mapper methods; existing `mvn compile` runs JSR 269 processor. No DI framework required. [Reference: setup and basic mappings][m-doc].
- Output: `OrderMapperImpl.java` under Maven generated annotation sources; direct getters/setters/constructors, nested mappings and collection loops. Removes handwritten field-copy implementations; generator does not invent DTOs or domain policy.

**Manual business code:** meaningful money/timezone transformations, validation, allowed-field rules, factories and explicitly selected custom methods. Mapping expressions/custom methods remain ordinary business code requiring tests.

**Semantic/runtime caveats:** target omissions default to `WARN`, source omissions and lossy conversions to `IGNORE`. Lead-prepared `@Mapper`/`@MapperConfig` uses `unmappedTargetPolicy = ReportingPolicy.ERROR`, optionally strict source policy, and `typeConversionPolicy = ReportingPolicy.ERROR` for requested guarantees. `@BeanMapping(ignoreByDefault = true)` intentionally disables automatic completeness reporting. Root-null, property-null and update-null policies are different; name matches cannot prove business equivalence.
- **Inspected evidence:** [Mapper.java:101–130][m-source] declares defaults. [UnmappedProductTest][m-unmapped] contrasts successful compilation with warnings against `shouldRaiseErrorDueToUnsetTargetProperty`; [LossyConversionTest][m-lossy] expects compilation failure for long→int under strict conversion policy. These are inspected upstream assertions, not locally executed results.

**Concrete assigned check — `OrderMapperContract`:** supplied fixture renames `reference`→`displayReference`, maps nested address and empty/nonempty lines, and specifies update-null behavior. For supplied `NullValuePropertyMappingStrategy.IGNORE` update case, null note must preserve existing `"old"`. Baseline mapping compiles and matches expected DTO. Separate negative fixtures add unmapped writable target `auditCode` and change target ID to `int` while source stays `long`; require missing-target and lossy-conversion compilation errors respectively. Use generated mapper through real application factory/DI path selected in packet.

## 3. Mapperly — C# mapping implementations with inspectable output

**Pin:** `Riok.Mapperly` **4.3.1**; [release][r-release] 2025-12-22; SHA `036698914bd48be888b25322938b565db72ff7ff`; [Apache-2.0][r-license]. Requirements: C# 9+, Roslyn 4.0+, .NET 5+ or .NET Framework 4.x; support policy favors currently supported .NET targets. [Installation requirements][r-install].

**Input → mechanism → output**
- Supplied C# source/target types, nullable annotations, map/ignore rules, constructor and copy/reference policy, enum policy and exact partial method signatures.
- Prepared package reference pins 4.3.1 with `ExcludeAssets="runtime" PrivateAssets="all"` for ordinary build-only use; `[Mapper] partial class OrderMapper` plus `public partial OrderDto Map(Order source);` and `[MapProperty(...)]`; `dotnet build --no-restore` invokes Roslyn generator.
- Output: compiler-added partial mapping implementation with direct assignments/conversions and diagnostics; prepared `EmitCompilerGeneratedFiles` settings make output inspectable on disk. Ordinary mapping needs no reflection mapper engine. Cross-project attributes that must survive in metadata require documented attribute-preservation configuration/runtime assets; packet must specify that case. [Installation][r-install], [configuration][r-config].

**Manual business code:** domain conversions and validation, approved user mapping methods, persistence/loading decisions, application handling of mapping failures.

**Semantic/runtime caveats:** `RequiredMappingStrategy.Both` emits warnings, not hard errors. Lead sets `RMG012` (target lacks source) and `RMG020` (source unused) severity to error for requested completeness. Same-type assignable objects/arrays share references by default; `UseDeepCloning` changes copy behavior. Default enum strategy is numeric `ByValue`; differing enum numbers need explicit policy. Null-member handling differs from null-return handling. [Diagnostics][r-diag], [enum rules][r-enum].
- Optional `IQueryable` projections have different semantics: several null/copy options ignored, reference handling and enum `ByName` unsupported; successful C# compilation does not prove provider SQL translation. Projection assignments need actual selected provider check. [Projection constraints][r-query].
- **Inspected evidence:** [MapperAttribute.cs][r-source] records defaults; [RequiredMappingTest.ClassAttributeRequiredMappingBoth][r-required] asserts both diagnostics and emitted body; [EnumerableDeepCloningTest][r-clone] checks generated array cloning and element mapping.

**Concrete assigned check — `OrderMapperContract`:** baseline renamed/nested/nullable fields match frozen expected object. Add writable unmatched target `AuditCode` in isolated negative fixture; build must fail on `RMG012`, not merely log warning. Add unmapped source field for `RMG020`. For supplied `UseDeepCloning=true` fixture, mutating mapped line must not mutate source line; for supplied `ByName` enum fixture, equal names with differing numeric values must map correctly. Execute generated methods; snapshots alone cannot establish runtime copy semantics.

## 4. System.Text.Json source generation — closed JSON implementation surface

**Pin:** reviewed .NET runtime/System.Text.Json **10.0.12**, selected-target example `net10.0`; [release][s-release] 2026-09-08; SHA `4271d88e0aebf3d04f188f1334c2220d80555ef6`; [MIT][s-license]. SDK version and deployment RID are separate packet pins; runtime version is not SDK version.

**Input → mechanism → output**
- Existing serializable types; exact JSON names, enum/number/null behavior, converters, polymorphic variants and collection roots. Known runtime types behind `object` must be declared; static member traversal cannot infer arbitrary runtime payload types.
- `[JsonSerializable(typeof(OrderDto))]` and collection roots on `partial class AppJsonContext : JsonSerializerContext`; lead fixes `[JsonSourceGenerationOptions]`. Normal `dotnet build --no-restore` invokes bundled generator; call `JsonSerializer.Serialize(value, AppJsonContext.Default.OrderDto)` or wire supplied context into application's resolver. [Usage][s-doc].
- Output: generated `JsonTypeInfo<T>` metadata for serialization/deserialization; default mode also emits eligible direct `Utf8JsonWriter` fast-path serialization methods. Metadata mode replaces runtime contract discovery; it is not a generated fast-path JSON reader. [Modes][s-modes].

**Manual business code:** DTO/domain definitions, nonstandard converters, business validation, version compatibility and serializer integration at actual call sites. Gain is generated contract/writer implementation and explicit type coverage, not CRUD or business-handler generation.

**Semantic/runtime caveats:** context declaration does not force every serializer call to use it. Missing runtime types can fail at runtime; successful compilation does not prove complete coverage. Fast-path-only mode cannot deserialize and lacks some options; metadata fallback must exist when needed. Streaming requires metadata, although small buffered async payloads can use fast paths. .NET 10 private/protected member/accessor limitations still apply; current docs also discuss .NET 11 capabilities, which are outside this pin. No performance claim without workload measurement.
- **Inspected evidence:** [JsonSourceGenerator.Roslyn4.0.cs][s-source] selects annotated contexts and emits compiler sources. [SerializationContextTests:184–250][s-tests] checks handler presence, custom-converter fast-path exclusion, failure without metadata/handler, and metadata-backed round trip.

**Concrete assigned check — `OrderJsonContract`:** packet prepares `JsonSerializerIsReflectionEnabledByDefault=false`; assert `JsonSerializer.IsReflectionEnabledByDefault` is false in test process. Through actual app serialization path, compare supplied golden JSON and deserialize fixtures covering nullable note, decimal total, string enum, collections and declared polymorphic variants. Known root must succeed; isolated unregistered `ProbeOnlyRoot` serialized via context overload must reject missing metadata, proving default reflection cannot conceal omission. If selected target is trimmed/Native AOT, run same fixtures on assigned published artifact/RID; ordinary CoreCLR test is insufficient evidence for that target.

## Selection boundary

Micronaut compile-time introspection/DI belongs only in packets where lead already selected Micronaut. Typed Minimal API/OpenAPI/server generators require their own selected ASP.NET contract; HTTP schema client generation remains separate lane. Neither is needed to adopt shortlisted leaf mechanisms. Prefer smallest existing implementation surface with frozen semantics and concrete checks.

## Primary evidence links

[j-release]: https://github.com/jOOQ/jOOQ/releases/tag/version-3.21.9
[j-build]: https://www.jooq.org/doc/3.21/manual/code-generation/codegen-execution/codegen-maven/
[j-daos]: https://www.jooq.org/doc/3.21/manual/code-generation/codegen-object-types/codegen-daos/
[j-generator]: https://github.com/jOOQ/jOOQ/blob/d28bb64e08ad218e9caba2c0c43e72916509f5d8/jOOQ-codegen/src/main/java/org/jooq/codegen/JavaGenerator.java#L5807-L5849
[j-daoimpl]: https://github.com/jOOQ/jOOQ/blob/d28bb64e08ad218e9caba2c0c43e72916509f5d8/jOOQ/src/main/java/org/jooq/impl/DAOImpl.java#L417-L436
[j-execution]: https://www.jooq.org/doc/3.21/manual/sql-execution/daos/
[j-editions]: https://www.jooq.org/download/
[j-db]: https://www.jooq.org/download/support-matrix
[j-jdk]: https://www.jooq.org/download/support-matrix-jdk
[m-release]: https://github.com/mapstruct/mapstruct/releases/tag/1.6.3
[m-doc]: https://mapstruct.org/documentation/stable/reference/html/
[m-license]: https://github.com/mapstruct/mapstruct/blob/b4e25e49deae707b50ce061172e114292b414a23/LICENSE.txt
[m-source]: https://github.com/mapstruct/mapstruct/blob/b4e25e49deae707b50ce061172e114292b414a23/core/src/main/java/org/mapstruct/Mapper.java#L101-L130
[m-unmapped]: https://github.com/mapstruct/mapstruct/blob/b4e25e49deae707b50ce061172e114292b414a23/processor/src/test/java/org/mapstruct/ap/test/unmappedtarget/UnmappedProductTest.java
[m-lossy]: https://github.com/mapstruct/mapstruct/blob/b4e25e49deae707b50ce061172e114292b414a23/processor/src/test/java/org/mapstruct/ap/test/conversion/lossy/LossyConversionTest.java
[r-release]: https://github.com/riok/mapperly/releases/tag/v4.3.1
[r-license]: https://github.com/riok/mapperly/blob/036698914bd48be888b25322938b565db72ff7ff/LICENSE
[r-install]: https://mapperly.riok.app/docs/getting-started/installation/
[r-config]: https://mapperly.riok.app/docs/configuration/mapper/
[r-diag]: https://mapperly.riok.app/docs/configuration/analyzer-diagnostics/
[r-enum]: https://mapperly.riok.app/docs/configuration/enum/
[r-query]: https://mapperly.riok.app/docs/configuration/queryable-projections/
[r-source]: https://github.com/riok/mapperly/blob/036698914bd48be888b25322938b565db72ff7ff/src/Riok.Mapperly.Abstractions/MapperAttribute.cs
[r-required]: https://github.com/riok/mapperly/blob/036698914bd48be888b25322938b565db72ff7ff/test/Riok.Mapperly.Tests/Mapping/RequiredMappingTest.cs
[r-clone]: https://github.com/riok/mapperly/blob/036698914bd48be888b25322938b565db72ff7ff/test/Riok.Mapperly.Tests/Mapping/EnumerableDeepCloningTest.cs
[s-release]: https://github.com/dotnet/runtime/releases/tag/v10.0.12
[s-license]: https://github.com/dotnet/runtime/blob/4271d88e0aebf3d04f188f1334c2220d80555ef6/LICENSE.TXT
[s-doc]: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/source-generation
[s-modes]: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/source-generation-modes
[s-source]: https://github.com/dotnet/runtime/blob/4271d88e0aebf3d04f188f1334c2220d80555ef6/src/libraries/System.Text.Json/gen/JsonSourceGenerator.Roslyn4.0.cs
[s-tests]: https://github.com/dotnet/runtime/blob/4271d88e0aebf3d04f188f1334c2220d80555ef6/src/libraries/System.Text.Json/tests/System.Text.Json.SourceGeneration.Tests/SerializationContextTests.cs#L184-L250
