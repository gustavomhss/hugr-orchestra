Entreguei os descritores mecânicos dos quatro corpos L1, com identidades verificadas e sem alterar os originais.

### Arquivos

- [descriptors.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/descriptors.json) — arrays completos por artefato, fontes, inputs, referências candidatas e temporalidade.
- [materialization-plan.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/materialization-plan.json) — tabela de 594 destinos e as cópias necessárias.
- [REPORT.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/REPORT.md) — decisões de proveniência, pins e lacunas precisas.
- [verification.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/verification.json) — conferência documental de 1.319 arquivos observados, sem divergências.
- [observed-identities.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/observed-identities.json) — hashes dos bytes observados.
- [assemble_descriptors.py](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/assemble_descriptors.py) e [verify_descriptors.py](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/verify_descriptors.py) — geração e verificação documental, sem executar receitas ou Atlas.
- [request.txt](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/request.txt) e [followups.txt](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/followups.txt) — instruções visíveis preservadas.

| Artefato | Input keys / source refs | Recipe ref selecionado |
|---|---:|---|
| automation v4 | 263 / 263 | `revisions/v4/apply.py` |
| research v2 | 153 / 153 | `correction-v2-request.txt` |
| boundaries v2 | 60 / 60 | `records/prepare_boundaries_v2.py` |
| support v2 | 140 / 140 | `records/prepare_support_v2.py` |

**Todos os source_refs locais têm caminho e identidade comprovados em P `f6ffb725704cc01682847d7e175f22b6ead3894c`**, por comparação com o índice e os bytes do snapshot publicado, ligado ao recibo existente de readback. Nenhum usa H como commit de conteúdo. A auditoria research posterior permanece somente proveniência com commit ainda ausente; não foi promovida a input/source_ref.

No native-source, **505 destinos já estão byte-idênticos e 89 precisam de cópia**. Os **96 arquivos pertinentes já estão byte-idênticos no payload**; não há conflitos. Não efetuei cópias.

Mantive seis inputs únicos acima de 256.000 bytes: projeção histórica 726.892, Modelina 266.885 e quatro arquivos anteriores efetivamente lidos pelo procedimento de preservação de automation: 953.016, 338.932, 375.497 e 404.469 bytes. A3/A4 também permanecem integrais. O limite de capacidade continua explícito.

As receitas JSON posteriores ficaram fora dos inputs retroativos. Research conserva 152 unidades efetivas e acrescenta somente o registro da mensagem escolhido como recipe_ref; armazenamento posterior e wire SHA **UNKNOWN** estão expressos. As demais lacunas são inventário completo de scripts temporários iniciais, telemetria do branch condicional de cópia em boundaries e os campos/juízos que pertencem à principal e ao par. Nenhum semantic_review_ref, aceite ou binding foi inventado.

### Identidades principais

- `descriptors.json`: 903949 bytes; SHA-256 `cc4c2cf63301a3df4da44efe53535766642bf1c7acea8f7eb9fd0783eed66c19`.
- `materialization-plan.json`: 1138771 bytes; SHA-256 `56b6e787d7cb3b4346d3b36a224e5246038446e407a859db2b74bc19e455f5a6`.

Sem rede, oracle/reserved, testes, execução de receitas, prepare ou publicação. A tarefa concreta está concluída; o slot fica livre para a próxima autoria.
