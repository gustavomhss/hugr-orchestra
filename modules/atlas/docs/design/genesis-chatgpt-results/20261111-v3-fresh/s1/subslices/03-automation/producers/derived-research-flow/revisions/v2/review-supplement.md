# RF-J2-F01 — suplemento literal para reavaliação L2 v2

## Identidade e alcance

Artefato `s1.subslice03.research-flow`, somente L2. O achado público RF-J2-F01 pediu restaurar a condição de início do build em F3 e separar estado devolvido de novo trabalho iniciado. O produtor aplicou uma substituição de frase e uma atualização da linha correspondente de E1. Nenhuma outra passagem do body ou evidence mudou.

Predecessor semântico inalterado: `s1.core.research`, 63.841 bytes, SHA-256 `f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f`. A condição explícita é preservada conforme a qualificação pública RF-J2-F01, ligada ao mecanismo de R8.1. Não foi aberto raw source nem parecer integral.

## Antes e depois exatos

### body.md

Versão v1 preservada: `a4b50fa9ae0b781dbea831aefcb98cb099f93167d4a7a584dc88878fc93bc044`, 16980 bytes. Versão v2: `f6dce8d080ff5bdd3a5409bd16b846c176c8270135eb51a6cd0329413e3d0994`, 17113 bytes. Offset inicial UTF-8 zero-based: 6695; linha: 48.

**ANTES**

```text
Sem shard aberto, dispara build detached e responde building/unavailable com motivo.
```

**DEPOIS**

```text
Sem shard aberto, só inicia build detached se houver extrator, construção necessária e nenhum build em curso; a resposta building/unavailable com motivo não comprova, por si, que a consulta iniciou novo trabalho.
```

SHA-256 do literal ANTES: `693d5046f90042f2647f15a011dfc91b3d3e8a6b43ca5ee83020db4cee8fe4a0`. SHA-256 do literal DEPOIS: `0507146c6d769086763227bb6adbc254f498abb56417ddd9363c347351026168`. Prefixo e sufixo restantes foram comprovados byte-idênticos.

### evidence.md

Versão v1 preservada: `8e2b11c446ef73d166c98f7d852d5ca674a0a056779351e393a2d8b832cbf365`, 11305 bytes. Versão v2: `b7d51d3bab6f9d8538d6b6362953647eedfbc5fad905c69b5d3fd38b0ea75022`, 11457 bytes. Offset inicial UTF-8 zero-based: 4283; linha: 27.

**ANTES**

```text
| F3, query/stale/dirty | building/unavailable, retido stale, basis do plano atual, overlay limitado, candidates e limites de cobertura | R8.1 Query: vazio, stale e dirty | Observação; ausência de hit não prova ausência de uso |
```

**DEPOIS**

```text
| F3, query/stale/dirty | Build condicionado a extrator presente, construção necessária e nenhum build em curso; building/unavailable não comprova novo disparo; retido stale, basis do plano atual, overlay limitado, candidates e limites de cobertura | R8.1 Query: vazio, stale e dirty; qualificação pública RF-J2-F01 | Observação; ausência de hit não prova ausência de uso |
```

SHA-256 do literal ANTES: `81be80ecac76fcb5361adf8089a69fa77a7a1e2aaf5f9fa07f7c8b5ab491eb10`. SHA-256 do literal DEPOIS: `6ffb41d3f19349d369ae2c1ad697272561eefbc60b050bd49c1976341d8495e7`. Prefixo e sufixo restantes foram comprovados byte-idênticos.

## Disposição dos registros históricos

Os quatro outputs anteriores foram preservados byte a byte em `history/v1/` antes da mudança. A seção E3 do evidence foi mantida literalmente, por ser registro da produção v1: seus números 16.980 bytes/17 inputs e as verificações daquela etapa permanecem históricos. As identidades atuais e os 28 inputs cumulativos de v2 estão no manifesto atual e em `input-manifest-extension.json`; não se apresentam os números antigos como medição de v2.

## Verificação e gate

O script real `apply.py` e seus inputs foram congelados em `procedure-freeze.json` antes da execução. A verificação do produtor confirmou um literal alterado em cada arquivo e nenhuma outra mudança nesses bytes. A principal deve conferir independentemente o delta e reapresentá-lo aos mesmos J1/J2; este suplemento não é parecer nem libera L3/L4. Testes de produto, rede, runtime e consumidores: NOT_RUN. Tentativas físicas, tokens e custo: UNKNOWN.
