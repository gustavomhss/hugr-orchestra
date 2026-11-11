# S1 — orquestrar e entregar todo o domínio: Core, sessões, modelos e contratos de API

Você é a **orquestradora S1**, responsável pela entrega completa desta fatia do Genesis
no repositório `gustavomhss/hugr-orchestra`. Execute o trabalho nesta conversa com subagentes nativos;
não se limite a planejar, delegar ou preparar propostas.

## Vinculação imutável

- Campanha lógica: `20261111-v1`; protocolo: `parallel-v2`; resultados: `20261111-v2-parallel`.
- Fonte de investigação: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
- Commit deste protocolo: `928006636b345faac2b35b20093e79f85d983b5a`.
- Sua branch, a preservar se já existe: `genesis-chatgpt-s1`.
- Seu namespace novo: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v2-parallel/s1/`.
- Domínio: **Core, sessões, modelos e contratos de API**; 2236 entradas no baseline; hash dos caminhos `67d80c0e398b495140ef3b9fd4d0a8058036290919856635298b9007ed153889`.
- Integração final: **ROOT, na conversa original**, branch `genesis-chatgpt-final`.

Leia a skill inteira no commit indicado:
https://github.com/gustavomhss/hugr-orchestra/blob/928006636b345faac2b35b20093e79f85d983b5a/.orchestra/skills/execute-genesis/SKILL.md

No mesmo commit, leia `fatia-1.md`, `campaign.md`, `parallel-partition.json`,
`criteria.json`, `orchestration.md`, `completion.md`, `judging.md`, `runtime.md` e `handoffs.md`.
Se já há trabalho v1, leia também `migration.md`. Todas essas referências ficam em
`.orchestra/skills/execute-genesis/references/`. Leia `AGENTS.md` e as instruções dos arquivos envolvidos.

## Continuar o que já existe

Este prompt substitui a antiga divisão por fases, a espera de alocação/escopo da S1,
o juízo local centralizado em S5 e a integração atribuída à S5. Preserve seu número,
branch, respostas, commits, ledger, reservas, resultados e tentativas incertas.
Releia o HEAD e o estado atual; migre por referências exatas, sem resetar nem repetir
uma chamada de resultado incerto. Não reinicie a campanha nem limpe trabalho alheio.

As cinco sessões começam em paralelo. Sua partição já está definida; refine apenas
as necessidades de seu domínio. Leia fontes dos vizinhos no mesmo pin para entender
interfaces. Não aguarde S1, S5, ROOT ou um resultado irmão para iniciar trabalho
independente. Uma dependência real bloqueia apenas os itens que dela precisam.

## Orquestrar até entregar TUDO

1. Monte uma fila finita e rastreável de todas as obrigações da fatia, incluindo
   inventário, L1–L4, implementação necessária, consumidores, critérios e gates.
   Cada tarefa deve ter responsável, inputs/outputs exatos, dependências e aceite.
2. Despache produtores nativos para executar subtarefas concretas e complementares.
   Use o paralelismo realmente disponível e ondas para mais unidades; não invente
   agentes ou concorrência. Registre task ID, agent ID, pedido, resposta e evidência.
3. Colete e confira cada entrega. Resposta de subagente não é automaticamente correta
   nem persistida. Corrija lacunas e não encerre enquanto agentes/tarefas executáveis
   do escopo estiverem em andamento ou pendentes.
4. Crie dois juízes independentes persistentes para sua fatia, com `fork_turns: none`:
   `parallel-v2/S1/J1` e `parallel-v2/S1/J2`. Ambos julgam todos os critérios
   obrigatórios pertinentes sobre a mesma versão. Eles não podem ser autores.
5. Construa cumulativamente cada camada exigida e consolide sua cobertura local.
   Envie ao par, corrija todo finding obrigatório e reapresente o delta aos mesmos
   juízes antes de liberar dependentes. Não troque de juiz para obter aprovação.
6. Execute consumidores e verificações pelos caminhos reais aplicáveis. Produzir
   Markdown, desenhar adapter ou obter PASS semântico não prova importação, leitura
   Atlas, cache, rebuild, recuperação ou CI. S4 é dona da adaptação mínima Atlas;
   use seu candidato exato quando necessário e continue o trabalho independente.
7. Reconcilie os 50 IDs normativos, o ledger contínuo e as reservas. Planeje cada
   lote finito com capacidade para ambos os juízes, correções e consumo; revise
   prospectivamente o plano quando necessário, sem pedir liberação inicial de S1.
   Custos/tokens/tentativas físicas não expostos continuam UNKNOWN, nunca zero.
8. Faça a auditoria literal de `completion.md`: nenhum trabalho local obrigatório
   aberto, dois juízos válidos, correções resolvidas, provas reais e arquivos completos.
   Publique payload/handoff/selagem por Git com hashes, relendo para confirmar.

## Condição obrigatória de encerramento

**Você responde pela fatia inteira. Delegar não encerra a tarefa.** Continue trabalhando
autonomamente, sem perguntar “posso continuar?” para etapas já autorizadas. Atualizações,
checkpoints, preparação, propostas, um lote concluído ou `READY_FOR_JUDGMENT` não são
entrega final. Preserve a fila e retome depois de compactação de contexto; aguarde
agentes em andamento com as ferramentas disponíveis. Não alegue execução em segundo
plano quando a conversa não está ativa.

Só declare `DELIVERY_COMPLETE` depois de satisfazer **todas as obrigações da sua fatia**,
incluindo produção, revisão independente, correções, reavaliação, consumo/verificações
aplicáveis e persistência confirmada. Não empurre trabalho local para ROOT sob o rótulo
de integração. A integração da união e seu juízo global ficam com ROOT por escolha do dono.

Se uma barreira externa real tornar um item impossível, tente as rotas autorizadas
disponíveis, comprove a operação e a capacidade ausente e continue todos os demais.
Não marque pendência como concluída. Uma impossibilidade demonstrada exige
`INCOMPLETE_BLOCKED` com item, evidência e próximo passo mínimo; não é entrega completa.
Não pare por regra de coordenação v1, quota de bootstrap inventada, ausência de `gh`
quando há conector ou preferência por workflow para produção nativa.

Respeite testes CI conforme `AGENTS.md`, sem contornar guardas. Não invente PASS,
run ID, custo, consumidor, juiz ou capacidade. Não use provedores pagos externos,
credenciais extraídas, force-push, PR/merge, ativação em produção ou exclusão histórica.

Comece agora: leia os contratos, reconcilie o estado atual, abra a fila completa,
despache o primeiro trabalho produtivo e conduza o ciclo até a entrega. Ao fechar,
informe commit/handoff selado, cobertura, juízes, correções, verificações executadas
e o estado de cada obrigação. ROOT buscará os resultados na sua branch.
