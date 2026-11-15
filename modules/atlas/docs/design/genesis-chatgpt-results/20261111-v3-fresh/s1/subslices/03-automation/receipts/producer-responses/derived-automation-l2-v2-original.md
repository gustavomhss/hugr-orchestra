Concluí a correção **L2 v2 de s1.subslice03.automation-flow**, limitada aos dois achados públicos anteriores à primeira revisão semântica.

- **AF-L2-PREVIEW-01:** os dois `holds` agora estão explicitamente restritos à claim ainda não admitida, mantendo separada a verificação de presença/identidade do owner.
- **AF-L2-PREVIEW-02:** o replay de capability manualKey conserva todos os casos restantes, inclusive `running` com SessionInput, sem restringir esse ramo às rows assentadas.

As duas cláusulas foram substituídas pelos literais do predecessor L1 v4 aceito. **A inversão das substituições reproduziu integralmente o corpo v1; todos os demais bytes do corpo permanecem iguais.**

### Arquivos e identidades v2

| Arquivo | Bytes | SHA256 |
| --- | ---: | --- |
| [body.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-automation-flow/body.md) | 16541 | `5b24037431881e96ddb5a872fd6541c94880d189d8b0c873bac9d8bd874d85c1` |
| [evidence.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-automation-flow/evidence.md) | 14569 | `0c4bff02eec8c4dbca2886127f1546bd51707060df8306ba4e630dba73f990d8` |
| [revisions/v2/delta.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-automation-flow/revisions/v2/delta.json) | 5990 | `09184ba9f3d0e84625e8a240bc148e65c29fc16777c449f011d8e115db8c6617` |
| [revisions/v2/dispatch-message.txt](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-automation-flow/revisions/v2/dispatch-message.txt) | 1370 | `b5cf544c85c7f3fae4739c200210f829a8b72a7bbb65eab809799fa198621e93` |

[production-manifest.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-automation-flow/production-manifest.json) registra **24 inputs cumulativos**, um predecessor de build e **seis outputs desta correção**, com os aliases históricos e `original_read_paths` preservados. Identifica a receita v2 e o pedido v2 efetivamente usados, mantendo o contrato, a receita, o pedido e o dispatch iniciais como inputs. O manifesto inclui a identidade de [response.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-automation-flow/response.md), cujo texto é exatamente esta resposta, sem LF terminal; a identidade do próprio manifesto foi calculada externamente após a gravação.

Os quatro outputs v1 de histórico, o pedido e o dispatch iniciais, o plano e o predecessor permanecem nas identidades fixadas. A delta registra identidades integrais antes/depois, os dois replacements e a igualdade da reversão.

**Limites:** nenhuma rede, nova fonte, parecer de juiz, oracle, teste de produto, operação Atlas ou delegação. Tentativas físicas, tokens e cobrança continuam `UNKNOWN`. O corpo L2 v2 inteiro aguarda a primeira revisão do mesmo par; nenhuma camada dependente foi liberada.