# Genesis: cinco conversas novas, cinco missões explícitas

Abra **cinco conversas novas** e use **um prompt diferente em cada uma**, conforme
a tabela. Cada prompt já atribui o número, domínio, branch e entrega. Nenhuma
conversa precisa do histórico das anteriores para saber o que fazer.

| Conversa | Domínio completo | Branch nova | Prompt |
| --- | --- | --- | --- |
| 1 | Core, sessões, modelos, APIs e SDKs | `genesis-fresh-s1` | [Prompt 1](prompts/01-core.md) |
| 2 | Interfaces: desktop, web, app-shell, UI e TUI | `genesis-fresh-s2` | [Prompt 2](prompts/02-interfaces.md) |
| 3 | Maestro, Relay, especialistas e integrações | `genesis-fresh-s3` | [Prompt 3](prompts/03-agentes.md) |
| 4 | Atlas, continuidade, RAG e Genesis | `genesis-fresh-s4` | [Prompt 4](prompts/04-atlas.md) |
| 5 | CLI, Omni, distribuição e infraestrutura | `genesis-fresh-s5` | [Prompt 5](prompts/05-plataforma.md) |

Cada conversa é uma orquestradora: decompõe a missão, delega a produtores reais,
recolhe e verifica, aciona dois juízes persistentes independentes, corrige, reavalia,
executa as provas próprias e entrega tudo. As cinco trabalham em paralelo.
**A integração final pertence a ROOT, na conversa original.**

## Princípios que ajudam a executar

Os prompts incluem **axiomas, quality standards, completeness criteria, success
criteria, invariants e Definition of Done**. Axiomas orientam decisões; qualidade
define a barra; completude define cobertura; sucesso pede resultado observável;
invariants preservam as regras; DoD define quando a entrega termina.

Não são um pedido de papelada. A população mecânica já está atribuída. Cada sessão
prepara a primeira unidade e produz enquanto refina o restante, com oracle fixado
antes da produção correspondente. Uma matriz de evidências é suficiente no fechamento.

## Como evitar os bloqueios anteriores

- Números e branches são explícitos; não existe escolha por inferência ou migração obrigatória de conversa antiga.
- Cada sessão tem seus produtores e dois juízes; S1/S5/ROOT não liberam o início das outras.
- Os cinco usam um formato nativo comum desde a primeira entrega.
- S4 publica cedo o runtime que tiver comprovado, com candidato e comandos reais, por capacidade.
- Juízes recebem os corpos e as evidências decisivas; não recebem só links que não podem abrir.
- Gates e provas comuns têm donos; as cinco não reimplementam nem repetem todo o motor Atlas.
- Delegação, plano, lote, checkpoint e PASS parcial não permitem encerrar; obrigações reais continuam até o DoD.

Uma dependência externa comprovada pode impedir um resultado; nesse caso ele fica
INCOMPLETE_BLOCKED, com evidência e todo trabalho independente realizado. O kit não
transforma limitação de ferramenta em aprovação ou promessa de execução em background.

## Identidades

- Fonte: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
- Protocolo da skill: `ee2521a5b966bd505cc95bd1c733e09e12f33531`; `parallel-v3-fresh`.
- Execução nova: `20261111-v3-fresh`; campanha lógica histórica: `20261111-v1`.
- População: 14.442 entradas, atribuídas uma vez; contagens não são estimativas de esforço.
- Integração: `genesis-fresh-final`; produção local: `genesis-fresh-s1` até `genesis-fresh-s5`.

Artefatos e branches anteriores permanecem históricos. Reúso compatível pode ajudar,
mas leitura de chats/handoffs/ledgers antigos não é pré-requisito deste início.
Uso anterior desconhecido não foi zerado; ROOT reconcilia o agregado na integração.

[Manifesto](manifest.json) · [Skill](../../../../../.orchestra/skills/execute-genesis/SKILL.md) ·
[Princípios](../../../../../.orchestra/skills/execute-genesis/references/principles.md) ·
[DoD local](../../../../../.orchestra/skills/execute-genesis/references/completion.md) ·
[Validação do kit](kit-validation.json)

Este pacote prepara a execução; não declara o Genesis executado ou aprovado.
