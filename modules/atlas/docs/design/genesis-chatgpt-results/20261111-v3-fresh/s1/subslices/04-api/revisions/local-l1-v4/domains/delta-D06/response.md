# D06 — correção mínima concluída

Texto exato do bounded_claim corrigido:

```text
The Schema modules represent file entries/diffs, reference sources, VCS answers and host-CLI pull requests. Protocol declares the VCS diff query and response shapes; Server delegates reference/Git/PR work to Location services and projects the PR host error. No file access or remote PR was performed by this production.
```

| Arquivo atual | Bytes | SHA256 |
| --- | ---: | --- |
| `producer/b3/v4/domain-disposition.md` | 38080 | `12248d1cc39a27b1655f1a683f02cd1af864f87945300a86b0ee4326227a4edd` |
| `producer/b3/v4/dossier-D01-D06-v4.md` | 12472 | `183649bb5e918a6b5f38b4c516e64bd5566e4b7f5ed64497d5928171dd3342b1` |

A alteração semântica é uma única substituição da frase autorizada em cada arquivo. O corpo conserva todos os demais bytes. No dossiê, além dessa substituição, atualizei somente o vínculo mecânico de tamanho/SHA256 do corpo para apontar aos novos bytes.

Os originais v4 estão preservados em `producer/b3/v4/delta-D06/before/`. Os diffs exatos são `body.diff` e `dossier.diff` dentro de `delta-D06/`. O registro estruturado D06 e os manifestos foram sincronizados; o manifesto explicita D06 como a única exceção nova à identidade dos bounded_claim herdados e registra o reuso dos outros dossiês em seus domínios inalterados.

Manifesto atual: `producer/b3/v4/manifest.json`. Recibo da correção: `producer/b3/v4/delta-D06/manifest.json`. Pedido e resposta desta rodada: `producer/b3/v4/delta-D06/request.txt` e `producer/b3/v4/delta-D06/response.md`; o pedido também foi acrescentado ao registro principal.

A verificação mecânica desfez a substituição e recuperou exatamente os bytes anteriores, incluindo a reversão do vínculo do dossiê. Os outros 23 bounded_claim, todos os conditional_gap e os 190 membros permanecem iguais. Nenhuma tabela foi reaberta, nenhuma fonte adicional foi lida e nenhum L2–L4 foi produzido. Pronto para a reavaliação de D06 pela mesma dupla.
