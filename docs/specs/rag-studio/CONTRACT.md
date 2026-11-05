# Rag Studio — contrato congelado

Id: `rag-studio-v1`. Hash: `fb61d451`. Re-frozen after the cold spec review, including `readRevision`. The hash `2f0ba82b` did not include that call. `7c2ae7a5` contradicted A65 and A84.

Ninguém renegocia estes tipos. O comportamento está na suíte `ACCEPTANCE.md`. O que não está aqui fica livre dentro de um único pacote de trabalho.

## Tipos

```ts
type FileStatus = "not_yet_read" | "read" | "failed"
type Light = "not_in_corpus" | "search_miss" | "dropped_before_model" | "sent"
type PassName = "reparse" | "rechunk" | "redo_numbers" | "orphan_delete"
type Fill = "complete" | "failed"

interface Source {
  id: string
  locationId: string
  path: string
  contentHash: string
  status: FileStatus
}

interface Chunk {
  id: string
  sourceId: string
  start: number
  end: number
  text: string
  sourceHash: string
}

interface Pipeline {
  parser: string
  boundary: string
  tokenizer: string
  lexical: true
  embedding: false
  k: number
}

interface Revision {
  id: string
  snapshot: string
  pipelineHash: string
  fill: Fill
}

interface SpanRef {
  sourceId: string
  start: number
  end: number
}

interface QuestionResult {
  revisionId: string
  light: Light | null
  reasons: Record<Light, string>
  fileStatus: FileStatus | null
  span: SpanRef | null
  hits: string[]
  dropped: string[]
  promptText: string
  promptChunkIds: string[]
  retrievalOptional: boolean
}
```

## Funções

Os nomes estão fechados na spec. `redo_numbers` devolve `not_applicable`, não `wrote: false`.

```ts
admit(input: { locationId: string; path: string }): Promise<Source | { refused: "atlas" | "permission" }>
listSources(locationId: string): Promise<Source[]>
removeSource(sourceId: string): Promise<void>
parseSource(sourceId: string): Promise<Source>
replaceChunkText(chunkId: string, text: string): Promise<{ refused: "not_source_text" }>
readPipeline(locationId: string): Promise<Pipeline>
setPipeline(locationId: string, field: PipelineField, value: string | number): Promise<Pipeline>
readRevision(revisionId: string): Promise<Revision>
searchWords(revisionId: string, word: string): Promise<Chunk[]>
ask(revisionId: string, text: string): Promise<QuestionResult>
saveQuestion(revisionId: string, text: string, span: SpanRef): Promise<{ id: string }>
retrievalProof(questionId: string, revisionId: string): Promise<boolean>
citationProof(questionId: string, sentence: string): Promise<boolean>
compareRevisions(leftId: string, rightId: string, proofSetId: string): Promise<{ rejected: true } | { questions: CompareRow[] }>
enableEmbedding(): Promise<{ refused: "embedding_off" }>
runPass(pass: PassName, sourceId: string): Promise<{ pass: "redo_numbers"; result: "not_applicable" } | { pass: PassName; fill: Fill }>
runPasses(passes: PassName[]): Promise<{ refused: "one_pass" }>
```

## Decisões que o contrato já tomou

- Código do projeto não entra. Caminho que só canonicamente cai na árvore também não. A resposta é `{ refused: "atlas" }`. Nada é escrito em `.atlas/`.
- Embedding não liga. `enableEmbedding` recusa. `redo_numbers` devolve `not_applicable` e não escreve.
- O intervalo é `start` e `end` no texto admitido. Busca é substring, não FTS5.
- Uma pergunta não cria chat e não devolve resposta de modelo.
- Quatro passes, uma chamada cada. `runPasses` com tamanho diferente de 1 recusa e não escreve.
- O registro de capítulo, o grupo HTTP e o `module-architecture.json` são do lead. Nenhum pacote de trabalho escreve neles.
