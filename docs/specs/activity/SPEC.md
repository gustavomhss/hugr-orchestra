# Atividade — spec

Status: spec. Não autoriza implementar. Não gera tela a partir do mock.

Lei: `DESIGN.md` e `REQUIREMENTS.md`. A mesma voz, duas versões. O texto do requirement é a lei daquele id. O desenho é a mesma lei. Esta spec não reescreve nenhum dos dois. Fecha a junta: o que quebra se um id for lido sozinho. Condição que nenhum dos dois afirma não entra.

O oráculo do requirement é o teste. Esta spec não o substitui por uma frase mais frouxa. Spec que não cita um id não satisfaz os requirements.

Frase em português é o sentido. Não é a string da interface. Não se traduzem: Ready, Armed, Held, Refused, Out, Unknown, IN/OUT, e os nomes das abas. Chave de i18n está fora.

## Leitura

R1 R20.

Célula sem fonte nomeada mostra a palavra não lido. Não mostra zero, traço, vazio, nem omite a coluna. Célula com fonte mostra o valor, o nome da leitura, e a idade. Valor velho permanece, com a idade. O binário que leu não é a string.

Residência não aparece sozinha. Na mesma célula, a frequência ou "frequência não lida". Pressão de memória da máquina fica não lida. A primeira linha não calcula culpado nem resto. Taxa sem janela é não lida. `df` não vira saúde, livre, nem importante. O cliente não soma uma segunda conta.

Tick que não acompanhou o intervalo: a idade sobe e o valor anterior fica velho. Não se alarga o intervalo em silêncio. Não se troca o valor anterior por não lido, zero, traço, ou célula omitida. Primeira amostra que não chegou é a palavra não lido, não vazia. Amostra atrasada não dispara ato. A caminhada fecha só se cada diretório da raiz foi medido ou gravado como não lido. Parcial não é conta fechada. `/tmp` inteiro não é raiz.

## Dono

R2 R19.

Dono é o nome da sessão gravada no spawn, ou vazio. A mesma string na árvore, na worktree, no cache, no Docker, no log, no temporário, no IN/OUT e na quarentena. Trocar de aba não troca a string e não preenche vazio. Vivo, morto, suspenso e saindo não ocupam a coluna. Sem ledger de sessão, a tela que preenche dono mente. Gravar o dono no spawn é condição da tela, não a tela.

## Endereço

R3 R5 R7 R14 R15.

Quando o produto para ou suspende, o endereço é o id da árvore que o supervisor segura. Não é um pid. Pid que a amostra segurou não é o endereço. Pid de amostra que falhou também não é. O confirmamento mostra esse id, não um pid da tabela de membros. O produto não reconstrói árvore por PPID.

Pid que a amostra perdeu não tira do ato um membro que o supervisor ainda segura. Descendente que saiu da sessão está fora do stop e fora do teto. O resultado diz fora. Não diz que a árvore inteira parou.

No Windows, a árvore é o Job. Parar e suspender passam pelo Job, ou não acontecem. Falha de inspeção é estado desconhecido, a lei de R5. Não é não lido. Parar e suspender recusam esse estado. Falha de enumeração de handle é segurado, a lei de R7.

Parcial só alcança quem a marca não listou como parado. Sem marca que sobrevive ao restart do nosso processo, suspender não está no produto: a tela não oferece, e o efeito não corre. Sucesso só se cada membro reivindicado parou. Senão é parcial. Parcial não é sucesso, não é suspenso, e não se retoma sozinho. Footprint não desce, e a tela mostra que não desceu. Baixar o número na tela porque suspendeu não é o ato. Retomar só quem a marca lista.

## Visto e caminho

R4 R18.

Visto não tem dono, não tem flag, não tem ação. Caminho aparece, e o teto não o vê. O conjunto confirmado recusa os dois. A tela não oferece a caixa. O ato não corre sem ela. Os dois recusam parar, parar a consulta, suspender, retomar, atestar, aceitar custo, armar, aplicar, restaurar, esvaziar, mover, quarentena e vacuum. Com botão ou sem. Oferecer a caixa falha. Nome parecido não torna visto nosso. Footprint de visto, sem ledger nosso, é não lido.

## Estado

R5.

Estado e flag não dividem coluna. Estado é vivo, saindo, zumbi, ido, desconhecido, suspenso, ou parcial. Não há oitava palavra. Parcial não se grava como suspenso. Flag é uma das três, e só em árvore com dono gravado: a sessão gravada morreu e o processo vive; shutdown foi pedido e ignorado; o pai existe e o agent que precisava dele já foi. PPID=1 não é flag. Visto não recebe flag. Órfão, leak, culpado e ocioso não são estado. Hipótese não é flag. Desconhecido fica na tabela. Não vira zero para ir ao fim. Sessão morta não substitui o nome do dono.

R5 não escolhe o arquivo. Se houver série, a palavra é uma das sete, no id de R3. Desconhecido fica desconhecido. Pid não é endereço. O arquivo, a tabela, o pacote e quanto tempo fica estão fora.

## Hipótese

R6.

Na árvore selecionada, a hipótese é insuficiente, ou compatível com leak lógico. Sem footprint, é insuficiente. Compatível com leak lógico só quando o footprint subiu depois que o trabalho gravado acabou e não desceu nas amostras seguintes. Não se emite leak verdadeiro, retenção de alocador, nem cache. Série de RSS não emite hipótese. Footprint alto não escolhe classe. Alcançabilidade não lida fica escrita como não lida. O produto não injeta pressão para classificar. Hipótese não é selo e não é nota.

## Prova

R7 R8.

Ocioso só se cwd, `git -C`, arquivo aberto e lock com PID vivo rodaram e voltaram vazios. Método que não rodou, falhou, não está implementado, ou é indisponível neste OS, conta como segurado. Sem enumeração de handle que rodou vazia, nada é ocioso e nada entra em quarentena. PID de lock file velho não é PID vivo. A célula de prova lista o método que rodou, ou é não provado. Uma palavra só não é a prova. Vazio de stub não é prova. Path que não casou é segurado. Agregado não herda a prova da maioria.

Conjunto fechado, e só ele sai sem atestação e sem aceitar custo, e só com essa prova, e só se for cópia: `node_modules`, `.turbo`. `dist`, `out`, `target`, `.env` e o resto ignorado não estão no conjunto. Ignorado pelo git não é descartável. Se não dá para provar que é cópia, não está no conjunto. Store não medido não herda a prova de cópia.

## Saída

R8 R17.

O resto não sai por R8. Pede R17. R17 não é default.

Única cópia sai só se a pessoa atestar aquele objeto, com a frase que cabe. Atestar que aterrou é um objeto e a frase dos commits. Não cobre arquivo. Atestar que regenera é um diretório nomeado. Não cobre o irmão, nem sujo rastreado, nem em uso, nem alheio. As duas não se substituem. Nenhuma é aceitar custo.

Snapshot sem commit sai só se a pessoa aceitar o custo, na frase, naquele objeto. Atestação não o tira. Custo não cobre única cópia, atestação, alheio, nem em uso. Aceite não passa ao vizinho. O agent não atesta e não aceita.

Não se infere já aterrou por ancestralidade. Squash-merge não é ancestral. O teste inverso também não prova que aterrou. Única cópia não sai porque o teste inverso disse que aterrou.

## Mover

R9 R10 R16.

Claimant é árvore viva cujo env ou cwd gravado aponta o path, ou holder vivo da prova de ocioso. Registro morto não é claimant. Flag do pai não é claimant. Path com claimant não se move, não entra em quarentena, e não fica Ready.

Mais de um claimant, ou path referido de fora do diretório, é compartilhado. Compartilhado dentro de worktree se move no mesmo volume e o efeito devolve zero byte, se o path não tem claimant e se a referência gravada passa a apontar o destino. Mover para outro volume não é este efeito. Zero de mover não substitui não colapsei.

Mover não é quarentena. Esvaziar não o apaga. Restaurar o movido é mover de volta, e só se o destino novo não tiver claimant. Restaurar da quarentena não é esse ato.

Quarentena é rename no mesmo volume, com o path original gravado. Lista dono, path original, e Restorable ou Occupied. Restorable só com a segunda leitura de R12. Sem ela, a célula não é Restorable. Occupied: o path original existe. Restaurar não aparece. Sem o registro do path original, restaurar recusa. Já esvaziado recusa.

Esvaziar é outro ato. A lista do que sai de vez está na tela. A segunda leitura confirma. Se o path da quarentena ainda está lá, não foi sucesso. Recusa continua na lista, fora da soma. Esvaziar recusa se há recusa na lista. Tirar a recusa da lista para esvaziar o resto não é o ato. Esvaziar não é efeito de aplicar. Esvaziar esta lista não apaga um mover. Cópia entre volumes não é quarentena.

`git worktree remove`, com ou sem `--force`, com ou sem botão, não é a ação e não é a quarentena. A worktree continua registrada. Filho provado sai por R8 ou R9. Rename que não é esses dois não é reclaim. O descarte que a ferramenta de task já faz não se alarga.

## Plano

R9 R12 R13.

O passo é Ready só quando a prova passou, o path não tem claimant, não é pedido do agent, e ainda não foi armado. Path com claimant é Held, não Ready. Entre armar e aplicar, é Armed, e nada se moveu: o path continua na origem. Aplicar sem segunda leitura não é Out.

Os estados do passo são Ready, Armed, Held, Refused, Out, Unknown. Waiting e Queue não são estado. Esses nomes não se traduzem.

Pedido do agent não é nenhum dos seis. Não entra na soma. Aplicar não o leva. A pessoa arma, e só então é Armed. Pedido é manter, quarentena, ou mover. Outro verbo não entra no plano. Agregado não recebe pedido e não entra no plano. Docker não oferece efeito e não entra no plano. Temporário sem raiz declarada nomeada é não lido, não passo.

Geração é o token monotônico do ledger, escrito quando muda membro, identidade de path, ou sujo. Não é pid. Armar prende path, identidade de arquivo, esse token, e o que a prova disse. Plano vazio ou identidade não capturada recusa. Token que não andou quando membro, identidade de path ou sujo mudou não é geração. Confirmação prende o id e esse token. Se o token mudou, o ato recusa. Se um desses mudou e o token não andou, o ato recusa.

Aplicar compara. Divergência recusa. Não tenta mesmo assim. Aplicar o armado velho recusa. Depois do efeito, a segunda leitura: está no destino e não está na origem, ou o passo é Unknown. Unknown não se tenta de novo. Resto não se apaga para consertar sucesso. Recusa continua visível, com o pedido ao lado, e não entra na soma.

O rodapé conta os mesmos seis estados com a mesma função da aba. Não publica soma de bytes.

O agent lê e pode pedir prévia. Prévia leva o rótulo de pedido do agent até a pessoa armar. Não arma, não aplica, não esvazia, não atesta, não aceita custo, não para, não suspende, não retoma. Agent confirmando recusa. Porta lateral não existe. Nada disso corre porque a tela abriu ou porque a amostra atrasou.

Um botão saturado, e é o próximo ato irreversível. Nunca dois. Vista sem ato armado não tem botão saturado. O confirmamento mostra o token que prendeu, e nomeia os objetos. O conjunto confirmado não aceita visto nem caminho.

## Único e teto

R11 R18.

Sem identidade colapsada, a célula é a palavra não colapsei. Não é um número. Coluna ausente, zero, traço, branco ou número não substituem a palavra. Hardlink não colapsado, clone não medido, ou caminhada que não fechou: a mesma palavra. Enquanto o clone do APFS não se colapsa, não há soma. Agregado não recebe um único herdado. Mover a zero não é um único inventado.

Se a amostra do teto aparece, o nome diz soma de residentes e que a página compartilhada é contada por processo. Soma de residentes, sozinha, não é esse nome. Essa soma não entra na coluna de footprint e não emite hipótese. Amostra jogada fora não vira célula. Kill sem valor, limiar e hora não é kill deste produto e não aparece. Kill gravado com os três aparece na árvore. A tela diz que o teto não vê caminho. O teto não se estende a caminho.

## Tela

R19.

Um chapter. Abas sempre visíveis. Os nomes são os de R19, em inglês nos dois idiomas. A página não empilha as categorias. A contagem fica no topo. Filtro que não casou diz que não casou. Não diz que a máquina está vazia.

Sem barra. Sem texto de concorrente. Sem frase gerada. Classe é palavra medida. Ação é verbo. Nenhum modelo escreve nota sobre processo, disco ou hipótese. Docker não tem efeito. Agregado não tem linha de ação. Logical e idade, se não foram lidos, são não lido. Não somem da linha para a tabela fechar. A primeira linha não é museu de contadores. Pressão não lida não vira herói.

Onde o chapter senta está fora.

## Atos

A tabela do desenho, com a recusa que o requirement do mesmo ato já nomeia. Célula que omite recusa do id citado não é a lei. A lei do id continua valendo. Ato que nenhum dos dois nomeia não entra.

| Ação | Ids | Quem | Quando a prova passa | Recusa |
|---|---|---|---|---|
| Parar | R3 R14 | pessoa | Id do supervisor, geração de R12 confere, viva, suspensa por nós, ou parcial. Parcial só alcança quem a marca não listou como parado. Membro que o supervisor ainda segura entra, ainda que a amostra não o tenha visto | Visto, caminho, saindo, zumbi, desconhecido, qualquer pid. Falha de inspeção pintada como não lido |
| Parar a consulta | R3 R13 R14 | pessoa | Prévia nomeia quem entra e quem fica. O confirmamento nomeia os ids do supervisor, não pids. Contagem não é prévia. A geração de R12 confere | Nome sem prévia. Agent confirmando. Qualquer pid. Token que mudou. Token que não andou quando membro, identidade de path ou sujo mudou |
| Suspender | R3 R15 | pessoa | Id de R3, vivo, geração de R12 confere, marca durável existe. Sucesso só se cada membro reivindicado parou. Senão é parcial. A tela mostra o footprint que não desceu | Visto, caminho, desconhecido, supervisor, qualquer pid. Sem marca, o efeito não está no produto. Chamar sucesso com membro reivindicado ainda vivo |
| Retomar | R12 R15 | pessoa | A marca lista quem parou, e a geração de R12 confere. Não se retoma sozinho | STOP que não gravamos. Token que mudou. Token que não andou quando membro, identidade de path ou sujo mudou. Parcial que se retoma sozinho |
| Atestar que aterrou | R17 | pessoa | Um objeto, a frase dos commits | Arquivo. Aceitar custo. Snapshot sem commit. No lugar de regenera. Agent |
| Atestar que regenera | R17 | pessoa | Um diretório nomeado | Irmão, sujo rastreado, em uso, alheio. Aceitar custo. Snapshot sem commit. No lugar de aterrou. Agent |
| Aceitar custo | R17 | pessoa | Aquele objeto não-cache, custo na frase, naquele objeto | Única cópia. Atestação. Alheio. Em uso. Vizinho. Agent |
| Armar | R9 R12 R13 | pessoa | Cada passo tem prova. A pessoa arma o pedido do agent, e só então é Armed. Prende path, identidade de arquivo, a geração de R12, e o que a prova disse. O path continua na origem | Plano vazio. Identidade que não foi capturada. Path com claimant. Agent armando |
| Aplicar | R12 R13 | pessoa | Revalidação refeita, recusas separadas, segunda leitura definida. Divergência recusa. Não tenta mesmo assim | Armado velho. Apagar resto. Pedido do agent ainda não armado pela pessoa. Divergência. Token diferente do botão. Token que não andou quando membro, identidade de path ou sujo mudou. Pintar Out sem segunda leitura |
| Restaurar | R12 R16 | pessoa | O objeto está na quarentena, o registro do path original existe, esse path não existe agora, e a segunda leitura de R12 passou. Sem ela, não é Restorable | Já esvaziado. Path original ocupado. Sem a segunda leitura. Não é o restaurar do mover |
| Restaurar o movido | R9 | pessoa | O objeto foi movido, não está na quarentena, e o destino novo não tem claimant | Destino novo com claimant. Esvaziar o apaga. Usar a restauração da quarentena |
| Esvaziar | R9 R16 | pessoa | A lista do que sai de vez está na tela, e a segunda leitura confirma | Recusa na lista. Tirar a recusa e esvaziar o resto. Efeito de aplicar. Path que ficou. Apagar um mover |

## Fora

Não são spec. Implementar um item desta lista quebra a lei.

- Onde o chapter senta. Quanto tempo a série fica. O path da quarentena no disco. O verbo de sistema. Qual binário lê frequência ou GPU. As chaves de i18n. O pacote do código.
- Remover worktree do git. Vacuum. Mover entre volumes. Estender o teto a caminho. Injetar pressão.
- Joule, Energy Impact, prioridade, afinidade, reputação, stall por pid.
- Colapsar clone do APFS, provar squash-merge, e um teste positivo de regenerável além do conjunto fechado. Enquanto isso não se sabe, a célula é a de R6, R8, R11 ou R17. Não é spec de descobrir.

Vacuum na lista de recusa de R4 não é licença para o efeito. É a recusa de oferecê-lo.

## Cobertura

| Id | Seção |
|---|---|
| R1 | Leitura |
| R2 | Dono |
| R3 | Endereço, Atos |
| R4 | Visto e caminho |
| R5 | Endereço, Estado |
| R6 | Hipótese |
| R7 | Endereço, Prova |
| R8 | Prova, Saída |
| R9 | Mover, Plano, Atos |
| R10 | Mover |
| R11 | Único e teto |
| R12 | Plano, Atos |
| R13 | Plano, Atos |
| R14 | Endereço, Atos |
| R15 | Endereço, Atos |
| R16 | Mover, Atos |
| R17 | Saída, Atos |
| R18 | Visto e caminho, Único e teto |
| R19 | Dono, Tela |
| R20 | Leitura |
