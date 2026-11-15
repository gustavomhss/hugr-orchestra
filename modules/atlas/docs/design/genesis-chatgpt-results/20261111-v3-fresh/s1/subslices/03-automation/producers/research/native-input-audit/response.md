# Auditoria dos inputs efetivos — research L1 v2

Manifesto concreto entregue em native-input-disposition.json. A identidade de cada input é o arquivo original inteiro; leitura semântica seletiva não reduz essa unidade.

- 130 fontes normativas usadas, nas famílias 59 backend-toolkit e 71 research, com identidades confrontadas com captures.json.
- 16 shared_inputs declarados e consumidos, todos vinculados ao mapa canônico somente após igualdade exata de SHA-256, tamanho e Git blob.
- 6 unidades locais de versões anteriores: cinco arquivos efetivamente lidos na correção v2 e um corpo ancestral da v1. Os aliases de recipe.json/history/recipe-v1.json representam a mesma unidade; o body v1 resolve para history/body-v1.md.
- 2 registros de instrução preservam mensagens da principal; não são apresentados como arquivos executáveis preexistentes. Sete controles de conversa documentados têm sua proveniência separada.
- 14 outros outputs, evidências e recibos recebem disposição explícita como não-inputs do corpo v2. Ler/hashing posterior não cria dependência retroativa.

A3, A4 e a projeção histórica inteira são inputs reais do reaproveitamento. Permanecem obrigatórios a projeção de 726.892 bytes e Modelina de 266.885 bytes. Nenhum foi recortado, omitido ou substituído por hash. AGENTS.md aponta para a autoridade original, fora do namespace de resultados.

As propostas dos índices A/B foram consumidas de fato para as duas substituições. recipe.json era um relato da v1 e foi usado como base administrativa de recipe-v2.json; recipe-v2 e este relatório são saídas posteriores, não o procedimento executado. O comando real da correção v2 foi inline. Não há inventário integral comprovado de eventuais scripts temporários da produção inicial; nenhum arquivo de receita executável foi inventado retroativamente.

Preservação: os 153 arquivos anteriores, somando 3.566.724 bytes, coincidem integralmente com before.json. O próprio before.json permanece no SHA-256 c2209c0a4a9fa9e6b2e50a62d53bd9da04b4d723068813f4e99d1195692949ea. Corpo v2 permanece d2def4b82495605b491e0d5494b1511e1b68c47dcffa84af87c8d35705468661 (63501 bytes). Verificação detalhada em preservation.json.

Identidades desta entrega:

- native-input-disposition.json: 377085 bytes; SHA-256 3b1695b21f8bb70014e65acd200456b8dd56e0bf7688cfe6bbe3aa003c240b79.
- preservation.json: 74861 bytes; SHA-256 844800c734b8beb96c4db5c742574e55b0e440aff76e2633800af16bce4f313b.

Incertezas específicas constam do manifesto: não há hash de um script persistido que nunca foi retido como arquivo; bytes de transporte originais das mensagens e leituras históricas em detalhe de token não são reconstruídos; publicação remota dos aliases locais não foi verificada nesta auditoria. Tokens, tentativas físicas e custos não expostos permanecem UNKNOWN. Sem rede, oracle, L2, teste de produto ou publicação; a revisão semântica permanece externa.
