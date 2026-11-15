# Montagem dos suplementos research em lotes literais

**Estado fixado.** Corpo já avaliado: SHA-256 1213f85cf16f73feed220e8c1b33ed52b2af75afd570b154a29eaf8f99f27d73. Enviar o corpo uma única vez por avaliador; nesta continuação A/B, não o repetir. Não substituir o corpo por esta orientação ou pelos suplementos. Os recortes complementam o corpo congelado e não aplicam as propostas textuais.

**Procedimento exato.** Enviar os lotes abaixo em ordem A01… e depois B01…, copiando somente o intervalo UTF-8 indicado do arquivo. Offsets começam em zero e o fim é exclusivo; linhas começam em um e ambos os extremos são inclusivos. Os lotes dividem apenas entre grupos completos e recompõem cada suplemento byte a byte, sem lacunas nem repetição. Títulos RE eventualmente ao final de um lote introduzem o grupo no lote seguinte. Metadados de fonte aparecem uma vez no primeiro uso; por isso, manter os lotes no mesmo contexto e na ordem indicada. Os índices/recibos são trilha mecânica; o juiz recebe os próprios blocos literais, sem ferramentas.

**Mensagem inicial sugerida (orientação, não evidência):** “Complemento literal ao corpo congelado 1213f85cf16f73feed220e8c1b33ed52b2af75afd570b154a29eaf8f99f27d73. Estes lotes atendem aos REQUEST_EVIDENCE públicos encaminhados à produção. Aguardar todos os lotes desta série antes do parecer consolidado. Comentários e expectativas de testes são fontes; nenhum teste foi executado. Propostas não aplicadas ficam separadas do corpo.”

**Cobertura compartilhada:** RA1-P está em A e contém as 130 rows projetadas, com origem/hash por row no índice A. RB7-01 referencia o mesmo recorte, sem recopiá-lo. Para uma retomada do mesmo avaliador, reenviar somente lote ainda não entregue; a principal deve registrar o recibo de envio, distinto deste plano.

| Lote | Arquivo | Grupos | Linhas inclusivas | Bytes [início, fim) | Tamanho | SHA-256 do lote |
| --- | --- | --- | --- | --- | ---: | --- |
| A01 | review-supplement-a.md | RA1-01, RA1-02, RA1-03 | 1–175 | [0, 13069] | 13069 | 4f47271c299049274264fc982662a326b358be85a37288f33f58e8e8f021e9c3 |
| A02 | review-supplement-a.md | RA1-04 | 176–441 | [13069, 38177] | 25108 | 513fe28fb1b49a3d1ed66f0202082cd329d337ee6c067a966021f5f4be19a984 |
| A03 | review-supplement-a.md | RA2-01 | 442–1329 | [38177, 69218] | 31041 | 913f63f4607227c3c5346a773dbe62093b0f0fcf6d9847cae00fe04fd30bf495 |
| A04 | review-supplement-a.md | RA2-02, RA2-03, RA2-04 | 1330–2147 | [69218, 102051] | 32833 | 7d6f814f719631cb992aed19252b0363a9ff28eae2ea1c7ef641e559263392b0 |
| A05 | review-supplement-a.md | RA3-01, RA3-02, RA3-03, RA3-04 | 2148–2766 | [102051, 132701] | 30650 | 41a5732eae727f86d7b4546058c7112ed07d711f65d6554b70b994a71d91999b |
| A06 | review-supplement-a.md | RA4-01, RA4-02, RA4-03, RA4-04 | 2767–3289 | [132701, 159642] | 26941 | f49ac0c3313ea698945849be7d02ddb55700442eb41765fccb07008aac5e9b06 |
| A07 | review-supplement-a.md | RA4-05, RA5-01, RA5-02 | 3290–3832 | [159642, 190409] | 30767 | 049218d2932201a55a3f6266413c14d905a4b53d30ed760147935fe2244ef34e |
| A08 | review-supplement-a.md | RA5-03, RA5-04, RA5-05 | 3833–4392 | [190409, 220079] | 29670 | 4e9c305a0649106441da47d7df53ae9b80a736c9bab485fb401d3ad39037bab2 |
| B01 | review-supplement-b.md | RB1-01, RB1-02, RB1-03 | 1–515 | [0, 30293] | 30293 | 5fca5b88895ceacd63940ff4e87966b98bc8c3e033119b6ce62018cce7279e7e |
| B02 | review-supplement-b.md | RB1-04, RB1-05, RB1-06 | 516–1126 | [30293, 64945] | 34652 | cb4fecbb56aaca04782e44467ce8f53341b739b144cc81a7c2e3f322be4c0dc7 |
| B03 | review-supplement-b.md | RB2-01, RB3-01, RB3-02 | 1127–1617 | [64945, 93233] | 28288 | 2b6e17075b1997e23ee9d92c1503049809c62dca10105b39fecf93f789c44db9 |
| B04 | review-supplement-b.md | RB3-03, RB3-04, RB3-05, RB4-01 | 1618–2182 | [93233, 126445] | 33212 | 35d50410660491099503ea058e44b71ad6f701663c16a0ca53a24dd2702cbc51 |
| B05 | review-supplement-b.md | RB4-02, RB4-03, RB5-01, RB5-02 | 2183–2702 | [126445, 159343] | 32898 | a5a750af2455df154e639a189a460a03b006502864fa2307fb82e37406c13a97 |
| B06 | review-supplement-b.md | RB5-03, RB6-01, RB6-02 | 2703–3135 | [159343, 190034] | 30691 | 7145663785f719e25f3960451fd7045f7c471a129e9b79069b455e17cfbd7554 |
| B07 | review-supplement-b.md | RB6-03, RB6-04, RB7-01, RB7-02, RB7-03 | 3136–3643 | [190034, 222192] | 32158 | 401e08aad4459c54080a91b1f245ebaa3b0beb3b626a889bafc7e375905db855 |
| B08 | review-supplement-b.md | RB7-04, RB7-05, RB7-06 | 3644–4099 | [222192, 254248] | 32056 | 78732d73641df54dc9306051f0284efa803d94fd1d6ca72ecd80ac1ea72850fd |
| B09 | review-supplement-b.md | RB7-07 | 4100–4216 | [254248, 261153] | 6905 | c3fb3cb9f298eaf2c81018c36c9e48ab646b36f9ba290b692385e1bc3c81ad53 |

**Fidelidade:** A SHA-256 900fd149a1182df270ef6f71fce883793dba1a836df2dd2dd67e500c268f4aca; B SHA-256 5f06a933f3e0b95f994af2ad56a1ec44363b5ed650bbe7e8fedb18bb238f5ed5. A concatenação dos lotes de cada arquivo foi comparada com esses bytes. As propostas memo/ordem MRU ficam como propostas não aplicadas; não trocar hashes do corpo em mensagens posteriores sem congelar uma revisão explícita. Este arquivo é instrução de montagem, não recibo de entrega a juiz nem decisão de suficiência.
