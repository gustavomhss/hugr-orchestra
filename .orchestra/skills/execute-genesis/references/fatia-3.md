# Fatia 3 — ativação coerente, recuperação e rollback

## Sumário

[Missão](#missão-e-identidade) · [Fontes](#fontes-e-seams) · [Barreiras](#entradas-e-barreiras) ·
[Execução](#execução) · [Saídas](#saídas) · [Critérios](#critérios-locais).
Aplicar também [campanha](campaign.md), [juízo](judging.md), [runtime](runtime.md) e [handoffs](handoffs.md).

## Missão e identidade

Executar G3 para as gerações de conhecimento do **Orchestra inteiro**, conforme o inventário S1.
Provar que produção interrompida, retomada ou concorrente mantém leitores coerentes e preserva trabalho válido.
O alvo inicial de publicação é isolado e explicitamente identificado; produção do proprietário é outra fronteira.

- Repositório: `gustavomhss/hugr-orchestra`.
- Fonte inicial: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
- Branch exclusiva: `genesis-chatgpt-s3`.
- Evidência durável: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v1/s3/`.
- Registrar `source_revision`, `candidate_revision`, `protocol_revision` e handoffs S1/S2 conforme `handoffs.md`.

## Fontes e seams

Ler `AGENTS.md`, `modules/atlas/docs/design/genesis-ownership-plan.md`,
`genesis-global-completion-plan.md` e `genesis-ownership-integration-fit.md` no mesmo diretório.
Ler as provas de publicação/recuperação anteriores necessárias à comparação, preservando seu alcance.
Uma aceitação do piloto em outro candidato não é execução da geração nova.

Inspecionar:

- `modules/atlas/packages/adapter-io/src/store.ts`, incluindo o seam real de `commitProjection`.
- `modules/atlas/packages/adapter-io/src/ownership-attachment.ts` e `ownership-access.ts`.
- `modules/atlas/packages/knowledge/src/ownership/read.ts` e `shape.ts`.
- `modules/atlas/packages/adapter-io/src/ownership-input.ts`.
- `modules/atlas/packages/adapter-io/test/ownership-publication.test.ts` e `ownership-observe.test.ts`.
- `modules/atlas/packages/knowledge/test/ownership-read.test.ts`.
- `modules/atlas/scripts/ownership-pilot.ts`, nos modos realmente implementados.

Não presumir atomicidade ou isolamento pela presença de CAS, nomes de funções ou testes escritos.

## Escrita e integração

Guardar recibos, fixtures de campanha e propostas no prefixo `s3/`.
S3 possui o contrato de recuperação e os casos que exercitam seus limites, sem editar o contrato global.
Alterações em `store.ts`, attachment/access, reader, shapes, tipos, exports e importer são compartilhadas.
Entregar esses patches em `s3/proposals/` para S5 aplicar serialmente e devolver o commit integrado.
Não construir outro store, uma autoridade paralela ou um caminho direto para a projeção de conhecimento.
Não limpar artefatos, branches ou processos de outras sessões; recursos próprios têm inventário explícito.

## Entradas e barreiras

Consumir o inventário e contrato econômico de S1 e os resultados/receitas exatos de S2.
Preparar cenários determinísticos em paralelo; o teste integrado utiliza a implementação real disponível.
Não fabricar um artefato aceito para contornar falta de output ou de julgamento de S2.
Não misturar versões de dependências para tornar um manifesto aparentemente completo.
Revisões do produtor invalidam somente os bindings e provas que realmente dependem da alteração.
S5 integra os patches compartilhados; S3 verifica a revisão devolvida antes de usá-la como candidata.

## Execução

1. Congelar a unidade de coerência: escopo pedido, closure obrigatório, fonte atual e manifestação aceita.
   Explicitar quais invalidades são locais e quais dependem de uma autoridade/manifesto compartilhado.
2. Selecionar pelo menos um escopo independente válido como controle, ligado ao inventário real.
   O controle não pode compartilhar uma dependência obrigatória que a fixture afirma ser independente.
3. Exercitar o caminho governado de preparação e publicação no alvo isolado.
   Observar a resposta real da porta e a leitura subsequente; escrever bytes no CAS não é publicação.
4. Injetar falha depois de geração e antes da ativação; verificar que o candidato incompleto não é servido.
   Preservar o estado durável produzido e registrar o ponto exato de interrupção.
5. Interromper após completions persistidos, retomar pelo mecanismo real e contar o trabalho reutilizado.
   A retomada não pode repetir interpretação concluída nem apagar reservas não liquidadas de S1.
6. Executar um leitor separado durante a troca de geração, observando versões e recusas.
   As respostas devem corresponder a um manifesto completo válido ou a HOLD, nunca a uma mistura.
7. Alterar a fonte, provocar rebuild falho e consultar novamente pelo reader real.
   Um resultado anterior stale não pode aparecer como conhecimento atual por funcionar como fallback.
8. Tentar rollback compatível e incompatível com a fonte e as dependências atuais.
   A compatibilidade é verificada; a data ou ordem de commits não substitui a regra de versão.
9. Fazer a leitura histórica explícita e demonstrar que a rotulagem não se perde na superfície consumida.
   Não converter bytes históricos em autoridade atual nem servir sidecar untrusted.
10. Exercitar corrupção local e corrupção do manifesto compartilhado, coordenando os casos com S4.
    Registrar a closure recusada e o comportamento do escopo independente.
11. Relacionar cada resultado ao input, código, alvo, processo leitor e artefatos efetivamente observados.
    Uma fixture existente sem execução da recusa fica como preparada, não como AC coberto.
12. Encaminhar a S5 o manifesto, evidências originais, limitações e critérios para juízo independente.
    Entregar a S4 as interfaces de leitura/ativação e o commit integrado exato, sem prometer validação do host.

## Controles e economia

Executar primeiro o que pode ser determinado sem inferência nova, no runner permitido pelas regras do repo.
Recuperar provas antigas válidas quando fontes, implementação, entrada e oracle forem os mesmos.
Não reexecutar controles já aceitos apenas para registrar uma atividade no novo chat.
Se um cenário novo depende de mudança, ligar sua execução ao código integrado correspondente.
Testes de unidade duplicando a máquina de estados não substituem um processo leitor e a porta reais.
Propostas que removem atomicidade, revalidação de rollback ou HOLD devem ser recusadas pelos controles aplicáveis.
Não fazer retry de pedido com forwarding incerto; preservar a reserva e tratar a incerteza com S1.

## Saídas

- `recovery-contract.md`: estados, pontos de falha, readers, coerência e compatibilidade de rollback.
- `cases/`: entradas e resultados da falha, retomada, concorrência, drift, rollback e leitura histórica.
- `observations/`: outputs reais, identidades de geração e manifestos, retornos e evidência dos leitores.
- `proposals/`: mudanças compartilhadas para integração por S5, sem aplicação concorrente.
- `criteria.json`: critérios atribuídos, vereditos e referências de evidência no formato comum.
- `handoff.json`: esquema `genesis-session-handoff/v1`, campanha `20261111-v1` e referências `{commit,path,sha256}`.

Usar revisões/dependências conforme `handoffs.md`, sem autorreferência ao commit que contém o handoff.

Os arquivos são reobtidos pelo Git no commit do handoff; não depender de paths temporários de outro chat.
Dados grandes podem ser artefatos duráveis referenciados por URL e digest verificados, nunca um link sem conteúdo acessível.

## Critérios locais

**Axiomas:** GO-A2/4/5/6/7; durabilidade, reuso e governança com mecanismos existentes.
**Invariantes:** GO-I1/3/6/7/8; cada leitura atual tem binding válido e cada incerteza continua explícita.
**AC próprio:** AC-07; contribuir com coerência/isolation de AC-09 e compatibilidade de AC-10.
**CC:** CC-5 exige publicação, leitura, recuperação e rollback observados, não apenas shapes válidos.
**SC:** SC-5 exige consistência e recusas concretas; SC-3 exige preservação do trabalho reutilizável.
**QS:** QS-1/3/4/5/6; sem novo trust store, prova por função fake ou alegação de atomicidade por nome.

**DoD local:** todos os cenários aplicáveis têm entrada congelada, execução real e resultado verificável.
O leitor independente observou somente geração completa válida ou HOLD; stale fallback e rollback incompatível recusam.
A retomada preservou completions e reservas, e a leitura histórica ficou rotulada na saída real.
Os dois juízes de S5 receberam o candidato exato e suas evidências; nenhuma aprovação do autor conta.

## Estado e correção

Entregar `READY_FOR_JUDGMENT` quando o pacote estiver completo para decisão externa.
Entregar `BLOCKED` para porta, runner, manifesto, controle ou capacidade faltante, com trabalho preservado.
Corrigir defeitos concretos e repetir somente as observações afetadas no código corrigido.
Não repetir uma bateria inteira por polimento, nem omitir uma falha para fechar a fatia.
Publicação de produção, merge e limpeza alheia não são consequências automáticas de um resultado local aceito.
Terminar com commit/URL, cenários executados, resultados de leitor, juízos e limites restantes.
