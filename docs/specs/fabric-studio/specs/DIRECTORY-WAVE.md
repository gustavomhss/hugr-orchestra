# Diretório do contexto — recorte independente

**Estado:** aceitação em preparação, não implementação qualificada. Esta seam privada permite implementar o filesystem em paralelo ao domínio depois de crítica/RED próprios; não espera nem substitui autorização, SQL, contexto ativo ou UI.

Contrato mínimo `FabricContextDirectory.make(root)` → `{root, prepare(record), observe(record)}` em context-directory-contract.ts. Root é AbsolutePath confiável do host; record `{id: FabricContext.ID, nonce: string}` é a reserva já validada pelo domínio, não payload público. O domínio deve autorizar/revalidar antes de chamar a seam. Este recorte não lê SQL, credenciais, rede ou perfil instalado.

`make` provisiona a raiz privada 0700 e captura seu realpath; raiz incompatível é unavailable sem reparo destrutivo. Child é sempre `root/<ID canônico>`, 0700. `prepare` cria somente diretório ausente e marker `.orchestra-fabric-context`, JSON fechado `{id,nonce}`, arquivo exclusivo 0600. Diretório preexistente só é retomado após a mesma verificação readonly de `observe`; nunca sobrescrever marker incompatível nem adotar pasta não marcada. Outros arquivos de um diretório legitimamente marcado permanecem intocados.

`observe` não cria/repara nada: exige diretório e marker reais, não symlinks, com identidade ID/nonce exata, JSON fechado e conteúdo de até 1024 bytes. Bounds são aplicados antes de ler conteúdo sem limite; revisar código da leitura fixa/handle, não inferir isso só do caso oversized. Caminho fora da raiz nunca é escolhido por marker. Erros são FabricContext.Failure unavailable com mensagem fixa sem nonce, body, sentinel, causa bruta ou conteúdo de I/O.

FSD01 prova criação real/modos/shape e retomada por instância nova sem substituir marker ou tocar dados. FSD02 prova observação sem criação, criação ausente permitida e recusa de pasta não marcada/ID ou nonce errados/extras/JSON inválido sem reparo. FSD03 usa targets de symlink com marker **válido** e JSON oversized com whitespace **válido**, tornando os controles causais, mais raiz arquivo incompatível. Testes usam somente filesystem real sintético no CI; nenhum mock, skip ou teste local.

Nome de path e limites são deste formato privado fechado, não scanner de arbitrário filesystem/objeto hostil. Uma pausa/realpath/lstat não torna a seam uma transação atômica contra outro processo do mesmo usuário alterando o filesystem; não afirmar isso. Não há purge, key rotation, C07, backup fencing ou comando remoto. SQL e cancelamento de preparo continuam pertencendo ao domínio, com suas próprias provas FCT.
