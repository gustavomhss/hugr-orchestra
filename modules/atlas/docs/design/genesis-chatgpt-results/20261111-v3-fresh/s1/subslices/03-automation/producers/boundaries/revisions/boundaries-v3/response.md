# Entrega boundaries L1 v3

Aplicadas somente ROOT-BND-L1-F01 e ROOT-BND-L1-F02. §3.2 agora descreve execução e retorno do comando de trial sem grading/registro de veredito; preserva efeitos possíveis do shell, o limite de sanitização e os caminhos separados de check/evaluate. §6 descreve campos inteiros start/end sem lhes atribuir unidade de linha.

O corpo v2 foi preservado em history/body.md antes da mutação. O procedimento apply.py e suas entradas foram congelados em procedure-freeze.json antes da única invocação. recipe.json/request.txt/public-findings.md permanecem byte-idênticos às identidades fornecidas. dispatch-message.txt preserva o despacho literal. A ordem efetiva está em producer-verification.json.

Corpo anterior: 23665 bytes, SHA256 `ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6`, blob `6821d54aec4f8015dd00d634f632dc9960d1bd74`.
Corpo atual: 23769 bytes, SHA256 `937208953bb286da7bcefad8fd145d935a0ed00ee7d8f87d87c840973033d070`, blob `d3b070015882d10f778f563438eb3f9d67cab061`.

delta.json contém duas operações literais com offsets/hash, três segmentos inalterados e inversão byte-idêntica. delta.patch é o diff independente dos corpos integrais. review-supplement.md contém o delta e quatro excertos literais decisivos, com identidade das fontes, linhas/offsets/hash e mapa das duas afirmações correntes. Os registros antigos permanecem históricos.

Todos os inputs enumerados foram lidos integralmente; as leituras mecânicas, aliases de preservação, pedido, despacho, script e freeze também estão declarados em input-manifest-extension.json. A lineage anterior permanece integral: A3/A4/projection continuam inputs reais, sem recorte/reclassificação para contornar limite. Os outputs correntes não se tornam self-inputs.

Somente o corpo boundaries corrente mudou fora deste diretório revisional. Support/union não foram lidos ou alterados neste despacho. Não houve rede, produto/testes, providers, Atlas, oracle/juízes/descendentes ou delegação. Não foi produzida camada posterior nem self-PASS semântico. O mesmo par independente deve reavaliar antes de qualquer gate dependente. Tokens, physical attempts e custo: UNKNOWN quando não expostos.
