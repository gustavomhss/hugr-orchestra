# Pacote portátil — preparação da fatia pura

**Estado:** preparação de aceitação, não implementação nem qualificação de T21/J07. Requisitos proprietários continuam FS-TPL-005 e FS-HIS-004/008; C08 e S12 definem a obrigação. UI/preview, consentimento, autenticação/rebind, persistência, export/download autorizados e template update ficam fora deste codec, não fora da entrega do módulo.

## Decisões do lead para o wire

O envelope único será `FabricWorkspace.Package`, sem ID/grant próprio e reutilizando `FabricWorkspace.Document` por identidade:

```ts
{
  format: "fabric-studio.workspace-package",
  version: 1,
  workspace: FabricWorkspace.Document,
  origin?: { templateID: string, templateRevision: string },
  requiredVersions: {
    workspaceVersion: 1,
    components: FabricWorkspace.Component[],
    capabilities: FabricCapability.Ref[]
  },
  resourceHints?: {
    alias: string, resourceType: string,
    tenantID?: string, workspaceID?: string, resourceID?: string
  }[],
  exclusions: {
    credentials: true, authority: true, activations: true, results: true,
    approvals: true, "remote-data": true, environment: true
  }
}
```

Objetos fechados; strings obrigatórias não vazias; readonly e opcionais omitidos no encode. Hints têm no máximo 64 entradas. Cada lista de revisões tem no máximo 24 referências; semântica exige conjunto exato/sem duplicatas das revisões usadas pelo documento. Hints só podem usar alias declarado, uma vez por alias; IDs são sugestões opacas, nunca destinos resolvidos. Seus schemas de tipo/IDs reutilizam os campos de FabricResource.Ref, sem impor que todo tipo de recurso seja UUID. Nenhum connection/context/principal/storage/path de autoridade ou classificação de ambiente é aceito.

`origin` preserva uma alegação de origem, não assinatura, prova de autoria ou permissão. A camada de templates ainda precisa resolver a base confiável antes de usar O/L/U. Exclusions descreve categorias ausentes; não promete que uma string de título escolhida pelo usuário não contenha informação sensível. Preview/seleção/política de compartilhamento continuam obrigatórios fora do codec.

## Motor limitado compartilhado, sem elevar o workspace

O envelope admite 524.288 bytes UTF-8 no input e JSON codificado. O documento interno continua em 262.144 bytes/profundidade 16. O envelope precisa de profundidade 17 para conter um documento válido de 16, não para ampliar sua profundidade interna.

A extração futura para `src/json.ts` deve preservar o algoritmo revisado e todos os controles existentes. Namespace privado ao pacote `BoundedJson`, não exportado pelo manifest. Assinaturas internas decididas:

```ts
BoundedJson.admit(value: unknown, profile: "workspace" | "package", limits?: Partial<Limits>): Admission
BoundedJson.parse(text: string, format: "json" | "yaml", profile: "workspace" | "package", limits?: Partial<Limits>): Admission
```

O perfil é escolhido por código confiável, nunca por campo do documento. Os `parse/admit` públicos atuais continuam com assinaturas e perfil workspace fixos, inclusive clamp em 256 KiB/16. O codec usa perfil package fixo e chama o compilador existente sobre o workspace interno. Limites menores prevalecem; nenhum override eleva o teto de qualquer perfil. Não duplicar parser, contador UTF-8 ou tratamento de getters/paths.

## Codec puro a congelar após crítica da suite

```ts
encode(input: unknown, catalog: Catalog, limits?: Partial<Limits>): PackageResult
decode(text: string, catalog: Catalog, limits?: Partial<Limits>): PackageResult
```

Encode aceita somente `{workspace, origin?, resourceHints?}`; deriva format/version, requiredVersions e exclusions, em vez de confiar nesses campos fornecidos. Decode aceita JSON estrito do envelope inteiro. Sucesso será `{ok: true, package: FabricWorkspace.Package, text: string, normalizations: Normalization[]}`; falha reutiliza Diagnostic, sem pacote/texto parcial. `text` é JSON canônico do pacote efetivo. Não há filesystem, rede, executor, token, store, grant ou nova consulta.

Ambas as entradas passam por admissão limitada antes de acessar propriedades/schema; o workspace é compilado pelo único compilador atual. Encode deriva listas únicas de revisões em ordem lexical por id/revision. Decode exige igualdade exata dos conjuntos e não ignora campos/revisões extras. Nenhum dos dois instala componente/capacidade ou resolve hint automaticamente.

Normalizações do compilador são rebased para `/workspace/...`. Futuro package version e futuro workspace/layout version têm `incompatible-version` no nível correto; objetos malformados têm `invalid-input`. Validade não depende de readiness e não transporta labels de disponibilidade. A saída inteira é readmitida sob o perfil package antes de serializar dados já admitidos; excesso falha, sem truncar. Preservar conteúdo escolhido e input original.

Neste codec, “canônico” significa serialização compacta determinística (`JSON.stringify`), **não JCS, digest ou assinatura**. Ambos os caminhos constroem envelope na ordem `format`, `version`, `workspace`, `origin` quando presente, `requiredVersions`, `resourceHints` quando presente, `exclusions`. Origin ordena templateID/templateRevision; requiredVersions ordena workspaceVersion/components/capabilities e refs id/revision; exclusions usa a ordem do bloco acima. Decode aceita qualquer ordem dos conjuntos exatos e os ordena como encode, com comparação lexical de strings por unidades UTF-16 (sem locale). Hints mantêm a ordem da lista e projetam alias/resourceType/tenantID/workspaceID/resourceID. O workspace efetivo preserva ordem de ferramentas/bindings e os membros de conteúdo fornecidos; **não** se promete igualdade de bytes para documentos internos com ordem distinta de chaves JSON. Ordem de membros do envelope/metadata não altera o texto de saída. Identidade canônica dos schemas de campos opcionais de hints é também item de revisão estática, sem duplicar os contratos de FabricResource.

## Preparação/ordem

1. Lead escreve PKW01–04 (wire) e PKG01–04 (codec/perfis), captura RED real e pede crítica independente até duas rodadas secas.
2. Lead materializa wire/contratos/manifests/fixtures compartilhados e stubs compiláveis, sem dizer que o codec está pronto.
3. Workers disjuntos: extração do motor (`json.ts`, `parse.ts`) e codec (`package.ts`). Lead mantém Schema/contratos/índices e merge order motor→codec. Nenhum live decision no packet.
4. Gates: todos os PAR/CMP/ADV/SEAM anteriores, novos PKW/PKG, typechecks, boundaries/guards e mutações isoladas dos tetos/manifesto. Testes só via `test:ci`; publicar/atualizar a referência da branch no remoto escolhido antes dos uploads. Não disparar CIs concorrentes neste repo.

Provar este formato não comprova exportação segura entre operadores, contexto autorizado, UI impecável ou os dezoito templates. Esses gates permanecem explícitos em DELIVERY e S12/S14.
