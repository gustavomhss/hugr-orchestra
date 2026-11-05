# Revisão técnica das specs

## Estado

**Proposta documental revisada e aprovada pelo lead, com PR01 corrigido e reconferido. Não congelada para implementação.** Dois pareceres independentes examinaram a integração; o segundo pediu uma correção de consistência de tipos, aplicada antes deste fechamento. Este veredito não herda o APPROVE dos requirements ou das decisões e não aprova viabilidade operacional, endpoints ou lançamento.

## Entrada, alcance e método

Snapshot integrado authoring-2 de 2026-11-04: manifesto SHA-256 `8b0931e32cbbcf14f55bb8504f27ed17bbe8cf9a108bb4dd853487cec1fe3536`. Revisores novos de autoridade/runtime/segurança e de composição/dados/Fabric trabalharam em checkouts isolados, sem editar o corpus. Os APPROVE anteriores continuam restritos às suas etapas. Findings exigiram citação, contraprova concreta e disposição verificada pelo lead.

| Parecer | Resultado e alcance | Artefato externo / SHA-256 |
| --- | --- | --- |
| Autoridade/runtime/segurança | APPROVE somente da coerência documental no recorte S02/S08/S09/S11/S13/S14, seam e consumidores pertinentes; sem finding AR substanciado. | `fs-review-authority-return.md` / `9ac08793702d5d3908962ccbd861bb3bf6ee4a8e809172b2bf0cc82b548c9534` |
| Composição/dados/Fabric | FIX-FIRST documental, PR01 P2; demais cruzamentos examinados preservados, sem aprovação de implementação. | `fs-review-product-return.md` / `102748ef727ac86854bc8ffe8a4892306b87e051fd6a54107f9376a8f242bfc4` |
| Reconferência do delta PR01 | APPROVE documental do delta; PR01 fechado, sem nova revisão ampla ou prova operacional. | `fs-review-product-PR01-return.md` / `3bd186308249f10564eecca299afe80fc0ea98ae9626e74ada53c94ccdba2439` |

Artefatos preservados no diretório temporário aprovado `opencode`, ao lado do snapshot, não no histórico de produto. CONTRACTS corrigido tem SHA-256 `690f65d9f39129f8701115f5d17776aa8701965bf207832bb4f44cba44dc3475`. A reconferência comparou exatamente a substituição de um parágrafo ao snapshot original, preservado; não substituiu o relatório FIX-FIRST por um APPROVE retroativo.

## Findings e decisões do lead

**PR01 / P2 — aceito e corrigido.** C01 declarava indiscriminadamente que gerações/revisões eram inteiros, embora CapabilityRef declarasse `revision: string` e S04 usasse strings para componente/capacidade. Contraexemplo confirmado pelo lead: `revision: "1"` satisfazia a forma e contrariava a frase, enquanto `revision: 1` fazia o inverso. Isso poderia divergir entre validador Server e preview, contra FS-DEC-002/014 e Q12. A correção limita a regra aos campos declarados numéricos e fixa revisões de componente/capacidade como strings não vazias, sem coerção e conferidas contra a entrada exata do catálogo. Não altera tipos, exemplos ou requirements. O revisor reconferiu o delta e fechou PR01; codecs reais continuam em B-CONTRACT.

**Disposição do lead:** APPROVE da proposta documental corrigida, somente nesse estágio. Conferidos os pareceres, seus hashes e snapshot; reabertas as cláusulas citadas de S04, requirements e Q12. Conferidos também os limites reais de Database (`synchronous = NORMAL`), CredentialCipher (cifra específica e descoberta atual das tabelas conhecidas), OAuth de Integration e settlement/bounding do registry. Eles não demonstram as extensões propostas e permanecem gates, sem relaxamento. Não há finding documental substanciado pendente nestes pareceres; isso não é alegação de ausência universal de defeitos.

**Perguntas dos revisores:** a revisão não demonstra que todos os canais reais de entrada/saída já aplicam egress. S11/B-EGRESS exige inventariar e provar esses boundaries, incluindo admissão de usuário, tool parts, saídas gerenciadas, erros e histórico, antes de admitir conteúdo sensível; não se declara auditoria de implementação concluída. Código/definições/buffers estão deliberadamente fora do pacote portátil v1: transferência desses payloads requer contrato separado, não é continuidade entre operadores já entregue. Buffers locais retidos no trabalho de um operador seguem Q03 e proteção demonstrada.

## Verificações documentais

- Ownership: os 200 IDs canônicos (195 M, cinco H) têm exatamente uma spec primária entre S01–S14. Remover um ID ou duplicá-lo no input em memória foi detectado; não se alterou a fonte para o controle.
- Referências de prova: cada ID proprietário aparece na seção de provas da spec; em S14, a tabela E2E está na seção 2 e os casos OPS adicionais na seção 5. O primeiro verificador encontrou esse arranjo em vez de fingir que todos estavam na seção 5; foi ajustado para ler as duas tabelas explícitas. Esta é prova de referência, não de suficiência semântica ou execução.
- Links Markdown locais do corpus resolvem arquivos existentes. Controle de caminho ausente detectado. Âncoras internas e disponibilidade das URLs externas não foram revalidadas por esta checagem.
- Hashes da entrada de autoria: DESIGN, COVERAGE, TEMPLATES, DECISIONS e os oito catálogos canônicos coincidem com o snapshot anterior; controle com byte alterado detectado. Requirements README só recebeu link de navegação para specs.
- Scope contra HEAD: corpus Fabric e três mocks preexistentes são os únicos arquivos não rastreados; nenhuma mudança tracked. Diff contra origin/dev pode conter história anterior da branch e não é atribuído a esta autoria.
- `bun run check:guards --base origin/dev`: repetido após PR01 e registro dos pareceres, 78 regras, 43 caminhos, zero findings/erros. O runner carrega regras do merge-base, executa seus controles positivos/negativos `selfCheck` e inclui arquivos não rastreados (`script/guards/run.ts` e `diff.ts`). Execução local documental: não é suite de produto nem CI verde.
- Checagens finais repetiram ownership/referências/links/hashes com controles; contra o snapshot revisado, só CONTRACTS (substituição exata de PR01) e metadados de status em README/REVIEW/WAVE mudaram. Nenhuma das quatorze specs ou entradas canônicas foi reescrita após o parecer.
- Três worktrees de autoria e dois de revisão removidos sem force após status vazio incluindo ignorados; hashes dos rascunhos e pareceres externos preservados e conferidos.

## Estado de freeze e limites de prova

Permanece **não congelado para implementação**. [BLOCKERS.md](./BLOCKERS.md) concentra contratos compiláveis, isolamento, credencial/proteção/egress, durabilidade/restore/proveniência, renderer/driver/engines, budgets medidos, tenant e release. Nenhum teste de produto, ensaio autenticado Fabric, qualificação remota ou julgamento H foi executado nesta etapa. Não houve commit/push ou mudança de API/Client.

Este é o fechamento histórico da etapa documental. A materialização parcial autorizada depois, seus testes de contrato em CI e a revisão de código são registrados separadamente em [FOUNDATION.md](./FOUNDATION.md); não transformam este parecer em aprovação de runtime ou lançamento.
