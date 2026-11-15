# Resposta de produção — BOUNDARIES-SUPPORT-L1

**Entregue: candidato L1 de fronteiras, suporte local e proposta de navegação.** A produção autorizada deste despacho está concretamente materializada; não declara conclusão de S1-03, aceite semântico, L2–L4, união ou execução runtime.

## Corpos entregues

| Arquivo | Identidade e conteúdo |
|---|---|
| [bodies/boundaries.md](bodies/boundaries.md) | Novo corpo L1 `s1.core.boundaries`, necessidade `component`: Atlas, Relay, hooks/workflow, RAG, Workspace e MoveSession no lado Core |
| [bodies/support.md](bodies/support.md) | Novo L1 `s1.subslice03.support`, necessidade `entry`: reconciliação das 104 fontes locais de suporte e seus papéis de manutenção/evidência |
| [union-navigation-proposal.md](union-navigation-proposal.md) | Proposta por necessidade/dono/subfatia/keys reais, com links no kit pinado e versões aceitas `NOT_SELECTED` |
| [history/entry.md](history/entry.md) | Entrada histórica do Core inteiro, preservada byte a byte, sem substituição pela nova chave local |

## Cobertura e provas

- **128/128 paths atribuídos** capturados de GitHub em base64 e decodificados sem normalização: 24 fronteiras + 104 suporte; **1.642.309 bytes**.
- **14 folhas de implementação fronteira lidas integralmente**; dez fontes de teste lidas como contratos preparados, sem execução.
- **104 fontes de suporte** reconciliadas: nove históricas, três documentais, doze de package/tooling e oitenta de validação/fixtures/harness. Profundidade individual é explícita, inclusive limites de arquivos binários e leitura dirigida.
- **Oito arquivos adicionais do kit** capturados para navegação: cinco missions, partition, dependencies e roster. Total do manifesto de captura: **136 registros**. Esses oito não aumentam o inventário atribuído.
- [coverage.jsonl](coverage.jsonl) possui **128 linhas únicas**, cada uma com path, pin, blob, SHA256, bytes, origem histórica, read_depth, role, need, artifact, reason e gatilho de manutenção.
- [evidence.md](evidence.md) preserva o arquivo integral de trechos literais, agora ampliado com branches relevantes e navegação pinada; [evidence-review.md](evidence-review.md) contém uma projeção por corpo, com subintervalos literais pequenos e índice próprio. O juiz pode solicitar evidência adicional sem receber um falso PASS.
- [captures.json](captures.json), [records/evidence-index.json](records/evidence-index.json) e [records/evidence-review-index.json](records/evidence-review-index.json) permitem conferir identidade e intervalos. A verificação de transporte/estrutura é distinta de julgamento semântico.

## Deltas substantivos

O L1 explicita que `currentStep` não avança estado, e que settlement exige a identidade existente da mensagem, fence, checkpoint e recibo autenticado. Um PASS antigo ou JSON de checkpoint sozinho não autoriza reparo. A recuperação de hooks é implicit-local, distingue tentativa de recibo e pode absorver falhas de ledger por grupo; zero erros observados não prova shipping integral. Instalação de hook tem lock de processo único. MoveSession pode falhar depois de aplicar destino e publicar evento, e não fornece a exclusão do runner. As tabelas RAG não provam retrieval/embedding. Todas essas afirmações permanecem limitadas ao adaptador Core e aos bytes examinados.

O suporte distingue histórico de implementação atual, export de fixture de API produtiva, generator de gerado, archive pinado de código interno semanticamente aceito e teste preparado de resultado executado. Os fixtures de schedule/Board/distribuição tornam explícito o que substituem: runner, API/renderer/gates ou Bun/cargo. A proposta de união usa as 36 keys e os cinco donos do kit, sem inventar keys externas ou payloads aceitos.

## Preservação e limites

`history/entry.md` tem **7.312 bytes**, blob `894266bd4543763fb1ee2a4dbf0ba749a244ec48` e SHA256 `6a488ca8f9717a497949b71ed41db84d995f23b90c31cc59c22c5bd86239ca6c`, iguais ao input histórico. `history/boundaries.md` também foi preservado integralmente; A3/A4 e a projeção foram reutilizados por seleções identificadas em `history/manifest.json`.

Não houve leitura de oracle reservado, teste local, job CI novo, import/publication Atlas, provider pago, instalação, branch/PR/merge, `gh`/login/token ou mudança de produto. A principal é a única escritora remota; esta entrega ficou exclusivamente no diretório delegado. Uso/tokens e identificadores de runtime não expostos permanecem UNKNOWN, sem estimativas fabricadas.

O julgamento independente e eventuais correções pertencem à próxima etapa. A coordenação ainda deve selecionar predecessores/versões aceitas e tratar capacidades externas S3/S4/S5, Session/trust/API/bibliotecas, runtime e união. Os corpos não apropriam essas garantias. [recipe.json](recipe.json) preserva entradas, procedimento público, limites e identidades dos resultados; [request.txt](request.txt) preserva o pedido e [request-followups.txt](request-followups.txt) as duas instruções adicionais da principal.
