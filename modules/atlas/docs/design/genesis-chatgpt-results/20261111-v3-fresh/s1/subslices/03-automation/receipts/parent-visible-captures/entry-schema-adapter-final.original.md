Criei o adaptador mecânico [build-final-assembly-config-v2.py](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/scripts/build-final-assembly-config-v2.py), preservando o builder original e o manifesto do produtor.

O ramo da entry aceita explicitamente o schema original, mantém os **21 inputs integrais** de `actual_inputs`, usa `effective_recipe.per_task_recipe` como receita efetiva e `effective_recipe.request` como pedido. `visible_dispatch` e o contrato comum permanecem inputs verificados. O ramo rejeita schema desconhecido, ambiguidade, contagem incoerente, duplicação de paths e divergência de identidade.

As checagens de tamanho, SHA-256, Git blob, 12 gates e vínculos de revisão foram preservadas. A sintaxe do v2 foi conferida por AST; **o builder não foi executado**.

**2 inputs de trabalho; 3 outputs:**

1. [build-final-assembly-config-v2.py](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/scripts/build-final-assembly-config-v2.py) — **9475 bytes**, SHA-256 **10094da76fb59d7a11620c6cce065803fbf0e06e16de46a400404b9996ee633b**.
2. [REPORT.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/entry-schema-adapter/REPORT.md) — inclui os hashes dos dois inputs e do script v2.
3. [response.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/entry-schema-adapter/response.md) — este FINAL integral, sem LF terminal.

É uma adaptação **pós-produção**, sem mudança de receita, pedido ou input do produtor. Nenhum corpo, evidência, oracle ou parecer foi aberto; não executei rede, Atlas ou testes. Tokens, tentativas e custo permanecem **UNKNOWN**.