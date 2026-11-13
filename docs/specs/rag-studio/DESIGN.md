# Rag Studio

Desenho de produto. Não é autorização para implementar. Não é gerador de tela.

Data: 4 de novembro de 2026. Base: a pesquisa em `research_notes/Estúdio de RAG no Orchestra/` e o relatório `reports/Estúdio de RAG no Orchestra.md`.

## As cinco perguntas

**Por que isso é muito bom?**
Porque junta, num objeto só, o que o mercado de 2026 partiu em três produtos e não amarrou. O RAGFlow mostra o pedaço. LangSmith, Langfuse, Phoenix e Braintrust mostram o traço de uma execução, se o aplicativo emitir o span. Nenhum dos dois prende a resposta a uma revisão do índice, mostra quem perdeu a busca, e recusa um verde quando o objeto falta. O estúdio é esse elo. Não é um chat mais bonito.

**Por que todo usuário fica pasmo em 5 segundos?**
Não fica. Quem abre para "conversar com uns PDFs" não vê nada de pasmoso. O pasmo, quando existe, é de quem acabou de receber uma resposta ruim e cola a pergunta aqui. Em um olhar, uma das quatro luzes acende: não está no acervo; está e a busca não achou; achou e não entrou no modelo; entrou e o modelo não usou. Isso é o que hoje exige abrir três ferramentas e ainda assim não fecha. Não é todo usuário. É o usuário que já desconfia.

**Resolve problema real?**
Sim, estes: resposta que perde o documento óbvio e ninguém sabe em que estágio; citação que confere e mesmo assim não causou a frase; acervo que piora depois de entrar arquivo, por pedaço órfão, fonte mais nova que o pedaço, ou duplicata; prova que continua verde quando o corte deslocou a citação um parágrafo; troca de modelo de embedding sem refazer os números. Não resolve busca na empresa inteira, herança de permissão, nem "o modelo é burro". Abaixo de um acervo pequeno, o problema real às vezes é não usar RAG. A Anthropic, em setembro de 2024, manda pular o índice abaixo de cerca de 200 mil tokens no Claude daquela data. O número é deles, não uma lei. O estúdio mostra a escolha.

**É o melhor estúdio de RAG do universo, de longe?**
Não. De longe, não. O RAGFlow já é o estúdio de corte, e o parser de PDF deles é o emprego deles, não o nosso. Pinecone Assistant é contratado para esconder o pipeline, e quem quer isso não vem aqui. Não vamos ganhar de um índice em nuvem em escala, nem de um traço de produção em volume. A frase honesta é menor e ainda é forte: o melhor lugar para ver se este RAG está mentindo, no acervo que a pessoa admitiu, dentro do Orchestra.

**Destrói a concorrência?**
Não. Não é o objetivo, e a pesquisa não sustenta. Flowise e Verba já se arquivaram sozinhos. GraphRAG está em manutenção e o próprio README diz que é demonstração. Copiar o canvas, o grafo ou o visor 3D é construir o que 2026 largou. O que dá para tomar é um emprego que ninguém fechou: diagnóstico no primeiro olhar, prova presa à revisão, manutenção que não é um botão "reindexar". Isso não apaga o RAGFlow. Convive com ele, e é melhor nele nesse emprego.

## O que é

Uma tela no Orchestra, no projeto que a pessoa já escolheu. O acervo é uma lista de arquivos que ela admite. Não é o repositório. Se ela apontar para o código, a tela diz que isso já é o Atlas e abre o Atlas. O Atlas vive no git, sem embeddings e sem vector store. Essa decisão não se reabre por este módulo.

O emprego: configurar, manter, testar e rodar um percurso de recuperação, com a estrutura visível o tempo todo. Rodar, aqui, é executar a pergunta contra uma revisão nomeada e guardar o traço. Não é um segundo chat. O chat já existe.

## A tela dos 5 segundos

Não é um dashboard. É uma linha de diagnóstico, em cima da pergunta.

Quatro estados, um aceso, os outros apagados com a razão:

1. Não está no acervo.
2. Está no acervo. A busca não devolveu.
3. A busca devolveu. Não entrou no que iria para o modelo.
4. Entrou. Não dá para afirmar que o modelo usou. Dá para afirmar se o trecho sustenta a frase. Uso causal não está no log. Fingir que está é teatro.

Ao lado, o arquivo aberto no intervalo, não um cartão solto. Quem perdeu a busca está na lista, ou a frase "não registrado". Um vão em branco não pode parecer "não havia nada".

Quem chega sem pergunta vê o inventário: cada arquivo com leu, não leu, ou ainda não leu. Falha de leitura é estado do documento. Índice vazio que parece "não tinha conteúdo" é o bug.

## Os objetos

Tudo pende de uma revisão. Sem revisão, a tela não desenha.

A revisão não é o apelido da coleção. É três coisas:

- o retrato do acervo: quais arquivos, qual hash de cada um;
- o hash do pipeline: parser, regra de corte e o tokenizador com que ela conta, se houve preâmbulo e qual modelo e qual prompt o escreveram, modelo de embedding se houver, dimensão, tipo numérico, métrica, modelo da consulta se puder diferir, modelo esparso, método de fusão, reranker, e quantos pedaços de fato entram no prompt;
- o preenchimento: se cada pedaço já passou pelo passo que o hash exige. Anunciar busca híbrida com pedaço antigo sem a perna de palavra é mentira.

Dois modelos com a mesma dimensão não são o mesmo vetor. Qdrant guarda tamanho e distância, não o id do modelo. O estúdio guarda o id.

O pedaço é um intervalo: arquivo, começo, fim, texto exato guardado. Preâmbulo gerado, se houver, é outro objeto. Palavra-chave que a pessoa acrescenta é sobreposição, e aparece no traço como sobreposição. Não se mistura ao texto da fonte. A pessoa não edita o texto do pedaço para "melhorar a busca". Um pedaço que o arquivo não diz transforma a checagem de hash numa mentira. Dá para desligar um pedaço: continua visível, sai da busca.

## Configurar

Não é um slider de tamanho com sobreposição. Sobreposição é ajuste menor. As fontes que publicam número não creditam ela pelos movimentos grandes. Creditam guardar o contexto que o corte destruiu, acrescentar a busca por palavra, fundir posto em vez de somar score cru, reordenar uma lista funda, e não trocar o modelo por baixo do índice.

O que a pessoa configura, porque mudar isso muda quem volta ou torna o índice incomparável:

- o que entra e o que fica de fora;
- como cada tipo de arquivo é lido. Tabela, PDF e lista aninhada quebram no parser. Texto puro, quase não. O parser é estágio, não detalhe;
- a fronteira do corte, e com qual tokenizador se conta;
- preâmbulo ligado ou não, separado do intervalo;
- busca por palavra, sempre ligada na primeira versão;
- busca por sentido, desligada até um modelo ser nomeado;
- se as duas existirem: fusão por posto, não soma de score cru. A escala do BM25 muda com a pergunta. Fundir só reordena o que as duas pernas já trouxeram. Não inventa documento que as duas perderam;
- profundidade de candidatos, reranker, e quantos pedaços entram no prompt. O K da prova é o K que a tela mostra. Prova em 100 e tela em 5 faz o recall parecer bom;
- métrica, e se o número é similaridade ou distância. Distância invertida parece ranking bom.

Um antes e depois que troca parser, corte e modelo juntos não diz qual escolha moveu. A tela só compara quando um estágio mudou.

Late chunking, grafo, compilação estilo RAPTOR e loop de agente não são interruptor da primeira versão. Não porque sejam impossíveis. Porque ou pedem condição estreita, ou a pesquisa daqui não tem fonte primária para recomendá-los, ou 2026 já tirou da interface principal.

## Testar

A pessoa guarda perguntas e marca o intervalo certo. O rótulo diz como foi feito: gente, log, ou sintético. Sintético infla. Clique reproduz a busca velha, não a de agora.

Duas provas, não uma nota:

- recuperação: o intervalo rotulado apareceu no K que o modelo veria;
- geração: a resposta se apoia nesses intervalos.

Uma nota de fidelidade ao lado do chat não separa busca que errou de modelo que inventou. Em junho de 2026, um corte que passou a prefixar número de linha deixou a avaliação verde e deslocou toda citação um parágrafo. O conserto é contrato na fronteira trecho-citação, não um juiz melhor.

Comparar duas revisões exige o mesmo conjunto e o mesmo retrato. A média esconde o conjunto em que a mudança piorou. Leaderboard de fornecedor não é a prova deste acervo.

## Manter

Não existe um botão "reindexar" que faça tudo. Os passes são separados, e cada um diz o que vai tocar antes de rodar:

- ler de novo, se o parser ou os bytes mudaram;
- cortar de novo, se a fronteira mudou;
- refazer o preâmbulo, se o prompt ou o modelo dele mudou;
- refazer os números, se modelo, dimensão ou tipo numérico mudou;
- preencher a perna de palavra, se o campo foi acrescentado e o pedaço antigo não tem;
- apagar órfão, se o arquivo saiu do acervo. Se não apagar, o pedaço morto continua ganhando a busca.

Cache que pula um passo cujo hash não mudou não apaga o vetor do passo anterior. As duas coisas aparecem.

A exceção documentada, Voyage 4 em 15 de janeiro de 2026, é espaço compartilhado dentro da família: o vetor de consulta de um modelo menor busca vetores de documento do maior sem refazer o corpus. Vale dentro da família, não entre fornecedores. Por isso "modelo do documento" e "modelo da consulta" são dois campos. Não é recomendação de comprar Voyage.

Os quatro desencontros que a tela de inventário tem de mostrar: pedaço vivo com arquivo sumido; arquivo mais novo que o hash do pedaço; duplicata exata por entrar de novo sem ser idempotente; quase-duplicata, parser velho e parser novo competindo.

## O que não entra

- Canvas de nós. O mantenedor do Flowise, ao arquivar em agosto de 2026, culpou o fluxo rígido de baixo código, não uma feature de RAG ausente.
- Chat com arquivo chamado de estúdio. AnythingLLM documenta manutenção como apagar e subir de novo. Verba tinha visor 3D e foi arquivado sem a avaliação prometida.
- Grafo como a coisa que a pessoa olha. GraphRAG está em manutenção. O RAGFlow tirou GraphRAG e RAPTOR da interface principal em agosto de 2026.
- Visor 3D de embedding.
- Seletor de corte semântico como diferencial, sem antes e depois nas perguntas da pessoa.
- Nota de fidelidade solta.
- Log de gateway como se fosse observabilidade de RAG. Proxy vê a chamada do modelo. Não vê qual pedaço voltou.
- RAG gerenciado que esconde o corte. Isso é outro emprego.
- Geração declarativa de tela. O capítulo é escrito, com dado real.
- Escrever em `.atlas/`. Ler memória de reunião. Índice do código. Segundo banco. Processo novo ao lado da sessão. Spawn fora do caminho que o repositório já permite.

## Onde mora no Orchestra

Capítulo, não plugin. Id `rag-studio`, no grupo Extensions. Não pode ser `search`: esse id abre a paleta. Pacote `modules/rag-studio`, sem processo próprio. Tela em `packages/app-shell`, falando só com o cliente gerado. Grupo de protocolo com escopo de Location. SQLite único, se precisar de linha, com migração que faz backup antes. Inglês é a fonte do texto. Português do Brasil entra no par.

Arquivo comum entra pela API de filesystem, relativa à Location. Fora do diretório, só com a permissão que já existe. Página de pesquisa já admitida entra pela porta que já existe, que não aceita caminho arbitrário. Nenhuma das duas portas se alarga. Texto recuperado é dado. Nunca instrução, nunca fato do Atlas, nunca cópia de credencial.

Se um assento for usar um trecho, o texto entra como Context Source, rotulado como dado, no próximo limite seguro. Não reescreve o prompt de sistema no meio da sessão. Não vira fato.

## Primeira versão e embedding

Sem modelo nomeado, embedding fica desligado. O que liga sem ele é o que o repositório já sabe fazer e o que a pesquisa mediu como amplificador que não pede um segundo modelo neural: identidade da fonte, parse honesto, intervalo, busca por palavra, traço em estágios, prova presa ao retrato, diagnóstico das quatro luzes. Nomear um modelo liga embedding e não escreve vetor por si.

Busca por palavra é a que um desktop acrescenta sem GPU. O caso trabalhado da Anthropic é o identificador `TS-999`, que o embedding perde e a busca por palavra acha.

Embedding entra quando um modelo é nomeado, e só no acervo admitido. Nunca no código. O contrato fica ao lado do intervalo, em linha do SQLite que já existe ou em arquivo local ignorado pelo git. Nunca em `.atlas/`. O encoder passa pelo caminho de provedor que já devolve a string do modelo, ou por um arquivo de modelo que o índice nomeia. Não há processo de índice ao lado da sessão. Quantização e corte de dimensão são troca explícita, medida no conjunto da pessoa, não assumida.

Não se confirmou, nesta pesquisa, se o SQLite do Orchestra tem FTS5 ou extensão vetorial. Recomendar um motor agora seria inventar.

## A primeira sentada

A pessoa admite três arquivos. Vê o que leu e o que falhou. Vê os cortes no texto. Faz uma pergunta e vê qual das quatro luzes acende, quem entrou, quem perdeu, e o bloco que iria para o modelo. Salva a pergunta e marca o intervalo. Muda uma regra de corte, só essa. Vê quais perguntas salvas mudaram de intervalo.

Não há depoimento, nestas notas, de alguém que se apaixonou por um painel de RAG. O carinho é inferência a partir da dor. A aposta de produto, marcada como aposta, é que a pessoa fica na ferramenta que se recusa a acender verde quando o objeto falta.

## O que este desenho não sabe

Não há, nestas notas, medição de 2025–2026 de colapso de embedding, nem de vazamento de permissão, nem de "perdido no meio" replicado em modelo de contexto longo atual. Não há formato primário de caixa de PDF. Não há como uma mudança de permissão se propaga num índice já construído. Enquanto o traço não tiver rótulo de quem podia ver o pedaço, o estúdio não promete "não vazou". Não há comparação de modelo local que autorize escolher um. Não há estudo de uso que diga que o diff de índice é amado. Há o buraco, e há um repositório que já sabe recusar um verde sem objeto.
