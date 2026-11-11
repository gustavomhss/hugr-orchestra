---
name: execute-genesis
description: Executar o Genesis do Orchestra inteiro em cinco sessões ChatGPT, com subagentes nativos, produção cumulativa L1–L4, reutilização e rebuild, recuperação, integração e dois juízes independentes persistentes. Usar ao receber uma fatia desta campanha, retomar seus recibos ou integrar seu fechamento; distinguir trabalho produzido, executado, julgado e entregue.
---

# Executar Genesis em cinco sessões

## Vincular o pedido

Trabalhar em `gustavomhss/hugr-orchestra`. Usar como baseline de investigação
`1cde2ff7a71bcf7aecb5d030917b577165135d38`, da branch `genesis-economy-green`.
Ler esta skill e suas referências no **commit do protocolo indicado no prompt**.
Registrar separadamente baseline, commit do protocolo, HEAD de trabalho e candidato executado.
Não chamar o HEAD de baseline depois de adicionar commits.

Executar a campanha `20261111-v1`. O proprietário pediu em 11/11/2026:

- executar o trabalho pelas sessões ChatGPT e seus subagentes;
- salvar esta skill no repositório e distribuir o trabalho em cinco sessões;
- incluir juiz, correção, nova avaliação e integração completa;
- cobrir explicitamente **o Orchestra inteiro**, escolha posterior ao piloto Session-input.

Aplicar essa expansão de alcance e nova topologia somente à campanha nova. Preservar os
recibos e decisões históricos. Herdar a exigência de evidência dos contratos existentes;
não herdar como indisponível uma capacidade que esta sessão realmente possui.

Esta é uma skill do repositório. Não exigir instalação no diretório pessoal de skills,
execução do app Orchestra, contato com Maestro nem uma ferramenta MCP `atlas-mine`.
Um prompt com o endereço Git da skill permite carregá-la por leitura explícita.

## Carregar o mínimo necessário

Ler [campanha e cobertura](references/campaign.md), [handoffs](references/handoffs.md)
e a fatia atribuída. Ler [runtime](references/runtime.md) antes de executar código ou
afirmar produção real. A sessão 5 também lê [julgamento](references/judging.md).

| Sessão | Trabalho | Contrato |
| --- | --- | --- |
| 1 | Inventário do repositório, critérios, preservação inicial e economia | [Fatia 1](references/fatia-1.md) |
| 2 | Construção cumulativa, reutilização e atualização | [Fatia 2](references/fatia-2.md) |
| 3 | Ativação coerente, recuperação e rollback | [Fatia 3](references/fatia-3.md) |
| 4 | Host, Git/CI, preservação e migração | [Fatia 4](references/fatia-4.md) |
| 5 | Integração, dois juízes, consumidores e fechamento | [Fatia 5](references/fatia-5.md) |

Consultar no baseline `AGENTS.md`, `.orchestra/skills/atlas-{usage,maintenance,ownership}/SKILL.md`
e os documentos normativos indicados em `references/campaign.md` conforme o trabalho.
Não carregar todo o histórico em cada agente. Cada afirmação depende da fonte realmente lida.

## Inicializar cada sessão

1. Identificar sua fatia; assumir somente as escritas dela. Criar ou retomar sua branch
   `genesis-chatgpt-sN` a partir do commit do protocolo. Se a branch existir, ler o handoff
   e seu HEAD antes de continuar; nunca resetar ou sobrescrever outro trabalho.
2. Registrar capacidades observadas: leitura/escrita GitHub, execução no sandbox,
   disponibilidade do código, dependências, leitores Atlas e slots de subagentes.
   Ausência de `gh` autenticado não prova ausência do conector. Não iniciar `gh auth login`,
   procurar credenciais, preencher `GH_TOKEN` nem presumir acesso à máquina do proprietário.
3. Usar os subagentes nativos realmente disponíveis. Na sessão que originou este pacote
   há quatro agentes simultâneos incluindo o principal; nas demais, verificar o limite.
   Distribuir 10–20 unidades de trabalho em ondas quando útil, sem prometer 20 simultâneos.
   Reservar na sessão 5 dois slots para os juízes persistentes.
4. Persistir um primeiro handoff com capacidades, tarefas independentes e dependências
   ainda ausentes. A falta de uma dependência bloqueia seus consumidores, não todo trabalho útil.
5. Executar descoberta e preparação independente. Só alterar interfaces compartilhadas
   depois do contrato de propriedade de arquivos e da integração serial descritos nas referências.

Usar o conector para GitHub quando disponível. Usar terminal do sandbox para comandos
necessários e autorizados; o subprocesso não recebe automaticamente os poderes do conector.
Não exigir workflow para produção nativa. Respeitar separadamente a política de CI/testes
do repositório; uma execução no sandbox não recebe um run ID fictício de GitHub Actions.

## Produzir pelo caminho verdadeiro

1. Congelar o inventário finito de **todos os domínios e fluxos necessários** do Orchestra.
   Classificar a árvore inteira; explicar exclusões e representar dependências externas.
   O piloto Session-input é uma entrada reutilizável, nunca o denominador do repositório inteiro.
2. Vincular necessidades a artefatos, fontes, dependências de build, casos e critérios.
   Registrar fonte observada, intenção autorizada, interpretação e lacuna separadamente.
3. Reutilizar outputs previamente aceitos somente após comparar corpo, autoridade,
   fonte, receita e contrato. Produzir os gaps pelo adapter/receita que realmente executa.
   Persistir o pedido visível, a resposta visível original e os recibos necessários.
   Não pedir nem publicar raciocínio privado dos agentes.
4. Construir cumulativamente: base verificável → entendimento local → entendimento
   integrado → ownership/manutenção operacional. Cada artefato exigido precisa servir
   uma necessidade. Não exigir quatro documentos por arquivo só por simetria.
5. Consolidar a camada finita completa e enviar a mesma versão à sessão 5. Avançar
   a camada seguinte somente com o manifesto anterior aceito e dependências completas.
   Dividir a revisão em lotes rastreados quando necessário, mantendo cobertura integral.
6. Exercitar produtor, cache, seleção de afetados, rebuild, leitor, publicação isolada,
   recuperação e gates pelos pontos de entrada reais. Fixture, comentário ou teste lido
   não substitui execução. Um índice vazio, orçamento esgotado ou ausência de erro não fecha cobertura.

`modules/atlas/scripts/ownership-pilot.ts` é específico do piloto. Sua generalização é
trabalho da fatia 2, com integração da 5; não afirmar que já aceita qualquer domínio.
O `atlas mine` legado e seus cinco nomes de braço não são as cinco fatias desta skill.
Não reiniciar a fila histórica aposentada para preencher o novo registro de aceite.

## Julgar e corrigir

Centralizar o juízo vinculante na sessão 5. Usar dois subagentes persistentes, um com
ênfase em fidelidade/autoridade e outro em completude/utilidade; ambos verificam todos
os critérios obrigatórios aplicáveis à versão recebida. Seguir `references/judging.md`.

Manter revisão técnica de autoria separada de aceite independente. Registrar `PASS`,
`FIX-FIRST`, `HOLD` ou `REQUEST_EVIDENCE` com identidade exata, critério e evidência.
Corrigir defeitos concretos dentro do escopo/envelope vigente, preservar o original e
reavaliar o delta nos mesmos dois juízes. Reutilizar decisões inalteradas apenas com
bindings verificáveis. Não criar terceiro juiz para desempatar ou substituir um veto.

Persistir decisões e entregas por Git: uma conversa não pode chamar o `agent_id` da outra.
Autoria e juízo em contextos distintos dão separação de papéis; não demonstram diversidade
de fornecedor/modelo quando todos herdam a mesma família.

## Controlar execução e custo

Usar o envelope comum da fatia 1 antes de distribuir trabalho substantivo. Contabilizar
pedidos lógicos de produção, juízo, consumidor e correção; reservar também o trabalho
pendente. Preparação necessária para congelar o envelope é registrada desde o início.
Repartir quotas exclusivas por sessão para evitar cinco escritores concorrentes no orçamento.

Registrar tokens, tentativas físicas e cobrança como `unknown` quando o host não os
expuser. Slots, sites, bytes e chamadas não são dólares. Não chamar APIs pagas externas,
Grok/Claude/OpenRouter ou trocar modelo silenciosamente. A autorização atual é para
trabalho nativo nestas sessões; qualquer capacidade econômica não demonstrada permanece
um limite explícito de AC-08, sem impedir trabalho independente que esteja autorizado.

Não repetir uma requisição de resultado incerto. Procurar primeiro o recibo e o trabalho
durável. Uma correção tem identidade nova e vínculo com sua origem. Interromper refinamento
opcional assim que o critério estiver satisfeito; congelar novo limite antes de exceder o envelope.

## Integrar, entregar e retomar

Persistir resultados em
`modules/atlas/docs/design/genesis-chatgpt-results/20261111-v1/sN/`.
Cada sessão escreve somente sua branch e seu prefixo; a 5 consolida os commits exatos,
resolve propostas de arquivos compartilhados e mantém o manifesto integrado.

O registro de campanha é coordenação, não um segundo armazenamento de conhecimento.
Conhecimento servido continua pelas portas e manifestos governados do Atlas. Testar
publicação e recuperação em store isolado; ativação de produção exige alvo e autoridade próprios.

Prosseguir autonomamente em correções reversíveis do escopo autorizado. Concluir com
evidências de cada AC, CC, SC e DoD, consumo real e ambos os juízes da mesma versão.
Separar `READY_FOR_JUDGMENT`, `ACCEPTED_SCOPED`, `GLOBAL_REVIEW_READY`, aceite do dono,
landing e ativação. Não criar PR, fazer merge, force-push, instalar em produção ou limpar
recursos alheios como efeito colateral de receber uma fatia.

Se faltar uma capacidade ou autorização concreta, preservar o que foi feito e registrar
`BLOCKED` com a operação exata, evidência do impedimento, critério afetado e menor próximo
passo. Não chamar isso de conclusão. Entregar commit, caminhos, resultados reais,
juízos disponíveis e lacunas, sem substituir execução por um plano ou mapa documental.
