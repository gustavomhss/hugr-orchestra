# S1-04 — materialização mecânica dos predecessors Core concluída

Foram tratados somente os três artefatos solicitados:

| Key | source_refs declarados |
|---|---:|
| s1.core.session-admission | 10 |
| s1.core.session-execution | 5 |
| s1.core.persistence | 11 |

Após deduplicação, são **21 fontes e cinco referências de recipe/producer**, totalizando 26 paths e 284.992 bytes. Todos os blobs pinados conferem com a árvore de HEAD 8835faf6329cc3d5f5de1097872882d57472b793; todos os SHA-256 declarados também conferem. Não houve divergência nem sobrescrita.

A materialização reutilizou dez paths de arquivos/objetos já verificados e fez 16 chamadas ao conector GitHub, no pin exato 1cde2ff7a71bcf7aecb5d030917b577165135d38, capturando 194.007 bytes em base64. Foram criados 21 arquivos antes ausentes e preservados cinco arquivos já existentes e idênticos.

Destino: /workspace/scratch/8833f71e3e94/s1-04-runtime-scout/verified-git-candidate.

A origem da seleção permanece o Core observado em 9fd024a34e76d2e9328e1f793ef1f69fbf606e51, payload a2a5de03d7b1034373eb877d8f03c4cecc772dde. As cinco referências de recipe/producer foram reutilizadas pelos hashes exatos do pin a8df22ae3a140c58c63f62ce2a634c84f415c943, sem leitura semântica dos corpos.

## Preservação confirmada

- HEAD, origin/dev, index, shallow, sparse-checkout e configuração permaneceram byte a byte idênticos.
- SHA-256 do index antes/depois: 8b4edc1c7726fbbab079aedf504e189e19152fd81d4194be1b14cbf4228dd0d0.
- Os 903 arquivos preexistentes do worktree, incluindo o overlay, foram relidos e permaneceram intactos.
- Nenhuma referência de julgamento Core foi materializada.
- Nenhuma escrita no namespace output da principal.
- Nenhuma alteração de objetos Git, runtime, policy ou guard; nenhum teste, prepare, interpretação semântica de Core ou escrita remota.
- O ZIP bloqueado não foi reaberto.

## Evidências

Diretório: /workspace/scratch/8833f71e3e94/s1-04-runtime-scout/core-predecessors/.

- receipt.json — provas por path, origem, hashes e preservação. SHA-256 237ae2eaea386cc3be611902ab3e4e9f07419379c00b495400bae453fd938586.
- materialization-plan.json — seleção exata, comparação prévia com HEAD e plano de reutilização.
- before-state.json — hashes dos metadados Git e dos 903 arquivos existentes antes da escrita.
- captures.json — requests/responses integrais das 16 capturas.
- cache/ — bytes verificados usados na materialização.
- request.txt e response.md — pedido e resposta visíveis.

As fontes e referências solicitadas estão disponíveis para o prepare final da principal. Encerro o turno para liberar o slot dos juízes.
