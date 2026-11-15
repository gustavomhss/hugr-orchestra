# D15/D18 — complemento pronto

Arquivo: `producer/b3/v4/supplement-D15-D18.md` — **7038 bytes**, SHA256 **`73b95a7db8d2c61b2f62656eec02e6b19d6cf68b349840d46cced64cacdf61fd`**.

O complemento contém os três intervalos literais solicitados:

- **D15 — `packages/schema/src/maestro-event.ts`, linhas 737–768:** construção completa de `Definitions`, com todos os membros, seguida de `DurableOnlyDefinitions`. A comparação deixa de depender apenas do comentário sobre a superfície pública.
- **D18 — `packages/schema/src/lean-metrics.ts`, linhas 27–70:** função `decode` completa, incluindo o fechamento da condição inicial com `return undefined`, `counts(root.bytes)` e a recusa quando `bytes` é inválido.
- **D18 — mesmo arquivo, linhas 87–98:** função `counts` completa, verificação de inteiros seguros/aritmética e a chamada por `estimated`, com retorno `undefined` no caso inválido.

Cada trecho está acompanhado de path, blob, SHA256 da fonte, linhas, tamanho e SHA256 do intervalo. As identidades foram calculadas por script e conferidas contra os registros herdados. Detalhes em `producer/b3/v4/supplement-D15-D18-identities.json`.

**Nenhum claim ou corpo foi alterado.** O corpo atual continua com SHA256 `12248d1cc39a27b1655f1a683f02cd1af864f87945300a86b0ee4326227a4edd`; o dossiê D13–D18 continua com SHA256 `fb2dd55acba3dd59decadbc2e575e253bee6e95052d8f76ce79b2fe3b9743dac`.

Pedido, resposta e recibo desta rodada estão em `producer/b3/v4/round-4b/` (`request.txt`, `response.md`, `manifest.json`). Foram lidos somente os dois arquivos adicionais autorizados. Nenhuma execução de produto, teste, CI, geração ou Atlas ocorreu; nenhum L2–L4 foi produzido. Pronto para reavaliação pontual pela mesma dupla.
