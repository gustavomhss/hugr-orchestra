# Integração final na conversa original

## Responsável e limites

O proprietário atribuiu a integração final a ROOT, nesta conversa. As cinco sessões
S1–S5 são orquestradoras de domínios, cada uma com produção e dois juízes locais.
ROOT não substitui as entregas dessas sessões nem impõe autorização inicial.

| Campo | Valor |
| --- | --- |
| `integration_owner` | `root` |
| Campanha lógica | `20261111-v1` |
| Protocolo | `parallel-v2` |
| Epoch de resultados | `20261111-v2-parallel` |
| Branch | `genesis-chatgpt-final` |
| Namespace | `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v2-parallel/integration/` |
| Juízes próprios | `integration/J1`, `integration/J2` |

Criar a branch somente ao iniciar o trabalho de integração, sem resetar uma existente.
Confirmar seu HEAD antes de cada atualização e usar lease; nenhum force-push.
Não confundir a revisão deste kit de instruções com a futura integração do Genesis.

## Receber entregas sem perseguir branches móveis

1. Consultar `genesis-chatgpt-s1` até `genesis-chatgpt-s5` e os namespaces v2. Ler
   o HEAD atual e selecionar handoffs selados com commits e hashes exatos.
2. Verificar migração, continuidade de v1, partição, 50 critérios, artefatos L1–L4,
   julgamentos, correções, consumidores, gates, código e accounting de cada fatia.
3. Aplicar [completion.md](completion.md). Um handoff intermediário, plano ou
   aceite semântico sem operação não é entrega completa. Integrar preparação
   possível sem converter itens bloqueados em concluídos.
4. Congelar `selected-inputs.json`: sessão, branch observada, handoff e selo, fonte,
   candidato, artefatos, hashes, avaliações, dependências e gaps aceitos como gaps.
   Avanço posterior da branch não muda silenciosamente os inputs da integração.
5. Se uma revisão nova for necessária, registrar a substituição, o motivo e os
   artefatos/decisões dependentes que precisam de revalidação. Preservar os anteriores.

O trabalho de preparação da antiga S5 é reutilizável: rubric, casos, fila de seis
propostas, recibos e inventários. Suas cópias importadas de S1/S3 podem estar antigas;
validar contra as fontes selecionadas. Não declarar juízes antigos inexistentes
como executados nem assumir que `apply --check` aplicou patches ou testou produto.

## Montar e verificar o candidato integrado

Conferir a união da partição: todas as 14.442 entradas do baseline atribuídas uma
vez, classificações e necessidades sem lacunas. Reconciliar mudanças reais de fonte
no candidato, com novos hashes e análise de impacto. Cobertura estrutural não é
suficiência semântica; fluxos transversais precisam de artefatos e casos próprios.

Reconciliar patches de produto por arquivo/proprietário e dependências. Aplicar em
candidato isolado, preservando o significado e a proveniência de cada mudança.
Resolver conflitos reais sem substituir trabalho de outra branch por um snapshot
inteiro. Registrar a árvore, fonte, receita e identidade do candidato executado.

O importer/runtime de S4 deve ter evidência real de construção e governança. Confirmar
que atende aos cinco domínios, sem substituir identidades/reviewer IDs históricos
para forçar aprovação. Preparar uma geração coerente com manifestos de artefatos
exatos, mantendo stores de experimento separados do store servido em produção.

Verificar dependências de build e navegação separadamente. Detectar ciclos de build,
bindings incompatíveis, origem ausente, autoridade divergente, artefatos requeridos
faltantes e leituras misturadas. Não usar igualdade de texto como equivalência total.

## Executar integração e consumidores

Executar pelos pontos de entrada reais, conforme [runtime.md](runtime.md):

- Leitura Atlas-only e navegação progressiva, com casos mantidos fora da produção.
- Mudança permitida, violação, impacto entre componentes, falha e abstenção fora do escopo.
- Cache/reúso, seleção independente de afetados e rebuild após mudanças relevantes.
- Publicação isolada, leitura concorrente, interrupção, retomada e HOLD coerentes.
- Rollback compatível, histórico rotulado, isolamento de domínios e corrupção compartilhada.
- Preservação, migração, recusa de produtor antigo e fronteiras geradas.
- Gates de produto e CI exigidos, identificando candidato, execução e resultado reais.

Reaproveitar controles locais compatíveis pela identidade exata; não repetir tudo
por rotina. Executar os controles que faltam para a união ou que um delta invalidou.
Não converter gates indisponíveis em PASS. Testes seguem `AGENTS.md`; um build local
não equivale a testes remotos ou proteção efetiva de branch.

Reconciliar o ledger único a partir dos logs particionados e dos recibos v1/v2.
Deduplicar somente pela identidade demonstrada da mesma tentativa, conservar
reservas incertas e separar tarefas lógicas de tentativas físicas/tokens/cobrança.
Relatar garantias reais e limites de AC-08, nunca custo zero por falta de telemetria.

## Julgar a união e corrigir

Criar dois juízes independentes persistentes com `fork_turns: none`; nenhum pode
ter produzido o candidato/artefato que julga. Congelar o mesmo pacote para ambos,
com critérios [criteria.json](criteria.json), decisões locais e novas provas.
Ambos verificam todos os critérios globais aplicáveis, em lotes com cobertura total.

O par de uma fatia não substitui o par da integração. Não somar cinco aprovações
locais para inferir aceitação global. Não usar terceiro juiz para desfazer veto.
Corrigir cada finding obrigatório pelo responsável apropriado, formar revisão nova
e reapresentar o delta aos mesmos juízes. Mudanças de fonte invalidam decisões
dependentes; decisões independentes podem ser reutilizadas com binding explícito.

## Fechar sem pular obrigações

ROOT também segue a rotina de [orchestration.md](orchestration.md) e a condição de
[completion.md](completion.md). Continuar até entregar a integração inteira; não
parar ao abrir fila, delegar, resolver só o primeiro conflito ou obter um primeiro PASS.

Persistir pacote revisável com inputs selecionados, fonte/candidato, artefatos,
resultados operacionais, critérios, dois juízos, correções, accounting e limitações.
Separar `GLOBAL_REVIEW_READY`, aceite humano, landing e ativação. DOD-7 não é um
aceite que ROOT possa dar em nome do dono. Não fazer merge, PR ou ativação em produção
como efeito colateral de preparar a união; apresentar o resultado concreto quando
uma ação humana específica for de fato a única dependência restante.

Se uma barreira externa impedir uma obrigação, persistir `INCOMPLETE_BLOCKED`,
operação tentada, capacidade/autoridade ausente, evidência e próximo passo mínimo.
Continuar o trabalho independente. Não declarar a integração entregue enquanto
obrigação executável ou correção obrigatória continuar aberta.
