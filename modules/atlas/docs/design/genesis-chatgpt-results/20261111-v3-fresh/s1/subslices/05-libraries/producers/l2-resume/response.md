# Entrega original do produtor — quatro L2 locais

Produzidos os quatro candidatos contratados em `agents/produce_libraries/bodies/`. O estado é **REVIEW**, sem parecer semântico novo, sem fechamento global de R2 e sem liberação de L3/L4.

| Chave | Bytes UTF-8 | SHA-256 |
| --- | ---: | --- |
| `s1.subslice05.llm-contracts.l2` | 8399 | `5a65c4a80bf142d54a5e7eab30718090975d7d0e8d10cd6119340dfc134ed814` |
| `s1.subslice05.extension-contracts.l2` | 9532 | `59a9f41829855df521efcaf45ff42026f4bf0ff5c227a99a42624808e399d00e` |
| `s1.subslice05.storage-evidence.l2` | 10414 | `00d7d75ec6663c382bc8655c6b993d9da29dc4a205691a5f5158c882e1672d40` |
| `s1.subslice05.intent-authority.l2` | 10351 | `6a11153074477b25fcc7e10bb40946ef36208449cee279b061bb71dd5880d6f9` |

[fragment-metadata.json](sandbox:/workspace/scratch/dd08f46a3e40/agents/produce_libraries/fragment-metadata.json) usa o formato nativo e caminhos de corpo relativos ao diretório S1 de `native-package.json`; [local-path-map.json](sandbox:/workspace/scratch/dd08f46a3e40/agents/produce_libraries/local-path-map.json) liga esses caminhos aos arquivos locais. O prefixo remoto proposto é `subslices/05-libraries/producers/l2-resume/`. Nenhuma escrita remota ocorreu.

As dependências preservam os dez L1 C aceitos no alcance delimitado e quatro chaves Core efetivamente usadas: session-execution, persistence, configuration e config-project-supplement. Todas as quatro estão `ACCEPTED_BY_SAME_NATIVE_PAIR` no índice exato. Models/Runtime/Economy, Tools e completions pendentes não foram usados como fornecedores aceitos.

O vínculo de configuração resolve apenas a comparação específica decoder/schema: o loader inspecionado ignora excess properties com opção explícita, enquanto o schema capturado é fechado. Regeneração, igualdade/freshness de output e o restante de R2 continuam sem prova nova.

Foram preservados 323 paths e 39 disposições metadata-only. Duas leituras adicionais, `tool.ts` e `tool-runtime.ts`, totalizaram 12.664 bytes capturados no pin e esclareceram a conversão da falha de success schema para ToolFailure/eventos de erro. Nenhuma fixture não lida, fonte de oracle ou resposta esperada foi consultada. N03/X01 e os demais limites pertinentes permanecem explícitos.

O contrato local efetivamente lido tem um LF terminal a mais que o arquivo remoto canônico; o JSON é idêntico. Ambos os vínculos foram preservados sem atribuir ao commit remoto o hash da projeção local. Bytes/hashes dos predecessores e o censo de cobertura foram conferidos deterministicamente. Essas conferências não são testes do produto nem provas Atlas.

Request, receita, resposta, registros de leitura, proveniência e cobertura acompanham os corpos. Provider, ferramentas, banco, migração, replay, build, CI, Atlas e consumidores: **NOT_RUN**. Tokens, tentativas físicas de modelo e custo: **UNKNOWN**.
