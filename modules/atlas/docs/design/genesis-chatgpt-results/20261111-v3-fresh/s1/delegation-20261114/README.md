# Delegação S1 em cinco sessões

Preparação autorizada pelo proprietário em 14/11/2026. Este kit organiza cinco entregas novas dentro de S1, preservando o trabalho anterior. Não declara produção, julgamento ou operação executada pelas novas sessões.

| Missão | Domínio | Fontes | Branch |
| --- | --- | ---: | --- |
| [S1-01](01-sessions/mission.json) | Sessões, estado e infraestrutura de execução | 555 | genesis-s1-sessions |
| [S1-02](02-tools/mission.json) | Ferramentas, segurança, extensões e capacidades | 424 | genesis-s1-tools |
| [S1-03](03-automation/mission.json) | Automação, pesquisa e fronteiras do Core | 462 | genesis-s1-automation |
| [S1-04](04-api/mission.json) | Schema, contratos públicos, APIs, clientes e SDKs | 472 | genesis-s1-api |
| [S1-05](05-libraries/mission.json) | LLM, plugins, CodeMode, SQLite e gravação | 323 | genesis-s1-libraries |

Total: 2236 fontes, cada uma com exatamente um dono; os 36 artefatos L1 históricos também têm um dono primário único. Quantidade de fontes não é estimativa de esforço nem quantidade obrigatória de documentos.

Cada sessão lê COMMON.md, sua mission.json, inputs.json e sources.jsonl no commit imutável indicado no prompt. Depois continua a produção, avaliação, correção, operação e entrega no namespace próprio.

As cinco branches partem do mesmo preparo, cujo pai é a8df22ae3a140c58c63f62ce2a634c84f415c943. O baseline investigado continua 1cde2ff7a71bcf7aecb5d030917b577165135d38. Preservar ambos sem confundir código executado com fonte de investigação.

Os prompts de abertura ficam em PROMPTS.md no commit de selagem, apontando para o payload imutável deste kit.

## Composição posterior

A coordenação desta delegação recebe os cinco handoffs e compõe S1 em genesis-fresh-s1. As cinco sessões não escrevem nessa branch nem no pacote central em paralelo. ROOT mantém a integração global em genesis-fresh-final.

dependencies.json atribui as necessidades cruzadas e a contribuição para a entrada geral. Nenhuma sessão precisa esperar a união para iniciar trabalho independente.

## Verificação

verify.mjs confere as cinco listas contra coverage.json herdado, os 36 donos, as contagens, paths/blobs, branches e namespaces. Executar com Node a partir de uma cópia do kit; a opção --legacy permite indicar explicitamente o inventário herdado.

validation.json é o recibo mecânico da preparação. Não é teste de produto, CI, aprovação semântica, publicação Atlas ou conclusão de S1.
