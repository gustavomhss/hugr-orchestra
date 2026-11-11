# Produção L2A concluída para revisão

Foram produzidas exatamente duas sínteses cumulativas `layer=2`, `need=component`, scope `atlas-continuity-rag-genesis`, a partir do manifesto fixado SHA-256 `00812b16cc21f2520bf16d46747417917f3f4c069309b2bb11a170c1ecc1f3ca` e dos predecessores aceitos no commit `8a041ca66982dcc2b89aaed46ebe347cb3de57db`.

## Conteúdo acrescentado

- **S4:L2:atlas-system:** organiza responsabilidades do motor e do host, explica efeitos de mudança de identidade/autoridade/inputs, distingue CAS de seleção publicada e aponta as portas e paths úteis para manutenção. Relaciona a fronteira externa do host sem lhe atribuir autenticação ou hooks de Session não demonstrados.
- **S4:L2:genesis-governance:** liga cobertura e profundidade à seleção de inputs/receitas, distingue dependências de consulta e explica aceitação semântica, transformação/binding, publicação e consumo. Separa piloto e automação históricos do adapter novo e lê release/CI com seus respectivos pins e limites.

O release preserva uma amostra anterior e campos antigos de andamento. O manifesto fixa L1 completa aceita; o recibo CI identifica o candidato posterior. Esses registros não publicam as novas sínteses nem transferem suas decisões de binding.

## Corpos e dependências

| Corpo | Bytes UTF-8 | SHA-256 | Predecessores semânticos |
|---|---:|---|---:|
| atlas-system.md | 7954 | `cc061470d976df7253db34d5ffebd4310de0bb7f4d3866723ed0746a5a99bbbc` | 5 |
| genesis-governance.md | 7933 | `b84b7c172ed2c777f259e3ff16dff83f27867c80db954d8e8c24ba8924c12228` | 4 |

Os metadados são independentes: o primeiro artefato usa ownership-boundaries, atlas-engine, atlas-host-genesis, native-runtime-delta e host-boundaries; o segundo usa ownership-boundaries, atlas-host-genesis, coverage-governance e native-runtime-delta. CI é fonte adicional dos dois; runtime-release somente do segundo. Cada artefato tem seis source_refs exatos e file inputs nos mesmos caminhos, além dos inputs próprios de receita/pedido/manifesto/proveniência. Navegação entre as duas sínteses é apenas consulta.

## Arquivos

Todos estão em `/workspace/scratch/aff930d22ec7/s4/producers/l2a/`: corpos, `artifacts.json`, `recipe.json`, pedido literal, manifesto byte exato, fontes copiadas em `inputs/`, mapas `*-sources.json`, resposta e recibo mecânico. `recipe.json` SHA-256: `f19c56dca48f8ba0b826660631742451a457645ae303580d16633686273fbe7f`. `review-packet-01.txt` e `review-packet-02.txt` conterão os corpos/metadados exatos e as identidades dos predecessores, com limite de 32000 bytes por parte e a marca AGUARDAR FECHAMENTO DO PRINCIPAL. Nenhuma parte foi enviada aos juízes.

## Limites

Não houve redescoberta de fonte bruta, teste/build/runtime, alteração de produto/candidato ou escrita remota. A sustentação proposta é `supported` dentro dos limites herdados e declarados; `semantic_review_refs=[]` e `runtime_receipt_refs=[]` permanecem vazios. Persistem profundidade seletiva, limites de observação, integração/autenticação externas, recuperação geral e composição entre scopes/pacotes. Metadados de modelo, tokens e custo não expostos são `UNKNOWN`. O recibo mecânico verifica apenas bytes, tamanhos, seções e correspondência de referências; não é juízo semântico.
