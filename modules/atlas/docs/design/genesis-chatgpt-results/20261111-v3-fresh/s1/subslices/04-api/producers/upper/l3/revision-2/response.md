L3 revisão 2 pronto para o mesmo par de juízes. A revisão anterior está preservada integralmente em `revision-1/`: seis arquivos byte-identical, inclusive o corpo de 7.120 bytes, SHA-256 `b97dfa5c155e851d0360eb27c730996634d7b240797c373bc41a2122a2a4a101`.

- Corpo corrigido: [body.md](sandbox:/workspace/scratch/8833f71e3e94/s1-04-94f1e157-8c44-4e6e-a4af-7690a8845ecf/producer/upper/l3/body.md) — 9301 bytes UTF-8, SHA-256 `c140fb0bf9606079e91576b542ec82b3904583e7433a8fe297c886318649f478`.
- Metadata: [metadata.json](sandbox:/workspace/scratch/8833f71e3e94/s1-04-94f1e157-8c44-4e6e-a4af-7690a8845ecf/producer/upper/l3/metadata.json) — SHA-256 `fee948a5fd4b43af90c341b1e4c3e5e71b1c37009f6426bc5145a092eecd34e0`.
- Receita: [recipe.json](sandbox:/workspace/scratch/8833f71e3e94/s1-04-94f1e157-8c44-4e6e-a4af-7690a8845ecf/producer/upper/l3/recipe.json) — SHA-256 `a8bb4994c0661cc899e8956b5d633aba3d3739c1160599dac02a679811e5ffab`.
- Delta: [body.diff](sandbox:/workspace/scratch/8833f71e3e94/s1-04-94f1e157-8c44-4e6e-a4af-7690a8845ecf/producer/upper/l3/body.diff), [inserted-excerpts.md](sandbox:/workspace/scratch/8833f71e3e94/s1-04-94f1e157-8c44-4e6e-a4af-7690a8845ecf/producer/upper/l3/inserted-excerpts.md) e [delta-manifest.json](sandbox:/workspace/scratch/8833f71e3e94/s1-04-94f1e157-8c44-4e6e-a4af-7690a8845ecf/producer/upper/l3/delta-manifest.json).
- Registros: [request.txt](sandbox:/workspace/scratch/8833f71e3e94/s1-04-94f1e157-8c44-4e6e-a4af-7690a8845ecf/producer/upper/l3/request.txt), [response.md](sandbox:/workspace/scratch/8833f71e3e94/s1-04-94f1e157-8c44-4e6e-a4af-7690a8845ecf/producer/upper/l3/response.md) e [manifest.json](sandbox:/workspace/scratch/8833f71e3e94/s1-04-94f1e157-8c44-4e6e-a4af-7690a8845ecf/producer/upper/l3/manifest.json).

Foram apenas três inserções no corpo, sem remoção ou alteração do texto anterior: ciclos/consulta limitada, dois exemplos locais congelados de comparação e condição de leitura atual. Critérios, seis predecessores diretos e gaps herdados permanecem iguais. Os exemplos são normativos e hipotéticos; não registram execução nem mudança de validade dos predecessores. L4 continua aguardando dupla liberação.

## Corpo integral

```markdown
# L3 — impacto integrado de contratos e receitas

`s1.subslice04.integrated-impact` · `orchestra.s1` · fonte API `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

Este candidato compõe L2 aceito e cinco L1. Integra fronteiras API locais; não certifica o ciclo interno de Core. As regras de manutenção vêm da norma pública, sem execução do Atlas.

## Três relações diferentes

- **Input de fonte/receita:** arquivo, membership relevante, intenção normativa, configuração de geração ou contrato de validação que sustenta a construção. Adição, remoção e alteração de receita também entram no impacto. O grafo de imports do produto ajuda a localizar consumidores, mas não é o grafo de conhecimento.
- **Dependência de construção:** predecessor aceito cujo resultado foi usado para construir este artefato. Aqui são L2 e `s1.api.boundaries`, `s1.api.schema-contracts`, `s1.api.session-contract`, `s1.api.client-projection` e `s1.api.codegen`, com hashes exatos. L2 conserva sua própria cadeia; não se inventa uma dependência Core para preencher ausência de conhecimento aceito.
- **Navegação:** referência que orienta uma consulta ou handoff. Um link, inclusive para Core, não invalida automaticamente o artefato. Se o conteúdo consultado passar a sustentar um claim, declarar sua dependência e satisfazer o gate pertinente.

Dependências de construção devem ser acíclicas: rejeitar ciclos. A navegação pode conter ciclos, mas cada consulta deve ter limite definido de leituras/contexto e evitar revisitar artefatos já percorridos.

## Da mudança pública às fronteiras afetadas

| Mudança | Impacto local a examinar | Consequência para conhecimento e verificação |
| --- | --- | --- |
| Campo opcional de DTO/pedido | Schema possui o tipo compartilhado; Protocol possui a declaração HTTP. Em `session.prompt`, seguir `packages/protocol/src/groups/session.ts` → `packages/server/src/handlers/session.ts` e o serviço delegado. Client reflete `ClientApi`; SDK pode expor a chamada. | Revalidar semântica de ausência/valor, encaminhamento e projeções. `optional` filtra `undefined`; isso não determina sozinho defaults, `null` ou compatibilidade de registros antigos. Atualizar os L1 de valores, Session e projeção atingidos, depois seus dependentes. |
| Resposta, erro ou comportamento de handler | Conferir a declaração Protocol, o mapeamento específico Server e o tratamento Client. Para prompt, o conhecimento aceito demonstra `Admitted` e mapeamentos 409; não demonstra toda a execução. | Mudança observável pode exigir contrato e clientes novos; não deduzir status universal de erros Core. Revalidar apenas os adapters/contratos afetados e o conhecimento que depende deles. |
| Evento ou forma de stream | Schema possui envelope, identidades e inventários; Protocol/Server expõem o transporte; Client projeta wire/Effect. O feed global vivo e a leitura durável de Session têm papéis distintos. | Reexaminar classificação público/durável, codecs e consumidores. Persistência/migração exigem o owner correspondente; envelope ou SSE não provam durabilidade, continuidade global ou replay compatível. |
| Receita do Client ou gerador genérico | `packages/client/src/contract.ts` possui nomes/omissões; `packages/client/script/build.ts` compõe os produtos; `tooling/httpapi-codegen` possui compilação/emissão/escrita. | A receita é input mesmo com API e bytes gerados iguais. Revalidar geração, bindings e os L1 de geração/projeção afetados; preservar contratos independentes que continuem válidos. |

A mudança deve preservar Schema/Protocol separados dos serviços concretos. Importar Core/Server no runtime Client viola a autoridade de fronteira; essa composição pertence a Server/SDK. Inspeção de fonte não prova bundle/browser.

Promise entrega wire; Effect imported conserva codecs e valores decodificados. Conferir ambas as projeções: só `{data: A}` exato é desembrulhado. A norma exige regenerar mudanças públicas pertinentes de Protocol/Server HttpApi por `bun run generate` em `packages/client`, sem editar gerados manualmente. `check:generated` executa geração e diff; não foi executado aqui. Fonte de teste não é PASS; geração, freshness e compatibilidade executada continuam sem prova.

## Quando a mudança deve propagar

Pela norma pública (§3), fonte, receita/prompt/extrator e contrato de validação alterados tornam seus dependentes candidatos a revalidação/rebuild. A análise parte dos inputs e dependências declarados, não de todos os links ou de uma releitura geral. Uma checagem determinística pode resolver o delta sem nova interpretação; input e receita válidos e inalterados permitem reúso.

A comparação decisiva é a identidade canônica do **resultado validado visível ao consumidor**: corpo, autoridade, validade, gaps e identidades de evidência de que ele depende. Prosa idêntica com autoridade, validade ou gaps diferentes não interrompe propagação. Se esse resultado canônico permanecer igual após validação, a propagação pode parar; mudança apenas de recibo/versão de input atualiza os bindings auditáveis sem exigir interpretação downstream. Igualdade de SHA-256 do Markdown, isoladamente, não decide isso.

### Exemplos locais congelados de comparação

Os cenários abaixo fixam a aplicação da regra; não relatam alterações ou verificações executadas.

**EX-L3-01 — propagar (S1-04-M1).** Num candidato que acrescenta um campo público a `session.prompt`, falta a evidência obrigatória de encaminhamento pelo handler. A comparação fica congelada assim: corpo igual; autoridade API igual; validade `supported` → `blocked`; novo gap de encaminhamento; evidência pertinente antes vinculada e agora indisponível para sustentar o candidato. O resultado visível mudou apesar do Markdown igual. Propagar a revalidação aos dependentes de construção e manter os claims afetados em HOLD; links de navegação não ampliam esse conjunto.

**EX-L3-02 — parar (S1-04-M2).** Uma alteração de comentário na receita muda sua versão de input e o recibo da geração. Neste cenário, a revalidação sob o contrato atual confirma o contrato de `session.prompt` e compara todos os componentes do resultado: corpo igual; autoridade igual; validade `supported` preservada; gaps iguais; identidades de evidência pertinentes usadas pelo consumidor iguais. A versão da receita alterada pertence somente ao input/recibo deste caso, não à evidência visível do contrato. Confirmada a identidade canônica validada igual, atualizar recibos e bindings auditáveis e parar a interpretação downstream. Bytes gerados iguais, sozinhos, não autorizam essa decisão; se a receita integrar a evidência visível ou qualquer componente mudar, esta condição de parada deixa de valer.

Hashes deste pacote identificam transporte. O runtime competente calcula versões/CAS e registra recibos reais; não converter esses hashes em `OwnershipInput.version` ou inventar result/receipt. PASS de conteúdo não aprova automaticamente uma transformação/binding. Inputs indisponíveis ou impacto incompleto mantêm o dependente em HOLD; lista vazia não prova ausência de afetados. Reutilizar independente válido é a regra normativa, não prova de que isolamento/publicação já funcionam. Uma versão antiga aceita só pode ser atual se ainda compatível com os inputs/contratos atuais; caso contrário, é histórica.

Cada leitura apresentada como atual deve vincular as versões exatas dos artefatos a um manifesto aceito de escopo e de fechamento das dependências, válido para os inputs e contratos atuais. Sem esse vínculo, a leitura atual fica em HOLD. Uma consulta histórica deve ser identificada como histórica e não pode ser apresentada como atual apenas por ter sido aceita anteriormente.

## Handoff Core e consulta proporcional

A principal informou S1-01 em `genesis-s1-sessions`, head `45cf4cd48f2038dca56b859f763da2c28d862c12`, handoff `IN_PROGRESS`, sem pacote aceito. Esta é uma referência de coordenação, não fonte Core inspecionada nem dependência de construção aceita.

O owner Core precisa fornecer conhecimento aceito sobre identidade de retry (message ID, prompt, delivery), relação entre admissão/resume/promoção, persistência e recuperação, e consequências dos erros para registros/execução. Os casos históricos O1/O2 apoiam essas perguntas; não fecham as garantias. A evidência API já permite localizar declaração, encaminhamento e erro HTTP. Exclusão entre hosts, efeitos externos exactly-once e comportamento de runner continuam fora do que este mapa demonstra. A ausência do pacote Core bloqueia esses claims, sem bloquear o mapa integrado API delimitado.

Para uma mudança local, começar pelo L2 `s1.subslice04.local-contracts` e abrir só o L1 do assunto; a tabela indica quando cruzar a fronteira. Para detalhes de stream/SDK/domínio, usar a navegação de L2 e os gaps do domínio. Um conhecimento obrigatório faltante vira complemento inferior delimitado e julgado antes do claim dependente; não vira descoberta bruta automática. Os claims B3 retirados permanecem `RETIRED_EXTRA_CLAIM`. Não há declaração de publicação ou consumo real.
```

## Trechos inseridos exatos

### L3-02

```markdown
Dependências de construção devem ser acíclicas: rejeitar ciclos. A navegação pode conter ciclos, mas cada consulta deve ter limite definido de leituras/contexto e evitar revisitar artefatos já percorridos.
```

### L3-01

```markdown
### Exemplos locais congelados de comparação

Os cenários abaixo fixam a aplicação da regra; não relatam alterações ou verificações executadas.

**EX-L3-01 — propagar (S1-04-M1).** Num candidato que acrescenta um campo público a `session.prompt`, falta a evidência obrigatória de encaminhamento pelo handler. A comparação fica congelada assim: corpo igual; autoridade API igual; validade `supported` → `blocked`; novo gap de encaminhamento; evidência pertinente antes vinculada e agora indisponível para sustentar o candidato. O resultado visível mudou apesar do Markdown igual. Propagar a revalidação aos dependentes de construção e manter os claims afetados em HOLD; links de navegação não ampliam esse conjunto.

**EX-L3-02 — parar (S1-04-M2).** Uma alteração de comentário na receita muda sua versão de input e o recibo da geração. Neste cenário, a revalidação sob o contrato atual confirma o contrato de `session.prompt` e compara todos os componentes do resultado: corpo igual; autoridade igual; validade `supported` preservada; gaps iguais; identidades de evidência pertinentes usadas pelo consumidor iguais. A versão da receita alterada pertence somente ao input/recibo deste caso, não à evidência visível do contrato. Confirmada a identidade canônica validada igual, atualizar recibos e bindings auditáveis e parar a interpretação downstream. Bytes gerados iguais, sozinhos, não autorizam essa decisão; se a receita integrar a evidência visível ou qualquer componente mudar, esta condição de parada deixa de valer.
```

### L3-03

```markdown
Cada leitura apresentada como atual deve vincular as versões exatas dos artefatos a um manifesto aceito de escopo e de fechamento das dependências, válido para os inputs e contratos atuais. Sem esse vínculo, a leitura atual fica em HOLD. Uma consulta histórica deve ser identificada como histórica e não pode ser apresentada como atual apenas por ter sido aceita anteriormente.
```

