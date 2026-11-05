export function enableEmbedding(): Promise<{ refused: "embedding_off" }> {
  return Promise.resolve({ refused: "embedding_off" })
}
