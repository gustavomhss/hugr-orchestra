#!/usr/bin/env python3
"""Render an index of existing contracts. Never select, execute or approve work."""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
REPO_NAME = 'gmhelmold/HuGR-Orchestra'
BASE = 'specs/orchestra-visual/'
KINDS = {'epic', 'issue', 'subissue'}
GROUPS = ('dod', 'invariants', 'quality_standards', 'completeness_criteria', 'success_criteria')


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def safe_path(value):
    if not isinstance(value, str) or not value or '\\' in value or '\n' in value:
        raise ValueError('Invalid navigation path')
    path = PurePosixPath(value)
    if path.is_absolute() or '..' in path.parts:
        raise ValueError('Unsafe navigation path: ' + value)
    return value


def label(value):
    return str(value).replace('|', '\\|').replace('\n', ' ')


def read_contracts(root):
    plan = read_json(root / 'PLAN.json')
    registry = read_json(root / 'GITHUB.json')
    surfaces = read_json(root / 'SURFACES.json')['surfaces']
    nodes = {node['id']: node for node in plan['nodes']}
    if len(nodes) != len(plan['nodes']):
        raise ValueError('Duplicate node ID')
    tickets = {key: value for key, value in registry['issues'].items() if key in nodes}
    expected = {key for key, node in nodes.items() if node['kind'] in KINDS}
    if set(tickets) != expected:
        raise ValueError('Ticket registry does not match PLAN nodes')
    numbers = [entry['number'] for entry in tickets.values()]
    if len(numbers) != len(set(numbers)) or any(type(x) is not int for x in numbers):
        raise ValueError('Invalid or duplicate ticket numbers')
    for node in nodes.values():
        if not re.fullmatch(r'[A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*', node['id']):
            raise ValueError('Invalid node ID')
        if node.get('parent') is not None and node['parent'] not in nodes:
            raise ValueError('Unknown parent: ' + node['id'])
        for group in GROUPS:
            if not node['axioms'].get(group):
                raise ValueError('Missing axiom: ' + node['id'] + '/' + group)
    return plan, nodes, tickets, surfaces


def chain(nodes, ident):
    result = []
    while ident:
        if ident in result:
            raise ValueError('Parent cycle')
        result.append(ident)
        ident = nodes[ident].get('parent')
    return list(reversed(result))


def containing_ticket(nodes, ident):
    return next(x for x in reversed(chain(nodes, ident)) if nodes[x]['kind'] in KINDS)


def ticket_link(ident, tickets):
    return '[%s / #%s](https://github.com/%s/issues/%s)' % (
        ident, tickets[ident]['number'], REPO_NAME, tickets[ident]['number'])


def local_link(root, path):
    safe_path(path)
    if not (root / path).is_file() and not (root / path).is_dir():
        raise ValueError('Missing navigation input: ' + path)
    return '[`%s`](%s)' % (path, quote(path, safe='/'))


def path_description(root, path, repo=None):
    safe_path(path)
    if any(c in path for c in '*?['):
        return '`%s` — **padrão de caminho**, não um arquivo literal' % path
    if path.startswith(BASE):
        rel = path[len(BASE):]
        if (root / rel).is_file() or (root / rel).is_dir():
            return local_link(root, rel) + ' — arquivo/pasta do plano; raiz `$PLAN_ROOT`'
        return '`%s` — saída prevista; **pode ainda não existir**' % path
    if repo is not None and (repo / path).exists():
        return '[`%s`](../../%s) — presente no snapshot; raiz `$REPO`' % (path, quote(path, safe='/'))
    return '`%s` — entrada mapeada; **existência/consumer a conferir em S01**' % path


def render(root, repo=None):
    plan, nodes, tickets, surfaces = read_contracts(root)
    plan_hash = hashlib.sha256((root / 'PLAN.json').read_bytes()).hexdigest()
    code = 'não conferido contra Git nesta geração'
    if repo is not None:
        subprocess.check_output(['git', '-C', str(repo), 'rev-parse', '--show-toplevel'], text=True)
        code = 'links conferidos no checkout fornecido; base histórica das âncoras ' + plan['source_sha']
    lines = ['# INDEX — onde estão os tickets, contratos e entradas de código', '',
             '[Comece por START-HERE.md](START-HERE.md) · [Épico #215](https://github.com/' + REPO_NAME + '/issues/215)', '',
             'Índice de navegação, não nova especificação. Axiomas, permissões e desbloqueio vêm de PLAN.json/EXECUTE.md. '
             'As relações abaixo não marcam trabalho como concluído. Nenhuma nova task foi criada.', '',
             'Contrato: `%s`; SHA-256 de PLAN.json: `%s`. Snapshot do código: `%s`.' % (plan.get('contract_revision'), plan_hash, code), '',
             '**Raízes:** caminhos `packages/...` partem de `$REPO`; links para specs, tools e provas partem de '
             '`$PLAN_ROOT = $REPO/specs/orchestra-visual`. Um caminho de leitura não concede escrita. '
             'Um padrão com `*` não é um arquivo existente. Presença não prova reachability, backend live ou runtime testado.', '',
             'Se PLAN/SURFACES/GITHUB mudarem, o coordenador pode regenerar este índice em uma atualização documental '
             'com `python3 tools/render_navigation.py --write --repo "$REPO"`. `--check` não altera arquivos. '
             'Isto não modifica o DAG nem dispensa qualquer gate; os contratos atuais prevalecem sobre o snapshot.', '',
             '## Mapa dos 39 tickets subordinados', '',
             '| ID / ticket real | Responsabilidade | Pai | Filhos diretos |',
             '|---|---|---|---|']
    for ident, node in nodes.items():
        if ident not in tickets:
            continue
        parent = node.get('parent')
        p = ticket_link(parent, tickets) if parent in tickets else '[#215](https://github.com/' + REPO_NAME + '/issues/215)'
        children = ' · '.join('[%s](#%s)' % (c, c.lower()) for c in node['children']) or '—'
        lines.append('| [%s / #%s](#%s) | %s | %s | %s |' % (ident, tickets[ident]['number'], ident.lower(), label(node['title']), p, children))
    lines += ['', '## Guias por ticket e unidade', '',
              'As seções WP/task são localizáveis por ID. Abra a seção correspondente no Markdown canônico '
              'ou use o comando `--show` abaixo. `--show` apenas lê: a prontidão vem de `select_work.py --repo`.', '']
    for ident, node in nodes.items():
        if ident not in tickets:
            continue
        lines += ['<a id="%s"></a>' % ident.lower(), '### %s — %s' % (ident, node['title']), '',
                  '**Ticket:** ' + ticket_link(ident, tickets) + ' · **Contrato completo:** ' + local_link(root, 'issues/' + ident + '.md'),
                  '**Caminho:** #215 → ' + ' → '.join(ticket_link(x, tickets) for x in chain(nodes, ident) if x in tickets),
                  '**Dependências de entrada declaradas:** ' + (', '.join('[%s](#%s)' % (d, d.lower()) for d in node.get('depends_on', [])) or 'nenhuma neste nó') + '. Leia também as dependências herdadas/finas da task.']
        if node.get('output'):
            lines += ['**Entrega esperada:** ' + node['output']]
        if node.get('external_dependencies'):
            lines += ['**Fronteiras externas registradas:** `' + json.dumps(node['external_dependencies'], ensure_ascii=False) + '`. Não presumir prontidão pelo título da issue.']
        if node['kind'] != 'subissue':
            lines += ['**Entrar pelos filhos:** ' + ' · '.join(ticket_link(c, tickets) for c in node['children'] if c in tickets)]
        else:
            related = [x for x in nodes.values() if x['kind'] == 'task' and containing_ticket(nodes, x['id']) == ident]
            docs = list(dict.fromkeys(f for t in related for f in t.get('normative_files', []) if f != 'reference/approved.png'))
            lines += ['**Contratos usados pelas tasks (leitura seletiva por categoria):** ' + ' · '.join(local_link(root, f) for f in docs)]
            inputs = list(dict.fromkeys(node.get('read_paths', []) + [s['path'] for s in surfaces if s['owner'] == ident]))
            lines += ['', '**Entradas mapeadas de código / fontes (não são todas permissões de edição):**']
            for path in inputs:
                lines += ['- ' + path_description(root, path, repo)]
            lines += ['', '**Escrita autorizada no nível da subissue — a task pode ser mais restrita:**', '```text'] + node.get('write_paths', []) + ['```']
            if node.get('exclude_paths'):
                lines += ['**Exclusões:**', '```text'] + node['exclude_paths'] + ['```']
            rows = [s for s in surfaces if s['owner'] == ident]
            lines += ['**Registros de cobertura:** ' + (', '.join('`%s` %s [%s]' % (s['id'], s['title'], s.get('inventory_class', 'classificar')) for s in rows) or 'consulte SURFACES.json; não deduzir cobertura só por nome de arquivo'),
                      '**Provas da frente:** `evidence/%s/`; só crie arquivos das suas tentativas. Não há provas de produto preaprovadas.' % ident]
        selected = [x for x in nodes.values() if x['kind'] in {'wp', 'task'} and containing_ticket(nodes, x['id']) == ident]
        for unit in selected:
            u = unit['id']
            lines += ['', '<a id="%s"></a>' % u.lower(), '#### %s — %s' % (u, unit['title']),
                      'Arquivo: ' + local_link(root, 'issues/' + ident + '.md') + ' · localizar o heading `## ' + u + ' —`. Os cinco axiomas e seus IDs estão nessa seção.']
            if unit['kind'] == 'wp':
                lines += ['Tasks: ' + ' · '.join('[%s](#%s)' % (c, c.lower()) for c in unit['children'])]
            else:
                lines += ['```sh', '# CWD: $PLAN_ROOT', 'python3 tools/select_work.py --show ' + u, '```',
                          'Provas: `evidence/%s/%s/attempt-NN/`. Template/selagem/validação: [passo a passo](START-HERE.md). '
                          'Readiness e locks devem ser verificados antes de iniciar; mostrar a task não a libera.' % (ident, u[len(ident)+1:])]
        lines += ['', '[Voltar ao início](START-HERE.md) · [Mapa de tickets](#mapa-dos-39-tickets-subordinados)', '']
    return '\n'.join(lines) + '\n'


def validate_links(root, text, repo=None):
    anchors = set(re.findall(r'<a id="([^"]+)"', text))
    problems = []
    for target in re.findall(r'\]\(([^)]+)\)', text):
        if target.startswith('https://'):
            continue
        if target.startswith('#'):
            if target[1:] not in anchors and target != '#mapa-dos-39-tickets-subordinados':
                problems.append('Unknown anchor: ' + target)
        elif target.startswith('../../'):
            if repo is not None and not (repo / target[6:]).exists():
                problems.append('Missing source link: ' + target)
        elif not (root / target.split('#', 1)[0]).exists():
            problems.append('Missing package link: ' + target)
    return problems


def main():
    p = argparse.ArgumentParser(description=__doc__)
    mode = p.add_mutually_exclusive_group()
    mode.add_argument('--write', action='store_true')
    mode.add_argument('--check', action='store_true')
    p.add_argument('--repo', type=Path)
    args = p.parse_args()
    try:
        text = render(ROOT, args.repo)
        errors = validate_links(ROOT, text, args.repo)
        if errors:
            raise ValueError('; '.join(errors))
        out = ROOT / 'INDEX.md'
        if args.write:
            out.write_text(text, encoding='utf-8')
        elif args.check:
            if not out.is_file() or out.read_text(encoding='utf-8') != text:
                raise ValueError('INDEX differs from source; use the same --repo snapshot when checking')
        else:
            print(text, end='')
            return 0
        print(json.dumps({'status': 'PASS', 'kind': 'navigation-not-product', 'file': 'INDEX.md'}))
        return 0
    except (OSError, ValueError, KeyError, TypeError, subprocess.CalledProcessError) as exc:
        print(json.dumps({'status': 'FAIL', 'error': str(exc)}, ensure_ascii=False))
        return 1


if __name__ == '__main__':
    sys.exit(main())
