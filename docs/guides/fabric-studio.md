# Fabric Studio

## Identidade em desenvolvimento

Os guards locais já distinguem os perfis público desktop e confidencial HTTPS e recusam callbacks com destino/state incorretos. A admissão durável de tentativas está em desenvolvimento, vinculada ao operador e à Location atuais. Isso ainda não habilita “Entrar com Microsoft”: reserva `preparing` não é login pronto, não recebe callback e não cria conexão. Não copie configurações/records de outra instância para tentar transferir uma conta.

A preparação protegida foi implementada no domínio de desenvolvimento e testada em Linux: PKCE, state e nonce ficam cifrados no backend; preparações concorrentes preservam um só material, e retomar não renova o prazo original de dez minutos. `pending` significa apenas material local preparado, não conta autenticada ou operação autorizada. Cancelar uma preparação pendente exige o operador/contexto atuais e remove o material local, não cópias de backup. Callback de uso único, validação da identidade, troca de tokens, interface de login e qualificação Windows ainda não estão liberados.

O domínio de desenvolvimento agora também tem inbox/claim de callback testados em Linux, ainda sem rota ou listener habilitado. Receber um callback não acessa banco/cifra nem autentica a conta; continuar exige o operador e contexto atuais. O claim consome a fase pendente uma vez, e o code só pode ser entregue uma vez ao host backend por um ticket opaco — não ao modelo. Fechar o processo/Scope após claim perde esse ticket; a tentativa não é retomada automaticamente e exige reinício explícito. Isso não anuncia “Entrar com Microsoft” pronto: validação criptográfica da identidade, exchange, cache/conexão e listener/TLS reais continuam gates separados.

O verificador de assinatura/claims do ID token foi testado com RSA real e chaves sintéticas em Linux e Windows. Ele exige nonce, audience, issuer e identidade organizacional coerentes, mas ainda não está ligado ao login. Chaves configuradas no host não são, por si só, prova de origem Microsoft: obtenção autenticada de JWKS, exchange e vinculação ao material protegido continuam separados. A prova interna emitida pelo verificador não concede acesso ao Fabric, e esta qualificação não libera armazenamento protegido no Windows.

A leitura backend do PKCE/nonce original depois do claim também foi testada em Linux. Ela exige autorização atual, mantém o prazo original e recusa mudanças de contexto, metadados ou ciphertext durante a leitura. Não consome o code nem inicia exchange, e material sensível não é resultado de ferramenta ou progresso para o modelo. A composição com MSAL, obtenção confiável das chaves e publicação da conta/conexão continuam pendentes.

**Estado:** em desenvolvimento, sem release do Studio completo. A entrada nativa de contextos locais está implementada e materializada na árvore de desenvolvimento, com testes e smoke web isolado; qualificações e pendências são registradas em `docs/specs/fabric-studio/specs/DELIVERY.md`. O contexto local descrito abaixo é infraestrutura de entrada, não uma conexão autenticada com Microsoft Fabric. Não atribua suporte a uma versão instalada a partir deste guia.

## Contexto local e workspace Microsoft são diferentes

Um contexto local pertence ao operador e ao armazenamento do servidor Orchestra selecionado. Ele fornece uma pasta gerenciada para abrir o Studio sem exigir um projeto Git. Criar esse contexto não faz login, não descobre workspaces, não inicia consultas/jobs e não consome capacidade Fabric.

O ID do contexto não concede acesso. O servidor verifica a autoridade atual, a geração da referência e seus vínculos de armazenamento em cada operação. Trocar de servidor não transporta acesso a contextos do servidor anterior.

### Proteção local em desenvolvimento

A base de armazenamento protegido e a política local de retenção estão implementadas no domínio de desenvolvimento, com testes Linux, sobre o Database e a chave de cifra existentes do Orchestra. O conteúdo é vinculado ao operador, contexto e revisão; substituições e sobrescritas obsoletas são recusadas. A política distingue rascunhos (sete dias sem escrita explícita), composição salva (até exclusão) e evidência opt-in (sete dias desde criação, sem renovação silenciosa por leitura/edição). Inspeção e limpeza ainda não estão expostas na interface desta entrega.

Isso não significa banco inteiro cifrado, backup protegido contra rollback, proteção Windows qualificada ou autosave sensível já habilitado. Perda da chave preserva o ciphertext para recuperação; não remova chaves nem restaure uma base antiga para tentar reativar um contexto. Limpeza local não elimina cópias de backup/exportação nem cancela trabalho Fabric. Recuperação integral, rotas/UI e qualificação restante têm gates próprios antes de ligar consumidores.

## Interface de bootstrap em desenvolvimento

No candidato que contém a entrada nativa:

1. Selecione a conexão autenticada do servidor Orchestra na Home; não é necessário selecionar uma pasta Git nem configurar um modelo IA.
2. Abra **Extensions → Fabric Studio**. A página só lista contextos do servidor explicitamente selecionado; uma seleção indisponível não usa outro servidor como substituto.
3. Use **Create local context** para criar explicitamente. **Open** resolve a referência atual antes de abrir seu contexto local; o estado “Local context resolved” não significa conexão Microsoft pronta.
4. Após falha ambígua, **Retry the same creation** ou **Retry the same revocation** conserva a chave daquela intenção. A intenção é efêmera: sair do capítulo ou trocar a conexão encerra esse retry local; o estado remoto pode já ter sido alterado e deve ser conferido na lista ao retornar.
5. Preparações interrompidas aparecem separadamente, sem contexto utilizável. **Cancel preparation** cancela a reserva local. **Revoke** exige confirmação e revoga somente o controle local, sem apagar arquivos ou dados Microsoft.

O candidato usa copy inglesa como fallback deliberado; traduções, Electron/Windows, leitor de tela e qualificação final têm gates separados. Não há compositor, templates operacionais, login ou execução Fabric nessa entrada.

O grupo `fabricContexts` do Client gerado contém:

| Método | Resultado |
| --- | --- |
| `list({ after?, limit? })` | Referências dos contextos locais ativos acessíveis ao operador. |
| `preparing({ after?, limit? })` | Referências de preparações ainda não publicadas, sem Location utilizável. |
| `create({ "idempotency-key": chave })` | Cria explicitamente um contexto e devolve sua referência e Location autorizada. |
| `resolve({ id, generation })` | Resolve uma referência atual sem recriar ou reparar sua pasta. |
| `remove({ id, generation, "idempotency-key": chave })` | Revoga o contexto local e devolve a geração da referência revogada. |

`list` e `preparing` aceitam páginas de até 32 itens, com 16 por padrão. O cursor retornado pertence àquela lista/servidor; não é credencial. Abrir ou listar não cria contextos implicitamente.

Esses endpoints não exigem uma Location anterior. Não envie `directory`, `workspaceID`, `principal`, `storageID`, grant ou raiz de armazenamento para escolher outro destino: o contrato os recusa. A raiz é definida pela composição confiável do servidor, não pelo cliente nem por um pacote importado.

## Autenticação e retries

- Servidor configurado com senha usa Basic; um Bearer não substitui essa configuração.
- Servidor sem senha/embedded exige um Bearer realmente emitido pelo seu operador. Localhost não é uma autorização implícita.
- Use a conexão autenticada selecionada no Orchestra. Não coloque credenciais em URLs, logs, exemplos compartilhados ou arquivos do workspace. Para conexões remotas, proteja o transporte com TLS; não envie Basic por HTTP aberto.
- Gere uma chave de entrega por intenção de criação ou revogação. Após uma falha ambígua, repita a **mesma** operação com a **mesma** chave e referência. Uma chave nova pode representar outra intenção; não a gere automaticamente a cada retry.
- Retry não ignora revogação ou redução de permissões. Uma referência excluída não é ressuscitada pelo replay de create.

## Preparações interrompidas e revogação

Uma preparação interrompida aparece em `preparing`, não na lista de contextos ativos. Seu proprietário pode tentar concluir a intenção original com a chave original ou cancelá-la explicitamente por `remove`. Resolver uma preparação ainda não publicada retorna indisponibilidade; não a transforma em contexto pronto.

`remove` revoga somente o controle local. **Não exclui arquivos, dados remotos ou workspace Microsoft.** A operação também pode revogar um contexto cuja pasta esteja danificada, sem abri-la nem tentar repará-la. Não edite markers, recibos ou linhas SQL manualmente para contornar uma falha.

## Falhas esperadas

| Status | Significado |
| --- | --- |
| 400 | Entrada fora do contrato ou chave obrigatória ausente. |
| 401 | Autenticação ausente, inválida ou revogada. |
| 403 | Solicitação recusada pelo controle do operador, referência alheia/desconhecida ou chave de entrega malformada. |
| 409 | Referência expirada, conflito ou limite de contextos locais alcançado. |
| 503 | Preparação não publicada, pasta/vínculo indisponível ou outra indisponibilidade do contexto local. |

Uma pasta ausente não é recriada por `resolve`. Investigue a falha ou revogue o contexto local; não trate uma resposta indisponível como uma conexão Fabric pronta.

## O que este recorte não comprova

Login Microsoft/Entra, consentimento, proteção contextual de conteúdo sensível, recuperação por keychain, composição de espaços, templates operacionais e execução real em Fabric têm qualificações próprias ainda pendentes. A qualificação de filesystem/SQLite local em Linux e macOS arm64 não é qualificação desses recursos nem de Windows. Não use o contexto de entrada como autorização para armazenar tokens, consultas ou rascunhos sensíveis em arquivos comuns.
