---
name: execute-genesis
description: Orquestrar uma das cinco fatias paralelas do Genesis do Orchestra em uma conversa nova, com produtores nativos, dois juízes persistentes, correções e entrega completa. Usar o número e domínio explícitos do prompt; a integração final pertence à conversa original. Também retomar a própria execução por seus recibos.
---

# Genesis: cinco orquestradoras em conversas novas

## Missão e identidade

Executar o Genesis do Orchestra inteiro por cinco domínios. Orchestra é o produto
do repositório `gustavomhss/hugr-orchestra`; Atlas, em `modules/atlas/`, é sua camada
de conhecimento. Genesis deve produzir entendimento cumulativo e operacional L1–L4,
mantido e consumido pelas portas do Atlas. As cinco fatias não são braços do `atlas mine` legado.

Usar o número **explicitamente escrito no prompt de início**. Não escolher uma
fatia, adivinhar o número ou precisar de outra conversa para descobrir a missão.

| Sessão | Domínio | Branch exclusiva | Contrato |
| --- | --- | --- | --- |
| S1 | Core, sessões, modelos, APIs e SDKs | `genesis-fresh-s1` | [Fatia 1](references/fatia-1.md) |
| S2 | Interfaces: desktop, web, app-shell, UI e TUI | `genesis-fresh-s2` | [Fatia 2](references/fatia-2.md) |
| S3 | Maestro, Relay, especialistas e integrações | `genesis-fresh-s3` | [Fatia 3](references/fatia-3.md) |
| S4 | Atlas, continuidade, RAG e Genesis | `genesis-fresh-s4` | [Fatia 4](references/fatia-4.md) |
| S5 | CLI, Omni, distribuição e infraestrutura | `genesis-fresh-s5` | [Fatia 5](references/fatia-5.md) |

Fonte: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Protocolo: `parallel-v3-fresh`.
Resultados: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/sN/`.
O prompt fixa o commit da skill; ler suas referências no mesmo commit. A campanha
lógica `20261111-v1` conserva a história contábil, mas este início não depende dela.
ROOT integra as cinco entregas na conversa original, branch `genesis-fresh-final`.

## Ler o necessário e começar a produzir

1. Ler [princípios](references/principles.md), sua fatia e [início novo](references/fresh-start.md).
   Conferir `AGENTS.md` no baseline e instruções locais dos arquivos que serão alterados.
2. Carregar a [partição](references/parallel-partition.json): a população de 14.442
   entradas já está congelada e atribuída. Não aguardar um censo novo de S1.
3. Antes do primeiro produtor, ler [orquestração](references/orchestration.md),
   [julgamento](references/judging.md) e o [transporte comum](references/transport.md).
   S4 lê imediatamente [runtime](references/runtime.md); as demais antes de suas
   operações de importação, leitura ou prova de runtime.
4. Antes de publicar/encerrar, aplicar [handoffs](references/handoffs.md) e
   [conclusão](references/completion.md). [Campanha](references/campaign.md) contém
   a matriz de responsabilidades; [integration.md](references/integration.md) rege ROOT.

Não carregar a história inteira, a migração v2, todos os contratos de outras fatias
ou todo o corpus de fonte antes do primeiro trabalho produtivo. Os axiomas orientam;
não exigem um documento ou aprovação para cada item. Fontes adicionais entram quando
decidem a tarefa. Nenhuma conversa anterior é pré-requisito do início novo.

## Ser a orquestradora responsável pela entrega inteira

Manter uma fila simples cobrindo toda a população atribuída. Classificar componentes,
testes, gerados, fixtures, assets e terceiros com profundidade justificada. A fila
pode ser refinada durante o trabalho; nenhum caminho ou necessidade desaparece.

Congelar por unidade a necessidade, inputs, output, dependências e critérios antes
de despachá-la. Preparar e hashear seu oracle antes da produção avaliada; não fornecer
as respostas reservadas ao produtor. Começar o primeiro L1 útil enquanto outras
partes do inventário semântico são refinadas. A camada completa e a entrega final
continuam exigindo a união integral das necessidades previstas.

Delegar tarefas concretas a produtores reais, recolher suas saídas e conferir bytes,
fontes, versões e escopo. Cada principal é o único escritor remoto da sua branch.
Subagentes trabalham em áreas exclusivas. Não presumir que chats possuem filesystems
físicos diferentes. Isolar checkout, candidato, CAS e store por execução.

Construir cumulativamente L1 (base verificável), L2 (entendimento local), L3 (relações
e fluxos integrados), L4 (ownership/manutenção operacional). São níveis lógicos,
não quatro arquivos por fonte ou quatro chamadas obrigatórias. Julgar a camada
local exigida completa antes de liberar os dependentes da camada seguinte.

Ler fontes de qualquer domínio no mesmo pin para entender fronteiras. Produzir
sua parte sem esperar artefato de outra conversa; declarar as dependências reais.
Não aprovar conhecimento ausente ou copiar parecer de vizinho como aceite próprio.

## Produzir, julgar, corrigir e comprovar

Criar dois juízes nativos novos, independentes da autoria, com `fork_turns: none`,
no primeiro pacote julgável. Registrar os IDs reais e reutilizá-los ao longo desta
conversa. Cada um cobre todos os critérios obrigatórios do mesmo pacote exato.
Não importar IDs de chats anteriores, criar terceiro voto ou substituir um veto.

Com quatro slots, principal + um produtor/consumidor + dois juízes; antes de formar
o par, produtores independentes podem usar os slots livres. Executar ondas conforme
a capacidade observada. A quantidade de agentes segue o trabalho, não uma meta vazia.

Fornecer aos juízes os corpos e evidências decisivas, não somente links: seu papel
não usa ferramentas. Recolher decisões originais, corrigir findings obrigatórios
e reapresentar o delta aos mesmos IDs. Contextos separados não provam diversidade
de modelo. Sugestões opcionais não aumentam a barra fixa.

Produzir o pacote nativo comum já definido em [transport.md](references/transport.md).
Ele preserva bytes e evidência; ainda não é conhecimento publicado pelo Atlas.
S4 implementa a adaptação mínima e publica cedo `s4/runtime-release.json`, por
capacidade comprovada, antes de terminar sua própria fatia. S1/S2/S3/S5 continuam
a produção em paralelo e usam o candidato exato quando necessário para seus casos.

Executar consumidores independentes e as verificações atribuídas. Controles comuns
do motor Atlas são responsabilidade de S4; reutilizar provas compatíveis e executar
o consumo/impacto específico do domínio. Não repetir a implementação ou toda a suíte
comum cinco vezes. ROOT executa a integração e os controles da união.

## Autonomia, verdade e limites

Prosseguir em trabalho nativo, preparação isolada, adaptações necessárias, correções
e commits atribuídos sem pedir confirmação para cada etapa. Não exigir workflow
para produzir conhecimento nativo. Testes do produto seguem `AGENTS.md`; não contornar
guardas nem chamar uma execução proibida de outro nome.

Usar o conector GitHub; não rodar `gh`, iniciar login, preencher `GH_TOKEN` ou extrair
credenciais. Cada commit escreve apenas o que pertence à missão e usa lease de HEAD.
Não fazer force-push, PR/merge, ativação em produção, exclusão histórica ou chamada
paga externa como efeito colateral. Essas ações não são parte da entrega local.

Planejar lotes finitos incluindo produção, os dois juízes, correções e consumidores.
Registrar uso novo e revisão do plano antes de ampliar o lote; não inventar uma quota
curta que encerra a missão. Tokens, tentativas físicas e cobrança não expostos são
UNKNOWN. ROOT reconcilia a história anterior; este início não zera suas reservas.

Continuar até entregar todas as obrigações próprias. Delegação, plano, checkpoint,
proposta ou PASS semântico isolado não são conclusão. Aguardar tarefas em andamento,
persistir antes de compactação e retomar a mesma fila. Se uma capacidade realmente
faltar, demonstrar o impedimento e terminar todo o trabalho independente; uma
pendência permanece `INCOMPLETE_BLOCKED`, nunca `DELIVERY_COMPLETE`.
