# S1-03 — adaptador mecânico do schema da entry

Criado [build-final-assembly-config-v2.py](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/scripts/build-final-assembly-config-v2.py) como cópia adaptada do builder original. **2 inputs de trabalho; 3 outputs**, contando o script v2, este REPORT.md e response.md. O trabalho é **pós-produção**: não altera a receita efetivamente usada, o pedido, os inputs ou os outputs do produtor.

## Alteração delimitada

O ramo específico de s1.subslice03.entry reconhece explicitamente o schema s1-03-derived-production-manifest/v1 e o record_kind POSTPRODUCTION_DESCRIPTIVE_MANIFEST_NOT_RETROACTIVE_RECIPE do manifesto original. Exige a chave de artefato correta, actual_inputs e effective_recipe; rejeita formas ambíguas, schema desconhecido da entry ou emprego desse formato em outro artefato.

Todos os **21 registros integrais** de actual_inputs permanecem na lista de inputs adicionais. O script confere contagens declaradas, ausência de paths duplicados e declaração de leitura integral. Mantém a verificação de tamanho, SHA-256 e Git blob sobre os bytes completos de cada arquivo, sem recortes ou exclusões.

O vínculo usa:

- Receita efetiva: effective_recipe.per_task_recipe → payload/recipes/derived/entry.json.
- Pedido: effective_recipe.request → producers/derived-entry/request.txt.
- Dispatch: effective_recipe.visible_dispatch → producers/derived-entry/dispatch-message.txt, preservado como input.
- Contrato comum: effective_recipe.common_contract, também preservado como input.

As quatro identidades declaradas devem coincidir com entradas efetivamente verificadas de actual_inputs. O manifesto descritivo não é transformado em receita retroativa. Os formatos legados já tratados pelo builder continuam no ramo anterior; o formato novo não é aplicado por fallback genérico.

A exigência dos **12 gates**, a conferência do hash do corpo, os vínculos dos dois juízes, a navegação, as fontes inteiras e a proibição de sobrescrever configuração congelada foram mantidas. Nenhuma montagem principal, helper adicional ou arquivo do produtor foi modificado.

## Identidades integrais

| Papel | Arquivo | Bytes | SHA-256 |
|---|---|---:|---|
| Input 1 | [build-final-assembly-config.py](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/scripts/build-final-assembly-config.py) | 6772 | 067100ef2e0c1cb8046ce1f1bfec1b6ce7e2645f26d215ee479a21b0bf8b16f6 |
| Input 2 | [production-manifest.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-entry/production-manifest.json) | 29258 | 32d73b791e1b34bbec004d4f9e269f368d4e4c5b5077dbbcaa4161212a6cef9e |
| Output 1 | [build-final-assembly-config-v2.py](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/scripts/build-final-assembly-config-v2.py) | 9475 | 10094da76fb59d7a11620c6cce065803fbf0e06e16de46a400404b9996ee633b |

## Verificação e limites

Foi feita somente análise sintática por ast.parse do script v2 e hashing dos arquivos autorizados e outputs. **Builder NOT_RUN**; o 12º gate estava pendente no dispatch e não foi consultado por esta tarefa. Não foram lidos os corpos, evidências, oracle, pareceres ou arquivos apontados pelo manifesto; nenhuma rede, operação Atlas, modelo externo ou teste de produto foi executado.

Os outros dois outputs são [REPORT.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/entry-schema-adapter/REPORT.md) e [response.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/entry-schema-adapter/response.md). response.md preserva exatamente o FINAL desta tarefa, sem LF terminal. Tokens, tentativas e custo: **UNKNOWN**.
