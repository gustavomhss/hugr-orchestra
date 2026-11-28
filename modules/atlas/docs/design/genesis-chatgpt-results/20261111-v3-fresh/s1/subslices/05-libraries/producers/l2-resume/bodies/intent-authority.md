# L2 — Da orientação documental à afirmação do produto

**Chave:** `s1.subslice05.intent-authority.l2` · **Need:** `maintenance` · **Scope:** `orchestra.s1`.
**Fonte do produto:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Propósito

Esta síntese orienta uma decisão recorrente: que evidência falta para transformar uma frase de guia, skill, plano ou schema em uma afirmação atual de comportamento? P1 e P2 classificam as intenções/documentos aceitos no alcance C. C1 e C2 são fornecedores Core já aceitos, usados aqui exclusivamente para decodificação e publicação de configuração. A autoria nova não reaprova nenhum predecessor e não encerra R2.

## Classificar a autoridade antes de agir

| Material consultado | Uso sustentado | Próximo passo para ampliar a afirmação |
| --- | --- | --- |
| Guia de usuário | Intenção operacional e vocabulário do produto | Encontrar o consumidor/implementação e seu aceite exato |
| Skill de manutenção | Instrução de mudança e ponteiros de ownership | Conferir o ramo implementado e as instruções vigentes |
| Plano histórico ou discussion draft | Decisão proposta em seu tempo/baseline | Comparar com exports, tipos e implementação atuais no pin |
| Schema gerado | Conteúdo do contrato publicado capturado | Conferir decoder, generator e consumidor relevantes |
| Código inspecionado e aceito | Mecanismo nos ramos e na profundidade declarados | Obter prova de execução para um resultado runtime |
| Fixture, teste ou script | Caso declarado, amostra ou procedimento | Registrar execução autorizada do caso e versão exatos |

Atualidade dos bytes, validade semântica e autoridade são perguntas separadas. Um hash identifica o texto consultado; não prova interpretação correta ou adoção. Um artefato aceito herda limites: não remove uma pendência runtime só por estar revisado. Da mesma forma, frase documental antiga não se torna ordem operacional deste produtor. [P1–P2]

## Os documentos C sustentam fronteiras concretas

Os treze guias atribuídos descrevem modelos/Claude mode, permissões, trust, credenciais, integrações, backups, hooks, plugins de comportamento, ferramentas e erros de config. Usar seu vocabulário evita confundir allow-once, regra persistida e auto-accept do cliente; conexão e visibilidade de catálogo; desconexão local e revogação upstream; draft, publicação e instalação. Esses contrastes são intenção documental em P1. Sem o fornecedor aceito correspondente, não certificam enforcement nem execução. [P1]

O guia `plugins.md` trata instruções de comportamento do modelo; o pacote de code plugins tem contratos próprios. O guia de backups recomenda o procedimento de restauração, enquanto o adapter SQLite genérico não prova a política Core. O guia de modelos distingue suporte de protocolo do model layer e rotas documentadas do session core. Assim, procure o dono da afirmação antes de traduzir a orientação em garantia de produto. [P1]

P2 separa quatro skills de manutenção, seis cards de fases e três specs de armazenamento/database. Os seis cards se referem ao baseline histórico `7181942eaa733b9cc3f4ff6aef79231d0d1c2f93`; paths absolutos e comandos antigos são dados de planejamento. A spec de remoção de database legado relata conclusão/supersessão sem fornecer um censo atual. O follow-up de integridade mantém trabalho de foreign keys adiado. As afirmações de que índices ou migrações foram entregues continuam documentais quando sua implementação não foi examinada no alcance. [P2]

README/manifest/bunfig/tsconfig estabelecem interfaces, dependências ou comandos declarados. Não demonstram instalação, build ou teste. `LLM/DESIGN.md` é proposta de API; o plano V2 de plugin não sobrepõe declarations atuais, que já incluem Promise e `reload`. Wire types congelados e schema gerado atual também permanecem contratos diferentes. X01 conserva essas separações. [P2]

## Caso resolvido apenas no vínculo específico: configuração

P1–P2 preservaram uma diferença de autoridade: `schema/config.json` declara `additionalProperties: false`, enquanto o guia diz que chaves extras são ignoradas. Essa divergência não autoriza concluir rejeição universal nem defeito runtime. Agora C1 e C2, ambos com estado `ACCEPTED_BY_SAME_NATIVE_PAIR`, fornecem um vínculo mais preciso, sem alterar os corpos antigos. [P1–P2, C1–C2]

C1/C2 descrevem `Config.Info` e o loader Location: JSONC aceita comentários/trailing commas e o decode usa explicitamente `onExcessProperty: "ignore"`. Há caminho ativo de schema/migração legado; após migrar, recupera permissões correntes do texto e decodifica o resultado atual. Um arquivo legível não vazio com erro de parse/schema falha; texto vazio pode não gerar documento, e a leitura segura pode devolver `undefined` para ausência ou acesso negado. Não generalize isso para toda superfície que aceita config. [C1–C2]

O schema publicado aponta a `Config.Info` e conserva objeto fechado. C2 identifica dois caminhos de fonte para publicação: `apps/cli/script/schema-files.ts` exporta `configSchemaText()`, normaliza o schema e restaura referências de modelos, e seu main escreve config/TUI/tema; `schema.ts` converte `Config.Info` diretamente, valida um argumento de saída e acrescenta newline. Igualdade, atualidade e regeneração desses outputs não foram executadas. Os scripts/schema ficam fora das 123 linhas de ownership daquele suplemento, e uma alteração gerada deve seguir o dono e o generator oficial. [C2, seção A/E06]

Portanto, a afirmação local sustentada é: **o decoder inspecionado ignora propriedades excedentes com opção explícita, enquanto o schema publicado capturado tem política fechada**. Isso não é um PASS de regeneração, de todos os consumidores ou de migração runtime. O vínculo atende à comparação específica de C-N05; o estado global de R2 e as pendências de execução/publicação continuam abertos.

## Sequência de manutenção e decisão

1. **Formule a afirmação e o domínio.** Pergunte se precisa explicar intenção, declarar comportamento de código ou provar resultado observado. Exemplos: orientar restore; afirmar como o decoder trata extras; garantir que restore funcionou. São necessidades diferentes.
2. **Consulte o artefato aceito mínimo.** Leia a síntese e o L1 relevante antes da fonte bruta. Confira key, corpo/hash, fornecedor, autoridade e gaps. Para configuração, use C1/C2 no vínculo acima; para host/Tools, Models/Runtime ou completions pendentes, conserve a afirmação dependente em HOLD.
3. **Abra só a lacuna necessária.** Uma claim além do ramo/depth aceito exige leitura adicional no mesmo pin e, quando pertinente, novo fornecedor aceito. Uma fixture metadata-only não pode ser usada por seu conteúdo antes dessa observação. Não invente ausência porque o observador recusou tamanho ou leitura.
4. **Mude a fonte do dono.** Planos, guias e skills têm impacto semântico próprio. Uma edição de guia ou receita pode invalidar esta síntese mesmo se o código não mudou; uma mudança de código pede revisão da orientação associada. Para gerados, siga o generator oficial e o dono; não edite output como atalho.
5. **Preserve dependências e incerteza.** Refaça apenas os artefatos afetados por fonte, autoridade, validade, receita ou membership. Dependência de build liga um predecessor usado na afirmação; navegação oferece consulta. Adicionar uma referência de consulta não exige reconstruir um ramo independente. Mudança de autoridade com prosa idêntica ainda requer novo binding/juízo pertinente.
6. **Obtenha a prova certa.** Uma síntese nova requer juízo próprio; importação/binding/publicação e consumo real exigem recibos Atlas separados. Propostas de impacto e contagens locais não são rebuild observado. Os casos M1–M3 do contrato continuam a exigir o runtime liberado real. Nenhuma dessas operações foi executada aqui.

## Abstenções operacionais que permanecem úteis

Não se pode garantir rejeição de toda chave extra a partir do schema gerado: o loader aceito tem política explícita diferente. Não se pode garantir restore Core porque um guia instrui o procedimento ou um adapter oferece transações. Uma consulta sobre streaming Node deve seguir a `s1.runtime.effect_sqlite.l1`; a presença de um pacote, manifesto ou guia não prova essa capacidade. Uma skill sobre credenciais ou governança oferece ponteiros de manutenção sem permitir assumir que autorização, chaves ou conexão foram verificadas nesta produção. [P1–P2, C1–C2]

N03 mantém ausentes os recibos de build, provider, migração, replay, CI e consumidor/runtime. N04 mantém review selecionado/estrutural onde declarado; N06 preserva 39 entradas metadata-only, sem conteúdo promovido a evidência. Os 323 paths C permanecem reconciliados por referência imutável, sem novos rótulos de profundidade. N01-host e as partes não aceitas de N02 continuam pendentes; este L2 não libera L3/L4 nem substitui decisões do par de juízes.

## Proveniência exata

P1–P2: `native-package.c-r1-v2.json`, commit `a8df22ae3a140c58c63f62ce2a634c84f415c943`, SHA-256 `6fb6ce93ba167d667f97e987032c9a3d4d8e293653848e2d924c992121ed2060`. Prefixo S1: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/`.

| Ref | Predecessor aceito | SHA-256 do corpo |
| --- | --- | --- |
| P1 | `s1.runtime.guides_intent.l1` | `22303bf38d880468d845ec54732c2138f293243058d8cf8f1c6b9152c2587488` |
| P2 | `s1.runtime.maintenance_intent.l1` | `98d6626bcf2ae923fb8a905cef874bc3e086a42a71abc129a2e9471c0864bcb8` |
| C1 | `s1.core.configuration` | `eed22f8ddd9f3fdad18b39cfb8e52ca5f412bad8b21de10fef58ce113ba60ab1` |
| C2 | `s1.subslice01.config-project-supplement` | `555549f9971e6b6d8c8edd4799841e3f54259c9289b399da0eeb84336a896b13` |

C1–C2: `subslices/01-sessions/native-package.json`, commit `9fd024a34e76d2e9328e1f793ef1f69fbf606e51`, SHA-256 `7541d67c8a4c3183429b9600ec6ea947a8b7035bbc6d0e83f7bb2d910b7fc030`. Seu índice aceito fixa os mesmos hashes. C2 foi lido na seção A para esta síntese; nenhum comportamento de projeto fora dela é incorporado. Os vínculos de fonte transitivos, contrato e recipe ficam explícitos em `fragment-metadata.json`.
