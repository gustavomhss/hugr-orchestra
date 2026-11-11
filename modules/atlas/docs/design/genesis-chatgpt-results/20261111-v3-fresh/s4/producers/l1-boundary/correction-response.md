# Correção WP-L1-BOUNDARY — v2

Entregue `body-v2.md`, com **11972 bytes UTF-8**, para a mesma unidade `S4:L1:host-boundaries`, scope `atlas-continuity-rag-genesis`, layer 1, need evidence. A correção preserva todos os arquivos e hashes v1.

## Diff substantivo

Foi acrescentado, com localizador **C:277–329** (`packages/core/src/session/compaction.ts`), o comportamento do node padrão: os três métodos de `make` são `compact`, `compactIfNeeded` e `compactAfterOverflow`; `transform` devolve `input.messages`, enquanto `afterStep` não produz efeito. A contribuição Continuity continua descrita separadamente, com instalação global não demonstrada. Foram abreviadas frases locais redundantes e atualizados os nomes dos arquivos de metadados/proveniência no corpo. Não mudou a evidência RAG/Atlas nem seus limites.

Os **37 source_refs permanecem idênticos** à v1: 31 fontes semânticas e 6 de instrução. O mapa tem agora **57 localizadores**, sem novo arquivo fonte. A releitura pontual foi compaction.ts:258–330; os bytes da fonte continuam no baseline `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Os inputs de payload apontam às receitas/proveniência efetivas desta revisão e aos registros preservados necessários, sempre abaixo de 256000 bytes.

## Arquivos e hashes

- `body-v2.md`: `53a5fbc410f54421c80a73b51dd96b88f46edba9898f115083be051ee815d22a`.
- `recipe-v2.json`: `fa525df5574cd2953f1b6d5fb1a8ba9e71ad0b12f74bafc4283419bf9dfaf712`.
- `source-provenance-v2.json`: `844642de83937264f6078c24d864ed301974b63ec4b5b633e0418ff399b7dc0d`.
- `correction-request.md`: `d1468e3c97c39606882268cfd68a64b625fa0e24ef4d022074af62db96c45c0c` — pedido literal, referenciado junto do pedido original na receita.
- `body-v2.diff`: `35817e9cd6541bd3541e8f5b733ab7e26cab287d370c36c8b01c321dfb3ef6d8`.
- `artifact-v2.json` registra este corpo e esta resposta; seu hash final fica no recibo v2 separado para evitar autorreferência.

Arquivos em `/workspace/scratch/aff930d22ec7/s4/producers/l1-boundary/`. `validity=supported` continua limitado às constatações estáticas. `build_dependencies=[]`, `semantic_review_refs=[]` e `runtime_receipt_refs=[]` permanecem vazios. Nenhum teste de produto, remoto, oracle, nova delegação ou execução operacional foi realizado. A população atribuída segue com 2.220 caminhos.
