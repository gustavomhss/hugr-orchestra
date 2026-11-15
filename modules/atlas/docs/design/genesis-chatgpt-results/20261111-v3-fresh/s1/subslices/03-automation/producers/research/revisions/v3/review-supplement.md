# Research v3 — suplemento literal RB-J2-F01

Correção documental única em R8. A contagem 1 + 32 = 33 decorre da leitura estática dos ramos abaixo; nenhum teste ou produto foi executado. Este suplemento não é o parecer agregado dos juízes.

## Delta do corpo

BEFORE (v2, SHA-256 d2def4b82495605b491e0d5494b1511e1b68c47dcffa84af87c8d35705468661):

~~~text
`locate.ts` combina termos/símbolos/pergunta, mapa e buscas, com orçamento máximo de 32 buscas, no máximo dez buscas de vizinhos, cinco seeds e três snippets por arquivo.
~~~

AFTER (v3, SHA-256 f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f):

~~~text
`locate.ts` combina termos/símbolos/pergunta, mapa e buscas. Com índice utilizável, a seleção reserva uma chamada `map` e até dez buscas de vizinhos dentro do orçamento de 32; sem `sources.query`, permite até 32 listas lexicais. Se `sources.query` existe, mas a sondagem `map` retorna `index_unavailable` ou `index_building`, essa chamada já ocorreu e não é descontada das 32 listas lexicais: 16 termos distintos podem gerar 33 consultas internas. O limite é de cinco seeds e três snippets por arquivo.
~~~

## Ramos e contratos literais

Os IDs RB-S005/RB-S032 são os mesmos do suplemento B. Os intervalos adicionais curtos da fixture explicitam o map utilizável e o teste building sem asserção de teto; todos pertencem aos mesmos arquivos fixados. Comentários e expectativas são conteúdo de fonte, sem execução.

### RB-S005 — packages/core/src/research-toolkit/locate.ts

Commit 1cde2ff7a71bcf7aecb5d030917b577165135d38; 16148 bytes; SHA-256 0ebac9d228ca1764020e0f7ccf260228dc02c1169c0143c07f258e7c7ac650f2; Git blob d1343801f7b336d5e5b46eac860f6a07a0ae19fa. Arquivo integral: sources/packages/core/src/research-toolkit/locate.ts.

Linhas 37–43; bytes brutos 149; SHA-256 do intervalo a09a6fa5a7b035b52c445e8f86581789c7fc8b467beeeb89f5a027ed7a0cd939.

~~~text
37: export const MAX_SEARCHES = 32
38: export const DEFAULT_LIMIT = 12
39: const RRF_K = 60
40: const PER_FILE = 3
41: const CONTEXT = 3
42: const PAGE = 50
43: const SEEDS = 5
~~~

Linhas 56–79; bytes brutos 1884; SHA-256 do intervalo 241f6e9f17a2e4f530d245d5055986a2dce7efed8ee2cceaca3c63381c828253.

~~~text
56: export const run = Effect.fn("Locate.run")(function* (input: CodeIndex.LocateInput, sources: Sources) {
57:   const started = Date.now()
58:   const limit = input.limit ?? DEFAULT_LIMIT
59:   const scope = (input.paths ?? []).map((pattern) => new Bun.Glob(pattern))
60:   const inScope = (file: string) => !scope.length || scope.some((glob) => glob.match(file))
61:   if (!input.question && !input.terms?.length && !input.symbols?.length)
62:     return yield* new Research.Error({ code: "unsupported", message: "code_locate needs at least one of question, terms or symbols" })
63:   const prior = yield* ranks(sources.query)
64:   const query = prior ? sources.query : undefined
65:   const rank = prior ?? new Map<string, number>()
66:   const terms = [...new Set([...(input.terms ?? []), ...(input.question ? extract(input.question) : []),
67:     // Without an index, symbol names can only be found lexically.
68:     ...(query ? [] : (input.symbols ?? []).map((symbol) => symbol.split(".").at(-1) ?? symbol))])]
69:   // The prior costs one search; neighbours keep two per seed. The rest goes to terms and symbols, best lists first.
70:   const first = [
71:     ...(query ? (input.symbols ?? []).map((symbol) => definitions(query, symbol, inScope)) : []),
72:     ...terms.map((term) => lexical(sources.search, term, "lexical", input.paths)),
73:     ...(query ? (input.symbols ?? []).map((symbol) => named(query, symbol, inScope)) : []),
74:     ...terms.map((term) => lexical(sources.search, term, "lexical-wide", input.paths)),
75:   ].slice(0, MAX_SEARCHES - (query ? 1 + 2 * SEEDS : 0))
76:   const lists = yield* Effect.forEach(first, (planned) => planned.run, { concurrency: "unbounded" })
77:   const second = query ? [...new Set(fuse(lists, rank).map((unit) => unit.path))].slice(0, SEEDS)
78:     .flatMap((file) => neighbours(query, file, inScope)) : []
79:   const near = yield* Effect.forEach(second, (planned) => planned.run, { concurrency: "unbounded" })
~~~

Linhas 187–199; bytes brutos 683; SHA-256 do intervalo 41ef7a0a4be2d003d5dea2922a0e184c8a55a00777455435b8c29d8ca2a91000.

~~~text
187: /**
188:  * L5: PageRank position over the resolved import graph, used only to break ties. One `map` page. It also probes the
189:  * index: an index that is not ready yields undefined, and locate degrades to the lexical lists (J3.7).
190:  */
191: function ranks(query: Sources["query"]) {
192:   if (!query) return Effect.succeed(undefined)
193:   return query({ op: "map", limit: 200 }).pipe(
194:     Effect.map((result) => new Map(result.hits.map((hit, index, hits) => [hit.range.path, 1 - index / hits.length] as const))),
195:     Effect.catchIf((error) => UNINDEXED.has(error.code), () => Effect.succeed(undefined)),
196:   )
197: }
198: 
199: const UNINDEXED = new Set<Research.Error["code"]>(["index_unavailable", "index_building"])
~~~

### RB-S032 — packages/core/test/research-locate.test.ts

Commit 1cde2ff7a71bcf7aecb5d030917b577165135d38; 8418 bytes; SHA-256 ef4ff4e93af664f8810da34386b235ef33071fcbba9868bf9904aa40f72f801a; Git blob 53aed544518715b880e3415295e94da7756cc9ad. Arquivo integral: sources/packages/core/test/research-locate.test.ts.

Linhas 34–62; bytes brutos 1479; SHA-256 do intervalo afeb22edfa8cc31a3661842d2b5a69b0c532c7142b287b5a5084be35dd09dff6.

~~~text
34: function sources(over: Partial<Locate.Sources> = {}, files: Record<string, string> = FILES) {
35:   const calls = { search: [] as CodeIndex.SearchInput[], query: [] as CodeIndex.CodeQuery[], retained: [] as string[] }
36:   const value: Locate.Sources = {
37:     search: (input) => Effect.sync(() => {
38:       calls.search.push(input)
39:       const matches = Object.entries(files).flatMap(([path, text]) => text.split("\n").flatMap((line, index) => {
40:         const found = input.caseSensitive ? line.includes(input.pattern) : line.toLowerCase().includes(input.pattern.toLowerCase())
41:         return found ? [{ path, line: index + 1, text: line }] : []
42:       }))
43:       return { matches, basis: basis() }
44:     }),
45:     query: (query) => Effect.sync(() => {
46:       calls.query.push(query)
47:       if (query.op === "map")
48:         return { ...empty(), hits: Object.keys(files).map((path) => ({ range: { path, startLine: 1, endLine: 1 }, role: "definition" as const })) }
49:       if (query.op === "definition" && query.name === "assemble") return { ...empty(), resolved: assemble }
50:       if (query.op === "importers" && query.path === "src/assemble.ts")
51:         return { ...empty(), hits: [{ range: { path: "src/use.ts", startLine: 1, endLine: 1 }, role: "import" as const }] }
52:       return empty()
53:     }),
54:     read: (path) => Effect.succeed(files[path]),
55:     retain: (snapshot) => Effect.sync(() => {
56:       calls.retained.push(snapshot)
57:       return REF
58:     }),
59:     ...over,
60:   }
61:   return { value, calls }
62: }
~~~

Linhas 98–114; bytes brutos 1129; SHA-256 do intervalo 581f5c889e20c0bb5c68127d7978e0f2b2e1fc2d418ee06979f5566110055e97.

~~~text
98:   test("runs at most 32 searches per call", async () => {
99:     const fake = sources()
100:     const names = Array.from({ length: 16 }, (_, index) => `name${index}`)
101:     const result = await run({ terms: names, symbols: names.map((name) => `Sym${name}`) }, fake.value)
102:     expect(fake.calls.search.length + fake.calls.query.length).toBeLessThanOrEqual(Locate.MAX_SEARCHES)
103:     expect(result.searches.length + 1).toBeLessThanOrEqual(Locate.MAX_SEARCHES)
104:     expect(result.searches.length).toBeGreaterThan(16)
105:   })
106: 
107:   test("without an index runs the lexical lists only and declares the languages it reached", async () => {
108:     const result = await run({ symbols: ["assemble"] }, sources({ query: undefined }).value)
109:     expect(new Set(result.searches.map((search) => search.kind))).toEqual(new Set(["lexical", "lexical-wide"]))
110:     expect(result.ranges.some((range) => range.path === "src/assemble.ts" && range.startLine <= 3 && 3 <= range.endLine)).toBe(true)
111:     expect(result.basis.freshness).toBe("fresh")
112:     expect(result.basis.coverage.languagesMissing).toContain("ts")
113:     expect(result.basis.coverage.complete).toBe(false)
114:   })
~~~

Linhas 116–121; bytes brutos 417; SHA-256 do intervalo e30b9a119dcf52fceccfc0645aa270335a0a2ab41ea41babe8b589e59cef20c8.

~~~text
116:   test("an index still building degrades to the lexical lists", async () => {
117:     const fake = sources({ query: () => Effect.fail(new Research.Error({ code: "index_building", message: "building" })) })
118:     const result = await run({ terms: ["assemble"] }, fake.value)
119:     expect(result.searches.every((search) => search.kind.startsWith("lexical"))).toBe(true)
120:     expect(result.ranges.length).toBeGreaterThan(0)
121:   })
~~~

## Leitura limitada ao achado

RB-S005 chama ranks antes da seleção e zera query após a falha admitida. Nesse ramo, slice não desconta a chamada já feita; 16 termos distintos permitem 16 listas lexical e 16 lexical-wide. O teste de teto usa a fixture com map bem-sucedido. O teste sem índice passa query: undefined; o teste building usa um termo e verifica a degradação, sem contar o teto. Esta é a razão da qualificação documental, sem alterar o produto nem alegar teste executado.
