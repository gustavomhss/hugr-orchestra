# S3 — preparação de ativação e leitor concorrente

Estado: **PREPARAÇÃO CONCLUÍDA; CASOS NOT_RUN; AC-07 INDETERMINATE**.

- Campanha: `20261111-v1`.
- Subagente nativo: `/root/activation`.
- Tentativa lógica: `s3-prep-activation-001`.
- Fonte inspecionada: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
- Protocolo: `2689c516d63488be37de678cc853dd4556fd5c13`.
- Implementação candidata, inventário S1, quota S1 e manifesto S2 consumidos: **nenhum**.
- Execuções de produto, testes, leitores concorrentes e juízos realizadas neste recorte: **nenhuma**.
- Tokens, chamadas físicas e cobrança: **UNKNOWN**.

## Portas reais encontradas

O caminho existente de emissão é `createGovernedEmit(...).emit(node, at, opts)`. Depois de shape/truth, ele chama `store.commitProjection`, cuja decisão inclui autorização dependente do incumbent, `ownershipAttachmentRefusal`, ratificação e `upsert`. A emissão recebe `next` e os objetos CAS do carrier no mesmo resultado da decisão. O callback é refeito sobre uma nova projeção quando perde a disputa de publicação. Isto é uma inspeção da implementação; não é uma nova demonstração de atomicidade.

`ownershipAttachmentRefusal` exige carrier advisory, slot `ownership`, claim estável por scope, manifesto endereçável de hash correto e mesmo scope. Invoca `readOwnership` para **cada root declarado** com o observador atual do host e rejeita qualquer HOLD. Consequentemente, completar o manifesto exige primeiro o contrato S1/S2 da closure necessária: a enumeração de roots por si só não prova que o inventário do Orchestra inteiro está representado. Nenhum artefato/review sintético dos testes pode substituir essa entrada.

`store.put` guarda objetos em CAS. Essa chamada não seleciona manifesto atual. O leitor de produto `createOwnershipAccess` exige uma projeção governada legível, resolve os carriers de claim `Scoped ownership manifest for <scope>`, rejeita zero/múltiplas referências e só então chama `readOwnership`. A prova nova precisa passar por essa seleção e readback; invocar `readOwnership` diretamente sobre um CAS preparado não demonstra publicação.

`persistProjection` é uma gravação incondicional e explicitamente descrita como last-writer-wins. Não deve ser usada pelo runner de S3 para instalar, restaurar ou trocar geração. A publicação mantém a porta governada e `commitProjection`.

## Unidade de coerência e limites observáveis

`createOwnershipAccess.read` seleciona um manifesto por chamada e o passa explicitamente ao reader. Chamadas diferentes podem observar gerações diferentes enquanto ocorre uma troca. A API inspecionada não oferece transação sobre múltiplas consultas ou múltiplos scopes. O oracle deve comparar cada resposta com os bindings completos de uma geração permitida; não pode chamar qualquer diferença entre chamadas de mistura, nem inferir coerência repo-wide da validação de um scope.

O `commitSidecar` escreve objetos CAS antes da geração que os referencia. A implementação de `publish` serializa e sincroniza um temporário, publica um nome de geração com `linkSync`, verifica se o nome foi superado/reciclado e mantém um mirror em inode separado. Há limite de 64 tentativas, recusa visível e retenção de quatro gerações físicas. Esses números são controles do store, não versões de autoridade ou prova de compatibilidade de rollback.

O callback da decisão deve permanecer puro. Um hook de pausa, logging durável, relógio, reserva ou produção dentro dele poderia ser repetido em contenção e violar o contrato. A fronteira candidata durável → emissão governada deve ser controlada no executor/adapter efetivo, preservando a pureza desse callback.

`readSidecarSet` procura gerações legíveis em ordem decrescente e depois o mirror. Assim, corrupção externa da última projeção pode produzir fallback físico para uma projeção anterior. Isso não autoriza servir conhecimento obsoleto como atual: a leitura de ownership ainda precisa confrontar os inputs atuais. O caso drift/rebuild falho do outro recorte deve medir HOLD quando a geração recuperada for incompatível com a fonte.

Há `fsync` do arquivo de projeção e sync de diretório best-effort. `store.put` usa gravação de arquivo sem `fsync` explícito; nenhuma prova de resistência a perda de energia foi produzida. O escopo aqui preparado é falha/interrupção de processo e observação de leitores, não uma promessa de durabilidade sob power loss.

## Pontos preparados para observação

### S3-ACT-01 — interrupção após produção durável, antes da ativação

Consumir o candidato real S2 e suas revisões; observar a completion durável e os bytes necessários em CAS. Interromper o processo executor na fronteira anterior a `emit`, sem escrever a projeção e sem fabricar revisão aceita. Um processo leitor distinto deve consultar a porta de produto antes/depois da interrupção. O candidato não emitido não pode aparecer como atual. A resposta permitida é a geração anterior ainda válida ou HOLD; se não existia publicação, o retorno deve preservar a recusa correspondente. Guardar PIDs, sinal/exit, instante e estágio observado, outputs integrais, inputs atuais, manifesto anterior, candidato e hashes dos completions.

Um marker criado pelo harness sem evidência de completion real não demonstra o estágio. Se o processo morreu sem confirmação de quanto avançou, preservar tentativa/reserva como incertas e reconciliar antes de qualquer repetição. A retomada e o contador de produção pertencem ao recorte de recuperação durável.

### S3-ACT-02 — leitor separado durante a troca

Fixar os manifestos A/B e closures por S1/S2/S5, política e alvo isolado. Iniciar leitor em processo separado pela composição real de Atlas e registrar sua prontidão e uma leitura inicial. Executar a ativação de B pela porta governada, manter leituras durante a mudança e coletar uma leitura final que identifique B. Cada resposta READY precisa pertencer integralmente a um dos manifestos compatíveis permitidos; outras respostas devem ser HOLD verificável, nunca combinação de manifest/result/body/inputs de gerações distintas. Capturar a saída bruta de `emit` e do leitor. `emitted:true` sozinho não é readback.

O denominador de scopes/needs e o controle independente virão do inventário real. O controle não pode compartilhar um input obrigatório cuja corrupção o caso chama de local. Um manifesto por scope não oferece um commit global simultâneo entre scopes.

### S3-ACT-03 — candidato incompleto não é ativado

Depois de materializar um candidato S2 real, remover apenas a cópia isolada de um blob obrigatório de sua closure. Preservar o corpo original e hash para restauração. Apresentar o carrier e manifesto exatos à porta real de emissão. Observar a recusa e depois ler a publicação existente em outro processo. Não criar um manifesto sintético com reviews inventados para tornar o caso publicável. A falta do blob não deve produzir uma nova seleção atual; a publicação anterior só pode continuar READY se ainda compatível.

A mutação pertence exclusivamente ao store isolado e seu inventário de recursos. Não remover objetos/recibos da campanha, de outras sessões ou de produção. A restauração usa bytes preservados e as portas existentes, sem editar projeção servida. A leitura/corrupção depois de publicação e o rollback pertencem ao recorte de readers/rollback.

## O que as fixtures lidas acrescentam

`ownership-publication.test.ts` contém cinco testes que exercitam CAS não publicado, ratificação, paridade de recusa, root/need incompatível e drift/historical. Um caso declara truth double para isolar a ordem dos gates. `ownershipFixture` declara explicitamente que seus reviews são sintéticos e não são prova de juiz. A leitura desse arquivo não executou nenhum caso novo e não reabre G3 já aceito.

`ownership-observe.test.ts` contém os casos HO-01..12 de observação de arquivo e membership usando FS/Git reais e seams para erros. Essa cobertura escrita é útil para selecionar perturbações, mas não fornece observações do candidato desta campanha.

## Materialização e runner

Foram obtidos pelo conector e materializados 15 arquivos. Todos os bytes materializados conferem com o blob Git declarado, e `source-bindings.json` contém SHA-256, tamanho, commit, caminho e blob. `direct-imports.json` registra os imports diretos dos dez fontes/testes TypeScript inspecionados. Isso é uma cópia parcial verificável, **não** um checkout executável, nem uma declaração de completude transitiva.

Para executar a composição real são necessários a implementação candidata S2/S5, a closure transitiva dos pacotes workspace, manifestos/lockfiles reais e instalação permitida das dependências. O store sozinho depende de `@atlas/contracts`, `@atlas/kernel`, `@atlas/knowledge`, containment, sidecar, sidecar-commit, sidecar-abstained, identity-schema e freshness-watermark. A porta emit adiciona os módulos reais de gates, política, identidade/claims/ratificação e a composição de host/index/inputs. Não substituí-los por stubs ou truth doubles.

O alvo isolado precisa da relação Git/inputs/índice/política exigida pela composição. Copiar CAS para um diretório sem essas capacidades não produz o host observado. Um leitor persistente pode chamar `runtime.ownership.read` reiteradamente porque a seleção recarrega a projeção; um processo externo deve guardar PIDs, outputs e o estado da troca. Processo iniciado por código de Orchestra segue `ChildProcessSpawner`/`Process`; o harness de execução precisa respeitar essa regra.

`AGENTS.md` exige testes em GitHub Actions e reserva execução local de testes à autorização do proprietário. Nenhum `bun test`, suíte Vitest ou equivalente local foi executado. Os comandos locais deste recorte foram somente leitura/busca textual e SHA-1 Git/SHA-256 dos arquivos materializados. A confirmação de hashes não é gate de CI nem prova de AC-07.

## Bloqueios e entrega à integração

Antes dos três casos, faltam no recorte: referência imutável de inventário/critério/quota S1; candidato e manifestos/reviews S2/S5 aplicáveis; ambiente executável fiel e runner permitido; seleção concreta do scope e do controle independente. Estes não são falhas observadas do produto. Os campos de execução continuam NOT_RUN e o veredito INDETERMINATE.

Nenhum patch compartilhado foi aplicado e nenhum commit remoto foi criado por este agente. A suspeita de rollback do carrier antigo já retido no CAS foi encaminhada ao agente de rollback: ele confirmou por inspeção que `upsert`/`router` priorizam DEDUP. A prova ainda exige M1→M2→M1 com readback; não registrar esse achado como falha executada.

Os fontes determinantes e seus blobs estão em `source-bindings.json`. Os casos legíveis por máquina estão em `activation-cases.json`. O principal pode incorporar esses artefatos ao prefixo S3, consumir os commits novos quando existirem e entregar o pacote a S4/S5; nenhum aceite local/global é inferido deste relatório.
