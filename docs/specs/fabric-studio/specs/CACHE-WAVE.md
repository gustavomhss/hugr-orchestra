# Cache opaco de credenciais — preparação da fatia de identidade

**Estado:** aceitação v3 encerrou duas críticas secas; wire/interfaces em materialização pelo lead, runtime ainda não implementado. Requisitos proprietários S02: FS-AUT-011/015 e FS-INT-004. Não é login MSAL, callback OAuth, emissão de token, ContextGuard ou conclusão do B-CONTRACT. Credenciais instaladas e bancos do operador não serão abertos pelos agentes; testes usam apenas fixtures CI.

## Fatos conferidos antes da decisão

`Database.Service.storageID` já existe: hash do pathname resolvido para disco, UUID independente por aquisição em memória. Isso não é ID de tenant/servidor nem prova de realpath. Usar esse serviço no futuro contexto; não inventar namespace paralelo.

ServerOperator e seu frame privado Core já carregam principal/origem/requestID e verificam autoridade emitida pelo host. `RequestAuthority` isolado ou IDs do payload não substituem esse frame. Dois browsers continuam um operador. O ledger de requests valida o frame e a transação, mas deixa o owner/política do domínio para o callback SQL. Nenhuma operação deste documento publica acesso direto ao cache para renderer, ferramenta de agente ou modelo.

Credential já cifra seu valor via CredentialCipher, preserva dados indecifráveis durante leitura e rejeita refresh/write herdado. Seu update atual não recebe versão esperada. Integration e executores atuais conhecem Key/OAuth; acrescentar cache sem proteger esses consumidores seria incorreto.

## Decisões de armazenamento

1. Acrescentar **uma família explícita** `Credential.Cache` no contrato canônico e na união `Credential.Value`: `{type: "cache", methodID, format, version, serialized}`. `methodID` refina o schema canônico de Integration com os limites exclusivos de cache, preservando sua marca/tipo; não criar outro ID nem exigir identidade do schema refinado com o campo OAuth sem limites. Cache é opaco: Core não importa MSAL nem interpreta seu JSON/tokens/contas/audiences.
2. Objetos cache são fechados/readonly. Format não vazio, até 256 unidades UTF-16; methodID entre 1 e 256; version inteiro positivo seguro; serialized string opaca até 1048576 unidades UTF-16, inclusive vazia. São seeds de armazenamento, não budgets finais medidos do MSAL. Nenhum refresh/access/expires fake, callback, grant ou metadata livre é aceito nessa família. OAuth/Key existentes não recebem novas restrições.
3. Reusar **a mesma tabela credential e cifra/lifecycle de chave**. Sem arquivo/token store paralelo, nova tabela ou migração nesta fatia. Novos valores cache só entram após validação completa antes da serialização/cifra. Linhas antigas Key/OAuth continuam legíveis; sealed bytes indecifráveis não são reescritos por uma tentativa CAS.
4. A geração lógica do cache será uma **revisão opaca dos bytes cifrados atuais**, não timestamp nem contador novo. Isso permite CAS SQL persistente sem migração. O token interno liga credential ID aos sealed bytes; nunca contém plaintext, não é grant, é sensível e não pode ir para DTO/log/modelo. Limite do token 16 MiB; IDs admitidos nessa API até 256 unidades UTF-16. Não mudar o schema genérico legado do Credential.ID.
5. Compare-and-swap deve ter predicado atômico SQL por ID **e valor cifrado anterior**. Comparar antes de um UPDATE incondicional não basta. A revisão pode ser representada internamente como `encodeURIComponent(id) + "#" + sealedValue`; o consumidor só a guarda/devolve, sem interpretá-la. Atualização de label preserva o cache e não muda sua revisão; troca do valor (inclusive pelo update antigo) invalida o token. Remover/recriar não recupera o token de outro ID.

O uso de revisão opaca refina a notação “generation do cache” de S02: é controle de concorrência do valor persistido, distinto da versão de formato do produtor e das gerações Context/Connection públicas. Não altera a exigência de que retorno velho não sobrescreva cache novo. Scope de request, autoridade, conta/audience e proteção contextual de outros records permanecem controles adicionais, não são fornecidos pelo token CAS.

## Seam Core a materializar após crítica

`Credential.Cache` reexporta o exato schema/tipo canônico. A interface existente recebe `cache`, sem substituir create/get/list/update/remove:

Overloads de create/update preservam os canais de erro anteriores para entradas estaticamente Key/OAuth (ou label-only). Entradas cache/Value recebem CacheError tipado adicional; não mascarar esse erro por casts, `any` ou alteração dos testes legados para aceitar qualquer erro. O typecheck completo do Core é obrigatório na combinação, incluindo os consumidores da união ampliada.

```ts
type CacheSnapshot =
  | Readonly<{ mode: "owned"; credential: Info & Readonly<{ value: Cache }>; revision: string }>
  | Readonly<{ mode: "inherited"; credential: Info & Readonly<{ value: Cache }>; source: string }>
type CacheWrite = Readonly<{ updated: true; revision: string }> | Readonly<{ updated: false }>
cache.read(id): Effect<CacheSnapshot | undefined>
cache.compareAndSwap({id, revision, value: Cache}): Effect<CacheWrite, InheritedError | CacheError>
```

Read retorna undefined para ausente, tipo não-cache, ID inválido ou dados indecifráveis; nunca cria uma linha. IDs vazios/não-string ou maiores que 256 unidades UTF-16 são inválidos só nesta API; CAS com ID inválido retorna `{updated:false}` sem write, e IDs genéricos legados continuam sem esse limite. CacheError é TaggedErrorClass (`Credential.CacheError`) com somente credentialID/reason (`invalid`, `binding`) e mensagem fixa `Credential cache write rejected`, sem serialized/revision. Replacement inválido é `invalid`; mudar methodID/format/version da linha atual é `binding` (migração de produtor é outro fluxo explícito). Os writers genéricos create/update também validam valores cache e acrescentam CacheError ao canal de erro, antes de serializar, sem restringir os valores legados; no create o erro usa o ID interno emitido para a tentativa, nunca um ID/segredo escolhido pelo payload. Revisão inválida/velha, linha ausente/não-cache/indecifrável → `{updated:false}`, sem alteração. Uma linha herdada retorna snapshot inherited sem revisão gravável e qualquer tentativa CAS válida recebe InheritedError. Não renovar, migrar ou configurar o banco herdado.

Sucesso CAS cifra o novo valor com as primitivas existentes, preserva label/integration e retorna a revisão dos bytes realmente persistidos. Só um concorrente com a mesma revisão vence; o perdedor não apaga o vencedor. O predicado protege também contra escritores legados e outros processos; single-flight em memória não satisfaz a prova. Erro de biblioteca não é limpeza de cache: esta API não inicia refresh nem aplica erro antigo como write.

## Compatibilidade explícita nesta fatia

A nova família ainda **não registra um produtor OAuth-cache em Integration**. Até esse fluxo separado existir, o caminho Key/OAuth genérico não lista cache como conexão utilizável, não o envia a refresh OAuth, não lê serialized como API key/access token e não o usa para anunciar provider conectado. Resolver explicitamente esse credential ID no caminho genérico retorna indisponível, sem fallback por outro ID. Todos os consumidores Core de `Credential.Value` afetados pela nova união precisam recusar cache de forma estruturada antes de acesso remoto/secret projection; não satisfazer typecheck com casts, `any` ou campos OAuth falsos. A futura integração Fabric lê cache somente no boundary confiável da sua biblioteca.

Essa indisponibilidade explícita é limite da fatia de armazenamento, não substitute para o requisito de login real do módulo. Nenhuma release/ativação Fabric deve anunciar autenticação pronta com base nesses testes.

## Aceitação a escrever antes do código

- **CCW01–04:** novo wire/facade canônicos, fechamento/readonly/opcionais e limites próprios, versões/IDs tipados, OAuth/Key sem regressão; sem MSAL no Schema/Core.
- **CCS01:** roundtrip real no DB cifrado, revisão estável após reabrir, snapshot não cria dados; raw row não contém o texto sintético secreto.
- **CCS02:** CAS válido muda apenas o valor/revisão; retry/stale/cross-ID/legado não sobrescrevem; label e integração preservados; invalid/binding erros não expõem segredo.
- **CCS03:** dois clientes reais do mesmo SQLite competem pela revisão, um vencedor; reabrir preserva o vencedor. Remover o predicado cifrado deve também ser pego por negativo sequencial stale, sem depender de sorte no scheduler.
- **CCS04:** herança read-only, Key/OAuth, chave errada/tamper preservados, ausência não vira create; produtores genéricos não recebem cache como OAuth/token/conexão pronta.
- **CCS05–06:** corpus inválido nos três writers e controles vazios válidos; bounds próprios do ID da API de cache com UTF-16, sem estreitar Credential.ID genérico.
- **CCX01–04:** Integration real exclui cache de get/list/active/resolve sem refresh/fallback; MCP real-loopback recusa antes de HTTP com controles Key/OAuth; guard do serviço retorna authentication_required sem secret echo; Catalog real não anuncia modelo/provider conectado por cache, com controle Key.

Lead escreve suite RED e obtém duas críticas secas antes de dispatch. Separa storage/CAS de compatibilidade de consumidores; shared schema/interfaces pertencem ao lead. Gates são testes nomeados no GitHub, typecheck de pacote e guards; nenhum teste local, rede de tenant, nova cifra, alteração de gate ou inspeção de segredo real. A separação de namespaces/autoridade do Fabric continua na próxima integração, não é presumida por este armazenamento.

**Alcance da prova concorrente:** CCS03 observa dois clientes independentes e rejeição stale sequencial; não força toda intercalação entre processos. A revisão independente deve conferir o UPDATE real por ID **e bytes cifrados antigos** (literal SQL parameterizado para não recifrar o comparando no mapper), além da revisão retornada dos bytes do RETURNING. Pré-check com UPDATE incondicional, lock apenas em memória, troca para timestamp ou retorno de cifra não persistida são FIX-FIRST mesmo se um scheduler serializado produzir verde. Mutação do predicado deve ser medida; não afirmar qualificação multi-processo/driver antes da prova no respectivo ambiente.
