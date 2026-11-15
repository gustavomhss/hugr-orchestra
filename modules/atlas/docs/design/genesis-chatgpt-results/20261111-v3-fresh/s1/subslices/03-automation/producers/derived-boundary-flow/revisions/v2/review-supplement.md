# Suplemento de revisão — boundary-flow L2 v2

## Identidade e escopo

Candidato `s1.subslice03.boundary-flow`, L2 `flow`, revisão 2. Corpo: 16484 bytes, SHA256 `e18fe141b88a3aba6ede8e8a0dd138876161984db36d4b8e5540f9ab329c0771`. Evidência: 10057 bytes, SHA256 `b87c56d31e6b0f846b0cab7e9d329bdcb40fcbffcbb1025a3cd4b864f0f97f4d`. A correção segue a receita de 5.580 bytes, SHA256 `19923925cfbf39dcbbb33cb8fb00615dd2b37c5678a250f41dbd09ad4a398d30`, e os achados públicos de 1.561 bytes, SHA256 `bdf2775890fc18bb642fc4e341b5984b8c2fb3fc0ef15217ded1650d44e196ca`.

O único predecessor atual é `s1.core.boundaries` L1 v3, 23.769 bytes, SHA256 `937208953bb286da7bcefad8fd145d935a0ed00ee7d8f87d87c840973033d070`, Git blob `d3b070015882d10f778f563438eb3f9d67cab061`. A receita registra os PASS de J1/J2 nos mesmos bytes; os pareceres integrais não foram consumidos. O corpo L1 v2 histórico, SHA256 `ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6`, ainda contém as imprecisões sobre trial e linhas de chunks. As correções dessas duas frases vêm do v3, sem atribuição retroativa.

## Reparos obrigatórios aplicados

| Achado público | Local | Resultado da autoria |
| --- | --- | --- |
| BFLOW-J1-F01 / BF-J2-F01 | Corpo §2; evidência §2 | Separados os parágrafos de delegação e mining: a delegação mantém disposição/diagnóstico por pergunta e envia resposta/justificativa/modelo à superfície; mining conserva omissão/abstenção, teto 1–200, concorrência quatro e staging sem promoção. A justificativa estruturada não é transferida entre contratos. A redação utiliza o nível de detalhe explicitado no L1 §2, sem acrescentar chamadas brutas. |
| BF-J2-F02 | Corpo §3; evidência §3 | Trial executa o comando e devolve resultado, sem grading nem registro de veredito, conservando possíveis efeitos. Check sem state directory permanece avaliação separada; não se acrescenta sanitização. Suporte: L1 v3 §3.2. |
| BF-J2-F03 | Corpo §7; evidência §7 | Chunks têm start/end inteiros sem unidade estabelecida pelo schema. Removida a unidade linhas. Suporte: L1 v3 §6. |

## Delimitação mecânica

O corpo tem exatamente três substituições substantivas e duas de identidade do predecessor. As seções 1, 4, 5, 6 e 8 permanecem byte-idênticas; os segmentos fora das cinco substituições também. O mapa de evidência recebeu apenas os vínculos desses reparos e a atualização necessária de identidade, gate, histórico e contagem cumulativa. Manifesto e resposta foram atualizados como registros da revisão.

`delta.json` guarda os literais completos antes/depois, offsets zero-based em bytes UTF-8, hashes dos segmentos inalterados e verificação inversa para os quatro outputs atuais. `delta.patch` é a apresentação unificada determinística do mesmo delta. O procedimento real `apply.py` foi congelado em `procedure-freeze.json` antes da aplicação; os quatro outputs v1 já estavam preservados em `history/`. O manifesto cumulativo contém 28 unidades, com aliases estáveis e linhagem dos paths de leitura; os outputs atuais não são self-inputs.

## Estado para o par

Pronto para reavaliação pelos mesmos J1/J2. A verificação foi apenas de arquivos, identidades, escopo de substituições e inversão; não há self-PASS. Nenhum oracle, parecer integral ou fonte bruta foi aberto. Rede, GitHub, produto, testes, Atlas, consumidores, manutenção e camadas posteriores não foram executados. Tentativas físicas, tokens e cobrança: UNKNOWN.
