# TechLead — rodada de autoria técnica

## Escopo e estado

Usuário: **“Muito bem, pode eguir. Use a skill de techlead sempre”**. Interpretação: avançar de requirements/decisões para specs, não implementar ou operar Fabric. Base de código `9fcb899d50867c1ddc3f25d8345ac9fd8009d788`, branch `fabric-workbench`; os documentos anteriores continuam trabalho não commitado, não baseline de implementação.

Skills: techlead, decompose, contract, pack, verify, agent-dispatch-and-landing e instrument-calibration. A autoria adapta test-first à etapa documental: prova de presença/estrutura/rastreabilidade e crítica técnica independente; não fabrica suite de produto vermelha/verde.

## Preparação e decisão de dispatch

**HYBRID.** O lead escreve CONTRACTS/OWNERSHIP e specs centrais de produto, identidade, catálogo, aprovação, dispatch e qualificação. Depois, autores podem redigir documentos disjuntos contra a seam de autoria `authoring-1`. Arquivos compartilhados README/CONTRACTS/OWNERSHIP/WAVE/REVIEW são exclusivos do lead. Não há dois agentes escolhendo identidade/estados/APIs entre si.

Antes de dispatch, checar `conflict-map` sobre writes explícitos e `plan-check` sobre os itens documentais abaixo. Dependência de leitura da seam é satisfeita pelo snapshot imutável fornecido; a seam fica bloqueada para mudanças por autores. Produto/runtime não é despachado e não precisa de stub de implementação para esses autores; antes de uma wave de código depender dela, contratos compiláveis e seam tests serão obrigatórios.

## Itens documentais de aceitação

Cada DS corresponde ao arquivo de mesma numeração do índice; não duplica os requisitos de produto. Um arquivo deve explicitar contrato, estados/erros, persistência/autoridade, aplicação das decisões e prova/limites por IDs proprietários. Presença de títulos não prova suficiência: revisão independente confere a semântica. Baseline documental antes de autoria: esses arquivos S01–S14 ainda não existiam; nenhum teste de produto executado.

| Itens | Autor / writes exclusivos | Dependências / limites |
| --- | --- | --- |
| DS-S01; DS-S02; DS-S03; DS-S08; DS-S09; DS-S14 | Lead: S01-product.md, S02-identity.md, S03-capabilities.md, S08-changes.md, S09-jobs.md, S14-qualification.md | Decisões/requirements; mantém julgamento de arquitetura. |
| DS-S04; DS-S05; DS-S12 | Autor de composição: S04-declaration.md, S05-composer.md, S12-templates.md | C01–C07; schema/renderer/portabilidade; nenhuma escolha de permissão ou ativação. |
| DS-S06; DS-S07; DS-S10 | Autor de dados: S06-discovery.md, S07-data.md, S10-validation.md | C01–C07; proveniência/query/check; não implementa dispatch. |
| DS-S11; DS-S13 | Autor de continuidade: S11-ai.md, S13-operation.md | C01–C07; Session/egress/operação; não inventa principal, driver ou freeze. |

Modelo: padrão da sessão, sem escolha de provedor/modelo adicional. Orçamento por autor: pacote ≤35K tokens, total de trabalho ≤60K; retorno ≤200 palavras com arquivos/hash/bloqueios, sem transcrito. Cada spec deve ficar focada na responsabilidade, não repetir o desenho inteiro. Questão arquitetural inesperada retorna ao lead, não vira decisão implícita do autor.

## Controles da rodada

- Um worktree detached isolado por autor; nenhum write no checkout do lead. Entradas congeladas externas com hashes.
- Docs sem runtime, CI novo, chamadas autenticadas, segredo, commit/push/PR ou restart. A regra de push-early de implementação não é simulada por publicar documentos sem pedido; rascunhos persistem nos artefatos externos e são verificados pelo lead.
- Provas futuras usam runners do repositório/CI; documentação não recebe claims de typecheck ou testes de produto. Gates documentais são distintos de CI de implementação.
- Relays, se armados, não são declarados enforcement sem verificar hook. O lead lê arquivos/resultados e confere os hashes independentemente.
- Antes de integrar: read completo dos arquivos produzidos, compatibilidade com seams/Q, lista de writes exata, IDs/links e pares de contraprova. Nada é aceito só pelo status do agente.
- Depois: crítica técnica independente de coerência/rastreabilidade e gate `bun run check:guards --base origin/dev`; registros de validação e limpeza dos worktrees somente depois da verificação.

## Andamento

`plan-check` verificou a atribuição total/disjunta dos quatorze itens DS a cinco grupos (dois do lead e três autores); `conflict-map` retornou CONFLICT_FREE em todos os pares dos write sets explícitos. É verificação estrutural, não prova de completude semântica. A demanda de produto continua ancorada nos 200 requisitos já criticados, não na existência de quatorze arquivos.

Três autores foram despachados em worktrees detached separados, sem writes compartilhados, com manifesto SHA-256 `8d11eeb0845acd01512b84cd61c4d8a3e7d4011022aca870c1a2b5bf313edda7`. Seam authoring-1 SHA-256 `659dc1f31d59c5e0c424d864cad845a91842e57782ffb42a2d672dad2d7d6e8f`. Relays armados, hook não comprovado. Não houve código para merge, commit ou push.

Retornaram S04/S05/S12, S06/S07/S10 e S11/S13. O lead leu todos integralmente, verificou hashes/HEAD/ausência de alterações tracked e conjunto exato de arquivos novos; preservou cópia bruta externa `fs-spec-author-returned` e integrou por patch. Relatórios externos `fs-spec-composition-return.md`, `fs-spec-data-return.md` e `fs-spec-continuity-return.md` guardam hashes e limites; não foram usados como prova suficiente sozinhos.

### Integração decidida pelo lead

- Listagem raiz não tinha ResourceRef legítimo: authoring-2 introduz ObservationScope connection/workspace/resource, aplicado a S02/S06/S07 e C02.
- Mapa de ambientes ficou sem dono/formato: S02/C08 possui registro versionado test/publish com classificação server-side e pares explícitos, pinado por S08/S10.
- Pacote portátil ficou sem envelope único: C08/S12 fixa workspace-package v1, versões/origem/hints/exclusões, sem ativos/segredos/grants embutidos.
- Refs de resultado/ativação/execução/validação e snapshot foram consolidados em C08; autores não criaram DTOs concorrentes.
- Exportação de dados ganhou prepare/download JSONL do recorte capturado, sem requery, path/URL livre ou completude fictícia; limites/uso único em C08/S07/S13.
- Seeds adicionais de fila/memória/disco/recibos/tombstones foram escolhidos pelo lead em C08, aplicados aos consumidores e mantidos como seeds não medidos.
- O lead identificou que Database atual usa synchronous NORMAL; S09 não o declara durabilidade contra power loss. FULL/flush e fence de restart/restore ficaram como gates explícitos.
- Perguntas dos autores foram respondidas separando representação compartilhada já decidida, prova contratual de freeze e pré-requisito operacional/lançamento. Aprovar redação não equivale a resolver todos esses estados.

Os oito documentos canônicos de requirements e o desenho revisado permanecem intactos. Freeze de implementação indisponível até os gates de [BLOCKERS.md](./BLOCKERS.md); isso não autoriza remover requisitos ou anunciar suporte. Próximo controle: revisão técnica independente da versão integrada, não repetir o APPROVE anterior de requirements/decisões.

### Revisão independente da integração

Dois revisores novos, em worktrees detached próprios, leem o mesmo snapshot authoring-2 externo `fs-spec-review-input`, manifesto SHA-256 `8b0931e32cbbcf14f55bb8504f27ed17bbe8cf9a108bb4dd853487cec1fe3536`. Não editam specs ou código; writes exclusivos são os relatórios externos `fs-review-authority-return.md` e `fs-review-product-return.md`. Logo, não há conflito de escrita com o lead ou entre revisores. Modelo padrão, pacote/working set planejado ≤40K tokens, total ≤65K por revisor; retorno de chat ≤200 palavras. Relays armados sem claim de hook demonstrado.

- Autoridade: S02/S08/S09/S11/S13/S14, seam e requirements de autoridade/execução/privacidade; conferir invariantes, fronteiras e afirmações sobre contratos existentes.
- Produto: S01/S03–S07/S10/S12/S14, seam e requirements de experiência/dados/Fabric/E2E; conferir compatibilidade, cobertura semântica e impossibilidade de contar handoff como execução.
- Aceite de revisão: relatório persistido, snapshot/base inalterados, cada finding com cláusula/citação/contraprova/correção mínima, distinguir defeito textual de gate conhecido e declarar alcance. O lead valida findings e assina a disposição; não há merge de implementação ou autorização de tenant nesta rodada.

Os três worktrees de autoria já foram removidos **sem force**, após conferir status vazio (incluindo ignorados) e hashes das cópias brutas arquivadas. Artefatos externos foram preservados.

### Fechamento documental

Autoridade retornou APPROVE documental; produto retornou FIX-FIRST por PR01/P2 (regra numérica genérica contradizia strings de revisão de capacidade/componente). O lead confirmou a contradição e corrigiu somente o parágrafo C01:23, sem mudar tipos/exemplos/requisitos. O mesmo revisor reconferiu o delta exato e fechou PR01 com APPROVE documental. Hashes/alcance e disposição estão em REVIEW; não se chama isso de freeze, CI verde ou suporte Fabric.

As perguntas de framing ficaram respondidas sem ampliar escopo: B-EGRESS ainda precisa provar todos os canais reais antes de admissão sensível; pacote portátil inicial não carrega definições/buffers e não promete transferi-los. Próximo estágio possível, por decisão posterior, é materializar contratos compiláveis e provas de fundamento antes de qualquer wave dependente. Nenhuma implementação ou operação de tenant foi iniciada.

Fechamento: checagens documentais com controles repetidas após PR01, fontes preservadas, guard local novamente sem findings/erros. Os dois worktrees de revisão foram removidos sem force após conferir baseline/status/hashes, como os três de autoria. Todos os relatórios e snapshots externos foram preservados; corpus permanece não commitado/não publicado. README de specs é a entrada atual; o desenho original não foi reescrito para anunciar essa aprovação.

## Rodada posterior autorizada

O proprietário respondeu **“ok pode seguir”** após este fechamento. A primeira materialização limitada de C01/C02, críticas test-first, CI RED→GREEN, controles por mutação e revisão de código estão em [FOUNDATION.md](./FOUNDATION.md). Esta WAVE registra a autoria documental anterior; o avanço posterior não constitui freeze de todos os contratos nem habilita tenant/runtime Fabric.
