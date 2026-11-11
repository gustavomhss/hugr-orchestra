# Entrega WP-L1-BOUNDARY

Unidade **S4:L1:host-boundaries** concluída para revisão independente, em português, com **11955 bytes UTF-8**. Estado proposto: `supported` para as afirmações estáticas delimitadas; não há aceite de juízes ou vinculação em runtime nesta entrega.

## Resultado substantivo

- **Session/Continuity:** o corpo acompanha admissão, exclusividade, governança, ferramentas, compactação e persistência exposta pela API. Distingue o caminho de modelo normal, engine hospedada e `generate`; a contribuição de Continuity é declarada, mas sua instalação global não foi demonstrada. O recall recebe a sessão do contexto, e arquivo/máscaras têm persistência própria, separada da exportação ao repositório.
- **RAG/Store/SQL:** o servidor reconstrói Store por Location e por requisição, relê fontes, executa a operação e regrava tabelas. A leitura de arquivo precede o gate de admissão. Foram registrados o desencontro entre `revisionId` e `questionId` nos traces, a inferência de reutilização de `rev_1`/`q_1` pelo contador reiniciado, a diferença entre arquivo indisponível e hash alterado e a busca sobre estado atual apesar de membros históricos persistidos. O adaptador não abre uma transação para todo o ciclo; isolamento externo permanece desconhecido.
- **Atlas host/boundary:** o adaptador in-processo importa `surface`/`mine` gerados e resolve modelos fora de Session. As origens declaradas separam rascunho de modelo, proposta e decisão; o ator declarado e o token de ratificação não demonstram autenticação HTTP. Dois passes de mineração envolvem chamadas assíncronas; paridade dos bundles e estabilidade do estado entre passes não foram estabelecidas.

## Arquivos e integridade

- `body.md`: SHA-256 `c282b8edc6383dc3af07ed43fbcb75318bde5b581868eefdf606f40e245f6ef6`.
- `request.md`: SHA-256 `222d944f611edfe9627164437d8c4909898bd20ce315173fea4e9129037cbbc7`; pedido literal preservado antes da produção.
- `source-provenance.json`: SHA-256 `2269506b716862099388f71b2598467474245dcb4070e65d51f2511951a311d0`; mapa de fontes, intervalos, razões, pins e capturas.
- `recipe.json`: SHA-256 `b6aa3e05d44ef6a5a824de7421eedd120010fadbf03390cb82e04d0fa4e2ba78`; método e referências de payload.
- `artifact.json`: metadados comuns com refs/input paths correspondentes, sem dependências de build. Seu hash final é registrado no recibo de integridade separado para evitar referência circular com esta resposta.

Todos ficam em `/workspace/scratch/aff930d22ec7/s4/producers/l1-boundary/`. O recibo de integridade deve conferir os bytes finais sem executar código de produto.

## Fontes efetivas e limites

São **31 fontes semânticas**: os **12 externos** de Session/runner/compaction, core package/Atlas/SQL, handlers Atlas/RAG/Store, protocolo HTTP e schema; mais **19 ligações do domínio** em Continuity v2, RAG e origens/gerador de Atlas boundary. Há ainda **6 fontes de instrução**: AGENTS e cinco contratos do protocolo. Cada uma está listada com commit, path, Git blob e SHA-256 em `source-provenance.json`; cada `source_refs.path` tem o `file:` correspondente no mesmo path.

Código: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Protocolo: `ee2521a5b966bd505cc95bd1c733e09e12f33531`. A materialização é explicitamente multi-pin, com `observed_head=null`. Não inclui o censo bruto, recibo gigante, dados `.atlas` ou bundles grandes como inputs. Os **2.220 caminhos atribuídos permanecem preservados e inalterados**; as 12 referências externas não ampliam essa população.

Permanecem desconhecidos a composição global, o interior do Store/projetor/History e suas garantias completas, middleware/autenticação HTTP, atomicidade global e paridade dos bundles. Essas lacunas impedem concluir integração operacional completa, sem invalidar as observações delimitadas. `semantic_review_refs=[]`, `runtime_receipt_refs=[]` e `build_dependencies=[]` são vazios reais. Nenhum teste local de produto, build, CI, chamada externa, Git remoto, oracle, alteração de produto ou nova delegação foi realizado.
