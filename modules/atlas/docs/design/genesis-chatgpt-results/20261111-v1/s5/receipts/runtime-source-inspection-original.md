# Preparação runtime S5 — reader real em Node

Fonte: `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`.
Inspeção estática pelo conector GitHub; sem handoff/envelope S1. **Nenhum build, instalação, teste, receita, reader ou consumidor foi executado.** Houve inferência nativa de preparação; nenhuma chamada externa de modelo, produção ou julgamento.

## Conclusão operacional

**Bun ausente bloqueia executar o wrapper `ownership-pilot.ts` intacto, mas não demonstra indisponibilidade da API de leitura.** Há rota Node já prevista pelo código: pacote ESM compilado `@atlas/adapter-io` → export público `composeRuntime` → `runtime.ownership.index/read`. Falta materializar toolchain/dependências/outputs compilados e, separadamente, o repo/store governado correto. Esta rota não foi executada aqui.

A receita usa `Bun.argv` e `import.meta.path` (L1–2,26–41,56,119,154–157). Não é um arquivo Node diretamente executável sem adaptação. O build normal de Atlas usa `tsc -b`, `module/moduleResolution: NodeNext`, ESM e engines Node >=20. O entrypoint CLI tem shebang Node. Não há loader source-TS ou remapeamento dos imports `.js` configurado nesses manifests para substituir o build.

Fontes: `modules/atlas/package.json` L6–15,32–43; `tsconfig.base.json` L3–11; `packages/adapter-io/package.json` L5–12,29–32; `packages/adapter-io/src/index.ts` L259–260; `packages/cli/src/bin.ts` L1–18.

## Bundle versionado: existe, mas não oferece o atalho procurado

- `boundary/src/generated/surface.js`, blob **`5d0e2cf23486ff6d12e1d828dee8aaf647ac33be`**, contém `composeRuntime` internamente, porém seu único export ESM é **`openSurface`**. `AtlasSurface` não expõe `ownership.index/read`; seu `own` é a API RETR-12 diferente.
- `boundary/package.json` L23–26 publica esse surface; L50–52 exige `web-tree-sitter@0.23.2`. O build mira Node/ESM e deixa esse parser externo (`boundary/script/build.ts` L30–40).
- Há diferença concreta entre código embutido e source atual: o bundle contém `ownership-membership` **version 1**, enquanto `ownership-input.ts` L141 usa **version 2** e observação tri-state. Não é um substituto demonstrado do oracle atual.
- A árvore completa de `modules/atlas/packages` no pin contém **zero paths dist/** versionados. O pacote compilado precisa vir de um build/materialização apropriado; não existe nesse inventário um dist pronto para buscar.
- Não propus expor funções internas, editar o bundle, substituir oracle ou executar `openSurface().own` como se fosse o reader solicitado.

Referências adicionais: `surface.d.ts` L533–557; árvore packages **`4e916493ad3bf1dcf147b9e76ad557ba987d8636`** e árvore boundary **`634269803bcbc367f09f19a620e46df300e53ef8`**, respostas completas sem truncamento registradas no inventário.

## Bootstrap mínimo concreto, somente plano

Há duas raízes distintas: **instalação do código Atlas** no source pin e **repo isolado consultado** com inputs/publicação a conferir. Não usar o checkout de código como corpus por conveniência.

1. Materializar o workspace de código e dependências já previstas, mantendo o pin. O caminho normal é o workspace `modules/atlas` com seu `package-lock.json` e postinstall `scripts/fix-scip-types.mjs`; o shim já existente corrige exports/types do pacote SCIP, não o leitor.
2. Usar outputs ESM de `tsc -b`. Uma futura invocação Node do compilador instalado pode selecionar `packages/adapter-io`; o grafo de references contém 11 pacotes. O build raiz já declarado seleciona 15. Nenhum desses comandos foi invocado.
3. No host ESM futuro, importar a **API pública real**, sem alterar a receita Bun:

```js
// Exemplo de ligação NÃO EXECUTADO; variáveis de envelope ainda não fornecidas.
import { composeRuntime } from "@atlas/adapter-io";

const runtime = composeRuntime(isolatedRepo);
const index = runtime.ownership.index(scopeFromS1, needFromS1);
const read = runtime.ownership.read({
  scope: scopeFromS1,
  need: needFromS1, // ou key; exatamente um dos dois
  maxBytes: maxBytesFromS1
});
```

O exemplo não fixa uma quota nem constitui autorização. A API é construída em `compose.ts` L271–282,491–505; os métodos reais estão em `ownership-access.ts` L40–49. `wire.ts` L393–498 não publica uma tool `ownership`; o CLI bin tampouco passa essa propriedade em seu deps. Não inventar um comando `atlas ownership`.

O wrapper histórico chama `composeRuntime` diretamente, sem `initAst()`. O CLI padrão aquece AST antes de compor (`cli/src/bin.ts` L12–18). Para paridade com o wrapper, o exemplo mantém a mesma entrada fria. Se outro contrato requerer a preparação completa de AST, o export `initAst` existe e demanda os WASM de grammar (`ast.ts` L19–49); registrar essa escolha no envelope.

### Inventário de materialização

| Rota de código | Pacotes locais | Blobs nos diretórios completos desses pacotes |
| --- | ---: | ---: |
| Build raiz já declarado | 15 | 1025 |
| Fechamento de references de adapter-io | 11 | 773 |

Os 11 são adapter-io, contracts, kernel, index, grounding, knowledge, persist, retrieval, genesis, memory e tools. Somar os cinco companions raiz: `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.base.json` e `scripts/fix-scip-types.mjs`. Assim, a materialização conservadora do build raiz representa **1030 arquivos versionados**, sem contar tarballs externos, corpus ou store do host.

Essas são contagens exatas de diretórios completos, **não prova do menor conjunto possível de imports**. Muitos tsconfigs incluem `test`; materializar/compilar esses arquivos não autoriza executar testes. Não prometo que recortar o workspace para 11 diretórios mantenha o `npm ci` original: o lock completo deve ser respeitado.

O lock v3 tem 175 registros externos em node_modules, incluindo opcionais/plataformas; não são 175 downloads obrigatórios no host. As bases do runtime são SCIP 0.1.0, protobuf 2.12.1, noble/hashes 1.8.0, web-tree-sitter 0.23.2 e tree-sitter-typescript 0.23.2. O compilador fixado é TypeScript 5.9.3; o build também tem tipos e libs usados pelos arquivos de teste. Há um registro extraneous antigo de wire no lock, sem diretório presente: ele não aumenta os 15 pacotes reais. Disponibilidade local, cache, pacote npm e instalação não foram verificados.

## Query e resposta reais

`OwnershipNeed`: entry, ownership, maintenance, operational, flow, evidence ou component. `index(scope, need)` recebe dois argumentos. `read` recebe `{ scope, need? | key?, section?, maxBytes, historical?: true }`; exige exatamente um de need/key e maxBytes inteiro seguro >0.

- Index: `kind:"index"`, hashes manifest/artifact/result/receipt, key/scope/title/layer/need, sections, navigation, dependencies, bodyBytes, `bodiesReturned:false`, `bodyBytesVerified:true`, checked.
- Read: `kind:"ready"`, os mesmos bindings, body, knowledge {authority, validity, gaps, evidence}, historical e checked.
- Recusa: `{kind:"hold", reason, evidence}`; inclui unpublished/untrusted/store-unavailable/ambiguous/carrier e falhas de integridade, inputs, revisão, dependências, seleção, seção ou limite.

O index verifica corpos/closure internamente; `bodiesReturned:false` não significa zero bytes lidos no servidor. maxBytes limita o corpo retornado selecionado, não todo o trabalho da closure. `section` seleciona um H2 exato e único. `historical:true` pula currentness dos inputs e marca a resposta; não usá-lo para contornar um HOLD corrente.

Fontes: `knowledge/src/ownership/types.ts` L3,80–152; `ownership/read.ts` L23–28,50–72,75–129,153–179.

## Requisitos Git, inputs e trust

- É necessário **store realmente publicado**: projeção governada contém exatamente um carrier ownership ativo para o scope. CAS ou documentos de pesquisa sozinhos não publicam nada. A seleção atravessa `buildReadAccess` e `prepareClaimReceipts`, sem injetar um access cru (`ownership-access.ts` L13–36).
- Git deve representar o repo isolado real, com HEAD e membership corretos. O oracle consulta `git ls-files --cached --others --exclude-standard -z`, verifica arquivos regulares/paths e observa bytes de `file:` até 256000; `members:` usa o conjunto efetivo e id v2. Copiar só os onze arquivos do pack não prova membership do diretório. Os inputs incluem, conforme a receita, a cópia exata de `ownership-pilot-recipe.ts`, fontes e metadados históricos (`ownership-input.ts` L31–43,99–142,143–182; receita L45–59,81–97).
- O trust distingue trusted, tracked-staging (recusa) e tracked-provable (filtragem por reproof). Não colocar CAS/projection/staging no índice Git para fabricar um reader. Não usar ausência de Git como atalho: a função tem fallback trusted documentado, mas membership e proveniência ficariam sem a demonstração requerida (`store-provenance.ts` L94–157; `read-access.ts` L169–205).
- A closure exige integridade CAS, mesmo scope, supported, inputs atuais, dependencies exatas e pelo menos duas reviews de identidades distintas com bindings e critérios corretos. Identidades são strings estruturais; não são autenticação (`ownership/shape.ts` L50–58; `ownership/read.ts` L36–98).
- **Construir o runtime pode escrever no sandbox:** `compose.ts` L260–262 executa replayKnowledge no ramo trusted; o replay pode restaurar CAS, commitar projection e staging (`knowledge-replay.ts` L41–78,81–87). Usar cópia isolada com recibos; não presumir que compor para read é uma operação sem efeitos.
- Policy/actor/token são carregados na composição, mas leitura direta não exige conceder novos poderes de publicação. Não adquirir credenciais nem criar policy para tornar a consulta aceitável. A receita publish exige duas novas aprovações exatas runtime-import-binding e passa por check/emit (`ownership-pilot.ts` L117–151); pesquisa aceita não substitui isso.
- Restaurar um snapshot governado existente exige sua proveniência, CAS/projeção completos e inputs correspondentes; reconstruir/publicar de novo é outra ação. Um artefato com recibos da membership v1 pode recusar perante o oracle v2. Não se presume currentness por copiar arquivos ou usar o source pin.

## Pendências concretas

Faltam envelope S1 de scope/need/bytes, runtime compilado/dependências materializados e a identificação do repo/store governado e seus bindings atuais. Isso é **capacidade ainda não materializada/verificada**, não ausência de implementação nem impossibilidade causada por Bun.

Fontes completas, blobs e URLs: `source-manifest.json` e `sources/`. Árvores, contagens, dependências e inspeção do bundle: `tree-and-build-inventory.json`. O relatório histórico original permanece intacto; a correção sobre inferência nativa foi registrada separadamente em `preparation-history/preparation-history-model-call-erratum.md`.
