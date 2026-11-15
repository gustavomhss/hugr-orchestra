# Research — complemento literal residual e decisão agregada de L1 v2

Execução `34269cf4-d631-41c5-a30b-85b0ec217390`. Mesmo par J1/J2; sem ferramentas. Este pacote é transporte mecânico de uma fonte já capturada, não nova autoria de conteúdo. Nenhum oracle é incluído. O corpo continua v2: 63501 bytes, SHA256 `d2def4b82495605b491e0d5494b1511e1b68c47dcffa84af87c8d35705468661`. Nenhum byte do corpo foi alterado.

Reutilizar os lotes originais `research-a`/`research-b`, os suplementos `research-a-supplement-v2`/`research-b-supplement-v2` e os dois deltas literais já recebidos. A função abaixo completa o intervalo entre os trechos de RA-S058. Para a seleção do retido e atualização de ordem, o suplemento B já fornece `RB-S002` (`query.ts`, bloco `open`) e `RB-S003` (`store.ts`, linhas170–215, incluindo `touch`196–201). Essas referências reaproveitam evidência efetivamente transportada; não substituem sua avaliação.

## RESEARCH-RES-01 — extract.ts, linhas150–180

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; path `packages/core/src/research-toolkit/code-index/extract.ts`; Git blob `ccd710035774d754490d00f36eb16c0103355175`; arquivo 22551 bytes, SHA256 `80b2e9c6091bb6c342bfefa9582bd164fc5dffc239cdf67417dba4c0e79747af`. Intervalo literal: bytes [9545, 11514), 1969 bytes, SHA256 `3a2c129223f5a296e880bdcdb724f6115a811b0f504426d26e2cdaed653e07ff`. Somente os prefixos de número de linha são adicionados à renderização.

```text
150: 
151: const extract = Effect.fn("CodeIndexExtract.extract")(function* (
152:   input: Parameters<CodeIndexBuild.Extract>[0],
153:   launch?: { readonly executable: string; readonly memoryBytes: number },
154: ) {
155:   const selected = CodeIndexFilter.select(input.shard.files)
156:   const read = yield* Effect.forEach(selected.files, (file) =>
157:     text(input.root, file.path).pipe(Effect.map((content) => ({ ...file, text: content }))), { concurrency: 16 })
158:   const sources = read.flatMap((file) => file.text === undefined ? [] : [{ path: file.path, grammar: file.grammar, text: file.text }])
159:   const outlines = yield* Effect.forEach(sources, (file) => CodeIndexTreeSitter.extract(file.path, file.text, file.grammar), { concurrency: 8 })
160:   const dump: Scip.Index = input.indexer.id === STRUCTURAL ? { indexer: undefined, documents: [], malformed: 0 } : yield* scip(input, launch, new Map(sources.map((file) => [file.path, file.text])))
161:   const resolver = yield* CodeIndexResolve.make(input.root)
162:   return assemble({
163:     sources, outlines, dump,
164:     resolve: resolver.resolve,
165:     skipped: [
166:       ...selected.skipped,
167:       ...read.filter((file) => file.text === undefined).map((file) => ({ path: file.path, reason: "missing-in-worktree" })),
168:       ...outlines.flatMap((entry) => entry.coverage.complete ? [] : [{ path: entry.path, reason: entry.coverage.reason ?? "partial-parse" }]),
169:       ...(dump.malformed ? [{ path: input.shard.project, reason: `scip-malformed-occurrences:${dump.malformed}` }] : []),
170:       ...(input.indexer.id === STRUCTURAL ? [{ path: input.shard.project, reason: `structural-only:${input.indexer.version}` }] : []),
171:     ],
172:     language: input.shard.language,
173:   })
174: })
175: 
176: /**
177:  * One indexer run (J2.5, J2.13): the pack's executable, arguments and output file are the host's; the run is confined
178:  * (no network, writes only to its scratch and the dump), spawned through AppProcess under the D2 memory cap and the
179:  * per-shard timeout, with the project directory as cwd.
180:  */
```

## Pedido de decisão

Após receber este pacote integral e os suplementos A/B, decidir a suficiência do corpo L1 research v2 completo e seus deltas, usando todos os critérios pertinentes já recebidos. Preservar os pareceres anteriores e nomear qualquer finding obrigatório ainda aberto. PASS eventual é semântico para esta versão e seus inputs identificados; não é prova de execução de testes, publicação, consumidor, manutenção ou binding Atlas. Se os encadeamentos ainda não bastarem, solicitar somente a evidência exata que falta. Este texto não antecipa a decisão.
