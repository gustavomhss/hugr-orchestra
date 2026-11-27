# Atividade — requirements

Status: requirements. Mesma lei que `DESIGN.md`, outra versão. Spec: `SPEC.md`. Aceite: `ACCEPTANCE.md`. A spec só cita estes ids. Não autoriza implementar. O mock não é fonte.

Frase em português é o sentido. Não é a string da interface. Os nomes já fechados no desenho não se traduzem: Ready, Armed, Held, Refused, Out, Unknown, IN/OUT, e os nomes das abas. Chave de i18n está fora.

Um requirement sem oráculo não entra. Um requirement não cobre o que o desenho pôs em Fora ou em "O que este desenho não sabe", salvo para mandar a célula ficar não lida.

## Índice

| Id | Lei |
|---|---|
| R1 | Leitura nomeada, ou não lida |
| R2 | Dono é a sessão gravada |
| R3 | Árvore é o id do supervisor |
| R4 | Visto e caminho não recebem ação |
| R5 | Estado e flag não dividem coluna |
| R6 | Hipótese tem duas emissões |
| R7 | Prova que não rodou é segurado |
| R8 | Conjunto fechado é dois nomes |
| R9 | Em uso não se move |
| R10 | Worktree não sai do git |
| R11 | Único sem identidade não é número |
| R12 | Plano é IN/OUT |
| R13 | Quem confirma |
| R14 | Parar |
| R15 | Suspender e retomar |
| R16 | Quarentena |
| R17 | Atestação e custo |
| R18 | Teto |
| R19 | Ledger da tela |
| R20 | Amostra |

## R1 Leitura nomeada, ou não lida

Quando a célula não tem fonte nomeada, o produto mostra não lido. Não mostra zero, traço, vazio, nem omite a coluna. A primeira linha não atribui um resto a partir de pressão.

Fonte: Vocabulário, O que uma leitura pode ser, A tela.

### Definition of Done

- Célula sem fonte nomeada mostra a palavra não lido, não um traço e não uma coluna ausente.
- Célula com fonte mostra o valor, o nome da leitura, e a idade. Valor velho permanece, com a idade. O binário que leu não é a string.
- Residência não aparece sozinha. Na mesma célula, a frequência ou "frequência não lida".
- Pressão de memória da máquina fica não lida. A primeira linha não calcula culpado nem resto.
- Taxa sem janela é não lida. `df` não vira saúde, livre, nem importante.
- O cliente não soma uma segunda conta a partir das células.

### Invariants

- Não lido não é zero, morto, livre, ocioso, nem vazio.
- Lista que falhou no meio não se desenha como máquina vazia.
- Número cuja fonte este desenho não nomeou não entra como fato.

### Quality Standards

- O oráculo remove a fonte de uma célula preenchida. A palavra não lido aparece. Zero, traço ou coluna omitida falha.
- O oráculo pede um resto a partir de pressão não lida. A primeira linha não o publica.

### Completeness Criteria

- Cobre footprint, RSS, residência, frequência, único, lógico, idade, taxa, pressão, GPU e qualquer número sem fonte nomeada.
- Não escolhe o binário que lê frequência ou GPU. Isso está fora. Sem leitura, a célula é não lida.

### Success Criteria

- Quem abre com a máquina doente vê o que a leitura é, ou que não leu. Não vê um culpado calculado.

## R2 Dono é a sessão gravada

Quando não há sessão gravada, o dono é vazio. O produto não inventa dono para a aba fechar. A mesma string aparece na árvore, na worktree, no cache, no Docker, no log e no IN/OUT.

Fonte: A tela, Quem age.

### Definition of Done

- Dono é o nome da sessão gravada no spawn, ou vazio.
- Vivo, morto, suspenso e saindo não ocupam a coluna de dono.
- Selecionar uma sessão não troca a string. Trocar de aba não troca o dono.
- Objeto sem sessão gravada continua vazio nas outras abas.

### Invariants

- Dono vazio não vira "nosso" porque o nome do diretório parece.
- Sem ledger de sessão, a tela que preenche dono mente.

### Quality Standards

- O oráculo junta uma aba com um dono que o spawn não gravou. O requirement falha.
- O oráculo seleciona uma sessão e exige que as outras abas marquem a mesma string, sem preencher vazio.

### Completeness Criteria

- Cobre árvore, worktree, cache, Docker, log, temporário, IN/OUT e quarentena.
- Não cria o ledger. Gravar o dono no spawn é condição da tela, não a tela.

### Success Criteria

- A mesma sessão é reconhecível em todas as abas. O que não tem sessão gravada continua vazio.

## R3 Árvore é o id do supervisor

Quando o produto para ou suspende, o endereço é o id da árvore que o supervisor segura. Não é um pid. Pid que a amostra segurou não é o endereço. Pid de amostra que falhou também não é.

Fonte: O que é, Provas / Parar, Windows.

### Definition of Done

- A unidade de processo é a árvore gravada no spawn.
- O confirmamento nomeia esse id, não um pid da tabela de membros.
- Descendente que saiu da sessão está fora do stop e fora do teto. O resultado diz fora. Não diz que a árvore inteira parou.
- No Windows, a árvore é o Job. Parar e suspender passam pelo Job, ou não acontecem.

### Invariants

- O produto não reconstrói árvore por PPID.
- Nenhum pid é alvo. Nem o que a amostra segurou, nem o de amostra que falhou.
- Ordenar não desfaz a soma e não esconde filho que o ledger ainda segura.

### Quality Standards

- O oráculo para ou suspende pelo pid que a amostra segurou. O requirement falha.
- O oráculo para ou suspende por um pid de amostra que falhou. O requirement falha.
- O oráculo deixa fora do stop um membro que o supervisor ainda segura, porque a amostra não o viu. O requirement falha.
- O oráculo confirma um parar legal e o confirmamento nomeia um pid, não o id do supervisor. O requirement falha.
- O oráculo para uma árvore com um descendente fora da sessão e declara a árvore inteira parada. O requirement falha.
- O oráculo, no Windows, falha a inspeção e para ou suspende. O requirement falha.

### Completeness Criteria

- Cobre Unix e Windows. Falha de inspeção no Windows é estado desconhecido, a lei de R5. Não é não lido. Parar e suspender recusam esse estado, a lei de R14 e R15. Falha de enumeração de handle é segurado, a lei de R7.
- Não escolhe o verbo de sistema, desde que o efeito seja o desta prova.

### Success Criteria

- Nenhum ato endereça um pid. O endereço é o id da árvore que o supervisor segura. Pid que a amostra segurou não é o endereço. Pid que a amostra perdeu não tira do ato um membro que o supervisor ainda segura. O confirmamento mostra esse id.

## R4 Visto e caminho não recebem ação

Quando o processo não passou pelo spawn, é visto: sem dono, sem flag, sem ação. Quando é nosso, registrado, e não é árvore, é caminho: aparece, e o teto não o cobre.

Fonte: O que é, Vocabulário, Quem age, Teto.

### Definition of Done

- Visto não recebe flag. A célula é observação, rotulada como observação.
- O conjunto confirmado recusa visto e caminho. A tela não oferece a caixa. O ato não corre sem ela.
- Caminho aparece. A tela diz que o teto não o vê.
- Footprint de visto, sem ledger nosso, é não lido.

### Invariants

- Nome parecido não torna visto nosso.
- Caminho não é desculpa para omitir, nem licença para parar ou suspender.

### Quality Standards

- O oráculo, num visto e num caminho, corre ou oferece parar, parar a consulta, suspender, retomar, atestar, aceitar custo, armar, aplicar, restaurar, esvaziar, mover, quarentena ou vacuum. Com botão ou sem. O requirement falha.
- O oráculo põe um número de visto na coluna de footprint. O requirement falha.

### Completeness Criteria

- Cobre visto, caminho, e o servidor que cresce porque um cliente parou de ler.
- Não estende o teto a caminho. Isso está fora.

### Success Criteria

- O caminho medido aparece como caminho. Não entra no stop, não entra no teto, e não ganha dono por semelhança.

## R5 Estado e flag não dividem coluna

Quando a árvore é nossa, estado e flag são colunas diferentes. Parcial não é suspenso. Flag é só uma das três, e só com dono gravado.

Fonte: Vocabulário, A tela, Provas / Suspender.

### Definition of Done

- Estado é vivo, saindo, zumbi, ido, desconhecido, suspenso, ou parcial.
- Parcial é o suspender que não parou cada membro reivindicado. Não é sucesso. Não se grava como suspenso.
- Flag é uma das três: a sessão gravada morreu e o processo vive; shutdown foi pedido e ignorado; o pai existe e o agent que precisava dele já foi.
- PPID=1 não é flag. Visto não recebe flag.
- Desconhecido fica na tabela. Não vira zero para ir ao fim.

### Invariants

- Órfão, leak, culpado e ocioso não são estado.
- Sessão morta não substitui o nome do dono.
- Hipótese não é flag.

### Quality Standards

- O oráculo grava um suspender parcial como suspenso. O requirement falha.
- O oráculo põe uma quarta flag, ou uma flag em visto. O requirement falha.
- O oráculo pinta falha de inspeção como não lido, ou como zero. A palavra desconhecido não aparece. O requirement falha.

### Completeness Criteria

- Cobre as sete palavras de estado e as três flags. Não inventa outra.
- Não decide como a série de estado é guardada. Isso é spec.

### Success Criteria

- A pessoa distingue processo vivo de sessão morta, e suspender completo de parcial, sem ler uma frase.

## R6 Hipótese tem duas emissões

Quando a árvore está selecionada, a hipótese é insuficiente, ou compatível com leak lógico. Cache não se emite.

Fonte: Vocabulário, Provas / Hipótese, A tela.

### Definition of Done

- Sem footprint, a emissão é insuficiente.
- Compatível com leak lógico só quando o footprint subiu depois que o trabalho gravado acabou e não desceu nas amostras seguintes.
- Não se emite leak verdadeiro, retenção de alocador, nem cache.
- Série de RSS não emite hipótese. Footprint alto não escolhe classe.
- Alcançabilidade não lida fica escrita como não lida.
- O produto não injeta pressão para classificar.

### Invariants

- Hipótese não é selo.
- A exceção de cache não se aplica neste desenho: a pressão da máquina não tem fonte.

### Quality Standards

- O oráculo emite leak lógico só com footprint alto, sem a subida depois do trabalho gravado. O requirement falha.
- O oráculo emite cache. O requirement falha.

### Completeness Criteria

- Cobre as duas emissões e as classes proibidas. Não cobre um terceiro nome.
- Não nomeia a fonte de pressão. Enquanto não houver desenho posterior, cache fica de fora.

### Success Criteria

- A hipótese na árvore selecionada é uma das duas palavras, com o que não foi testado escrito como não lido. Não é uma nota.

## R7 Prova que não rodou é segurado

Quando um método da prova não rodou, falhou, ou não está implementado, o objeto fica segurado. Não fica ocioso. Uma palavra só não é a prova.

Fonte: Provas, A tela.

### Definition of Done

- Ocioso só se cwd, `git -C`, arquivo aberto e lock com PID vivo rodaram e voltaram vazios.
- Método indisponível neste OS é método que não rodou. Sem enumeração de handle que rodou vazia, nada é ocioso e nada entra em quarentena.
- PID de lock file velho não é PID vivo.
- A célula de prova lista o método que rodou, ou é não provado.
- Path que não casou conta como segurado. Vazio de stub não é prova.

### Invariants

- Ausência de check não é prova.
- Agregado não herda a prova da maioria.

### Quality Standards

- O oráculo marca ocioso com um método faltando. O requirement falha.
- O oráculo aceita a palavra "ocioso" sem a lista dos métodos. O requirement falha.

### Completeness Criteria

- Cobre os quatro métodos nomeados, falha, stub e OS sem o método.
- Não nomeia o binário de handle. Sem o método ter rodado, a lei é segurado.

### Success Criteria

- Nada entra em quarentena porque um check não rodou. A pessoa vê qual método rodou.

## R8 Conjunto fechado é dois nomes

Quando o objeto não é `node_modules` ou `.turbo`, não sai por conjunto fechado. Os dois só saem se a prova de ocioso passou e se é cópia, não elo de store que não medimos. O resto não sai por este requirement.

Fonte: Provas / Conjunto fechado, Única cópia.

### Definition of Done

- Fora do par, o objeto não entra no plano como conjunto fechado.
- `dist`, `out`, `target`, `.env` e o resto ignorado não estão no conjunto.
- Ignorado pelo git não é descartável.
- Se não dá para provar que é cópia, não está no conjunto.
- Atestar regenerável nomeia um diretório. Não cobre o irmão, nem arquivo rastreado sujo.

### Invariants

- Store não medido não herda a prova de cópia.
- Única cópia não sai por este requirement. Pede atestação, e a atestação não é default.

### Quality Standards

- O oráculo põe registry, `~/.bun`, `~/.npm`, Playwright ou checkout em `/tmp` no conjunto fechado. O requirement falha.
- O oráculo deixa `dist` ou `out` sair sem atestação. O requirement falha.

### Completeness Criteria

- Cobre o par nomeado, o que está fora dele, e a prova de cópia.
- Não cria um teste positivo de regenerável além do conjunto fechado. O desenho não sabe. O resto pede R17.

### Success Criteria

- Só cópia ociosa de `node_modules` ou `.turbo` sai sem atestação e sem aceitar custo. O resto não sai por este requirement. Pede R17. R17 não é default, e atestação não tira snapshot sem commit.

## R9 Em uso não se move

Quando o path tem claimant, não se move, não entra em quarentena, e não fica Ready. Claimant é daquele path. Flag do pai não é claimant.

Fonte: Provas / Compartilhado, Ocioso.

### Definition of Done

- Claimant é árvore viva cujo env ou cwd gravado aponta o path, ou holder vivo da prova de ocioso.
- Registro morto não é claimant.
- Mais de um claimant, ou path referido de fora do diretório, é compartilhado.
- Compartilhado dentro de worktree se move no mesmo volume e o efeito devolve zero byte, se o path não tem claimant e se a referência gravada passa a apontar o destino.
- Mover não é quarentena. Esvaziar não o apaga. Restaurar o movido é mover de volta, e só se o destino novo não tiver claimant. Mover para outro volume não é este efeito.

### Invariants

- Path com claimant não fica Ready. Flag do pai não é claimant.
- Zero de mover não substitui não colapsei. São células diferentes.

### Quality Standards

- O oráculo move um path que tem claimant. O requirement falha.
- O oráculo marca Ready um path cuja prova voltou vazia e que tem claimant. O requirement falha.
- O oráculo move sem atualizar a referência gravada. O requirement falha.
- O oráculo esvazia um objeto que foi movido. O requirement falha.
- O oráculo restaura o movido com claimant no destino novo. O requirement falha.

### Completeness Criteria

- Cobre claimant, compartilhado, mover a zero, a recusa de path com claimant, esvaziar que não apaga o movido, e restaurar só sem claimant no destino novo.
- Não cobre mover entre volumes. Isso está fora.

### Success Criteria

- O que uma árvore viva segura não sai. O que se move devolve zero, não aparece como quarentena, não se apaga ao esvaziar, e só volta se o destino novo não tiver claimant.

## R10 Worktree não sai do git

Quando o objeto é worktree, o produto não a tira do git. O que se reclaim é filho provado, por rename, com a worktree ainda registrada.

Fonte: Provas / Worktree.

### Definition of Done

- `git worktree remove`, com ou sem `--force`, não é a ação e não é a quarentena.
- A célula de efeito diz que fica no git.
- Filho provado sai por R8 ou R9. A worktree continua registrada.
- O descarte que a ferramenta de task já faz não se alarga.

### Invariants

- Remover a worktree fica fora até um desenho que restaure o ignorado.
- Worktree em uso não perde o filho por este requirement.

### Quality Standards

- O oráculo oferece remover a worktree do git, ou corre `git worktree remove`, com ou sem `--force`, sem botão. A worktree deixa de estar registrada. O requirement falha.
- O oráculo dá quarentena por sucesso deixando o diretório. O requirement falha.

### Completeness Criteria

- Cobre worktree registrada, ociosa não provada, única cópia e em uso.
- Não desenha a restauração do ignorado. Isso está fora.

### Success Criteria

- Nenhuma ação desta tela tira worktree do git. A pessoa vê que ela fica registrada.

## R11 Único sem identidade não é número

Quando a identidade de arquivo não foi colapsada, a célula é não colapsei. Não é um número. Enquanto o clone do APFS não se colapsa, não há soma.

Fonte: Provas / Único, A tela, O que este desenho não sabe.

### Definition of Done

- Único afirmado sem identidade colapsada é recusado.
- Hardlink não colapsado, clone não medido, ou caminhada que não fechou: a célula é não colapsei.
- A coluna de único não publica soma enquanto o desenho não souber colapsar clone do APFS.
- Mover a zero continua sendo o efeito de R9, não um único inventado.

### Invariants

- Não colapsei não é zero.
- Agregado não recebe um único herdado.

### Quality Standards

- O oráculo, sem identidade colapsada, omite a coluna de único, ou mostra zero, traço, branco ou um número. A palavra não colapsei não aparece. O requirement falha.
- O oráculo soma a coluna de único enquanto o clone do APFS não se colapsa. O requirement falha.

### Completeness Criteria

- Cobre worktree, cache, Docker, temporário, log e IN/OUT.
- Não implementa o colapso de APFS. O desenho não sabe. A célula fica não colapsei.

### Success Criteria

- A pessoa não lê um byte que o produto não colapsou. A soma não aparece no lugar da falha.

## R12 Plano é IN/OUT

O passo é Ready só quando a prova passou, o path não tem claimant, não é pedido do agent, e ainda não foi armado. Path com claimant é Held, não Ready. Entre armar e aplicar, é Armed, e nada se moveu: o path continua na origem. Aplicar sem segunda leitura não é Out.

Fonte: A tela, Provas / Plano, As ações.

### Definition of Done

- Os estados do passo são Ready, Armed, Held, Refused, Out, Unknown. Não se traduzem.
- Waiting e Queue não são estado.
- Pedido do agent não é nenhum dos seis. Não entra na soma. Aplicar não o leva. A pessoa arma, e só então é Armed.
- Geração é o token monotônico do ledger, escrito quando muda membro, identidade de path, ou sujo. Não é pid. Armar prende path, identidade de arquivo, esse token, e o que a prova disse. Plano vazio ou identidade não capturada recusa. Token que não andou quando membro, identidade de path ou sujo mudou não é geração.
- Aplicar compara. Divergência recusa. Não tenta mesmo assim. Aplicar o armado velho recusa.
- Depois do efeito, a segunda leitura: está no destino e não está na origem, ou o passo é Unknown. Unknown não se tenta de novo. Resto não se apaga para consertar sucesso.
- Recusa continua visível, com o pedido ao lado, e não entra na soma.
- O rodapé conta os mesmos seis estados com a mesma função da aba. Não publica soma de bytes.
- Esvaziar não é efeito de aplicar.
- Held é em uso: path com claimant. Não é Ready. Prova que passou não torna Ready um path com claimant.

### Invariants

- Pedido é manter, quarentena, ou mover. Outro verbo não entra no plano.
- Agregado não recebe pedido e não entra no plano.
- Docker não tem prova neste desenho: não oferece efeito e não entra no plano.
- Temporário sem raiz declarada nomeada é não lido, não passo.

### Quality Standards

- O oráculo pinta Out sem a segunda leitura. O requirement falha.
- O oráculo arma e o path deixa a origem antes de aplicar. A segunda leitura pinta Out. O requirement falha.
- O oráculo trata pedido do agent como Ready ou Armed. O requirement falha.
- O oráculo marca Ready um path com claimant cuja prova voltou vazia. O requirement falha.
- O oráculo publica uma soma de bytes no rodapé. O requirement falha.

### Completeness Criteria

- Cobre os seis estados, o pedido do agent, armar, aplicar, recusa, segunda leitura e o rodapé.
- Não cobre a chave de i18n. O nome IN/OUT fica nos dois idiomas.

### Success Criteria

- A pessoa vê o que vai sair, o que a prova segurou, e o que a segunda leitura não confirmou. Não vê uma fila que parece que tudo vai rodar.

## R13 Quem confirma

Quando o ato é irreversível, a pessoa confirma. O agent lê e pode pedir prévia. Não arma, não aplica, não esvazia, não atesta, não aceita custo, não para, não suspende, não retoma.

Fonte: Quem age, As ações, A tela.

### Definition of Done

- Prévia do agent leva o rótulo de pedido do agent até a pessoa armar.
- Geração é a de R12: token monotônico do ledger, escrito quando muda membro, identidade de path, ou sujo. Não é pid. Confirmação prende o id e esse token. Se o token mudou, o ato recusa. Se membro, identidade de path ou sujo mudou e o token não andou, o ato recusa.
- O confirmamento mostra a geração que prendeu, e nomeia os objetos.
- Um botão saturado, e é o próximo ato irreversível. Nunca dois. Vista sem ato armado não tem botão saturado.
- Nada disso corre porque a tela abriu ou porque a amostra atrasou.
- Porta lateral não existe.

### Invariants

- Agent confirmando recusa.
- O conjunto confirmado não aceita visto nem caminho.

### Quality Standards

- O oráculo deixa o agent armar, aplicar, esvaziar, atestar, aceitar custo, parar, suspender ou retomar. O requirement falha.
- O oráculo aplica com token diferente do que o botão mostrou. O requirement falha.
- O oráculo entra um membro, muda a identidade de path, ou marca sujo, e o token preso não anda. Armar ou aplicar segue. O requirement falha.

### Completeness Criteria

- Cobre os atos da tabela: parar, parar a consulta, suspender, retomar, atestar, aceitar custo, armar, aplicar, restaurar, esvaziar.
- Não cria um segundo confirmador.

### Success Criteria

- Nenhum ato irreversível acontece sem a pessoa, o id, e o token de R12 que o botão mostrou.

## R14 Parar

Quando a pessoa para, o alvo é a árvore nossa pelo id de R3, a geração de R12 confere, e o estado é vivo, suspenso por nós, ou parcial. Parcial só alcança quem a marca não listou como parado.

Fonte: Provas / Parar, As ações.

### Definition of Done

- Recusa visto, caminho, saindo, zumbi, desconhecido, e qualquer pid. Pid que a amostra segurou também recusa. O endereço é o de R3. Falha de inspeção pintada como não lido também recusa.
- Parar a consulta exige prévia que nomeia quem entra e quem fica, e confirmamento que nomeia os ids. Contagem não é prévia. Nome sem prévia recusa.
- O resultado de descendente fora da sessão diz fora.

### Invariants

- Parcial não precisa virar suspenso para poder parar.
- Agent não confirma a consulta.

### Quality Standards

- O oráculo para por um pid, o que a amostra segurou ou o de amostra que falhou. O requirement falha.
- O oráculo para um desconhecido, ou uma falha de inspeção pintada como não lido. O requirement falha.
- O oráculo para um parcial e alcança um membro que a marca já listou como parado. O requirement falha.
- O oráculo arma a consulta com "1 entra · 2 fica" sem os ids. O requirement falha.

### Completeness Criteria

- Cobre parar a árvore e parar a consulta, nos estados que a tabela autoriza.
- Não cobre kill por teto. Isso é R18.

### Success Criteria

- O que para é o id de R3 que a pessoa confirmou. Não é um pid. O que ficou fora continua visível como fora.

## R15 Suspender e retomar

Quando a pessoa suspende, sucesso só se cada membro reivindicado parou. Senão é parcial. Sem marca durável, o efeito não está no produto.

Fonte: Provas / Suspender, As ações, O que o código já é.

### Definition of Done

- O endereço é o de R3. Recusa visto, caminho, desconhecido e o supervisor.
- Sem marca que sobrevive ao restart do nosso processo, a tela não oferece suspender.
- Parcial não é sucesso, não é suspenso, e não se retoma sozinho.
- A marca lista quem parou. Footprint não desce, e a tela mostra que não desceu.
- Retomar só quem a marca lista, e só se a geração de R12 confere. STOP que não gravamos recusa. Token que mudou recusa. Token que não andou quando membro, identidade de path ou sujo mudou também recusa.

### Invariants

- Suspender não está no produto neste chão. O requirement não finge que a marca existe.
- Footprint depois do suspender não é menor por causa do ato.

### Quality Standards

- O oráculo oferece suspender sem marca durável. O requirement falha.
- O oráculo suspende por um pid, o que a amostra segurou ou o de amostra que falhou. O requirement falha.
- O oráculo retoma sozinho um parcial, retoma com token diferente da marca, ou retoma com token que não andou quando membro, identidade de path ou sujo mudou. O requirement falha.
- O oráculo baixa o footprint na tela porque suspendeu. O requirement falha.

### Completeness Criteria

- Cobre suspender, parcial, marca, retomada e a recusa de caminho.
- Não escolhe o verbo de sistema. Sem a marca, não há efeito.

### Success Criteria

- Suspender incompleto fica visível como parcial, com o footprint que não desceu. Retomar não alcança quem a marca não listou.

## R16 Quarentena

Quando a prova passou e a pessoa aplicou, quarentena é rename no mesmo volume, com o path original gravado. Restaurar não aparece se esse path existe. Esvaziar recusa se há recusa na lista. Mover de R9 não é esta lista.

Fonte: Vocabulário, Provas / Plano, A tela, As ações.

### Definition of Done

- Quarentena lista dono, path original, e Restorable ou Occupied.
- Occupied: o path original existe. Restaurar não aparece.
- Restaurar recusa se o objeto já foi esvaziado, ou se o path original está ocupado.
- Esvaziar é outro ato. A lista do que sai de vez está na tela. A segunda leitura confirma. Se o path da quarentena ainda está lá, não foi sucesso.
- Cópia entre volumes não é quarentena. `git worktree remove` não é quarentena.

### Invariants

- Esvaziar não é efeito de aplicar.
- Recusa continua na lista, fora da soma. Esvaziar recusa se há recusa na lista. Tirar a recusa da lista para esvaziar o resto não é o ato.
- Esvaziar esta lista não apaga um mover de R9. Restaurar desta lista não é o restaurar do mover.
- Sem o registro do path original, restaurar recusa.

### Quality Standards

- O oráculo restaura por cima de path que existe. O requirement falha.
- O oráculo esvazia como efeito de aplicar. O requirement falha.
- O oráculo esvazia com uma recusa na lista, ou tira a recusa da lista e esvazia o resto. O requirement falha.
- O oráculo esvazia um mover de R9 por esta lista. O requirement falha.
- O oráculo marca Restorable sem a segunda leitura de R12. O requirement falha.

### Completeness Criteria

- Cobre rename, registro do path, restaurar, occupied, esvaziar, e a recusa quando há recusa na lista. Não cobre o mover de R9.
- Não escolhe o path da quarentena no disco. Isso está fora. Sem o registro, restaurar não existe.

### Success Criteria

- O que saiu pode voltar, salvo se o path original existe ou se já foi esvaziado. Esvaziar é um gesto separado. Se a lista tem recusa, esvaziar recusa.

## R17 Atestação e custo

Quando o objeto não é o conjunto fechado, não sai por R8. Única cópia sai só se a pessoa atestar aquele objeto, com a frase que cabe. Snapshot sem commit sai só se a pessoa aceitar o custo, na frase, naquele objeto. Atestação não substitui custo. Custo não substitui atestação. Uma frase não vale pela outra, nem pelo vizinho.

Fonte: Vocabulário, Provas / Não é cache, Única cópia, As ações.

### Definition of Done

- Atestar que aterrou é um objeto e a frase dos commits. Não cobre arquivo. Não é aceitar custo.
- Atestar que regenera é um diretório nomeado. Não cobre o irmão, nem sujo rastreado, nem em uso, nem alheio. Não é aceitar custo.
- Aceitar custo é aquele objeto não-cache, com o custo na frase. Não cobre única cópia, atestação, alheio, nem em uso.
- Aceite não passa para outro objeto.
- O agent não atesta e não aceita.

### Invariants

- As duas atestações não se substituem.
- Snapshot sem commit não entra até a pessoa aceitar o custo, na frase, naquele objeto.
- Não se infere "já aterrou" por ancestralidade. Squash-merge não é ancestral. O teste inverso também não prova que aterrou. Única cópia não sai porque o teste inverso disse que aterrou.

### Quality Standards

- O oráculo deixa sair um snapshot sem commit por atestar que aterrou, ou por atestar que regenera, sem aceite de custo naquele objeto. O requirement falha.
- O oráculo cobre um arquivo com atestar que aterrou. O requirement falha.
- O oráculo usa atestar que regenera no lugar de aceitar custo. O requirement falha.
- O oráculo usa atestar que aterrou no lugar de atestar que regenera. O requirement falha.
- O oráculo aceita custo no lugar da atestação, numa única cópia. O requirement falha.
- O oráculo espalha o aceite de um objeto para o vizinho. O requirement falha.
- O oráculo deixa a única cópia sair porque o teste inverso disse que aterrou. O requirement falha.

### Completeness Criteria

- Cobre as duas atestações e o aceite de custo, cada um com a recusa da tabela.
- Não inventa um teste positivo de regenerável fora do conjunto fechado.

### Success Criteria

- A pessoa aceita uma frase, num objeto. O vizinho não herda.

## R18 Teto

Quando o teto mata, a árvore mostra o valor, o limiar e a hora. Sem esse registro, a tela não mostra kill. A soma de residentes não entra na coluna de footprint.

Fonte: Provas / Teto, O que o código já é.

### Definition of Done

- Se a amostra do teto aparece, o nome diz soma de residentes e que a página compartilhada é contada por processo. Soma de residentes, sozinha, não é esse nome.
- Essa soma não entra na coluna de footprint e não emite hipótese.
- Kill sem valor, limiar e hora não é kill deste produto e não aparece.
- A tela diz que o teto não vê caminho.

### Invariants

- O teto não se estende a caminho neste desenho.
- Amostra jogada fora não vira célula.

### Quality Standards

- O oráculo mostra kill sem valor, limiar e hora. O requirement falha.
- O oráculo grava o kill com valor, limiar e hora, e a árvore não mostra os três. O requirement falha.
- O oráculo põe a soma de residentes na coluna de footprint. O requirement falha.
- O oráculo publica a amostra sem dizer que a página compartilhada é contada por processo. O requirement falha.

### Completeness Criteria

- Cobre a amostra, o nome, o kill e o limite do caminho.
- Não muda o teto que o código já tem. Só diz quando a tela pode mostrá-lo.

### Success Criteria

- Kill deste produto é um registro que a pessoa vê. Kill sem registro não ganha linha.

## R19 Ledger da tela

Quando a pessoa troca de aba, continua no mesmo ledger. Docker não oferece efeito. Agregado não tem linha de ação. Nenhum modelo escreve nota.

Fonte: A tela.

### Definition of Done

- Um chapter. Abas sempre visíveis: Trees, Worktrees, Cache, Docker, Temporary, Logs, IN/OUT, Quarantine. Os nomes ficam em inglês nos dois idiomas.
- A página não empilha as categorias. A contagem fica no topo.
- Filtro que não casou diz que não casou. Não diz que a máquina está vazia.
- Sem barra. Sem texto de concorrente. Sem frase gerada. Classe é palavra medida. Ação é verbo.
- Docker não tem efeito. Temporário fora de raiz declarada nomeada é não lido, não passo.
- Agregado não recebe pedido, não entra no plano, não herda prova.

### Invariants

- Trocar de aba não troca o dono de R2.
- A primeira linha não é museu de contadores. Pressão não lida não vira herói.
- Logical e idade, se não foram lidos, são não lido. Não somem da linha para a tabela fechar.

### Quality Standards

- O oráculo oferece efeito num objeto Docker. O requirement falha.
- O oráculo seleciona uma sessão e troca de aba. A string do dono muda, ou um dono vazio é preenchido. O requirement falha.
- O oráculo põe um agregado no plano como um objeto: a string "46 locks", uma contagem de árvores, ou uma soma de cache. O requirement falha.
- O oráculo escreve uma nota de modelo sobre processo, disco ou hipótese. O requirement falha.

### Completeness Criteria

- Cobre abas, filtro, verbo, Docker, temporário e agregado.
- Não escolhe onde o chapter senta. Isso está fora.

### Success Criteria

- As abas são o mesmo livro. O que não tem prova não ganha verbo. A tela não explica o processo.

## R20 Amostra

Quando o tick não acompanhou o intervalo, a idade sobe e o valor anterior fica velho. A primeira amostra que não chegou é não lida, não vazia.

Fonte: Provas / Amostra, Caminhada.

### Definition of Done

- O tick corre fora da thread da interface.
- Lê o ledger e as raízes declaradas. Não varre a tabela inteira de processos para pintar.
- Não alarga o intervalo em silêncio.
- A caminhada fecha só se cada diretório da raiz foi medido ou gravado como não lido. Parcial não é conta fechada.
- `/tmp` inteiro não é raiz. Temporário fora de raiz declarada é não lido, não ausente.

### Invariants

- Amostra atrasada não dispara ato de R13.
- Não se escolhe capacidade para uma barra fechar. Não há barra.

### Quality Standards

- O oráculo, na primeira amostra que não chegou, pinta vazio, zero, traço, ou omite a célula. A palavra não lido não aparece. O requirement falha.
- O oráculo atrasa o tick. A idade não sobe, ou o valor anterior some, vira zero, vira traço, vira não lido, ou a célula é omitida. O requirement falha.
- O oráculo trata caminhada parcial como soma fechada. O requirement falha.

### Completeness Criteria

- Cobre tick, idade, primeira amostra e caminhada.
- Não promete 1 Hz. Não varre a máquina para um frame.

### Success Criteria

- Atraso fica visível como idade. Falha fica visível como não lido. Nenhum dos dois vira máquina vazia nem ato.

## Fora deste arquivo

Não são requirements. Spec que os implementar quebra a lei.

- Onde o chapter senta. Quanto tempo a série fica. O path da quarentena no disco. O verbo de sistema. Qual binário lê frequência ou GPU. As chaves de i18n. O pacote do código.
- Remover worktree do git. Vacuum. Mover entre volumes. Estender o teto a caminho. Injetar pressão.
- Joule, Energy Impact, prioridade, afinidade, reputação, stall por pid.
- Colapsar clone do APFS, provar squash-merge, e um teste positivo de regenerável além do conjunto fechado. Enquanto o desenho não sabe, a célula é a de R6, R8, R11 ou R17. Não é um requirement de descobrir.

## Cobertura

Cada seção de prova do desenho tem um id: leitura R1, dono R2, árvore R3, visto e caminho R4, estado e flag R5, hipótese R6, ocioso e prova R7, conjunto fechado R8, compartilhado R9, worktree R10, único R11, plano R12, quem age R13, parar R14, suspender R15, quarentena R16, atestação e custo R17, teto R18, tela R19, amostra R20.

Spec que não cita um id não satisfaz este arquivo. Requirement novo sem oráculo não entra.
