# Fatia 4 — host, Git/CI, preservação e migração

## Sumário

[Missão](#missão-e-identidade) · [Fontes](#fontes-concretas) · [Execução](#execução) ·
[Recusas](#lista-finita-de-recusas-a-cobrir) · [Saídas](#saídas) · [Critérios](#critérios-locais).
Aplicar também [campanha](campaign.md), [juízo](judging.md), [runtime](runtime.md) e [handoffs](handoffs.md).

## Missão e identidade

Executar G4 no **Orchestra inteiro**, verificando integração real, controle de validade e preservação.
Cobrir AC-09 e AC-10 sem tratar a leitura de um gate como prova de sua execução ou enforcement.
Manter a compatibilidade entre código, conhecimento, fontes, leitores e superfícies geradas.

- Repositório: `gustavomhss/hugr-orchestra`.
- Fonte inicial: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
- Branch exclusiva: `genesis-chatgpt-s4`.
- Evidência durável: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v1/s4/`.
- Cada execução fixa `source_revision`, `candidate_revision`, `protocol_revision` e handoffs S1/S2/S3.

## Fontes concretas

Ler `AGENTS.md` e, sob `modules/atlas/docs/design/`, `genesis-ownership-plan.md`,
`genesis-global-completion-plan.md`, `genesis-campaign-reconciliation.md` e `genesis-landing-plan.md`.
Ler `.orchestra/skills/atlas-{usage,maintenance,ownership}/SKILL.md` para o caminho operacional existente.

Inspecionar os entry points reais:

- `modules/maestro/coordination/src/v2/atlas-source.ts` e `tools/atlas.ts`.
- `modules/atlas/packages/adapter-io/src/ownership-input.ts`, `ownership-access.ts` e `ownership-attachment.ts`.
- `modules/atlas/packages/tools/src/handler.ts`.
- `modules/atlas/packages/knowledge/src/ownership/read.ts`.
- `modules/atlas/harness/gates/own-snapshot-guard.mjs`.
- `.github/workflows/atlas-guard.yml`, `atlas-worklist.yml` e `test.yml`.
- `modules/atlas/packages/adapter-io/test/ownership-input.test.ts` e `ownership-publication.test.ts`.
- `modules/atlas/packages/knowledge/test/ownership-read.test.ts`.

Resolver outros callers pelo grafo/imports observado; a lista acima é ponto de partida, não prova de cobertura total.

## Escrita e integração

S4 possui os cenários de integração, inventário protegido, plano de migração e recibos no prefixo `s4/`.
Escrever propostas em `s4/proposals/` quando precisar alterar host, guard, política, workflow ou entry point compartilhado.
S5 aplica tais mudanças serialmente, incluindo tipos/exports e saídas de geradores; S4 verifica o commit devolvido.
Não alterar configurações de proteção de branch para obter verde, não enfraquecer guards e não ativar produção.
Não editar manualmente outputs gerados nem reserializar corpos históricos com identidade protegida.
Não atualizar PRs herdados ou fechar recursos fora do ownership explicitamente registrado.

## Entradas e barreiras

O inventário completo e a classificação de autoridade vêm de S1.
Os artefatos/receitas vêm de S2; os limites de coerência, recuperação e rollback vêm de S3.
Antes dos handoffs, mapear callers e preparar fixtures; não declarar a integração nova observada.
Executar contra o conjunto compatível de commits que S5 materializou e identificou, não contra uma mistura de branches.
Caso uma dependência mude, invalidar as provas afetadas; conservar evidência antiga ligada ao candidato antigo.

## Execução

1. Enumerar os objetos protegidos da campanha: fontes, respostas, claims, julgamentos, manifests e derivados declarados.
   Calcular a identidade dos bytes efetivamente acessados; referência indisponível vira lacuna de preservação.
2. Mapear, para todo domínio/fluxo de S1, o caller que fornece a entrada atual e o reader que devolve conhecimento.
   Distinguir ausência de wiring, caminho presente, teste existente e execução efetivamente observada.
3. Congelar controles válidos e inválidos no entry point pretendido, mantendo pelo menos um escopo independente válido.
   Congelar resultado esperado antes da correção e sem copiar o algoritmo do gate para formar o oracle.
4. Exercitar `changed declared input` e `new input under registered scope`, incluindo adições e remoções.
   A assinatura da fonte consultada deve corresponder ao que o host realmente usa.
5. Exercitar `missing artifact`, `broken index reference`, `incompatible dependency version` e `invalid generation`.
   Guardar o veredito real que nomeia a recusa; citação de código sem execução permanece indeterminada.
6. Corromper uma unidade local e observar o HOLD da closure afetada junto da leitura do escopo independente.
   Corromper o manifesto compartilhado e observar o conjunto de readers que realmente dependem dele.
7. Verificar que produtor antigo não consegue publicar acidentalmente no novo escopo aceito.
   Identificar fonte e contrato de versão por evidência; não inventar ordem semântica entre SHAs.
8. Exercitar migração isolada e rollback compatível preservando o estado aceito anterior.
   A existência de uma cópia antiga não prova que o rollback é válido contra a fonte atual.
9. Gerar fronteiras/snapshots pelos geradores corretos e verificar resultado no candidato integrado.
   Um patch gerado deve conservar recibo do gerador, fonte, comando/runner e conteúdo resultante.
10. Inspecionar o escopo dos workflows e se os paths/entry points novos entram nos gates pretendidos.
    Reportar separadamente a configuração observada de branch protection e o resultado de execução do gate.
11. Executar a verificação permitida pelo repositório, com SHA e identificador reais quando houver CI.
    O conector poder ler Actions não significa poder dispará-lo; registrar capacidade ausente sem inventar run.
12. Comparar de novo o inventário protegido e registrar diferenças esperadas versus violações.
    Entregar a S5 os resultados, planos operacionais, patches integrados e restrições remanescentes.

## Lista finita de recusas a cobrir

Manter uma linha por caso, pelo entry point e pelo resultado, sem agrupar tudo como “stale rejeitado”:

- changed declared input;
- new input under registered scope;
- missing artifact;
- broken index reference;
- incompatible dependency version;
- invalid generation;
- independent scope remains readable;
- shared manifest corruption;
- branch-protection enforcement, com seu tipo de evidência explicitado.

Reutilizar provas anteriores apenas depois de verificar bindings do caso, fonte, caminho e oracle.
Não chamar proteção de branch “testada” só por ter lido a configuração; capacidade limitada fica declarada.

## Saídas

- `entrypoints.json`: domínio/fluxo → host/gate/reader → controles e resultado observado.
- `protected-inventory.json`: objetos preservados, identidades e comparação antes/depois.
- `cases/`: entradas, recusas, controles válidos e evidência real de isolamento/compartilhamento.
- `migration.md`: preparação, compatibilidade, rollback, alvo e limites de ativação.
- `verification.json`: gates, source SHA, runner/run reais, escopo e verificações não executadas.
- `criteria.json`: critérios atribuídos, vereditos e evidências no formato comum.
- `handoff.json`: esquema `genesis-session-handoff/v1`, campanha `20261111-v1` e referências `{commit,path,sha256}`.

Usar revisões/dependências conforme `handoffs.md`, sem autorreferência ao commit que contém o handoff.

## Critérios locais

**Axiomas:** GO-A4/5/6/7; consistência através do host e preservação com os mecanismos existentes.
**Invariantes:** GO-I1/3/5/7/8; fontes exatas, recusas efetivas e autoridade sem mistura de gerações.
**AC próprios:** AC-09/10; compartilhar observações de coerência com S3 sem duplicar suas execuções válidas.
**CC:** CC-5/7 exigem integração, compatibilidade, gerados, guias e disposição explícita de obrigações antigas.
**SC:** SC-5 exige rejeição observada dos estados nomeados e preservação de escopos válidos.
**QS:** QS-1/3/4/5/6; fidelidade, generated-code discipline e controles nos pontos de entrada reais.

**DoD local:** toda recusa atribuída possui resultado verificável ou blocker explícito, nunca cobertura por citação.
Os objetos protegidos conservam seus bytes; migração/rollback têm regras e provas compatíveis com a fonte.
A cobertura de CI e a proteção de branch estão reportadas como observadas, sem inferências de enforcement universal.
O pacote exato está disponível aos dois juízes de S5 e ao integrador.

## Estado e correção

Usar `READY_FOR_JUDGMENT` para o pacote completo e `BLOCKED` para lacunas de execução/autoridade/capacidade.
Corrigir achados específicos e renovar apenas os controles afetados pelo delta integrado.
Não considerar ausência de acesso a CI uma autorização para executar testes proibidos localmente.
Não tocar produção, PRs ou recursos herdados para completar um checklist; a decisão de entrega continua explícita.
Terminar com commit/URL, entry points cobertos, resultados de gates, preservação e pendências precisas.
