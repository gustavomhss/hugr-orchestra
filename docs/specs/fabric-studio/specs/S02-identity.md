# S02 — identidade, contexto e autoridade

**Estado:** proposta técnica; não congelada para implementação.  
**Requisitos proprietários:** FS-EXP-005; FS-AUT-001–015; FS-INT-004.

## 1. Responsabilidade e integrações

Aplica Q01/Q04/Q10/Q11/Q13 e [C01/C04/C07](./CONTRACTS.md). Domínio Fabric é product, instalado pelo Server; usa Credential/Integration/Database/Location/Permission existentes sem fingir que já são conector OAuth Fabric ou política multiusuário. Principal inicial é o operador da instância/perfil, não o nome Microsoft nem o username Basic de outro browser.

## 2. Contrato

### Contexto e sessão

`FabricContext` privado registra context ID/generation, storageID, principal, Location.Ref real, project ID observado, estado ativo/excluído e revisão de política. ID é emitido pelo servidor; request não escolhe storageID, dono ou path arbitrário. GET/list/reads/writes aplicam owner/store/context generation **além** dos guards Core. Fora de Git, diretório gerenciado por ID sob dados do perfil; Project.ID.global continua possível, sem ser ACL.

O bootstrap de S01 pode resolver contexto antes de haver SDK Location da UI. No request contextual seguinte, a Location informada pelo transporte deve coincidir com a resolvida no servidor; mismatch falha, não retargeta a sessão. `SessionFabricBinding(sessionID, contextID, contextGeneration, location)` é vínculo privado e imutável durante a sessão, criado no boundary confiável sob autoridade do operador. Agent tool verifica esse vínculo e a invocação real; possuir sessionID/contextID nos argumentos não concede acesso. Outra intenção de contexto requer outra sessão ou fluxo de vínculo explícito sem mover/adotar a sessão existente.

### Conexão e OAuth

Conexão referencia contexto, CredentialRef opaco, tenant/account ID Microsoft, perfil de nuvem, generation e superfícies consentidas. Recurso carrega ResourceRef de C01; nomes são labels. Credentials/token cache nunca entram em DTO de conexão, progresso, erro ou retorno de ferramenta.

Workspace Microsoft real pode ser recurso inventariado com resourceType `Workspace` e resourceID igual ao workspaceID; não é item falso de tenant nem autoriza endpoints genéricos. Observação/listagem raiz usa ObservationScope connection/workspace de C02, sem exigir recurso sintético. Rota aceita somente tipos e scopes do descriptor qualificado.

| Perfil | Registro e callback propostos |
| --- | --- |
| Desktop local | App público organizacional, browser do sistema, loopback permitido pelo registro; PKCE S256, sem client secret. Verifier/state ficam no backend local. |
| Web / desktop com servidor remoto | App web confidencial da instalação; callback HTTPS registrado nesse servidor/origem. Preferir certificado; nenhum segredo no renderer ou no desktop de quem acessa. |

Tentativa OAuth: attempt ID aleatório de uso único, contexto/principal/servidor, deployment profile, redirect permitido, state/nonce, PKCE verifier, requested surface/scopes e expiresAt. Prazo inicial dez minutos, a qualificar; terminal retido só por janela limitada de retorno. Callback compara todos os vínculos, valida issuer/audience/tenant e conta escolhida, consome state atomicamente e nunca ecoa authorization code em log. Negação ou troca de conta não sobrescrevem conexão existente. Redirect posterior, polling ou download só recebem credencial após validação do host/perfil e contexto.

Login inicial pode usar authority organizacional; depois tenant/account são pinados na conexão. Access token é obtido por audience/scope da capacidade escolhida, via aquisição silent MSAL ou consentimento incremental explícito. Readiness de conexão não autoriza operação específica. Não inferir permissão por autenticação nem emprestar token Storage a REST/SQL/Power BI.

### Extensão deliberada de credenciais

O recorte genérico posterior está definido em [CACHE-WAVE.md](./CACHE-WAVE.md): **cache opaco cifrado** com `type: cache`, `methodID` do produtor, `format`, `version` e `serialized`, sem campo livre de metadata, import MSAL em Core/Schema ou exposição em DTOs de conexão. O formato MSAL e sua validação interna vivem no módulo Fabric. Não usar refresh falso nem parsear internals para extrair token. Integration genérico exclui cache; uma futura integração de identidade deve consumir o cache explicitamente, sem mudar silenciosamente os produtores OAuth existentes.

Cache usa o lifecycle de credenciais/key recovery/herança existentes e CAS por **revisão opaca do ciphertext**, não timestamp/generation de conexão. Renovação coordena por credencial/conta, relê o snapshot, chama a biblioteca e só persiste se sua revisão continuar atual. Erro/retorno obsoleto não apaga cache novo. Cache por credencial pode conter tokens de múltiplas audiences para **a mesma conta vinculada**; requests/retornos são validados por audience. Herança de release é read-only: necessidade de refresh pede login próprio, sem renovar a credencial herdada. O comportamento real dos hooks e uma limitação de invalidação em erro estão registrados em [MSAL-QUALIFICATION.md](./MSAL-QUALIFICATION.md); conformidade e integração MSAL continuam abertas.

### Autorização de uso

`AccessGuard` do domínio resolve contexto/owner, valida geração e origem real, consulta política atual e deny floor aplicável, verifica vínculo conexão/recurso e capacidade, exposição e consentimentos; só então obtém token adequado. O permit é runtime, limitado ao uso, não serializável. Manual exige Authority do ServerOperator atual; agente exige contexto canônico da leaf com PermissionV2/capability policy aplicáveis. Aprovação S08 é mais uma condição, não alternativa às anteriores.

Alta restrição, revogação conhecida e contexto excluído revogam ativações e bloqueiam novos acessos; origem remota pode negar mais tarde, sem promessa de onisciência. Credencial inválida durante observação muda disponibilidade da observação, não estado do workload. Credencial de serviço e multiusuário são `unsupported` no primeiro perfil, não modo escondido de recuperar uma falha.

## 3. Estados e falhas

| Objeto | Estados / transições |
| --- | --- |
| Contexto | ativo → excluído (terminal); geração invalida refs; nomes não recriam ID antigo. |
| Tentativa OAuth | pending → exchanging → completed/denied/failed/expired/cancelled; somente uma conclusão. Queda ambígua no armazenamento pede reconciliação/recomeço explícito, não token em client. |
| Conexão | desconectada, consentimento pendente, conectada, reautenticação necessária, revogada; readiness por operação continua independente. |
| Cache | disponível, refresh em voo, herdado read-only, indecifrável, ausente. Indecifrável preserva bytes e exige recuperação, sem sobrescrever. |

Dados de outra conta, origem de callback diferente, SessionFabricBinding divergente, request com Location errada e cursor de outro contexto são negados antes de acesso. Política não depende de botão desabilitado. Tentativa de agente negada continua negada; ação manual nova não usa o mesmo permit/comando como recuperação automática.

## 4. Persistência e autoridade

Contexto, vínculos e metadados no DB Orchestra; cache só na extensão governada de Credential. Não adicionar banco ou arquivo refresh-token. Records sensíveis usam proteção S13/C07; chave indisponível não resulta em cache plaintext. Foreign keys de contexto não podem usar project global como dono. Vínculo de sessão não é FK que apague proveniência de comando por cascade; S09 guarda seu fato de autoria separado.

S02 também possui o registro de ambientes de C08: EnvironmentMapRef versionada, test/publish e classificação governada dos destinos. S06 resolve os pares e S08/S10 pinam mapa/revisão/IDs nos digests. Novo map revision ou retarget incrementa gerações/invalida o preflight, nunca muda destino de revisão aprovada. Manifesto/pacote pode sugerir alias, não atribuir sandbox/production nem importar essa configuração como grant.

Origem de rede e callbacks derivam de configuração do host confiável, não de arquivos/template. Dois browsers no mesmo servidor inicial são o mesmo operador, não dois humanos autenticados. É necessário perfil/instância separado para destinatário usar sua própria conta sem emprestar a do remetente.

## 5. Prova e bloqueios

| ID | Caso futuro / assert | Contraprova |
| --- | --- | --- |
| FS-EXP-005 | `context.no-git`: salvar/retomar em dois contextos não-Git e mesmo project global. | Nenhum dado, rascunho ou grant cruza o context ID. |
| FS-AUT-001 | `oauth.identity`: conta/tenant reais exibidos após callback válido. | Login não anuncia todas as superfícies prontas. |
| FS-AUT-002 | `token.audience`: quatro superfícies obtêm material apropriado separadamente. | Token/contexto trocado é recusado. |
| FS-AUT-003 | `oauth.once`: duas conclusões concorrentes da mesma tentativa produzem uma conclusão. | State, origin, Location ou conta divergente não vinculam conexão errada. |
| FS-AUT-004 | `access.intersection`: cada condição aplicável pode negar. | Remover guard/deny precisa fazer o negativo falhar. |
| FS-AUT-005 | `import.no-grant`: mesmo manifesto tem direitos distintos por contexto real. | Campos de política ou ambiente não elevam acesso. |
| FS-AUT-006 | `origin.attribution`: recibos registram origens reais sem contexto fabricado. | Manual não cria mensagem/tool part falsa. |
| FS-AUT-007 | `deny.no-reroute`: aprovação humana não reenvia tool negada como operador. | Nova ação manual tem autorização e atribuição independentes. |
| FS-AUT-008 | Perfil inicial rejeita SP/MI; extensão futura requer teste de direitos combinados. | Import não empresta SP mais privilegiado. |
| FS-AUT-009 | `access.revoke`: epoch/revogação conhecida invalida acesso/cache/ativação. | Histórico não vira grant eterno. |
| FS-AUT-010 | `risk.confirm`: efeito high-risk exige fluxo forte confiável e política. | Toggle global não o remove; bloqueio Q07 prevalece. |
| FS-AUT-011 | `credential.recovery`: erro de chave preserva bytes; herança não é atualizada. | Nenhum segredo em DTO/modelo/log ou fallback plaintext. |
| FS-AUT-012 | `network.context`: redirects/poll/artifact host validado por perfil. | URL hostil não recebe bearer. |
| FS-AUT-013 | `placement.context`: request direto com mesmo project e Location/contexto incompatíveis falha. | workspace Fabric não preenche Location.workspaceID. |
| FS-AUT-014 | Perfil single-operator não declara multiusuário; futura extensão deve provar principal/request/store. | Nome Basic/Microsoft não inventa outro principal Server. |
| FS-AUT-015 | `cache.concurrent`: refresh válido sobrevive a retorno/erro obsoleto e restart. | Single-flight só em memória não prova CAS persistente. |
| FS-INT-004 | `reuse.boundary`: adapter usa contratos reais; extensão de cache é explícita. | OAuth atual/cache e job store/poll não são declarados equivalentes. |

Bloqueios de freeze: DTOs/serviços da extensão cache e seu alcance sobre Integration precisam ser compiláveis e revisados sem regressão dos produtores atuais; provas de ContextGuard/SessionFabricBinding e CAS; contrato de callback/perfis e proteção S13. Bloqueios de ativação: registros/client IDs/certificados/consentimentos/tenant reais e conformidade MSAL/Bun. Nenhuma dessas provas foi executada.

### Mapa histórico de integração — anterior à onda Cache

Leitura estática pelo lead em 2026-11-05 **antes da materialização de CACHE-WAVE**, sem abrir banco, chave ou credencial do operador. Os dois primeiros itens documentam o baseline, não a interface atual do candidato em qualificação:

- `packages/schema/src/credential.ts` define `Value` como união OAuth/Key; OAuth exige refresh/access/expires. A extensão cache proposta acima não deve reutilizar esses campos com valores fictícios nem alterar silenciosamente o produtor OAuth existente.
- `packages/core/src/credential.ts`, `Interface` e `layerFrom`, fornece criação/leitura/update/remove; o update atual recebe ID e alterações, não uma generation esperada. `sealLegacy` usa `time_updated` no seu próprio predicado de migração: isso não é uma API CAS de refresh disponível ao domínio Fabric.
- `packages/core/src/credential/sql.ts` serializa o valor e aplica `CredentialCipher` no mapper; valor indecifrável vira null e o serviço registra/preserva a linha. A coluna não equivale à cifragem de todos os records Studio.
- `packages/core/src/credential/cipher.ts` expõe seal/open de texto com AES-GCM e lifecycle da chave. O envelope `enc:v1` tem IV/tag/ciphertext; o contexto C07 não é argumento dessas funções. A proteção Studio deve autenticar e comparar seu contexto interno conforme C07, reutilizando primitivas/lifecycle em vez de anunciar essa API como isolamento contextual já comprovado.
- A leitura herdada `readRelease` permanece read-only; `InheritedError` protege atualizações/remoções. Um futuro plugin de cache/MSAL precisa manter essa distinção e não renovar uma credencial herdada.

Esses são pontos de composição para o próximo trabalho de identidade/proteção. Não são novo contrato público, auditoria de segurança completa ou autorização para usar uma conta instalada. A extensão deve vir com aceitação concorrente/recuperação e revisão independente antes de qualquer login Fabric.
