**Correção mínima de `s1.core.boundaries` v3 concluída**, com uma única execução do procedimento previamente congelado.

O [corpo v3](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/boundaries/revisions/boundaries-v3/body.md) tem **23.769 bytes**, SHA256 **`937208953bb286da7bcefad8fd145d935a0ed00ee7d8f87d87c840973033d070`** e Git blob **`d3b070015882d10f778f563438eb3f9d67cab061`**. Os mesmos bytes estão no `bodies/boundaries.md` corrente.

### Duas alterações, somente

- **ROOT-BND-L1-F01 — §3.2:** removida a atribuição de “dry grading” a `trial`. O texto agora descreve execução e retorno do comando, sem grading nem registro de veredito nesse percurso. Preservados os efeitos possíveis do shell, o limite da afirmação sobre sanitização e os caminhos separados de `check` e `evaluate`.
- **ROOT-BND-L1-F02 — §6:** removida a unidade “linhas” dos chunks. O texto descreve campos inteiros `start`/`end`, **sem unidade declarada pelo schema**.

A verificação confirmou **duas substituições exatas**, **três segmentos restantes byte-idênticos** e reconstrução inversa integral do corpo v2.

### Registros entregues

Todos estão em `producers/boundaries/revisions/boundaries-v3/`.

| Registro | Bytes | SHA256 |
|---|---:|---|
| [procedure-freeze.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/boundaries/revisions/boundaries-v3/procedure-freeze.json) | 10.260 | `671995910e5e85b1a4dcdbaea8ecec19fa3f762e800fa7fed8467806b0907d03` |
| [delta.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/boundaries/revisions/boundaries-v3/delta.json) | 3.340 | `204aa0a2b338053ff545b51ec01096d7094a101677e60005f4d082d93c23acd2` |
| [review-supplement.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/boundaries/revisions/boundaries-v3/review-supplement.md) | 9.151 | `b2458ebc0d3499394873afc9baa24cee46f680fd344ca805165e6249606b4036` |
| [input-manifest-extension.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/boundaries/revisions/boundaries-v3/input-manifest-extension.json) | 36.415 | `53eb33d86d3f96c4f4c38a6023af697f384f80745eebacba478e659d98875964` |
| [producer-verification.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/boundaries/revisions/boundaries-v3/producer-verification.json) | 15.054 | `d1cd48d3b366f1168cdd98b92de6bc7b066152ead3b69a7493e9c563052eb965` |

Também foram entregues `dispatch-message.txt`, `apply.py`, `history/body.md`, `delta.patch`, `review-supplement.index.json` e [response.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/boundaries/revisions/boundaries-v3/response.md). O suplemento contém **quatro excertos literais decisivos**, com commit, path, linhas, offsets e hashes.

### Preservação e estado

O corpo v2 foi preservado **antes da mutação** em `history/body.md`, mantendo SHA256 `ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6`. A receita, o pedido e os achados fornecidos permaneceram intactos. O manifesto registra leituras integrais, leituras mecânicas, procedimentos e aliases; conserva a linhagem anterior e os inputs históricos integrais.

**Support e union não foram abertos nem alterados neste despacho.** Não houve rede, execução de produto/testes, acesso a oracle/juízes/descendentes, delegação ou produção de camada posterior.

Estado: **`PENDING_SAME_PAIR_REEVALUATION`**. A entrega está pronta para o mesmo par independente; nenhum aceite semântico foi atribuído pelo produtor.