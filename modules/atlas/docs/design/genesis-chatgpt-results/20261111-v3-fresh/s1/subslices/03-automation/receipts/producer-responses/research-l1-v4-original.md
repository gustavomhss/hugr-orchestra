**Correção L1 research v4 concluída.** Foi aplicada **uma substituição literal na linha 225 de R8.1**, preservando todos os demais bytes do corpo.

O texto agora explicita `missing && !building && ctx.extract`, inclui tanto shard ausente quanto stale e distingue o retorno `building/unavailable` de um novo disparo de build. Também conserva a saída antecipada `index_unavailable` quando não há shards no escopo.

### Identidades do corpo

| Versão | Bytes | SHA-256 | Git blob |
| --- | ---: | --- | --- |
| V3 preservada | 63.841 | `f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f` | `72bdc55fdf2dbda97e84c87111be73fa49aceeb4` |
| V4 corrente | 64.106 | `c3925ca6e27465598796ef21815e79980277d4c3194a8b2fda7cf433700675d1` | `69fda8b4a63d5480b7d78e8f915e1d90fb8a2b8b` |

- [body.md — v4 corrente](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/research/body.md)
- [history/body.md — v3 preservada](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/research/revisions/v4/history/body.md)

### Pacote revisional completo

Todos os registros estão em `producers/research/revisions/v4/`:

| Registro | Bytes | SHA-256 |
| --- | ---: | --- |
| `apply.py` | 17.467 | `5bfdf994e961bdac05212b2a981aa8f50fcdf60bd5d440988fca5247e4bab89b` |
| `procedure-freeze.json` | 5.148 | `6cd8fcb3642f22bf1f6831047db7e4ecc7b4e782c1681ccec4e400f798858a48` |
| `delta.json` | 3.594 | `101c4331a8cda599527fbbfb60a2e96336cfae47f29d885b13c39dcf73903278` |
| `delta.patch` | 2.508 | `006c3d6f4a57f82863ff1a508408d4703d0e1cbe1d3aad94274133002cb4a0a7` |
| `review-supplement.md` | 6.375 | `b1d76b7ca5e1dd897846d6fa8398b32de921829598dbd32b07eb7e3c5d9a0081` |
| `input-manifest-extension.json` | 19.044 | `90281c42bf33b412090a99e8e2e791cf79c38c6c03380856309ed6ed05e23c02` |
| `producer-verification.json` | 8.268 | `4bdc8d36e2497a2f302361001769751f52e83514f73d1806cdd599052e98a182` |
| `response.md` | 2.939 | `ab45f984ea21f8f8aa17fef8403e8d702efd05d1dfff713af9ad860963d0f837` |

Para o mesmo par de juízes, o [review-supplement.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/research/revisions/v4/review-supplement.md) reúne o delta literal e **query.ts:176–225**, com identidade integral, linhas, offsets e hash do trecho. Não transmite decisões ou opiniões de outro juiz.

### Verificação e proveniência

O procedimento real foi congelado **antes de uma execução única**. A v3 foi copiada e comparada antes da mutação. Conferi novamente a substituição única, o diff independente, o trecho literal e a reconstrução inversa exata da v3. Os offsets UTF-8 são BEFORE `[35896, 36023)` e AFTER `[35896, 36288)`.

O manifesto declara **dez unidades integrais de input efetivamente consumidas**, mantém a linhagem anterior e usa a cópia da v3 como alias versionado, evitando colocar a v4 como seu próprio input. Pedido, receita, achados e dispatch literal estão preservados. O erro de sintaxe do bootstrap inicial, ocorrido antes de qualquer instrução ou escrita, está registrado no freeze e na [response.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/research/revisions/v4/response.md).

Nenhuma rede, publicação, teste de produto, delegação ou camada posterior foi executada. Não houve leitura de oracle, juízes ou descendentes. **Não emiti PASS; a v4 está pronta para a reavaliação independente pelo mesmo par.**