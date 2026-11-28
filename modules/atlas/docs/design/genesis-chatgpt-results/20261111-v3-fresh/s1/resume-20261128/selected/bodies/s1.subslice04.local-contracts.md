# L2 — mapa local de contratos públicos

`s1.subslice04.local-contracts` · `orchestra.s1` · fonte `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

Síntese dos dez L1 liberados como `CONTENT_PASS_LOCAL_API` na rodada 5: observações de fonte e intenção normativa identificada, sem prova de execução. “Now” e “unjudged” nos corpos antigos são históricos. B3 aceita 24 domínios/190 membros; especificidades retiradas permanecem `RETIRED_EXTRA_CLAIM`, sem resolução por fonte.

## Responsabilidade por fronteira

| Fronteira | Autoridade e ligação local |
| --- | --- |
| Valores/eventos | Schema define DTOs, codecs, identidades e inventários; também contém código delimitado, como ELF, matching de hooks e decoder Lean. Os efeitos dos serviços têm outros proprietários. |
| Transporte | Protocol declara grupos HttpApi, entradas/saídas, erros e tags de middleware. `makeDefaultApi` recebe as identidades de middleware de quem compõe a API. |
| Implementação/delegação | Server fornece handlers, middleware e serviços concretos; adapta pedidos e delega a Core/serviços nos caminhos observados. Guardas e mapeamentos valem onde demonstrados. |
| Projeção/browser | Client constrói `ClientApi` com tags locais e Schema/Protocol. A regra normativa proíbe imports runtime de Core/Server; a inspeção local não prova todo o grafo transitivo de um bundle. |
| SDK | SDK Next pode compor Client, Core e Server. Embedded adquire/descarta um web handler local e oferece métodos Client e registro de tools. |
| Geração | `packages/client` possui nomes, omissões e receita (`src/contract.ts`, `script/build.ts`); `tooling/httpapi-codegen` possui compilação, emissão e escrita. Gerados não são fonte de autoria. |

## Valores e ausência

O helper `optional` usa chave opcional e filtra `undefined` ao codificar. Ausência, `undefined`, `null` e valor fornecido exigem a semântica do campo, sem equivalência presumida. Ausência de `Step.Ended.usageKnown` significa desconhecido, não zero. Brands de caminho/ID não concedem acesso ou autoridade. `Prompt` canônico e `PromptInput.Prompt` têm contratos distintos.

Promise entrega valores wire codificados, como timestamps numéricos; Effect imported usa codecs autoritativos e valores decodificados, como DateTime. O gerador desembrulha apenas sucesso exatamente `{data: A}`; `{location, data}`, paginação/cursor e `hasMore` conservam envelopes. A interpretação depende do modelo de valor e da forma da resposta.

## Session, eventos e erros

`session.prompt` encaminha message ID, delivery e resume opcionais e retorna `SessionInput.Admitted`: admissão não comprova execução/completude do modelo. Conflito/bloqueio de prompt têm projeção 409 específica. O middleware resolve a localização armazenada da sessão. Mensagem ausente ou de outra sessão resulta em `MessageNotFoundError` no caminho observado. `active` descreve drains em primeiro plano deste processo; `history` pagina registros duráveis por sequência exclusiva com `hasMore`, sem snapshot entre páginas prometido.

Inventário público, inventário completo de Session e inventário durável são distintos. Deltas vivos não são fatos duráveis. `/api/event` é assinatura global ao vivo, adquirida antes de `server.connected`; o cache reutiliza JSON serializado, cada chamada cria novo frame e `Sse.encode` vem depois. Sem ID SSE de retomada ou reconnect automático no Client Promise, não se promete retomada global sem perdas. `/api/session/:sessionID/event` delega leitura durável por sequência exclusiva; não demonstra continuidade do feed global. Falha após estabelecer o stream não vira resposta JSON posterior.

Para erros declarados, seguir Protocol → mapeamento específico Server → projeção Client; não há regra universal de status/`ClientError` para todo defeito. Promise interpreta JSON de erros declarados sem validar todo o schema; Effect usa codecs e preserva erros tipados não relacionados. Leitura binária não herda automaticamente o tratamento de falhas do leitor JSON.

## Projeção, composição e geração

SSE Promise é iterável preguiçoso e cancela/libera o reader em `finally`. Na extensão manual de transferências, o chamador possui consumo/cancelamento do corpo; redirects são manuais. A declaração de upload correspondente não foi demonstrada no grupo/handler inspecionado. O README diverge da fonte que emite `files.read` binário.

Embedded não cria listener TCP, mas conserva serviços reais, possível I/O e autorização de capability; Basic é desabilitado nessa composição. SDK renova apenas a credencial padrão ainda correspondente no caso puro `authentication_required`, sem generalizar a outras falhas ou credenciais explícitas.

A autoridade normativa manda regenerar mudanças públicas pertinentes com `bun run generate` em `packages/client`, sem edição manual dos gerados. O compilador pode recusar schemas incompatíveis. Nada aqui demonstra geração, testes ou freshness. O gerado de 462.732 bytes permanece requerido; o limite de 256.000 bytes pertence ao observador antigo registrado.

## Navegação e limites

As chaves abaixo localizam o aprofundamento; as dependências de construção e seus hashes estão separadas em `metadata.json`.

- `s1.api.boundaries`: autoridade/imports; `s1.api.schema-contracts`: valores/eventos.
- `s1.api.session-contract`, `s1.api.server-edge`, `s1.api.stream-contract`: Session, adapters/erros e streams.
- `s1.api.client-projection`, `s1.api.codegen`, `s1.api.sdk-composition`: projeções, geração e composição.
- `s1.api.surface-disposition`: gerados/testes/suporte; `s1.subslice04.domains`: contratos dos 24 domínios e gaps.

Autorização de provedor, persistência/recuperação, exclusão entre hosts, efeitos externos exactly-once, convergência e comportamento real de browser exigem evidência própria. Nenhum predecessor Core não julgado foi usado. Conhecimento obrigatório ausente para novo claim exige complemento L1 e julgamento antes de promoção. Os gaps condicionais herdados permanecem abertos para seus dependentes; este L2 ainda é candidato a julgamento, sem aceite operacional ou publicação.
