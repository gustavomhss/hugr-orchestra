# Crítica independente dos requirements

## Estado

**Crítica documental encerrada: avaliações 15 e 16 sem nova lacuna substanciada na mesma versão final.** O catálogo continua proposto e depende da revisão do proprietário. Os cenários não foram executados. Este registro é crítica de demanda versus obrigações/aceitação; não revisão de implementação, pentest ou qualificação Fabric.

**Atualização posterior à crítica:** o proprietário delegou as decisões ao TechLead, que escolheu as direções Q01–Q13 em [DECISIONS.md](./DECISIONS.md). As afirmações abaixo de que Q estava aberta descrevem o estado da entrada criticada, não a situação atual das decisões. Os oito documentos canônicos e seus hashes não foram alterados por esse registro de decisões. O `covers` dos críticos não é aprovação das decisões posteriores; os contratos/ensaios e os cinco julgamentos H continuam sem evidência executada.

## Método

- Aplicação adaptada de `techlead-decompose`: requirements/aceitação antes de specs e work packages.
- O catálogo 01–08 é a única definição canônica das obrigações. Não se cria lista concorrente de “done”.
- Crítico novo recebe apenas demanda/fontes de produto e catálogo de requisitos; sem raciocínio do autor, decisões de decomposição ou resultados de críticos anteriores.
- Fontes são lidas como demanda a cobrir, não como prova de funcionamento. O critério procura comportamento ausente, aceitação vaga, negativos faltantes ou expansão indevida.
- Saída estruturada com origem, caso concreto e IDs próximos; o lead verifica e aceita/rejeita cada finding com justificativa.
- Duas rodadas consecutivas sem nova lacuna substanciada encerram a crítica documental. Uma correção substanciada reinicia a contagem. Isso não prova completude absoluta, aprovação humana dos itens H ou produto verde.
- Worktree isolado/read-only; relatórios externos ao checkout. Sem commits, push, implementação ou chamadas autenticadas. Não há código de agente para integrar.

## Rodadas

### Rodada 1 — gaps_found, duas lacunas aceitas

Entrada congelada: DESIGN.md, COVERAGE.md, TEMPLATES.md, REVIEW.md e requisitos 01–08. Snapshot externo `fs-requirements-input-1`, manifesto SHA-256 `7a79cdd1bd974dae6c8ade97d28d437f39d3060c820ef2bc90e3120f26eef2d9`. Crítico novo, worktree detached no baseline `9fcb899d50867c1ddc3f25d8345ac9fd8009d788`; sem acesso ao raciocínio/traceabilidade/decisões do autor ou a revisões anteriores de requisitos.

Relatório externo: `fs-requirements-critic-1.json`. Relay armado; enforcement do hook não demonstrado e não alegado. O lead leu o relatório e as cláusulas citadas do desenho antes de aceitar os achados.

| Achado | Cenário e lacuna conferidos pelo lead | Decisão / correção |
| --- | --- | --- |
| RC1-01 | Offline é explicitamente “sem fila oculta de comandos” no desenho §4.4. Era possível armazenar intenção com aprovação válida, reconectar, revalidar e enviar sem expor que havia fila: FS-EXP-008/FS-RUN-001/FS-CHG-005 não o proibiam. | Aceito. FS-RUN-015 exige não enviado explícito e decisão visível de envio após reconexão, sem confundir preservação de intenção com consentimento de entrega diferida. |
| RC1-02 | Desenho §8.3 exige rejeitar slot inexistente e fonte que não alimenta o tipo do componente; §9.1 limita props. FS-DEC-002/005/006 cobriam validação igual, IDs e bindings, mas não todas as combinações semanticamente inválidas de entradas conhecidas. | Aceito. FS-DEC-014 exige validação de props, slot e fonte/resultado com rejeição localizada e preservação do documento; não tratar como disponibilidade degradada válida. |

O crítico não listou itens vagos ou expansão indevida; isso não é prova de ausência absoluta desses problemas. Após incorporar as lacunas, a contagem de rodadas consecutivas sem nova lacuna substanciada é **zero**.

### Rodada 2 — gaps_found, três lacunas aceitas

Crítico novo; mesma demanda original e catálogo corrigido, sem acesso ao relatório/justificativas da rodada 1. Snapshot `fs-requirements-input-2`, manifesto SHA-256 `4e35f7f2d42b41c40571e8bf08c7db298ef34c8a1b553ec9a93dda5cfe712533`. Relatório externo `fs-requirements-critic-2.json`; checkout detached separado no mesmo baseline. Sem testes de produto.

| Achado | Cenário e lacuna conferidos pelo lead | Decisão / correção |
| --- | --- | --- |
| RC2-01 | Desenho §13.4 exige exibir recorrência e permitir pausa. FS-DAT-008 só interrompia painéis ocultos e FS-DAT-011 só cancelava consulta; painel visível podia continuar atualizando sem controle de pausa. | Aceito. FS-DAT-012 exige recorrência visível, pausa dos próximos ciclos e retomada deliberada sem desmontar o espaço. |
| RC2-02 | Desenho §11.1 exige coordenação de refresh concorrente. FS-AUT-011 protegia storage/herança, mas resposta obsoleta ainda podia destruir uma renovação válida e exigir login indevido. | Aceito. FS-AUT-015 protege renovação válida contra resposta/erro concorrente obsoleto, preservando o vínculo e a política de herança. |
| RC2-03 | Desenho §9.4 exige seleção estável com novas linhas. FS-UI-001 preservava seleção na reorganização, não durante atualização do conteúdo: copiar podia pegar outro trecho. | Aceito. FS-UI-008 exige conservar o conteúdo selecionado para leitura/cópia acessíveis durante chegada de linhas. |

O crítico não listou vaguidade/overreach. Observou corretamente que REVIEW.md contém julgamento da rodada do **desenho**, e referências de origem citam RC1; a frieza não inclui desconhecer demandas corretivas já explícitas. Os relatórios/raciocínio anteriores dos **requirements** continuaram excluídos. Novas entradas das próximas críticas restringem REVIEW às obrigações corretivas, sem o veredito/narrativa de autores/revisores. Contagem sem nova lacuna após as correções: **zero**.

### Avaliações 3 e 4 — independentes sobre a mesma versão congelada

Dois críticos novos em paralelo, sem troca entre si ou acesso aos resultados anteriores. Ambos leram demanda original e catálogo completo; receberam somente os trechos corretivos de REVIEW.md, transcritos literalmente, em vez de julgamentos anteriores do desenho. Snapshot `fs-requirements-input-3`, manifesto SHA-256 `6dfa9ff0b6f751495a918040635bd43684124566205ae9b6761cc68d1e655e77`.

- **3 — covers:** relatório `fs-requirements-critic-3.json`; não substanciou lacuna, vaguidade ou expansão. A conclusão não tornou o catálogo automaticamente completo.
- **4 — gaps_found:** relatório `fs-requirements-critic-4.json`; substanciou os três pontos abaixo. Por isso não houve duas rodadas sem lacuna e a versão foi corrigida novamente.

| Achado | Avaliação do lead | Correção |
| --- | --- | --- |
| RC4-01 | Aceito. Desenho §4.4 prevê material local autorizado offline. Preservar layout ou mostrar offline não obrigava reabrir evidência já autorizada pela política. | FS-HIS-009: acesso offline condicionado à disponibilidade/autorização local, sem novo grant nem status remoto fictício. |
| RC4-02 | Aceito. Desenho §1.4/§4.2/§9.1 e regras T exigem assistência opcional/recolhível. Operação manual útil ainda podia deixar sidebar obrigatória. | FS-UI-009: recolher/restaurar IA conservando trabalho, sem painel de agentes obrigatório. |
| RC4-03 | Aceito. Desenho §19.2 enumera dimensões técnicas. Correlação e medir defaults em qualificação não obrigavam observar essas medidas durante operação. | FS-OPS-013: latência, cache contextual, rate limit, duração/cancelamento, filas, motivos e unknown observáveis, com minimização. |

Na conferência das cláusulas de composição/controles, o lead também explicitou FS-DEC-015 (edição visual/avançada e declaração efetiva, §8.3/§8.4) e FS-UI-010 (confirmação confiável/avisos não ocultáveis, §9.3/§9.4). São demandas existentes, não novas features autorizadas. A versão resultante precisa de nova crítica independente. Contagem após essas mudanças: **zero**.

### Avaliações 5 e 6 — três lacunas aceitas na versão seguinte

Críticos novos e independentes em paralelo, com o mesmo corpus corrigido e sem resultados anteriores. Snapshot `fs-requirements-input-5`, manifesto SHA-256 `20536b16fa4c5003d70615b8033e7330e26a5cb2a20c1f5595d490de8d1350c5`. Relatórios externos `fs-requirements-critic-5.json` e `fs-requirements-critic-6.json`; ambos `gaps_found`.

| Achado | Avaliação do lead | Correção |
| --- | --- | --- |
| RC5-01 | Aceito. Desenho §9.1 diz que gráfico não inventa agregação. Fonte correta e props válidas ainda permitiam rotular média simples de percentuais como medida empresarial sem regra/dados pertinentes. | FS-DAT-013: semântica da medida/transformação identificável, sem agregação fictícia. |
| RC6-01 | Aceito. Desenho §12.3/A03 exige atualizar apenas bindings declarados. Tipagem não proibia retarget de ferramenta limpa, não fixada e sem ligação por caminho implícito. | FS-DEC-006 refinado: vínculo declarado é condição de propagação, não só compatibilidade de dados. |
| RC6-02 | Aceito. Desenho §19.2 lista medidas de valor que a revisão genérica de utilidade não exigia nominalmente. | FS-OPS-012 refinado com conclusão, retorno espontâneo, intervenção/correção, compreensão da aprovação e tempo total/baseline; compreensão continua julgada por pessoa e resultado desfavorável não é escondido. |

Os critérios refinados continuam canônicos nas próprias linhas; este registro não os duplica como segunda suite. Contagem após incorporar os achados: **zero**.

### Avaliações 7 e 8 — continuidade de foco refinada

Críticos novos e independentes em paralelo; snapshot corrigido `fs-requirements-input-7`, manifesto SHA-256 `65408a20d0f6f67e0659eb52584ae00759c8316761be6b3f2430bb11a6e2c762`.

- **7 — covers:** relatório `fs-requirements-critic-7.json`; não substanciou nova lacuna, vaguidade ou expansão.
- **8 — gaps_found / RC8-01:** relatório `fs-requirements-critic-8.json`; o lead conferiu e aceitou o caso: teclado continuava utilizável se fechar inspector retornasse ao primeiro botão do chapter, mas isso contrariava a continuidade de foco de §9.4. FS-UI-005 agora exige o contexto correspondente, ou destino pertinente/previsível quando o controle some. Foco apenas acessível não basta.

A correção não cria requisito concorrente: refina a linha canônica existente. Contagem após ela: **zero**.

### Avaliações 9 e 10 — suspensão de fonte dependente refinada

Críticos novos e independentes em paralelo sobre `fs-requirements-input-9`, manifesto SHA-256 `41b4ce92c862a91ac231c85dc3e97537f7040e6a851e5bffd75e4c200f06b2b1`.

- **9 — covers:** relatório `fs-requirements-critic-9.json`; não substanciou nova lacuna, vaguidade ou expansão.
- **10 — gaps_found / RC10-01:** relatório `fs-requirements-critic-10.json`; aceito pelo lead ao comparar com §8.2.1: limpar seleção podia invalidar/hide resultados enquanto uma fonte de refresh previamente autorizada continuava consultando. FS-DEC-008 agora exige também suspensão dos novos fetches/ciclos enquanto faltar a seleção necessária.

Sem novo mecanismo de ativação, nem comando implícito: o refinamento preserva os limites já exigidos. Contagem após a correção: **zero**.

### Avaliações 11 e 12 — restrição Solid, autoria local e orientação segura

Críticos novos independentes em paralelo sobre `fs-requirements-input-11`, manifesto SHA-256 `0bd87843cb0b378812184f3a1c4a5c4125c52ea357eadb29c48a8499b7ed6e75`; relatórios `fs-requirements-critic-11.json` e `fs-requirements-critic-12.json`, ambos `gaps_found`.

| Achado | Avaliação do lead | Correção |
| --- | --- | --- |
| RC11-01 / RC12-01 | Mesmo achado substanciado independentemente: origem P03 não tornava Solid obrigação expressa; outro framework podia cumprir apenas a aparência/declaração. | FS-DEC-001 refinado com componentes Solid registrados e base verificável, sem escolher pacote ou APIs. |
| RC11-02 | Aceito contra J03: diagnóstico bem fundamentado ainda podia recomendar remover uma proteção de autenticação, sem que houvesse execução/escalada. | FS-AI-006 refinado para orientação segura, não apenas evidência correta. |
| RC12-02 | Aceito contra §9.1: controles de mutação não proibiam autosave remoto durante edição local com autorização ordinária válida. | FS-CHG-011 explicita a fronteira rascunho local/salvar ou aplicar remotamente. |

Ao conferir P03/§8.2/§9.3, o lead tornou também explícitas as exclusões já propostas de CSS livre/posicionamento arbitrário em FS-DEC-003; estilo não executável ainda não é um canal aceito de personalização. Sem specs/implementação novas. Contagem após ajustes: **zero**.

### Avaliações 13 e 14 — exclusão de runtime concorrente explicitada

Críticos novos independentes em paralelo, snapshot `fs-requirements-input-13`, manifesto SHA-256 `9ef19c7249b1edb8a246db88f9dd0959c6ee071fc5544f69762df81b0c3d091f`.

- **13 — covers:** relatório `fs-requirements-critic-13.json`; não substanciou nova lacuna, vaguidade ou expansão.
- **14 — gaps_found / RC14-01:** relatório `fs-requirements-critic-14.json`; aceito pelo lead. §1.4 exclui runtime concorrente em geral, não só scheduler oculto/local ou substituição de Airflow/dbt. Era possível acrescentar um executor Studio visível sem violar as linhas específicas nem a carga E2E no Fabric.

FS-INT-006 agora preserva a exclusão transversal, distinguindo execução de workloads da coordenação permitida de comandos/observações e dos caches/rascunhos locais. Também conserva os limites de não criar outro armazenamento/engine ou reconciliador universal já expressos em §1.4. Contagem após a correção: **zero**.

### Avaliações 15 e 16 — covers / covers, encerramento documental

Dois críticos novos independentes, em paralelo, sem resultados um do outro ou das avaliações anteriores. Ambos leram o corpus completo contra a demanda original e as cláusulas corretivas. Snapshot final `fs-requirements-input-15`, manifesto SHA-256 `9f7c80cc5b9d884d089c3b456424ab114c9badbe3f10466ec897b44e56b1b4e6`.

| Avaliação | Relatório externo | Resultado conferido |
| --- | --- | --- |
| 15 | `fs-requirements-critic-15.json` | `covers`; listas de missing/vague/overreach vazias. Tentativas registradas incluem declaração hostil, seleção vazia/tardia, revisões, concorrência de credencial, cache/identidade, envio ambíguo, exclusão de sessão, cancelamento, offline, BI e semânticas Fabric. |
| 16 | `fs-requirements-critic-16.json` | `covers`; listas de missing/vague/overreach vazias. Tentativas registradas incluem autoridade/egress, concorrência/crash/retry, disponibilidade, continuidade manual/IA/sem Git e não vacuidade de templates/jornadas. |

O lead leu ambos, revalidou JSON, hashes de toda a entrada e igualdade com os arquivos canônicos atuais; HEAD/status dos checkouts permaneceram no baseline e sem alterações. O instrumento de status também viu um caso conhecido não vazio no checkout principal. O manifesto alterado por bytes de controle deixa de coincidir. Hook Relay continua sem enforcement comprovado; não sustenta o veredito.

Não houve mudança canônica entre essas duas avaliações ou depois delas. São duas avaliações consecutivas na ordem do registro **sobre a mesma versão**, não duas execuções sequenciais com correção entre si. Critério documental encerrado; não é garantia absoluta de completude ou resultado operacional verde. As avaliações anteriores que disseram `covers` não impediram incorporar lacunas substanciadas por outro crítico.

**Parecer do lead:** decomposição pronta para revisão do proprietário antes das specs. Q01–Q13 continuam abertas; cinco requisitos H continuam sem aprovação humana; todos os cenários M continuam não executados. Não foi despachada implementação, criada spec técnica ou feito commit/push nesta etapa.

### Identificação durável do catálogo final revisado

Os relatórios brutos/snapshots ficam no diretório temporário aprovado do OpenCode; findings, decisão e correção estão preservados acima. Hashes abaixo identificam os oito documentos canônicos, independentemente da sobrevivência desses temporários.

| Documento | SHA-256 |
| --- | --- |
| 01-experience.md | `409296da7d2c8da5ded7725dff17297c3d2dd26317eb3516641d423fe89334fa` |
| 02-authority-and-data.md | `9192e5c79ce0cf84c408ef7aece3b1ce591f56721438205610ed1151380bdb57` |
| 03-discovery-and-queries.md | `9124319c936304116030ba6e0a9f3d540eee8a63918e1358cb842d351eaacb36` |
| 04-changes-and-jobs.md | `bf3134e0ff4a2672dba9f86f0b0537acce6462520d352e45556854cb9f02a668` |
| 05-evidence-and-continuity.md | `74708bce059f363a1ba4407af7feb83fe23aa4b0c55857ab7f97b044e29d75eb` |
| 06-ai-and-operation.md | `7806a9a09933ed20385202d729618b17034a1bd46f05e7ea7812c50c93512c02` |
| 07-fabric-semantics.md | `8e82916a93982e9008ae3f46aff532aacb704c6c1c20b211f999df0bd317e945` |
| 08-end-to-end.md | `741b9073eba600f73f64ad8ca7780fc3166860432a2f41186de5836d517d2d63` |

## Verificações documentais

Inventário e mapa foram examinados por script externo, fora do produto/CI: formato de cinco colunas, IDs/métodos únicos, referências e intervalos inclusivos, links locais, linhas de origem declaradas e decisões Q. Controles detectaram inventário vazio/duplicado/malformado, referência inexistente, linha-fonte removida e alteração de bytes. Isso mede estrutura e integridade, não suficiência semântica.

Os hashes da entrada revisada de README.md, DESIGN.md, COVERAGE.md e TEMPLATES.md permanecem os registrados em REVIEW.md. Nenhum desses documentos foi reescrito para incorporar os achados silenciosamente.

O guard existente foi exercitado com um marcador de conflito temporário neste diretório: detectou a infração e retornou erro. Após remover o controle, `bun run check:guards --base origin/dev` não relatou findings nas regras aplicáveis. O guard não valida a completude dos requirements nem executa cenários de produto.
