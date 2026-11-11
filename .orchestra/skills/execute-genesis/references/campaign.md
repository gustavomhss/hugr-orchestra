# Campanha, alcance e cobertura

## Conteúdo

- Identidade e decisão de alcance
- Fontes normativas e estado herdado
- Cobertura das cinco sessões
- Ordem de execução e integração
- Congelamento do universo do repositório
- Autoridade e conclusão

## Identidade e decisão de alcance

| Campo | Valor |
| --- | --- |
| Campanha | `20261111-v1` |
| Repositório | `gustavomhss/hugr-orchestra` |
| Baseline de fonte | `1cde2ff7a71bcf7aecb5d030917b577165135d38` |
| Branch de origem | `genesis-economy-green` |
| Entrega desta skill | branch `genesis-chatgpt-kit`; usar o commit imutável indicado no prompt |
| Escopo novo autorizado | Orchestra inteiro: inventário finito de domínios, fluxos e necessidades |
| Ambiente escolhido | sessões ChatGPT e subagentes nativos, com capacidade verificada em cada sessão |
| Produto esperado | ownership cumulativo L1–L4, mantido e consumido pelo Atlas, com provas de todo o contrato |

A autorização de 11/11/2026 expande explicitamente o escopo que o plano anterior limitava
a Session-input. A topologia passa a cinco sessões coordenadas por commits e dois juízes
nativos na sessão 5. Esta declaração não reescreve os documentos históricos nem transforma
seus aceites em aceites da nova população. Axiomas, invariantes e critérios de evidência
continuam vigentes. Autorizações de pagamentos externos, produção e landing não são inferidas.

## Fontes normativas e estado herdado

Ler os documentos abaixo no baseline, aprofundando os recibos que decidirem cada caso.
O prefixo dos documentos de design é `modules/atlas/docs/design/`.

| Fonte | Uso |
| --- | --- |
| `genesis-ownership-plan.md` | GO-A1..7, GO-I1..8, AC-01..10, CC-1..7, SC-1..5, QS-1..6, DOD-1..7 |
| `genesis-global-completion-plan.md` | G0..G6, lacunas e distinção entre plano, prova mecânica e aceite semântico |
| `genesis-campaign-reconciliation.md` | preservação, obrigações herdadas e escopo dos aceites existentes |
| `genesis-recovery-worklist.md` | solicitações, respostas e obrigações históricas imutáveis |
| `genesis-ownership-judges.md` | dois papéis complementares, versão exata, decisões e barreiras |
| `genesis-ownership-seats.md` | necessidades das camadas e contratos de produção anteriores |
| `genesis-economy-control-contract.md` | reserva, admissão, liquidação, tentativas e limites de observabilidade |
| `genesis-update-plan-contract.md` | afetados, dependências e controles de reconstrução |
| `genesis-landing-plan.md` | entrega, proteção de objetos, revisão e ativação |
| `AGENTS.md` e skills `atlas-usage`, `atlas-maintenance`, `atlas-ownership` | arquitetura, operações reais e verificação do repositório |

Começar do estado observado, sem refazer automaticamente pesquisa aceita. Comparar
os resultados L1–L4/piloto ao novo pin e ao escopo antes de reutilizá-los. Preservar
AC-03 aberto onde faltam casos diretos; AC-10/global sem reconciliação onde faltam provas;
old-producer indeterminado onde só há citação. Alterar um status somente por evidência nova
vinculada ao critério. A nova autorização de alcance não é evidência de que ele já passou.

Preservar a disposição da antiga fila M1; não a reiniciar. J1/R3, requisição original
sem resposta, uso físico histórico desconhecido, PRs #1291/#1300/#1302 e recursos retidos
continuam com disposições explícitas. Não somar replay ou dados sintéticos a uso real.

## Cobertura das cinco sessões

Uma sessão é responsável primária pelo critério; a sessão 5 decide a integração de todos.
Um apoio compartilhado não transfere silenciosamente a responsabilidade.

| Critério | Responsável | Prova necessária |
| --- | --- | --- |
| AC-01 | 1, juízo 5 | universo finito repo-wide; necessidade → artefato → fonte → caso; suficiência julgada |
| AC-02 | 5, produção 2 | consumidores Atlas-only resolvem mudanças, violações, impacto, falhas e abstêm fora do escopo |
| AC-03 | 5, leitores 3/4 | índice/leitor reais, limites congelados, uso raso/profundo e uso direto dos intermediários |
| AC-04 | 2 | produtor real e recusa de stale/conflicting/missing/malicious-source |
| AC-05 | 2 | cache hit observado com zero novas interpretações; identidade/autoridade/dependência corretas |
| AC-06 | 2 | afetados independentes e rebuild concluído para edit/add/remove/intent-doc/recipe |
| AC-07 | 3 | interrupção, concorrência, retomada durável, HOLD, rollback e histórico |
| AC-08 | 1 | envelope, concorrência, reserva, liquidação e limites reais do adapter |
| AC-09 | 4, isolamento 3 | recusas nos callers reais; escopo independente e corrupção compartilhada; CI/proteção separados |
| AC-10 | 4 | inventário preservado, recusa do produtor antigo, migração e rollback compatível |
| CC-1 | 1 | inventário/inputs/lacunas congelados |
| CC-2 | 2 + 5 | níveis exigidos persistidos, úteis e alcançados por leitor real |
| CC-3 | 2 + 5 | propósito, comportamento, contratos, decisões, impacto e manutenção apoiados |
| CC-4 | 2 | build/update/reuse/adicionais/remoções end-to-end |
| CC-5 | 3 + 4 | publicação coerente, recuperação e compatibilidade governadas |
| CC-6 | 1 | economia reconciliada com garantia descrita corretamente |
| CC-7 | 4 + 5 | documentação, superfícies geradas, compatibilidade e dívida histórica |
| SC-1 | 5 | todos os casos obrigatórios de ownership aceitos |
| SC-2 | 5 | consumo progressivo dentro dos limites por tarefa |
| SC-3 | 2 | independentes preservados e conjunto afetado reconciliado |
| SC-4 | 1 | custos/uso por fase; desconhecidos explícitos; sem economia fictícia |
| SC-5 | 3 + 4 | consistência e recusas executadas |
| DOD-1 | 5 | decisões explícitas para CC/SC e evidência semântica |
| DOD-2 | 5, todas apoiam | GO/QS e controles que rejeitam defeitos reais |
| DOD-3 | 5 | consumidores e cadeia integrada real |
| DOD-4 | 4 + 5 | testes/guards/typechecks reais, candidato exato e integração final |
| DOD-5 | 1 | uso/pendências reconciliados sem duplicação |
| DOD-6 | 4 + 5 | operação, migração, revisão independente e recursos próprios |
| DOD-7 | 5 + proprietário | aceite e integração governada documentados, nunca autoatribuídos |

Todas as fatias herdam GO-A1..7, GO-I1..8 e QS-1..6. Os contratos das fatias
especializam essas obrigações e não mudam a barra global.

## Ordem de execução e integração

Abrir as cinco sessões; iniciar 1 e 5 primeiro é útil, mas as demais podem preparar suas
inspeções e exemplos imediatamente. Não confundir preparação paralela com interfaces já congeladas.

1. A sessão 1 congela o universo, a matriz, as interfaces e o envelope. A 5 confere a
   cobertura e recebe as propostas de oracle sem vazar respostas aos produtores.
2. A 2 constrói/reutiliza camadas e implementa o update. A 5 julga o manifesto de cada
   camada completa antes de liberar a seguinte. Lotes de revisão podem ser menores que a
   camada, mas a barreira só libera quando a união dos lotes cobre o conjunto obrigatório.
3. A 3 completa ativação/recuperação a partir das interfaces aceitas. A 4 prepara e depois
   executa integração de host/migração contra os candidatos exatos de 2/3.
4. A 5 monta o candidato integrado, roda consumidores isolados, reconcilia o ledger e a
   verificação final. Correções voltam ao dono do arquivo; a integração serial preserva
   o histórico e produz uma versão nova quando muda uma dependência relevante.
5. Ambos os juízes avaliam o mesmo pacote final e todos os critérios aplicáveis, incluindo
   os resultados das quatro fatias. Encerrar sem inventar aceite do proprietário ou ativação.

Evitar deadlock: a sessão 5 julga handoffs e camadas assim que estiverem prontos; não espera
as quatro fatias inteiras terminarem para fazer o primeiro julgamento. As sessões que
aguardam uma dependência trabalham nas partes independentes e publicam checkpoints.

## Congelamento do universo do repositório

Partir da árvore Git do pin, não de um checkout sparse ou de uma seleção dos arquivos mais
quentes. Classificar aplicações, pacotes, módulos, runtimes nativos, protocolos, ferramentas,
configuração, CI, testes, documentação e fronteiras geradas relevantes. Agrupar por domínio
de responsabilidade e fluxos de produto; um diretório sozinho não é prova de fronteira.

Mapear cada entrada relevante a um domínio ou a uma exclusão explicada. Um arquivo gerado
pode remeter a seu gerador/contrato; terceiros e binários podem exigir evidência da fronteira.
Mapear fluxos transversais em artefatos integrados, sem duplicar autoria de contratos comuns.
Nenhum domínio não descoberto vira implicitamente concluído. Conferir totais contra a árvore.

Congelar por domínio necessidades, artefatos obrigatórios, fontes/autoridades, lacunas,
relação com domínios vizinhos, critérios e casos. Preservar casos conhecidos como regressão;
novos casos held-out permanecem fora dos prompts de produção. Definir limites de consumo
por necessidade antes de julgar os consumidores; não inventar um teto universal em bytes.

Fechar o repositório inteiro exige cobertura de todos os domínios/fluxos desse inventário.
Uma amostra, um piloto ou um orçamento de sites não substitui seu denominador. Relatar
separadamente cobertura mecânica, utilidade semântica, produção, integração e entrega.

## Autoridade e conclusão

Os prompts autorizam trabalho nativo, preparação de ambiente isolado, implementação
necessária e commits nas branches atribuídas, sujeitos às capacidades e contratos reais.
Não habilitam gastos com provedores externos, bypass de testes/guardas, credenciais,
produção, merge, PRs nem exclusão de evidência. Aguardar um aceite que só o proprietário
pode dar não invalida o trabalho técnico concluído, mas mantém DOD-7 no estado correto.

`GLOBAL_REVIEW_READY` exige evidências suficientes, decisões independentes e um pacote
revisável. `DONE` só existe depois de todas as condições do contrato, inclusive as humanas
e de entrega quando aplicáveis. Não renomear lacunas como sucesso para encerrar a sessão.
