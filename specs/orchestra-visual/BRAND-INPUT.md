> Nota histórica de incorporação da marca. A publicação integral foi concluída posteriormente; consulte README.md, BRAND-INTEGRATION.md e PUBLICATION.json.

# HuGR fornecida — atualização de marca do plano 4.1

O usuário forneceu o logo HuGR e o arquivo HuGR-Brand-Kit-v1.0-Handoff (1).zip. A marca está aprovada: integrar arquivos existentes, não reconstruí-los. Este documento remoto é um índice; o contrato completo BRAND-INTEGRATION.md, BRAND-ASSETS.json, o kit íntegro e as ferramentas estão no pacote Orchestra_Codex_Execution_Plan_v4.1.zip entregue no chat.

## Autoridades e limites

- Layout/tema: reference/approved.png, 1672 × 941, SHA-256 e839b759e0f93beca37b10cd45700725020a840fee6e97da1e67556b2ffb128d. Permanece inalterado.
- Desenho da marca: SVGs e exportações oficiais do kit, imutáveis. O pequeno elo ilustrativo do mock deixa de ser a fonte a vetorizar.
- Orchestra continua sendo o nome do produto. Aplicação operacional: símbolo HuGR no bloco de marca e texto Orchestra separado. Não editar o wordmark HuGR nem criar lockup vetorial novo.
- Tokens e tipografia da Orchestra continuam em SPEC.md. Não importar globalmente os tokens do kit nem substituir a paleta grafite por azul/ciano saturado.
- A paisagem da sidebar continua sendo asset independente a preparar/verificar. Este kit não fecha essa entrega.

Kit recebido: SHA-256 9c75596e259593c7b6e2ac9818c6358f207f7e4f9129fec3b93dbf3042fdd115. Foram conferidos 304 arquivos, incluindo os 295 originais. O verificador do próprio kit passou. A imagem enviada tem pixels RGBA idênticos à referência raster incluída no kit, embora os hashes PNG sejam diferentes. Usar SVG/export oficial no produto, não o PNG de apresentação.

## Escolha e implementação

Dark: 07-web/brand/logos/hugr-symbol-inverse.svg. Light: hugr-symbol-primary.svg. Destinos propostos: packages/app/src/assets/orchestra/hugr/ com os mesmos basenames. Somente esses dois assets são obrigatórios para a primeira integração; demais cópias exigem consumidor existente mapeado.

Símbolo inicial de 32 CSS px; mínimo 24 px; para 16 px usar favicon existente. Respiro externo compacto >= 0,5x, x=diâmetro da cabeça azul. Não deformar, recortar, filtrar ou reexportar para caber. Atribuição corporativa horizontal compacta exige largura >=180px; não esmagar logo com assinatura na sidebar.

O exemplo HuGRLogo.tsx importa React; a Orchestra usa Solid. Criar wrapper fino app-local quando necessário, usando SVG externo por img e resolução de URL do build existente. Não instalar React, outro framework de UI, novo ThemeProvider ou imagem inline com IDs de gradiente compartilhados. Não hardcode /brand sem confirmar o base path.

head.html e site.webmanifest do kit são exemplos. Preservar nome Orchestra, appId/bundleId, start_url/scope apropriados, service worker, updater, deep links e preferências. Ícones PWA/Apple/macOS são condicionais ao produto real. Exportação de ICNS não comprova instalação nativa. Não publicar o kit completo em public nem usar templates sociais/impressos para preencher a migração.

Os arquivos da marca não podem ser otimizados/recoloridos/reexportados. Assets usados devem manter SHA-256; compressão HTTP que preserva bytes descomprimidos é permitida. Otimização da paisagem, quando necessária, não autoriza alterar os logos.

## Ownership e axiomas

S05/#148 foi atualizada: copiar marca oficial, adapter Solid local e paisagem separada. Mantém os cinco axiomas na subissue, WP e tasks. S06 aplica o bloco visual; S03 preserva tema; S08/S25 fazem packaging/head/entrypoints; S24 compara marca com kit e geometria com mock. Sem nova issue/task ou mudança de dependências.

O ownership preexistente de logo.tsx compartilhado é preservado apenas para integração opt-in necessária, sem mudar os defaults de outros consumidores. O wrapper local evita rebranding global. Toda escrita continua sujeita aos scopes e recibos do plano.

## Verificações

Na raiz do pacote 4.1:

```sh
python3 vendor/HuGR-Brand-Kit-v1.0/11-handoff/verify_handoff.py --json
python3 tools/verify_brand.py
python3 tools/validate_plan.py
python3 tools/render_maps.py --check
python3 tools/render_issues.py --check
```

Após copiar assets ao worktree, tools/verify_brand.py --repo /caminho/real confronta os destinos. Em seguida executar typecheck/build, verificar o recurso servido (não aceitar HTML com HTTP200 como SVG), dark/light, tamanhos, múltiplas instâncias, foco/semântica, custo e capturas do aplicativo real.

Nesta revisão passaram 151 testes das ferramentas: 133 existentes e 18 adicionais. São testes do contrato/arquivos e fixtures sintéticas, não do frontend. Master, budgets, DAG e progress.json foram preservados. Nenhuma task de produto foi marcada PASS; nenhuma implementação, render do aplicativo, benchmark ou instalação nativa foi executada. Os recursos oficiais ainda não foram instalados no repositório por esta passagem.

Somente esta nota, o bootstrap e a issue #148 foram atualizados remotamente. O ZIP é a entrega completa; não presumir sincronização integral dos 39 corpos ou aplicação de vínculos nativos.