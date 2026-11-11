# Preparação independente S5 — mapa histórico

Campanha: `20261111-v1`. Repositório: `gustavomhss/hugr-orchestra`.
Fonte única fixada: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

**Natureza:** preparação read-only, sem papel de produtor, implementador ou juiz. Os três documentos abaixo foram lidos integralmente pelo conector GitHub. Nenhum artefato vinculado, PR, cadeia de envelopes ou resultado de execução foi revalidado nesta tarefa. Os estados descritos são disposições registradas nesses documentos no pin; não constituem novos PASSes, fechamento de critérios ou autorização. O handoff/envelope S1 não foi fornecido a este auxiliar.

## 1. Fontes exatas

| Sigla | Documento integral | Blob retornado | Linhas |
| --- | --- | --- | ---: |
| R | [genesis-campaign-reconciliation.md](https://github.com/gustavomhss/hugr-orchestra/blob/1cde2ff7a71bcf7aecb5d030917b577165135d38/modules/atlas/docs/design/genesis-campaign-reconciliation.md) | `fd0ec9be0fbbf1ca1674cbe02d6eac3d3d46fa99` | 106 |
| W | [genesis-recovery-worklist.md](https://github.com/gustavomhss/hugr-orchestra/blob/1cde2ff7a71bcf7aecb5d030917b577165135d38/modules/atlas/docs/design/genesis-recovery-worklist.md) | `322e11e5722b55404a661cabf0a8791cc24a45b9` | 1940 |
| L | [genesis-landing-plan.md](https://github.com/gustavomhss/hugr-orchestra/blob/1cde2ff7a71bcf7aecb5d030917b577165135d38/modules/atlas/docs/design/genesis-landing-plan.md) | `bd3b51bef5485e3b5c7a9e74686b92371e9bb6d4` | 94 |

As referências abaixo usam essas siglas, seção e linhas do texto integral. Cópias completas e respostas brutas do conector estão ao lado deste relatório; a linha vazia terminal não foi contada como linha adicional.

## 2. Disposições históricas que S5 deve preservar

| Assunto | Fato documentado e consequência para a preparação | Seção e linhas |
| --- | --- | --- |
| Contrato global | A campanha permanece OPEN. O owner escolheu **“Manter contrato global”**; fechamento limitado/transferência para fase futura não foi aprovado. Nenhum critério foi dispensado e preparação não autoriza gasto, PR, merge ou ativação. | R abertura L3–9; “Scope decision — global contract retained”, L94–106. |
| M1 | A obrigação histórica era terminar os budgets sequenciais da mesma campanha, com retry ligado à fonte, ledger cached/new e preservação de claims/CAS/respostas reconhecidas. A disposição atual aposenta a rota por arquivo, **sem declarar mineração concluída**; a obrigação antiga ainda exige disposição explícita. O teto antigo não autoriza gastar o restante nem reiniciar a fila. | W “Canonical queue”, tabela WP L685–704; “OWNER HOLD — consumption limit…”, L658–670. R “Campaign disposition register”, L63; L “Campaign gate…”, L29–32. |
| J1/R3 | J1 exigia julgamentos vinculantes por claim, holds de place inteiro, promoção governada e Own revisado; R3 incluía exclusões, reconciliação de promote, export Own e negative check. A disposição atual é **OPEN**: publicação isolada v3 tem outro escopo e não substitui silenciosamente o resultado original. É preciso resultado governado exigido ou supersession/disposição explícita. | W tabela WP L691; “Recovery sequence and acceptance”, L1057. R registro L64. L gate L21–23. |
| Original sem resposta | O run protegido `42012088507` preserva 295 envelopes, 104 dispatches e 103 completions. O original `be07949d-5cdc-48f1-9309-bddd4b32cd2b`, sequência 283, prompt `ae9245cf01c3ea1c15aac6c077739194973a3c09a684ea799c21fd8462e7d9fe`, permanece sem completion reconhecida; não é sucesso, abstention ou resposta recuperada. | W “Failed protected production recovery”, L879–898. R “Accounting boundary”, L76–79; registro L69. |
| Retry sintético | No controle offline `42087075694`, 200 deliveries = 103 replays + 1 retry sintético + 96 fresh sintéticos. O retry é **novo pedido** ligado ao original e ao seu prompt; não encerra o original. As 97 chamadas fake-provider não são chamadas reais de assinatura nem 200 novas requisições pagas. | R “Historical continuation…”, L23–41; “Accounting boundary”, L76–79. |
| Uso físico/billing | Permanecem **UNKNOWN, não zero**. Bytes de prompt e campos locais de sessão não reconstituem tentativas físicas ou cobranças liquidadas; novas chamadas não corrigem observabilidade histórica. Recebimentos cumulativos dos produtores/juízes não podem ser somados indiscriminadamente. O inventário de 120 metadados/114 pares e seis originais é lógico e limitado, não total físico da campanha. | R registro L68; “Accounting boundary”, L81–92. W “Actual L1 dispatch…”, L504–521; diagnóstico L639–656. |
| Own | Há refreshes materiais já registrados, inclusive `recovery-own.patch`, mas atualizam recibos do pack preexistente de `packages/genesis`, preservando seu único invariant e conteúdo. Isso é distinto do **Own final histórico**, que o controle offline não estabelece e J1/R3 ainda exigem/disponibilizam para decisão explícita. | W “Grouped green — precise reach”, L1284–1298; “Integration gate…”, L1770–1773; “Current-base…”, L1815–1820. R L54–55,64. |
| #1291 | Veículo antigo de entrega, distinto de branches de snapshot/report. O plano o conserva no head/baseline `c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085`; nenhuma atualização, retarget ou merge antes do fechamento. A antiga atualização do corpo relatada no ledger não autoriza nova mudança agora. | R registro L71. L “Frozen organizing baseline”, L36–41; “What organization does not change”, L89–94. W L1810–1813. |
| #1300/#1302 | O registro atual os mantém OPEN. Preservar candidatos corrigidos de hotspot e sugestões por autores durante a integração; a obrigação histórica é superseder/fechar **depois do landing**, sem permissão atual para editar PRs. A disposição não foi cumprida por um review ou teste de candidato. | R registro L70. W “Entire inherited campaign”, L1066–1067; “Review wave”, L1080–1083. |
| Recursos e cleanup | Preservar evidência temporária necessária à reconciliação e retomada. Cleanup final é obrigação de entrega, ainda não concluída. Não inferir propriedade sobre processos, worktrees ou branches alheios; apenas recursos próprios e recuperáveis entram no escopo histórico. | R registro L72. W demanda original L681–683; autorização histórica L1633–1635. |

### Lacuna histórica diferente, sem fusão

O owner aceitou a lacuna não recuperada do run `41974029272` ao autorizar um recomeço protegido a partir das nove claims preservadas, condicionado a checkpoints duráveis. Isso não recupera aquelas respostas nem dispensa gates. O ledger restringe expressamente essa aceitação a `41974029272`; ela não transforma o original sem completion de `42012088507` em resolvido. Referências: W “Current status — protected production failed…”, L778–801; “Protected restart implementation”, L853–859.

## 3. Separações de aceite, entrega e ativação

| Camada | O que está registrado | O que não pode ser inferido |
| --- | --- | --- |
| Recuperação/controle offline | Replays, bytes de staging/CAS/resposta e assertions nomeadas reconciliados. | Cadeia original completa inspecionada, C3 inteiro fechado, continuação produtiva, julgamento, publicação, billing ou Own final. R “Historical continuation…”, L46–55; registro L61–62. |
| Pesquisa L1–L4/Sol L4 | Handoffs aceitos para o recorte finito Session-input, reutilizáveis. | Entendimento de todo repositório, publicação produtiva ou global AC. R registro L65; W “Accepted predecessor…”, L259–280 e L147–160. |
| Publicação isolada/piloto | R registra RP-1..8 aceitos dentro do contrato. O ledger preserva v3 RP-7 PASS e a publicação v3 em manifest `ad6f94d5b1ef61267764159feb7058c71b4de9761f31cffaa0142e578c4e1bae`. | Mudança dos HOLDs v1/v2, instalação no owner, encerramento histórico ou aceitação global. R registro L66; W “Latest checkpoint…”, L31–69. |
| Contrato global | AC-01..10 e CC/SC/DoD continuam OPEN como conjunto. | PASS global derivado do piloto. Produção/economia/update/recovery exigem evidência ou amendment explícito. R registro L67; decisão L104–106. |
| Fechamento da campanha | Exige mapa final de aceitação/disposição e decisão explícita do owner. | Closure por plano, citação, green de CI ou review de agente. L “Campaign gate…”, L16–27. |
| Landing | É ação posterior; base, ordem, acoplamento corpus/pins e orçamento final ainda não estão congelados. | Sequência A–G já aprovada/testada para PRs ou autorização de merge. L L34–61,76–94. |
| Ativação em produção | Os documentos não concedem ativação; o store/policy do owner ficaram distintos da publicação isolada. | Ativação derivada de research PASS, publicação no store isolado, fechamento ou mera organização. R abertura L8–9, registro L66; W L186–192; L L89. |

**Chronologia:** o ledger retém checkpoints anteriores “pending”, “HOLD” e instruções históricas. Eles não devem ser apagados ou convertidos retroativamente em PASS. O mapa atual R declara o piloto aceito e a campanha global aberta; L continua fechando a porta de PR. Referências: W L31–48,112–151; R L3–9,65–67.

## 4. Evidência e recursos a reter nominalmente

- Originais: staging, plans, CAS, requests/responses, falhas, versões de fonte, prompts e decisões dos mesmos dois juízes. Os totais **272 claims/91 places** são staging histórico, não ownership julgado/publicado (R L76–77; W L879–898).
- Controle `42087075694`: artifact `13444687733`, ZIP SHA-256 `9df9f969d7f798e3fd9a4665d062da5293ac2aa77bbc1249bffdca41734860da`; os quatro recibos nominados em `genesis-campaign-results/continuation-42087075694/` e raw ZIP/log externo ao Git. O manifest vincula digests, não coloca os bytes brutos dentro do repositório (R L23–27,46–55).
- Corpus/histórico: contratos e freezes; L1/L2 com judgments/errata; L3; ambas as gerações L4; publicação/runtime, HOLD/diagnóstico original, consumers v2/v3 com seus freezes/casos/traces/decisões; falhas integradas e repairs. Não truncar, reserializar, renomear registros hashados, perder predecessores ou quebrar manifests/links para caber em diff (L “Corpus organization”, L63–85).
- Arquivos de retomada históricos: `genesis-campaign-archive.bundle`, com a campanha e treze refs originais, e os dois bundles anteriores; no checkpoint referido nenhum worktree/branch havia sido removido antes do landing (W L1010–1014).
- **Limite de disponibilidade:** W L728–734 diz expressamente que o diretório temporário daquele restart já não continha diretórios antigos de replay/recovery/worktrees. Git objects/checkpoints e artifacts eram as fontes duráveis. Portanto, citar um nome de pasta ou bundle não prova presença local atual, dono atual ou retenção completa hoje.

## 5. Lacunas para o integrador, sem julgamento

1. Não há neste recorte handoff/envelope S1 nem nova autorização de produção, avaliação vinculante ou execução.
2. Falta a disposição explícita de M1 e de J1/R3/Own; “rota aposentada” não equivale a obrigação concluída ou dispensada. A alternativa de fechamento limitado segue não aprovada.
3. O controle de continuação não contém a cadeia original completa; sua âncora permanece o source receipt anterior. Nenhuma leitura destes três documentos revalida artefatos ou fecha C3/AC por referência.
4. Estado físico/billing e o original sem resposta conservam suas qualificações; hipóteses de causa da falha protegida não foram estabelecidas (W L900–903).
5. Base final, estratégia de packets, acoplamento pins/corpus e tratamento de artifacts indivisíveis continuam indefinidos; greens anteriores têm candidato/escopo próprios.
6. Situação remota atual dos PRs, inventário de recursos, propriedade e disponibilidade dos brutos não foram consultados nesta preparação; os estados reportados são os do pin.

## 6. Resultado da preparação

Mapa entregue para preservar obrigações e limites quando S5 receber entradas autorizadas. **Nenhum critério foi fechado por citação; nenhuma produção, avaliação vinculante, chamada de modelo, teste, CI, alteração remota, limpeza ou contato com credenciais foi executado.**
