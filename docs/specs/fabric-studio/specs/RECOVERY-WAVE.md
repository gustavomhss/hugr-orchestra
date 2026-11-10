# Recuperação antes da persistência de contexto

**Estado:** preflight de arquivo implementado e qualificado no alcance abaixo; a demanda v5 original permanece nas evidências imutáveis. Prerequisito de S02/S13/C07; não entrega contexto, envelope, OAuth ou proteção contra rollback de backup. O recorte Cache anterior está concluído em CACHE-WAVE. Credenciais, chaves e bancos do operador não foram abertos; todas as provas usam arquivos sintéticos no CI.

## Falha factual do baseline anterior

Antes deste recorte, `CredentialCipher.refuseNewKey(file)` procurava MCP auth e `orchestra.db` junto ao arquivo de chave. O probe SQLite considerava apenas `credential.value` e capturava erros de query como se não houvesse material cifrado. Um futuro payload Fabric, um banco fora dessa pasta ou uma tabela reconhecida incompatível não estavam cobertos. A correção abaixo não é autorização para gravar payload Fabric.

## Decisões do lead para o recorte

1. Reusar a cifra e o lifecycle de chave existentes. Não criar chave, arquivo de token, banco paralelo ou mecanismo criptográfico Fabric. A recusa antecede qualquer tentativa de criar uma chave substituta e preserva bytes do store.
2. A descoberta de caminhos de produção deve usar a configuração efetiva do perfil: o banco escolhido por `Database.path()`, o banco de release conhecido por `Database.releasePath()` e o MCP auth do diretório de dados, sem inferir isso pelo diretório da chave. A chave do perfil pode proteger ambos os bancos: selecionar um DB customizado não elimina a proteção dos dados de release. Deduplicar paths e não tratar `:memory:` como arquivo. A resolução dos filenames terá uma única implementação compartilhada; preservar as APIs/comportamento de `Database.path/releasePath` e evitar importar Database/migrações pesadas no carregamento da chave.
3. A seam testável existente passa a aceitar opcionalmente `refuseNewKey(file, { databaseFiles, authFiles })`, com arrays readonly de paths confiáveis do host. O default usa os caminhos efetivos acima; o argumento não aparece em Protocol, Client, template ou agente. Não é permissão de filesystem. Os testes sempre fornecem somente seus paths sintéticos explícitos.
4. O conjunto fechado de colunas protegidas é `credential.value` e o futuro `fabric_record.sealed`. O segundo nome fica reservado para o store de payloads C07 do domínio, não para armazenar dados como credenciais improvisadas. Reconhecer esse nome no probe **não implementa** sua tabela, migração, autorização ou envelope. A integração futura deve provar correspondência entre a coluna real e esse registro.
5. Abrir SQLite read-only; primeiro verificar se a tabela reconhecida existe. Tabela ausente não é erro. Se existe mas não tem a coluna esperada, schema/arquivo não pode ser lido ou o driver não está disponível para inspecionar um banco existente, falhar fechado, sem interpretar isso como banco vazio. Não consultar uma coluna inexistente entre aspas e aceitar o fallback SQLite para string literal como prova de ausência.
6. Com coluna válida, detectar o prefixo cifrado existente sem abrir o payload nem usar a chave. MCP auth conserva a detecção conservadora do envelope selado. Material reconhecido cifrado com chave ausente recusa; store ausente, vazio ou somente legado plaintext permite prosseguir no lifecycle existente. Tabelas desconhecidas não viram uma varredura genérica de dados.
7. Arquivo de chave já existente preserva o caminho atual: o preflight não troca/recria a chave. Validade da chave, abertura de ciphertext e recuperação continuam nos controles existentes; presença não equivale a chave correta. Nenhum erro deve ecoar payload, cache serializado ou conteúdo do arquivo corrompido.

## Aceitação no CI

`packages/core/test/credential-key-recovery.test.ts` usa SQLite/arquivos reais e a função real, sem mock de scanner, driver ou serviço.

- **KRP01:** os positivos existentes de credential e MCP selados recusam chave ausente; arquivos permanecem iguais.
- **KRP02:** somente `fabric_record.sealed`, sem tabela credential, também recusa e preserva ciphertext.
- **KRP03:** banco/MCP em paths explicitamente selecionados fora da pasta da chave não são ignorados.
- **KRP04:** tabela protegida reconhecida sem a coluna obrigatória falha fechado, sem novo arquivo de chave.
- **KRP05:** stores ausentes, vazios e plaintext permitem o preflight; chave existente não é substituída. São controles contra uma implementação que recusa tudo.
- **KRP06:** arquivo SQLite corrompido é falha de inspeção, não ausência de segredo; preservar bytes e erro sem echo.
- **KRP07:** em subprocesso Bun real via AppProcess/omni, default sem options segue ORCHESTRA_DB, release conhecido e MCP auth do perfil XDG sintético, fora da pasta da chave. Ausência/plaintext permitem e ciphertext recusa, inclusive release/MCP quando o banco ativo contém somente plaintext. Ambiente do filho é explícito/isolado, sem mocks de Flag/Global ou acesso ao perfil do operador. A prova de paths explícitos não substitui essa ligação de produção.

O probe não decide autorização, política de dados ou anti-rollback. O ensaio de OS keychain/Bun.secrets e a recuperação de backup não são demonstrados por esta seam de preflight de arquivo; continuam bloqueios pertinentes de S13. Nenhuma persistência sensível Fabric é liberada só por este recorte. Gate próprio: demanda/suite revisadas, RED real, implementação revisada independentemente, contraprovas de coluna Fabric omitida e erro engolido, restauração verde; regressões credential/cache/MCP e typecheck/guards. Nada roda localmente além de checks estáticos permitidos. Ainda não há runtime, novos paths de produção ou gatilho de CI por este documento.

**Alcance dos instrumentos:** hashes de arquivo demonstram preservação, não modo da conexão. A revisão independente de implementação deve verificar explicitamente o open SQLite read-only, o default ligado ao resolver canônico e o fail-closed sem driver; trocar o open para read-write é contraprova estática FIX-FIRST, não um vermelho runtime presumido. A suite deve ainda controlar Fabric-only vazio/plaintext antes do ciphertext, mistura de rows, segundo path da lista e tabela não registrada com decoy cifrado permitido. Erros e saída do filho são comparados também aos bytes cifrados e ao envelope serializado efetivamente usados, não só ao plaintext original. O filho reporta as representações do erro para essa inspeção, com saída limitada e truncamento tratado como falha de instrumento.

O registro fecha **pares de tabela/coluna**, não todas as colunas de uma tabela reconhecida: coluna adicional com decoy cifrado e coluna protegida vazia/plaintext permite prosseguir. Fabric é verificado tanto sozinho quanto depois de credential plaintext; mistura de rows inclui plaintext antes e depois do ciphertext. O match deve ser delegado ao predicado SQLite antes do LIMIT, sem amostragem/materialização de rows no host. O teste de mistura não é prova por enumeração de toda posição possível: revisão SQL confirma a delegação ao motor. A inspeção de erro inclui cause/propriedades não enumeráveis em profundidade limitada, além de message/String/JSON; não é scanner universal de todo objeto arbitrário.

## Evidência do recorte implementado

Runtime publicado `40d2e8d90ebea453bd3c0ba59d8471481f7de1b8`, integrado por fast-forward em `context-recovery`, sem merge em dev/release. Helper canônico de filenames preserva path/releasePath sem carregar Database no probe. Revisão independente aprovou os checks estáticos, incluindo readonly, metadados de coluna, predicado SQL antes do LIMIT, default ativo+release+MCP e recusa sem driver; isso não foi inferido de hashes dos arquivos.

- RED v5: [41993015400](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41993015400), KRP02/03/04/06/07 falham por recusa ausente; controles KRP01/05 passam.
- Inicial restaurado: [41994590637](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41994590637), sete KRP passam com nove spawns omni reais.
- Omitir Fabric: [42003205365](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42003205365), KRP02 falha após os controles vazio/plaintext.
- Engolir erro de inspeção: [42003562557](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42003562557), KRP04/06 falham na recusa ausente.
- Ecoar ciphertext real: [42003962597](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42003962597), KRP01 falha no oráculo de erro sem conteúdo protegido.
- Restore exato e regressões afetadas: [42004356299](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42004356299), **122 passam / zero falha / um skip exclusivo de Windows** no Linux, doze spawns omni reais. Todos KRP/cache selecionados executaram.
- Caso omitido executado no Windows: [42005184854](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42005184854), `DatabaseMigration > maps native Windows paths through database columns` passou, sem skip selecionado. Não equivale à suíte Windows inteira.

O lead conferiu logs completos, diffs dos três mutantes, restauração byte a byte e blobs Git de fontes/testes dos snapshots. Guia atualizado sem sugerir apagar dados para contornar a recusa. Permanecem fora dessa prova OS keychain, rotação atômica, concorrência com mudanças posteriores ao probe, backup fencing e C07/Studio integral.
