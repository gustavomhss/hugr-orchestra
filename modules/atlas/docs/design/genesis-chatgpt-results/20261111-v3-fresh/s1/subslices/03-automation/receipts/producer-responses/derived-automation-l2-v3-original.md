Concluí a correção **L2 v3 de s1.subslice03.automation-flow**, restrita ao achado obrigatório **AF-L2-J2-01**.

A célula Dispatch/GitHub agora distingue **prova de `workflow_dispatch` na branch padrão** de **leitura da fonte da ref selecionada**, conforme o predecessor aceito e o exemplo público da receita. O HTTP 204 continua sem atribuição.

**Somente essa cláusula mudou.** A inversão da substituição reproduziu integralmente o corpo v2. Todos os demais bytes permanecem iguais, incluindo a §8 inteira e as duas correções anteriores do scheduler.

### Arquivos e identidades v3

| Arquivo | Bytes | SHA256 |
| --- | ---: | --- |
| [body.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-automation-flow/body.md) | 16570 | `64d97f6da72c92a00ad8e3d91e20a42fd360dbedb502733c0548746462442287` |
| [evidence.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-automation-flow/evidence.md) | 16141 | `c5d3a9803fb90ba58dbf2d37bcf94dd43adf166bc68e2d88fc06b0c93a067067` |
| [revisions/v3/delta.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-automation-flow/revisions/v3/delta.json) | 5411 | `4bf714451cb85c7c614f57faec1be7effe02a5bbf0271b8cfe3ef2b2d240b20a` |
| [revisions/v3/dispatch-message.txt](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-automation-flow/revisions/v3/dispatch-message.txt) | 1520 | `4fff1b29411f19321d656897a2ab13cb5c65589e4652e1f8a790fb49642ffbb0` |

[production-manifest.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-automation-flow/production-manifest.json) registra **31 inputs cumulativos**, um predecessor de build e **seis outputs desta correção**. Mantém os aliases históricos e `original_read_paths`, além das receitas, pedidos e dispatches anteriores; identifica a receita v3 e o pedido v3 efetivamente usados. Inclui a identidade de [response.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-automation-flow/response.md), que contém exatamente esta resposta, sem LF terminal. A identidade do próprio manifesto foi calculada externamente após a gravação.

A delta conserva as identidades integrais antes/depois, o único replacement, a igualdade da inversão e a preservação dos fixes de scheduler. Histórico, pedidos e dispatches anteriores permanecem preservados.

**Limites:** não houve oracle, parecer completo, nova fonte, rede/GitHub, ferramenta ou teste de produto, operação Atlas ou delegação. Tentativas físicas, tokens e cobrança permanecem `UNKNOWN`. O L2 ainda não tem gate duplo; o mesmo par examinará os bytes v3 antes de qualquer liberação de dependentes. Não houve avanço para L3.