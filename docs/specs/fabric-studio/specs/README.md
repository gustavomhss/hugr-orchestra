# Fabric Studio — especificações técnicas

**Estado: propostas técnicas revisadas; aprovação documental com PR01 corrigido. Não congeladas para implementação.** Requisitos e decisões são as entradas normativas; uma spec proposta não comprova integração, driver, orçamento ou tenant.

## Hierarquia e limites

[Requirements](../requirements/README.md) definem obrigação/aceitação/contraprova. [Decisões Q01–Q13](../requirements/DECISIONS.md) fixam a direção. Estas specs definem contratos, estados, persistência, aplicação dos controles e provas necessárias. Não alteram os oito catálogos canônicos nem a entrada congelada do desenho.

`proposta` significa contrato técnico revisável. `baseline de autoria` significa seam estável para os autores desta rodada, não freeze de produção. `bloqueada para freeze` identifica prova/contrato ainda ausente. A aprovação documental não vira qualificação Microsoft, aprovação H ou teste verde.

## Índice

| ID | Spec | Responsabilidade |
| --- | --- | --- |
| S01 | [Produto e cobertura](./S01-product.md) | Entrada, modos, percurso manual/assistido e linguagem de disponibilidade. |
| S02 | [Identidade e contexto](./S02-identity.md) | Login, credenciais/cache, autorizações e placement sem Git. |
| S03 | [Catálogo e adaptadores](./S03-capabilities.md) | Contratos por superfície, efeitos e disposição das famílias. |
| S04 | [Documento declarativo](./S04-declaration.md) | Formato, validação, bindings, compiler e versões. |
| S05 | [Compositor e ferramentas](./S05-composer.md) | Solid, organização, identidade, foco, rascunhos e acessibilidade. |
| S06 | [Descoberta e contexto](./S06-discovery.md) | Inventário, resolução, grafo, proveniência e ambientes. |
| S07 | [Dados e observação](./S07-data.md) | Ativação, resultados, cache, refresh, exportação e cancelamento. |
| S08 | [Mudanças e aprovação](./S08-changes.md) | Conteúdo imutável, preflight, autorização exata e falhas parciais. |
| S09 | [Comandos e jobs](./S09-jobs.md) | Intenção durável, dispatch, retry, observação e recuperação. |
| S10 | [Validação e evidência](./S10-validation.md) | Check, comparabilidade, instrumentos e alcance das provas. |
| S11 | [IA e sessões](./S11-ai.md) | Integração Session V2, tools e política de egress. |
| S12 | [Templates e portabilidade](./S12-templates.md) | Biblioteca inicial, versões, cópias pessoais e export/rebind. |
| S13 | [Operação e distribuição](./S13-operation.md) | Proteção, retenção, exclusão, rede, budgets e diagnóstico. |
| S14 | [Qualificação E2E](./S14-qualification.md) | Provas por requisito, jornadas, julgamentos H e lançamento. |

[CONTRACTS.md](./CONTRACTS.md) é a seam de autoria; [OWNERSHIP.md](./OWNERSHIP.md) mapeia cada requisito a uma única spec proprietária, sem impedir consumidores transversais. [WAVE.md](./WAVE.md) registra o trabalho TechLead; [REVIEW.md](./REVIEW.md) registra os pareceres independentes, a correção PR01, a disposição do lead e o estado de freeze. Nenhum desses índices redefine a aceitação dos requirements.

[BLOCKERS.md](./BLOCKERS.md) concentra os gates ainda sem prova, distinguindo decisão textual, contrato compilável, qualificação real e lançamento. Não são pendências a ignorar para declarar estas propostas prontas para código.

Após nova autorização, começou a [rodada de fundamento compilável](./FOUNDATION.md): referências e observações C01/C02 em Schema, sem runtime ou API Fabric. O avanço parcial não libera uma wave dependente dos demais contratos nem fecha B-CONTRACT inteiro.

O mandato posterior de execução autônoma, o quadro de entrega e a rodada ativa estão em [DELIVERY.md](./DELIVERY.md). O lead segue entre etapas sem novas confirmações rotineiras; bloqueios reais de ambiente, credenciais e julgamento humano continuam explícitos.

A [fatia declarativa pura](./DECLARATION.md) registra wire/parser/compiler integrados, revisão, CI e contraprovas, sem confundir essa base com o renderer, autoridade ou qualificação operacional pendentes.

A [fatia portátil pura](./PORTABILITY.md) registra o envelope/codec e a separação dos limites, com revisão/CI/contraprovas; não comprova compartilhamento autorizado, rebind ou templates operacionais.

[REST-INVENTORY.md](./REST-INVENTORY.md) prepara o subcontrato das três primeiras leituras de inventário com fontes Microsoft reabertas e limites de transporte/projeção. Ainda não é adaptador, API Studio ou prova de acesso/qualificação.

## Gate de saída desta etapa

Specs propostas devem ter responsabilidade total/disjunta dos requisitos, contratos sem contradição entre consumidores, estados/erros/negativos observáveis e bloqueios nomeados. Antes de implementação dependente, os contratos de código precisarão ser compiláveis, congelados e exercitados em seams reais; texto TypeScript em Markdown não conta como essa prova.

A etapa documental não implementou runtime. A materialização parcial autorizada depois está registrada em FOUNDATION; não houve alteração de HttpApi ou regeneração de Client, chamada Fabric autenticada ou restart da instância do proprietário. Testes são executados exclusivamente por CI conforme AGENTS.
