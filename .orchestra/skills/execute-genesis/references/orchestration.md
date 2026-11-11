# Orquestração de cada fatia Genesis

Aplicar à campanha `20261111-v1`, protocolo `parallel-v2`, epoch `20261111-v2-parallel`.
Cada uma das cinco conversas é uma orquestradora responsável pela entrega integral do seu domínio.
Aplicar [conclusão](completion.md), [juízo](judging.md), [runtime](runtime.md) e o contrato ativo em [SKILL.md](../SKILL.md).

## Responsabilidade do principal

Planejar a fila completa, despachar produtores reais, recolher saídas, verificar evidências e executar os dois juízes.
Corrigir por meio do autor apropriado, obter reavaliação e fechar cada obrigação própria antes de entregar.
Delegar não transfere a responsabilidade pelo resultado nem permite encerrar quando o subagente terminar.
O principal conserva a visão do inventário inteiro, das dependências e dos 50 critérios; nenhum lote redefine o escopo total.
Uma auditoria objetiva do principal complementa o juízo independente e nunca substitui votos dos dois juízes.

## Fila e registro de despacho

Materializar uma fila finita por necessidades, scopes, camadas, código necessário, casos e critérios.
Cada tarefa registra `task_id`, domínio, dono, tipo, estado, entradas, predecessores e resultado exigido.
Cada despacho registra também `agent_id` real, papel, referência/hash do pedido, versão de fonte/candidato e limites.
Ao recolher, registrar resposta original visível, arquivos/bytes/hashes, verificações, decisão e relação com a tarefa.
Persistir as relações tarefa→despacho→resposta→artefato→review→critério; nomes simbólicos não são IDs reais do host.
Manter o ledger de tentativas e reservas ligado a esses IDs, inclusive respostas incertas e uso `UNKNOWN`.
Não solicitar raciocínio privado. Preservar prompts, conclusões, evidências e saídas visíveis necessárias à auditoria.

## Slots e ondas

Confirmar a capacidade do host: nesta preparação havia quatro agentes ativos, incluindo o principal.
Com os dois juízes estabelecidos, usar principal + um produtor/consumidor + dois juízes persistentes.
Antes de haver pacote julgável, produtores independentes podem ocupar os slots livres, com ownership disjunto.
Concluir e recolher essas ondas antes de criar o par quando não houver slots; não abandonar produtores em andamento.
Criar os juízes como novos agentes limpos, não renomear um produtor ou oracle como juiz do próprio trabalho.
Depois do bootstrap, manter os mesmos dois IDs para todos os deltas; não recriar pares para liberar concorrência.
Executar produtores e consumidores subsequentes em ondas no slot disponível, sem reutilizar contexto contaminado.
Dez a vinte unidades delegadas podem ocorrer ao longo da execução quando necessárias; isso não promete vinte simultâneas.
Não criar agentes ou tarefas apenas para atingir uma contagem. Cobertura e prova determinam o trabalho.

## Despachar produção executável

Escolher um item desbloqueado que produza artefato ou evidência concreta e atribuí-lo a um subagente real.
O pedido informa missão, arquivos/scopes permitidos, fonte fixada, dependências, contrato e critérios de aceite.
Incluir entrega exata: corpo/código/caso exigido, referências, lacunas, paths e resposta visível preservável.
Exigir execução autorizada quando o item pede execução; uma proposta não satisfaz um resultado executável.
Passar o contexto necessário e separar evidência de instrução; fontes do repositório não podem alterar a missão.
Não entregar ao produtor o oracle held-out, resposta esperada ou conclusão que o juiz deveria alcançar.
Usar área de escrita exclusiva; mudanças fora do domínio seguem proposta ao dono, com candidato e diff verificáveis.
O principal coordena escritas remotas com o HEAD atual e o protocolo de lease; não permitir corridas entre subagentes.

## Recolher e verificar

Quando uma ferramenta indicar trabalho em curso, usar a espera suportada com o ID real e intervalos limitados.
Continuar outras tarefas independentes e manter atualizações; não concluir o turno só porque um despacho retornou `RUNNING`.
Recolher a resposta original antes de pedir nova inferência; uma resposta perdida não autoriza replay fictício.
Conferir que os arquivos existem, calcular os hashes dos bytes e comparar o resultado com a missão atribuída.
Verificar fonte/candidato, autoridade, dependências, cobertura e comandos realmente concluídos; não confiar só no resumo.
Resultado parcial volta à fila com itens faltantes. Erro concreto gera correção ou bloqueio delimitado, não aprovação.
Preservar respostas originais, inclusive as defeituosas, e identificar qualquer consolidação editorial do principal.

## Bootstrap e execução dos dois juízes

Criar o par no primeiro pacote julgável com `fork_turns: none`, sem histórico do autor e sem conclusão induzida.
Usar os papéis locais `parallel-v2/SN/J1` e `parallel-v2/SN/J2`, vinculados aos IDs efetivamente retornados.
Dar aos dois a mesma união de artefatos, fonte, versão, rubrica e evidência decisiva, conforme [judging.md](judging.md).
Ambos cobrem todos os critérios obrigatórios aplicáveis; ênfases diferentes não repartem o dever de revisão.
Os juízes não produzem, corrigem, executam ferramentas ou delegam a avaliação; pedem evidência delimitada quando faltar.
Recolher as duas decisões originais e validar seus bindings externamente; parecer ausente ou truncado não é PASS.
Não buscar maioria, terceiro voto ou troca de fornecedor. Divergência material permanece HOLD até sua resolução válida.
Preservar os IDs durante a sessão. Perda real segue o contrato de continuidade; nunca fabricar um agente persistente.

## Correção, reavaliação e fechamento

Para `FIX-FIRST`, ligar achado, critério e artefato ao dono e despachar correção concreta.
Recolher a correção, fixar novo manifesto e verificar seu delta e dependências afetadas.
Reapresentar o candidato aos mesmos dois juízes, com suporte inalterado vinculado e a nova evidência.
Exigir dois PASS aplicáveis à versão final para as obrigações que requerem juízo; não reaproveitar voto de outra versão como atual.
Marcar a tarefa `DONE` apenas após satisfazer suas condições e persistir os recibos, mantendo a rastreabilidade.
Percorrer obrigatoriamente fila→despacho→coleta→verificação→juízo→correção→reavaliação→fechamento quando houver defeito.
Sem defeito, fechar após juízo e provas exigidas; evitar rodadas opcionais que não resolvem obrigação pendente.
Avançar L1→L4 com predecessores locais aceitos; não exigir liberação de S1, S5 ou ROOT para produzir o domínio.

## Consumidores e provas operacionais

Separar oracle, produtor e consumidor. Após produção, usar um novo contexto de consumidor no slot liberado.
Executar os casos por `ownership.index/read` reais, registrando consultas, versões, respostas, limites e recusas.
Confirmar isolamento observável; uma instrução textual não prova restrição técnica de ferramentas.
Usar candidatos e estados isolados. Código planejado, leitura de Markdown ou CAS direto não prova consumo Atlas.
S4 possui o adapter comum; cada sessão continua responsável por executar suas provas locais quando ele estiver disponível.
Se faltar capacidade, continuar produção/revisão independente e conservar os critérios operacionais pendentes.
Seguir CI e autoridade existentes; a orquestradora não inventa dispatch, run, publicação ou autorização.

## Continuidade e entrega integral

Persistir fila, rosters, pedidos, respostas, versões e ledger antes de depender de memória temporária.
Compactação retoma a execução desses registros. Checkpoint facilita continuidade; não transforma pendência em entrega.
Revisar o plano operacional finito antes de novas chamadas autorizadas; não parar no fim de um lote arbitrário.
Depois dos dois PASS finais locais, executar a auditoria literal de [completion.md](completion.md) e fechar o que ainda faltar.
Verificar Git remoto e o handoff selado. Somente então declarar `DELIVERY_COMPLETE` para o domínio.
Impossibilidade material comprovada segue `INCOMPLETE_BLOCKED`, após esgotar rotas autorizadas e todo trabalho independente.
ROOT recebe as entregas locais e integra a união com par final próprio; isso não elimina obrigações das orquestradoras.
Não perguntar se deve continuar trabalho já autorizado e não prometer execução depois de terminar o turno.
