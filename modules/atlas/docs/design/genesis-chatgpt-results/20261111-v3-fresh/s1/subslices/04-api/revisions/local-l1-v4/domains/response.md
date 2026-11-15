# B3 v4 — pronto para a mesma dupla

Concluí o corpo único dos **24 domínios e 190 paths**, os quatro dossiês e o complemento obrigatório D09. Nenhum L2–L4 foi produzido; o estado semântico permanece pendente do julgamento de J1/J2.

Todos os caminhos abaixo são relativos a `producer/` no root autorizado.

| Entrega | Caminho | Bytes | SHA256 |
| --- | --- | ---: | --- |
| Corpo único v4 | `b3/v4/domain-disposition.md` | 38062 | `36339a1329421f80d15e37b40ce26edd6e1c793a0ac1b5056471e4df2bfed57c` |
| D01–D06 | `b3/v4/dossier-D01-D06-v4.md` | 12454 | `e98967118c9da0a74dc4fc8a89bd7a5462e68b22c3a6f4f34da2ae4c3729c746` |
| D07–D12 | `b3/v4/dossier-D07-D12-v4.md` | 15736 | `7f7406a6c749c237b7d28071f37a6229a1b06d98b913cec0b0f186736b6fe206` |
| D13–D18 | `b3/v4/dossier-D13-D18-v4.md` | 33794 | `fb2dd55acba3dd59decadbc2e575e253bee6e95052d8f76ce79b2fe3b9743dac` |
| D19–D24 | `b3/v4/dossier-D19-D24-v4.md` | 25735 | `3a8c595f42b86ff616dd4092803584edc4892d60a9c9dc8316073d5e03615045` |
| Complemento D09 | `b3/v4/supplement-D09-mcp-catches.md` | 1971 | `282a547c7ebcc18ec8fb1c0987f47813725bea695a9ddc010673bfa40feddfb6` |
| Manifesto do corpo/dossiês | `b3/v4/manifest.json` | 3672 | `7258cdd82d613b9fc8e11a2e51032d33fd0778e64e26a4edacd21092843ef931` |

**D01–D12 reaproveitam os literais v2 já enviados à mesma dupla**, com os arquivos-base, hashes e intervalos explicitamente vinculados. **D13–D24 incluem os literais decisivos**, pois esses lotes ainda não haviam sido enviados. O corpo e os quatro dossiês permanecem nos hashes congelados informados anteriormente; D09 é um arquivo adicional separado.

## Redução explícita à necessidade original

O corpo promove propósito, contrato e ownership/delegação por domínio, com os paths exatos, evidência, gaps, dependentes bloqueados e justificativa de profundidade. Os 24 `bounded_claim`, os 24 `conditional_gap` e a composição/ordem dos 190 membros permanecem idênticos aos registros herdados.

As tabelas detalhadas originais estão preservadas byte a byte em `b3/v4/original-review-domain-disposition.md`. Cada um de seus 190 claims locais recebeu a disposição **`RETIRED_EXTRA_CLAIM`** em `b3/v4/retired-row-claims.json`. A retirada de especificidade **não** é descrita como lacuna resolvida por fonte, novo PASS ou eliminação de uma necessidade obrigatória. Uma lacuna pertencente a um `bounded_claim` retido continua exigindo evidência ou correção julgada. O delta completo está em `b3/v4/domain-disposition.diff`.

## D09 e D12

O complemento D09 mostra os usos reais dos helpers: `mcp.remove` captura `Mcp.NotFoundError` e `Mcp.ConfigError`; `mcp.auth.start` captura `Mcp.NotFoundError` e `Mcp.AuthError`. Inclui também as definições dos mapeamentos. São intervalos exatos de `handlers/mcp.ts`, linhas 24–33, 60–69 e 89–95. Fonte de 3.425 bytes, blob `70a6b0ba7d3b8a8ee71fb9ba42b55710d1b43a18`, SHA256 `8b141ac204fe14e72a5576277a0c4c493a43b7921dfc4309b26d0b9fb08d5ad8`; identidades em `supplement-D09-identities.json`.

Para D12, a leitura completa autorizada de `atlas-screen.ts` e `atlas-setup.ts` confirmou as uniões pertinentes: `AtlasEmpty` com `AtlasSnapshot`, `AtlasReview`, `AtlasIndexOk` e `AtlasMineOk`. O corpo esclarece que “present” é descritivo, não um discriminante literal prometido. Os ramos snapshot/index/mine inspecionados usam `state: "ok"`; `AtlasEmpty` usa `state: "empty"`, e a união de reasoning também mostra `state: "missing"`. Não foi necessária alteração do `bounded_claim`; os novos literais e hashes constam em `d12-union-evidence.json` e no dossiê D07–D12.

`verification.json` registra a conferência mecânica. `review-manifest.json` vincula o manifesto congelado, o complemento D09 e os registros desta resposta. Os pedidos adicionais estão preservados em `producer/request.txt`; esta resposta está em `producer/b3/v4/response.md`.

Os complementos extensos intermediários v3 permanecem preservados como produção histórica, sem indicação de uso no despacho atual. B1/B2 e os campos de D07 não foram alterados. Nenhuma execução de produto, teste, CI, geração ou Atlas foi realizada.

Pronto para julgamento explícito da redução por J1/J2. Produção pausada até nova tarefa autorizada.
