# Release S4 selado — compatibilidade e limites para a S2

## Conclusão

O release S4 existe e fixa o runtime `db9b4235022c4df32fe3bfd4faeea8adcd69abb7`. Seu escopo publicado é **prepare v1 completo**, com evidência para os pacotes congelados S1-03 e S2. Ele não declara qualificação específica de avaliação v2.

Isso não torna os `NOT_RUN` de binding, publicação, index/read do domínio bloqueios da capacidade comum. Eles são trabalho atribuído à S2. Após reler o contrato runtime, o briefing S2 e o briefing Runtime S4, **não identifiquei uma cláusula que exija a S4 executar esses resultados locais ou emitir obrigatoriamente outro manifesto antes de a S2 usar uma porta documentada e testada do mesmo código exato**.

A rota justificável é um suplemento factual da S2 que fixe o release selado, o código v2, os 54 controles de CI aplicáveis, o prepare v2 real e os estados das operações seguintes. Isso permite demonstrar compatibilidade sem atribuir ao release S4 uma prova que ele não afirma. O suplemento não é voto ADMIT, policy, recibo de admissão ou aceite final.

Este parecer corrige qualquer leitura anterior desta investigação de que a falta de uma declaração v2 no manifesto seria, por si, um bloqueio obrigatório. A diferença factual de escopo permanece; a exigência de um novo manifesto como gate não foi encontrada nas instruções relidas.

## Identidades verificadas

| Objeto | Identidade |
| --- | --- |
| Branch observada | `genesis-runtime-resume` |
| Selo | `e171783482d0a44974d6056cd9e144a7e33406a7` |
| Payload | `da9800f55f31926f33c41a5ca2fd88bf26fcaccc` |
| Controles/harness | `09a4c4afc7aab2f9a153eb059d13df0ecf15595c` |
| Código do runtime | `db9b4235022c4df32fe3bfd4faeea8adcd69abb7` |
| Árvore do runtime | `3c93c4636c1e4c4b704f8be9314e22b2149e5609` |
| Release | `20261128-s4-runtime-db9b423-prepare-v1` |
| Manifesto blob | `ac4f5f46ce2044ded044e4c9a4e35220558bae22` |
| Manifesto SHA-256 | `2922f769ea2b533d06748a4c10471b19deba3fd0c41b8f1bf7930512eaa75af1` |
| Handoff blob | `d9cc3d678753ba573649544bce78c748d89df170` |
| Handoff SHA-256 | `9c66610362fcb806314c3f89958087ab7a2561e87573824d04d3c860ea6bffbf` |

O [manifesto selado](https://github.com/gustavomhss/hugr-orchestra/blob/e171783482d0a44974d6056cd9e144a7e33406a7/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/runtime-release.json) tem 19.736 bytes. O [handoff](https://github.com/gustavomhss/hugr-orchestra/blob/e171783482d0a44974d6056cd9e144a7e33406a7/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/resume-20261128/runtime-qualification/handoff.json) tem 34.693 bytes.

O payload acrescenta evidência documental e atualiza o manifesto. O selo acrescenta somente `handoff.json`. A execução continua ligada a db9; nenhum teste novo é inferido para os commits de documentação.

## Matriz por operação

| Operação | O que o release afirma | Evidência adicional aplicável | Estado local S2 e requisito seguinte |
| --- | --- | --- | --- |
| Prepare nativo v1 | PROVEN; único entrypoint listado: `genesis-native.ts prepare`, saída v1 | Run 46114652347, pacote S2 completo 13/626; prepare local anterior preservado | Usar a identidade local, sem transplantar o candidate ID do CI |
| Prepare evaluation v2 | Não declarado especificamente | Protocolo/CLI/API em db9; fixture integrada do CI; prepare02 real da S2 | Exit 0, candidato d1c8478…, 13 entradas/690 observações; precisa dos votos ADMIT exatos |
| Init-store v2 | Não listado | API e CLI existentes; fixture de inicialização, recusa de reinicialização/estado anterior/alias | Não executado; exige candidato e geração exatos; marcador não concede policy |
| Admit v2 | Não declarado; binding/publicação do domínio estão NOT_RUN | Admissão governada e validação dos quatro ADMIT testadas com fixtures sintéticas em db9 | Não executado; depende dos dois votos reais, policy, ator/escopo/ratificação e ausência de drift |
| Index v2 | Domínio NOT_RUN | Index composto real e orçamento persistente no CI db9 | Precisa admissão, policy do caso, query e resposta reais |
| Read v2 | Domínio NOT_RUN | Reader composto real, rótulos v2, drift/HOLD e limites no CI db9 | Precisa consumidor independente, versão correta e trace de bytes dentro dos limites |
| Manutenção/rebuild/target v2 | Não declarada especificamente; controles comuns sintéticos não são S2-U1 | Sete controles de rebuild v2 e admissão de target na fixture integrada | Não executada; plano inicial exclui maintenance. Requer plano concreto, receitas, evidência nova e votos de target; permanece obrigação posterior |

A presença dos mecanismos e do CI permite justificar uma tentativa de domínio sob seus requisitos reais. O resultado dessa tentativa só pode ser chamado PROVEN depois de existir seu recibo.

## Fundamentação normativa exata

### Contrato runtime

Em [runtime.md](https://github.com/gustavomhss/hugr-orchestra/blob/ee2521a5b966bd505cc95bd1c733e09e12f33531/.orchestra/skills/execute-genesis/references/runtime.md), blob `0e0f1607003ff49946ed7a155c268b31239930e6`:

- A seção **S4: liberar a capacidade compartilhada cedo** exige versões, comandos reais, autoridade e estados/recibos separados por capacidade. PROVEN vale para os casos e limites indicados.
- A mesma seção manda as sessões fixarem a versão exata compatível e reavaliarem somente provas afetadas por mudanças.
- **Binding, atualização e consumo** atribui à sessão o candidato exato, a obrigação separada dos juízes e o consumo real. Policy/store/projeção ausentes são precondições explícitas.
- **Ambiente mínimo** permite checkout autorizado ou materialização verificável, registrando a identidade real da cópia. Uma raiz materializada sem Git não pode alegar HEAD ou histórico que não tem.

Essas cláusulas impedem exagerar o escopo do release e inventar um PASS. Não encontrei nelas uma proibição de documentar, no trabalho da própria S2, a compatibilidade de uma rota já existente no exato runtime selecionado.

### Briefings desta retomada

O [briefing S2](https://github.com/gustavomhss/hugr-orchestra/blob/bb2a931301d541692b11e5a7f1eab234cd9ed2fd/modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/resume-20261128/S2-INTERFACES.md), blob `b2d1511880e59fa95f9c70abb817b0192d36cfdd`, separa a capacidade comum entregue pela fatia 01 dos resultados locais de binding, publicação, consumidores e S2-U1. Também manda reutilizar controles comuns compatíveis.

O briefing Runtime S4 limita a qualificação inicial aos pacotes completos, exige distinguir prepare de binding/publicação de cada domínio e manda reutilizar prova exata de código/configuração/caso. O novo handoff cumpre esse recorte. Exigir que S4 execute os 14 consumidores S2 antes da S2 criaria uma condição que esses documentos não estabelecem.

A conclusão de que um suplemento S2 pode registrar compatibilidade é uma interpretação destas instruções e da evidência, não uma alteração dos documentos nem uma nova decisão independente de admissão.

## Reúso do CI e do candidato local

O novo release referencia o run `43343953480` no próprio db9: 278 casos em 27 arquivos. A investigação anterior recuperou as fontes e o log que confirmam os 54 casos v2: 1 integrado, 29 fronteiras, 17 ownership e 7 rebuild. A lista nominal e os blobs continuam em `../evaluation-route-readiness.json`.

Esses casos provam mecanismos com fixtures sintéticas. Não substituem respostas S2, votos reais ou uma operação ainda não realizada. O wrapper CLI não foi exercitado pelos 54 testes; a execução prepare02 agora prova a passagem `genesis-evaluation.ts prepare` para os bytes S2. As versões de ambiente diferem entre o CI comum e o prepare novo e continuam registradas separadamente; não se alega que o CI foi repetido no Node 24.22.3.

A leitura local, sem executar Atlas, confirmou:

- Candidato v2 `d1c8478b155b2085df1289ef91edfeaa4834e9300d651c0b953e6e2978aa5d30`.
- Preparado SHA-256 `bb3ee09693ef1ddfb89e548f3f5e0d38c4abaee5e6d253f129c7c6c1a9dbda0e`, 475.213 bytes.
- Recibo original SHA-256 `6bcfc052fad8533cd2433c7faf910301ea55fb277d1ed59638068baa56a4a6fe`.
- Exit 0, 13 entradas, 690 observações e 925 membros de identidade de runtime.
- Raiz `/workspace/scratch/5cfbb6c803f1/s2-evaluation`, HEAD observado `null`.
- Estado Atlas contendo somente CAS; sem marcador de avaliação, policy de avaliação ou policy ordinária.

O recibo conserva a observação anterior r3/09a e o rótulo de diagnóstico. Isso deve permanecer como história da execução. A observação do release novo entra em registro suplementar, sem reescrever o recibo.

Não há motivo identificado para repetir o prepare só porque o release documental foi selado, se o plano, inputs, raiz e closure do runtime permanecerem iguais. O suplemento deve ficar fora dos inputs fixados do candidato. Qualquer mudança nesses inputs exige nova identidade e novas decisões.

## Pendências reais antes da travessia

1. Dois votos ADMIT novos para este candidato e todas as 13 entradas, incluindo adequação do plano inicial. O relatório de compatibilidade não emite nenhum deles.
2. Inicialização explícita, geração e policies reais ligadas a ator/escopo/ratificação, candidato, plano e obrigações.
3. Estabilidade dos bytes e da closure durante a revalidação feita por `admit`.
4. Recibo de admissão antes de servir index/read; consumidor independente e trace sob o orçamento persistente do caso.
5. Plano/target S2-U1 e provas próprias posteriores; ACs e DoD finais continuam pendentes.

Não se acrescenta bloqueio de “S4 precisa executar o domínio” nem de “outro manifesto é obrigatório apenas porque falta a palavra v2”. Também não se reclassifica uma operação S2 não executada como provada pelo release.

## Preservação

Esta consulta ficou em `s2-investigation/runtime/latest-release/`, sem sobrescrever capturas anteriores. `source-manifest.json` registra oito fontes com Git blob ID e SHA-256 conferidos. Há capturas de branch, commit de selo, payload, diretório, manifesto, handoff, README, work/status, aceite e plano de qualificação. `local-prepare-observation.json` separa a observação do candidato local da prova publicada pela S4.

O agente fez apenas leitura remota/local e gravação deste relatório/capturas. Nenhum prepare, init, policy, admissão, teste de produto, publicação ou mudança remota foi executado neste subtrabalho.

