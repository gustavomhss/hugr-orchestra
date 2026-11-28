# S4 — controles comuns: evidência para revisão independente

Este documento reúne evidência recuperada, sem emitir julgamento formal sobre o novo release. Os excertos de log abaixo removem apenas sequências ANSI para legibilidade; `common-ci.log` preserva o texto UTF-8 integral devolvido pelo conector, inclusive BOM inicial e newline final.

## Identidade e captura

- Runtime executado: `db9b4235022c4df32fe3bfd4faeea8adcd69abb7`.
- Árvore: `3c93c4636c1e4c4b704f8be9314e22b2149e5609`.
- [Run 43343953480](https://github.com/gustavomhss/hugr-orchestra/actions/runs/43343953480), tentativa 1, job `131618674434`, `pilot`, conclusão `success`.
- Workflow `.github/workflows/atlas-pilot.yml`, blob `e4a3036ffecd684d52c70a4c8cd346be9601e5c3`.
- Log original: `common-ci.log`, **125.694 bytes**, SHA-256 `efc3d912bc0ed3cd3d089c290e091bcf28c6d870737e675fd00d4088f0587778`.
- Recuperado novamente por `github.fetch_workflow_job_logs` em 2026-11-28; recibo local `common-ci.capture.json`.

## Resultado realmente observado nos logs

Os números à esquerda são linhas do log integral. Estas são saídas remotas do job, não resultados fabricados a partir da leitura dos testes.

```text
709: 2026-11-13T01:19:07.9417500Z db9b4235022c4df32fe3bfd4faeea8adcd69abb7
721: 2026-11-13T01:19:08.9583608Z db9b4235022c4df32fe3bfd4faeea8adcd69abb7
742: 2026-11-13T01:19:10.5032822Z node: v24.22.2
775: 2026-11-13T01:19:12.0310394Z 1.3.14+0d9b296af
928: 2026-11-13T01:19:51.2097510Z  ✓  unit  packages/adapter-io/test/genesis-native-recovery.test.ts (4 tests) 2100ms
929: 2026-11-13T01:19:51.2135238Z      ✓ NR1-01 interruption before activation leaves HOLD or the valid old manifest; resume reuses durable candidate/CAS  579ms
930: 2026-11-13T01:19:51.2139072Z      ✓ NR1-02 failed activation after source drift serves HOLD; incompatible rollback is refused and historical reads stay explicit  482ms
931: 2026-11-13T01:19:51.2143614Z      ✓ NR1-03 stale transport, scope rebinding and old approval cannot replace the new accepted scope  335ms
932: 2026-11-13T01:19:51.2153427Z      ✓ NR1-04 a separate reader overlaps real sidecar activation and sees only complete accepted manifests  702ms
939: 2026-11-13T01:19:53.1684881Z stdout | packages/adapter-io/test/ownership-observe.test.ts > G2.2 host observer > HO-02 file ceiling applies to bytes actually read
940: 2026-11-13T01:19:53.1687090Z ownership input ceiling resource observation: {"ceiling_bytes":2097152,"elapsed_ms":504.833629,"max_rss_kib":204544,"memory_scope":"cumulative Vitest worker peak"}
944: 2026-11-13T01:19:54.6466003Z  ✓  unit  packages/adapter-io/test/ownership-observe.test.ts (15 tests) 2899ms
945: 2026-11-13T01:19:54.6467621Z      ✓ HO-02 file ceiling applies to bytes actually read  1392ms
957: 2026-11-13T01:19:57.2187994Z  ✓  unit  packages/adapter-io/test/ownership-input.test.ts (2 tests) 95ms
961: 2026-11-13T01:19:59.3021222Z  ✓  unit  packages/adapter-io/test/genesis-native.test.ts (25 tests) 7215ms
962: 2026-11-13T01:19:59.3022128Z      ✓ prepares and serves a complete source at the shared ceiling, then detects last-byte drift  4789ms
965: 2026-11-13T01:19:59.3052697Z  Test Files  27 passed (27)
966: 2026-11-13T01:19:59.3053517Z       Tests  278 passed (278)
1123: 2026-11-13T01:20:53.8642785Z guards: 78 rules, 1446 changed paths, 0 gate and 4 warn findings, 0 errors.
```

O run passou **278 testes em 27 arquivos**. O arquivo do observer passou 15 testes; o native bridge, 25; recovery, quatro; ownership-input, dois. HO-02, o caso native de limite/último byte e os quatro NR1 possuem títulos PASS visíveis individualmente. Os títulos de cada instância parametrizada de compatibilidade de tamanho não foram impressos pelo reporter; sua execução é sustentada pelo PASS agregado do arquivo de 15 testes no SHA fixado.

A observação de recurso reportada foi `ceiling_bytes=2097152`, `elapsed_ms=504.833629` e `max_rss_kib=204544`, com escopo explícito **cumulative Vitest worker peak**. Não é medição de memória exclusiva de um arquivo nem promessa de heap máximo igual ao tamanho de entrada.

## Predicados nos fontes imutáveis

A tabela separa o que cada teste exige no código do que o log realmente mostra. O encadeamento de evidência é: commit/árvore fixados → blob do teste → caso incluído no workflow → PASS do caso ou do arquivo. O log não imprime o valor de cada assertion.

| Caso | Assertion no fonte fixado | Resultado remoto visível |
|---|---|---|
| Teto exato | HO-02 exige `ownershipInputMaxBytes == 2*1024*1024`; grava exatamente 2.097.152 bytes; espera `present` e ID de todos os bytes. | HO-02 PASS; métrica imprime 2.097.152. |
| Um byte acima | HO-02 grava 2.097.153 bytes e exige `unavailable`, com projeção legada `undefined`, não `absent`. | Mesmo HO-02 PASS; não há linha separada serializando a recusa. |
| Cauda | HO-02 altera somente o último byte de 1 para 2 e exige versão diferente. Native muda o último byte de 10 para 13; exige HOLD e recusa `native-source-drift`. | HO-02 e caso native de last-byte drift PASS. |
| Identidade anterior | Teste parametrizado exige ownership-source v1 sobre todos os 256.000, 256.001 e 1.131.057 bytes, incluindo BOM, decomposição Unicode, CRLF e binário. | `ownership-observe.test.ts (15 tests)` PASS; títulos parametrizados individuais não impressos. |
| Restauração de conteúdo | HO-01 altera um arquivo, restaura seus bytes e muda mtime para 2020/2030; exige retorno da versão original. | Mesmo arquivo de 15 testes PASS; HO-01 não aparece individualmente neste log. |
| Retomada | NR1-01 interrompe antes de ativar; exige CAS durável, HOLD ou seleção antiga válida, retomada sem repetir geração e candidato antigo intacto. | NR1-01 PASS individual. |
| Versões antigas | NR1-02 recusa rollback incompatível e binding antigo, permite leitura histórica explícita e compara bytes de requisição/resposta/pacote/candidato/aprovação/corpo e objeto CAS antigo. | NR1-02 PASS individual. |
| Troca de escopo | NR1-03 impede que transporte obsoleto, rebind de escopo ou aprovação antiga substituam o escopo novo aceito. | NR1-03 PASS individual. |
| Concorrência delimitada | NR1-04 requer sobreposição temporal da leitura principal com ativação real de sidecar e somente manifests aceitos completos. | NR1-04 PASS individual. |

### Observer: fonte e assertions selecionadas

[ownership-observe.test.ts no candidato](https://github.com/gustavomhss/hugr-orchestra/blob/db9b4235022c4df32fe3bfd4faeea8adcd69abb7/modules/atlas/packages/adapter-io/test/ownership-observe.test.ts), blob `6634d269bc38f0cf3740e6de19a8b0b0fea83b5c`. Os números são linhas do fonte; intervalos omitidos não alteram o texto citado.

```typescript
19: const fileVersion = (bytes: Uint8Array): string =>
20:   String(id({ kind: "ownership-source", version: 1, bytes: Array.from(bytes) }))
35:     writeFileSync(join(f.repoPath, "src", "util.ts"), "export function greet(name: string): string {\n  return `hi ${name}`;\n}\n")
36:     utimesSync(join(f.repoPath, "src", "util.ts"), new Date("2020-01-01T00:00:00Z"), new Date("2020-01-01T00:00:00Z"))
37:     expect(observeOwnershipInput(f.repoPath, "file:src/util.ts")).toEqual(observed)
38:     utimesSync(join(f.repoPath, "src", "util.ts"), new Date("2030-01-01T00:00:00Z"), new Date("2030-01-01T00:00:00Z"))
39:     expect(observeOwnershipInput(f.repoPath, "file:src/util.ts")).toEqual(observed)
42:   it("HO-02 file ceiling applies to bytes actually read", () => {
43:     const f = makeFixRepo()
44:     cleanups.push(f.cleanup)
45:     expect(ownershipInputMaxBytes).toBe(2 * 1024 * 1024)
46:     const bytes = new Uint8Array(ownershipInputMaxBytes).fill(255)
47:     bytes[bytes.length - 1] = 1
48:     writeFileSync(join(f.repoPath, "empty.txt"), new Uint8Array(0))
49:     writeFileSync(join(f.repoPath, "exact.txt"), bytes)
50:     writeFileSync(join(f.repoPath, "over.txt"), new Uint8Array(ownershipInputMaxBytes + 1))
59:     expect(exact).toEqual({ kind: "present", version: fileVersion(bytes) })
60:     bytes[bytes.length - 1] = 2
61:     writeFileSync(join(f.repoPath, "exact.txt"), bytes)
62:     expect(observeOwnershipInput(f.repoPath, "file:exact.txt")).not.toEqual(exact)
63:     expect(observeOwnershipInput(f.repoPath, "file:over.txt")).toEqual({ kind: "unavailable" })
64:     expect(ownershipInput(f.repoPath, "file:over.txt")).toBeUndefined()
72:   it.each([256000, 256001, 1131057])("keeps the v1 identity over all %i bytes, including text encodings and binary", (length) => {
73:     const f = makeFixRepo()
74:     cleanups.push(f.cleanup)
75:     const bytes = new Uint8Array(length).fill(255)
76:     bytes.set(text("\ufeffCafe\u0301\r\n"))
77:     bytes[bytes.length - 1] = 128
78:     writeFileSync(join(f.repoPath, "source.bin"), bytes)
79:     expect(observeOwnershipInput(f.repoPath, "file:source.bin")).toEqual({ kind: "present", version: fileVersion(bytes) })
```

### Native bridge: fonte e assertions selecionadas

[genesis-native.test.ts no candidato](https://github.com/gustavomhss/hugr-orchestra/blob/db9b4235022c4df32fe3bfd4faeea8adcd69abb7/modules/atlas/packages/adapter-io/test/genesis-native.test.ts), blob `fcb6b787dce85bb275d1b8772e7afd34718b0d5c`.

```typescript
114:   it("prepares and serves a complete source at the shared ceiling, then detects last-byte drift", async () => {
115:     const f = fixture()
116:     const bytes = new Uint8Array(ownershipInputMaxBytes).fill(97)
117:     bytes.set(new TextEncoder().encode("\ufeff// Cafe\u0301\r\n"))
118:     bytes[bytes.length - 1] = 10
122:     source.source_refs[0] = {
123:       commit: f.pack.source_revision, path: "src/large.ts",
124:       git_blob_sha: nativeBlobSha(bytes), sha256: nativeSha256(bytes),
125:     }
126:     const prepared = f.prepare()
127:     const version = String(id({ kind: "ownership-source", version: 1, bytes: Array.from(bytes) }))
128:     expect(prepared.candidate.observations.find((input) => input.key === "file:src/large.ts"))
129:       .toEqual({ key: "file:src/large.ts", version, sha256: nativeSha256(bytes) })
130:     const entry = prepared.candidate.entries[1]!
131:     expect(entry.inputs.find((input) => input.key === "file:src/large.ts")).toEqual({ key: "file:src/large.ts", version })
132:     expect(version).not.toBe(source.source_refs[0]!.sha256)
144:     bytes[bytes.length - 1] = 13
145:     f.write("src/large.ts", bytes)
146:     expect(f.runtime().ownership.read(query)).toMatchObject({ kind: "hold", reason: "ownership-input-changed" })
147:     await expect(publishNativePackage(f.repoPath, prepared, "native/approval.json")).rejects.toThrow("native-source-drift: src/large.ts")
```

Esse teste usa um pacote e decisões de fixture explicitamente sintéticos. O PASS demonstra o comportamento técnico de preparar/servir/refusar deriva; não representa binding nem publicação dos domínios S1 ou S2.

### Recovery: preservação de bytes e leitura histórica

[genesis-native-recovery.test.ts no candidato](https://github.com/gustavomhss/hugr-orchestra/blob/db9b4235022c4df32fe3bfd4faeea8adcd69abb7/modules/atlas/packages/adapter-io/test/genesis-native-recovery.test.ts), blob `6afce21027c84af72c2e9e02bdda3142933c43a4`.

```typescript
208:     expect(reader.ownership.read(query).kind).toBe("hold")
209:     expect(createDiskStore(join(f.repoPath, ".atlas/cas")).get(first.prepared.candidate_id)).toEqual(first.prepared.candidate)
210:     expect(await publishNativePackage(f.repoPath, reopen(f.repoPath, first), first.approvalPath)).toMatchObject({ kind: "publication-attempt", emission: { data: { emitted: true } } })
211:     expect(reader.ownership.read(query)).toMatchObject({ kind: "ready", manifest: firstManifest, historical: false })
212:     expect(f.calls).toEqual(["first"])
217:     expect(projectionBytes(f.repoPath)).toEqual(before)
218:     expect(reader.ownership.read(query)).toMatchObject({ kind: "ready", manifest: firstManifest })
219:     expect(await publishNativePackage(f.repoPath, reopen(f.repoPath, second), second.approvalPath)).toMatchObject({ kind: "publication-attempt", emission: { data: { emitted: true } } })
220:     expect(reader.ownership.read(query)).toMatchObject({ kind: "ready", manifest: secondManifest })
221:     expect(f.calls).toEqual(["first", "second"])
222:     expect(readFileSync(join(f.repoPath, first.preparedPath), "utf8")).toBe(firstBytes)
239:     expect(reader.ownership.read(query)).toMatchObject({ kind: "hold", reason: "ownership-input-changed" })
240:     expect(reader.ownership.read({ ...query, historical: true })).toMatchObject({ kind: "ready", manifest: published.ownership, historical: true })
241:     expect(reader.ownership.read(independentQuery)).toMatchObject({ kind: "ready", manifest: independent })
242:     expect(await publishNativePackage(f.repoPath, reopen(f.repoPath, next), next.approvalPath)).toMatchObject({ kind: "publication-attempt", emission: { data: { emitted: true } } })
243:     const beforeRollback = projectionBytes(f.repoPath)
244:     await expect(publishNativePackage(f.repoPath, reopen(f.repoPath, old), old.approvalPath)).rejects.toThrow("native-source-drift")
245:     await expect(publishNativePackage(f.repoPath, reopen(f.repoPath, next), old.approvalPath)).rejects.toThrow("native-binding-candidate")
247:     expect(projectionBytes(f.repoPath)).toEqual(beforeRollback)
248:     expect(reader.ownership.read(query)).toMatchObject({ kind: "ready", manifest: nextManifest, historical: false })
249:     expect(reader.ownership.read(independentQuery)).toMatchObject({ kind: "ready", manifest: independent })
250:     expect(readOwnership(createDiskStore(join(f.repoPath, ".atlas/cas")), published.ownership, { ...query, historical: true }, f.current)).toMatchObject({ kind: "ready", historical: true })
251:     expect(bytesOf(f.repoPath, protectedPaths)).toEqual(protectedBefore)
252:     expect(readFileSync(join(f.repoPath, ".atlas/cas", published.ownership.slice(0, 2), published.ownership), "utf8")).toBe(oldCas)
```

## Limites da reutilização

Os controles comuns são reutilizáveis para o código `db9b423` e para o escopo comprovado acima. O job também concluiu os 22 probes de mutação definidos pelo workflow, typecheck, geração do boundary e guards históricos; o log preserva 22 caminhos `ownership-probe-*.json`. Os guards reportaram zero gate, quatro warnings e zero erros. O SHA histórico de `origin/dev` não foi capturado neste run, portanto esse resultado não equivale ao guard contra a `dev` atual.

A listagem de artefatos do run está vazia na captura atual; o workflow tinha retenção de sete dias. O log comprova o upload histórico do artifact `14001051122`, ZIP SHA-256 `c6df13373d71e091cf842a603e1d25b241ffca7652ea73775419ee3f01da0871`. Os JSONs individuais de assertions não foram reextraídos desse ZIP. O log original permanece preservado nesta entrega.

Os controles sintéticos comuns não substituem os recibos novos de `prepare` dos pacotes completos, a verificação de sua proveniência e hashes, nem a recusa real de arquivo inacessível. Não demonstram queda de energia arbitrária, concorrência distribuída ou um veto cronológico universal a toda versão antiga. O aceite independente do release e o binding/publicação de cada domínio permanecem decisões próprias.
