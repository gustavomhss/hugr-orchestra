**Revisão L2 v3 concluída e pronta para o mesmo par de juízes.** O único predecessor semântico corrente é `s1.core.research` **L1 v4**, com **64.106 bytes**, SHA-256 `c3925ca6e27465598796ef21815e79980277d4c3194a8b2fda7cf433700675d1`.

A releitura integral confirmou a compatibilidade da correção RF-J2-F01 já produzida. **F3 e todos os bytes de F1–F8 permaneceram idênticos à v2.** Foram feitas somente quatro alterações de metadados:

- **F0:** versão, tamanho e hash do predecessor.
- **E0:** identidade, gate e registro de leitura do L1 v4, com o L1 v3 preservado como proveniência histórica.
- **E1:** vínculo direto da condição de build ao R8.1 do novo predecessor aceito.
- **E3:** registros de verificação e contagens atuais, distinguindo-os das versões históricas.

### Identidades atuais

| Arquivo | Bytes | SHA-256 |
| --- | ---: | --- |
| [body.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-research-flow/body.md) | 17.124 | `f2c19caaa501ea0e135cbbfb4768b4bd68c4e729e5545cb5f80e45c655f52ab7` |
| [evidence.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-research-flow/evidence.md) | 12.878 | `6c6d9c59bf75c0636598315fad3d850426f9d473cc7cbd0ba2f385165992a614` |
| [production-manifest.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-research-flow/production-manifest.json) | 54.847 | `a6fa0d012f2d43eceaf033b570ed1cfe4a09f6089c1df1a720e663c2753efeb8` |
| [response.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-research-flow/response.md) | 2.144 | `1adbff35cf2884d6dc2a3fff4ae2703227cea6f045503a20f58c78b030f77696` |

### Procedimento e registros de revisão

O script e seus inputs foram congelados **antes da execução**. A verificação final confirmou essa ordem, quatro edições de metadados, nenhuma edição substantiva, preservação dos segmentos restantes e **inversão exata dos deltas para os arquivos v2**.

| Registro em `revisions/v3/` | Bytes | SHA-256 |
| --- | ---: | --- |
| [apply.py](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-research-flow/revisions/v3/apply.py) | 20.110 | `fa8fb1920a259dda654fb75321d41bcd4416c8c03b69facbe7dcdd5088d48435` |
| [procedure-freeze.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-research-flow/revisions/v3/procedure-freeze.json) | 38.389 | `ab1c664955412b66e61c88a6213974944ec50ff4d9cadda593c5a3004db8ad4e` |
| [delta.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-research-flow/revisions/v3/delta.json) | 15.355 | `ed857fc8035e8995ff52247170eae49e416a47ae1812760328aea6587065560f` |
| [delta.patch](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-research-flow/revisions/v3/delta.patch) | 11.130 | `33abda8cf8387856ebe28a818cf1f17b20434cd705f10322f0b997d92e782e3b` |
| [review-supplement.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-research-flow/revisions/v3/review-supplement.md) | 11.742 | `2ab915b6becb96e0523fa59bad64ebd4ac1f73d3bc27c256cd371984a06bcd47` |
| [input-manifest-extension.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-research-flow/revisions/v3/input-manifest-extension.json) | 34.417 | `4db94d8d4a5a028d742b4cd6f82d81c175ca3ae2194f42d3922f368e85acd26f` |
| [producer-verification.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-research-flow/revisions/v3/producer-verification.json) | 2.909 | `751047a4ae095416c488ba28c83ca85cbfed37b82b47e460fde62d2e73909b39` |

O dispatch literal tem **1.273 bytes**, SHA-256 `2319e6ae0efd79115f68d417dba4e6297bde4546d33f540840a1995fc6eaddaa`. O recibo de preservação tem **2.545 bytes**, SHA-256 `ec68bad4886debb07d01a4b70695d7a1e3c3cde0b98ff524919a02e517ee37d5`.

### Preservação e proveniência

- Os quatro outputs **v2** estão preservados byte a byte em `producers/derived-research-flow/revisions/v3/history/`.
- O histórico **v1**, os pedidos, dispatches, receitas e procedimentos anteriores permanecem intactos.
- O L1 v3 anterior usa o alias autorizado `producers/research/revisions/v4/history/body.md`; ele é **contexto histórico, sem aresta de build corrente**.
- Foram registrados e conferidos **45 inputs integrais únicos, totalizando 500.591 bytes**: 28 do manifesto anterior, cinco registros v2 efetivamente lidos nas verificações anteriores e 12 unidades desta revisão.
- Todos os inputs têm `local_path`, tamanho, SHA-256 e blob Git. A linhagem dos caminhos originais está separada dos aliases. **Nenhum output corrente é auto-input.**
- Foram verificados **18 arquivos de saída**: quatro correntes, quatro cópias históricas e dez registros v3. O response corrente é byte-idêntico ao response preservado em `revisions/v3/response.md`.

**A conferência independente da principal e a reavaliação semântica da v3 continuam pendentes.** Nenhum parecer L2 v2 foi presumido, nenhum self-PASS foi emitido e nenhuma camada posterior foi liberada. Não houve fonte bruta, oracle, parecer integral, rede, delegação, operação de produto/Atlas, testes ou consumidores.

**Tentativas físicas, tokens e custo não expostos: UNKNOWN.**