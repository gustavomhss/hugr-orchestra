# Genesis: cinco orquestradoras em paralelo

**Cada sessão entrega um domínio inteiro com seus subagentes e dois juízes. A
integração final fica com ROOT, na conversa original.** Este é o protocolo `parallel-v2`.

## Retomar as cinco conversas já abertas

Use [o mesmo prompt de continuação](continue-parallel.md) nas cinco conversas.
Cada uma mantém seu número, branch e trabalho anterior, lê sua nova atribuição e
executa. Atualizar a branch do kit não muda automaticamente prompts antigos fixados
em commits: a continuação explícita é necessária.

| Sessão | Domínio completo | Prompt ativo |
| --- | --- | --- |
| S1 | Core, sessões, modelos e contratos de API | [Prompt 1](prompts/01-core.md) |
| S2 | Interfaces: desktop, web, shell, UI e TUI | [Prompt 2](prompts/02-interfaces.md) |
| S3 | Maestro, Relay, especialistas e integrações | [Prompt 3](prompts/03-agentes.md) |
| S4 | Atlas, continuidade, RAG e Genesis | [Prompt 4](prompts/04-atlas.md) |
| S5 | CLI, Omni, distribuição, infraestrutura e contratos transversais | [Prompt 5](prompts/05-plataforma.md) |

As cinco começam em paralelo; cada uma orquestra inventário, produção L1–L4,
dois juízes, correções, reavaliação, consumidores e todas as provas locais aplicáveis.
As dependências cumulativas existem dentro da própria fatia. Não há liberação
inicial de S1/S5 nem espera da integração para começar trabalho independente.

ROOT receberá os cinco commits/handoffs, verificará cobertura e compatibilidade,
resolverá conflitos e conduzirá o par de juízes e as provas da união. S5 faz CLI e
infraestrutura; não centraliza a revisão ou a integração das outras quatro.

## Entrega completa, sem encerramento antecipado

As sessões são responsáveis pelo resultado, inclusive pelo trabalho delegado.
O ciclo obrigatório é decompor → despachar produtores → recolher/verificar → julgar
com dois independentes → corrigir → reavaliar → auditar tudo → persistir e confirmar.

Plano, proposta, checkpoint, delegação ou PASS semântico isolado não são entrega.
Só `DELIVERY_COMPLETE` após todas as obrigações locais; pendência externa demonstrada
fica `INCOMPLETE_BLOCKED` e não pode ser vendida como sucesso. Não encerrar enquanto
há tarefa executável ou agente em andamento. Não pedir confirmação para continuar
etapas já autorizadas, nem prometer atividade em segundo plano após o fim do turno.

## Identidades e cobertura

- Fonte: `1cde2ff7a71bcf7aecb5d030917b577165135d38`; árvore `a522a53e5f046f1758151b0f558531bbded04592`.
- Protocolo/skill: `928006636b345faac2b35b20093e79f85d983b5a`.
- Campanha lógica contínua: `20261111-v1`; resultados novos: `20261111-v2-parallel`.
- Branches: `genesis-chatgpt-s1` até `genesis-chatgpt-s5`; integração: `genesis-chatgpt-final`.
- Partição: 14.442 entradas, 0 não atribuídas, 0 sobreposições; 2.236/4.506/4.553/2.220/927.
- Critérios: 50 IDs GO-A/GO-I/AC/CC/SC/QS/DOD, com disposição local e revisão global.

O número de arquivos não mede esforço nem suficiência semântica. Cada domínio deve
classificar sua população e produzir entendimento útil; fixtures/assets podem ser
representados por fronteiras justificadas. Os casos reais e juízes decidem a qualidade.

## Preservação e dependências reais

As cinco branches já têm trabalho v1; preservar tudo, reler HEAD e migrar por refs
imutáveis. O protocolo substitui somente a coordenação serial e quotas de preparação
que bloqueavam produção. Mantém respostas, reservas e incertezas da mesma campanha.

S4 assume o importer/runtime Atlas necessário e aproveita as propostas anteriores.
As outras continuam produção/revisão nativa enquanto uma prova operacional dependente
não está disponível. Isso não transforma Markdown em publicação, readback ou CI.
Os testes seguem `AGENTS.md`; não há autorização nova para burlá-los ou gastar com
provedores externos. Use o GitHub conectado sem login/extração de credenciais.

Com quatro slots observados, uma sessão pode coordenar um produtor e dois juízes;
distribui outras tarefas em ondas. Há dez papéis locais de juiz e um par final de
ROOT, sem promessa de que todos os agentes fiquem simultaneamente ativos.

## Contratos

[Manifesto](manifest.json) · [Skill](../../../../../.orchestra/skills/execute-genesis/SKILL.md) ·
[Orquestração](../../../../../.orchestra/skills/execute-genesis/references/orchestration.md) ·
[Condição de entrega](../../../../../.orchestra/skills/execute-genesis/references/completion.md) ·
[Partição](../../../../../.orchestra/skills/execute-genesis/references/parallel-partition.json) ·
[Integração de ROOT](../../../../../.orchestra/skills/execute-genesis/references/integration.md)

Este commit entrega instruções corrigidas e verificáveis. Não declara o Genesis
executado, julgado ou integrado. Resultados reais ficam nas branches das sessões,
e só suas evidências podem estabelecer esses estados.
