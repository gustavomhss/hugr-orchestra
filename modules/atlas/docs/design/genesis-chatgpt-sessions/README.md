# Genesis do Orchestra inteiro — cinco sessões ChatGPT

Este pacote entrega a skill e cinco prompts de execução para a campanha `20261111-v1`.
A campanha cobre o Orchestra inteiro por inventário finito de domínios e fluxos, com
produção cumulativa L1–L4, atualização, recuperação, integração, consumidores e dois juízes.
O pacote de instruções está preparado; sua existência não é execução ou conclusão do Genesis.

## Começar

Abra cinco sessões com acesso ao repositório e cole um prompt completo em cada uma.
Iniciar 1 e 5 primeiro ajuda a preparar o escopo e o julgamento; as outras podem começar
sua preparação independente imediatamente. Não é necessário abrir cinco sessões ao mesmo segundo.

| Sessão | Prompt | Entrega principal |
| --- | --- | --- |
| 1 | [Inventário e economia](prompts/01-escopo-economia.md) | universo repo-wide, critérios, interfaces, envelope e provas econômicas |
| 2 | [Produção e atualização](prompts/02-producao-update.md) | L1–L4, integração do produtor nativo, cache e rebuild reais |
| 3 | [Recuperação](prompts/03-recuperacao.md) | ativação isolada, concorrência, retomada, rollback e leituras históricas |
| 4 | [Host e migração](prompts/04-host-migracao.md) | callers/gates, CI, preservação e compatibilidade |
| 5 | [Juízes e integração](prompts/05-juizes-integracao.md) | dois juízes persistentes, consumidores, integração e aceite global |

Cada prompt fixa a skill no commit
`2689c516d63488be37de678cc853dd4556fd5c13`.
A fonte inicial de investigação é
`1cde2ff7a71bcf7aecb5d030917b577165135d38`.
Os executores registram o HEAD real de cada candidato que implementarem e executarem.
O [manifesto](manifest.json) identifica os prompts, branches, população e atribuição dos AC.

## Como as sessões cooperam

Cada sessão usa sua branch `genesis-chatgpt-sN` e publica handoffs com commits e hashes.
A sessão 5 integra alterações compartilhadas e registra as decisões dos dois juízes sobre
a mesma versão. Ela começa a julgar os pacotes incrementais cedo; não aguarda a campanha
inteira para liberar a primeira camada. Uma camada posterior depende da anterior aceita.

Cada host verifica seus slots. O ambiente de autoria permitia quatro agentes ativos,
incluindo o principal; 10–20 unidades de trabalho podem ser distribuídas em ondas.
Na sessão 5, dois subagentes são reservados para julgamento persistente.
Não se presume que IDs de agentes, memória ou arquivos temporários sejam compartilhados
entre conversas. Não existe agendamento automático de retomada neste pacote.

Se uma conversa terminar aguardando outra, retome-a com:

> Continue sua fatia da campanha 20261111-v1. Releia seu handoff e os novos handoffs das
> dependências pelos commits reais. Preserve os mesmos juízes quando esta for a sessão 5,
> reconcilie tentativas pendentes e continue o trabalho autorizado sem repetir o que já foi aceito.

## O que foi verificado neste pacote

- Frontmatter, nome e metadata da skill pelo validador do criador de skills.
- Links relativos e sintaxe dos exemplos JSON.
- Caminhos literais de fontes contra a árvore Git do baseline.
- Atribuição explícita de todos os 29 AC/CC/SC/DoD na matriz principal.
- Revisão independente da coerência operacional das cinco sessões.

Essas verificações avaliam as instruções. O adapter geral para produção nativa repo-wide,
os controles do Atlas, os consumidores e o Genesis serão executados pelas fatias e devem
produzir seus próprios recibos. O importador atual é específico ao piloto Session-input;
a fatia 2 possui a adaptação necessária, integrada e julgada pela 5.

## Fronteiras do aceite

O ciclo inclui produção, juízo, correção, reavaliação e consolidação. Ficam explícitos os
critérios não executados, bloqueados e indeterminados. Tokens/cobrança que o host não expõe
permanecem desconhecidos. Inferência nativa é o caminho escolhido; chamadas pagas externas
não são autorizadas por estes prompts.

A skill diferencia revisão técnica, aceite semântico, integração, aceite do proprietário,
landing e ativação de produção. Cada fronteira exige sua evidência e autoridade próprias.
