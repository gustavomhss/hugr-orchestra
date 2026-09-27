#!/usr/bin/env python3
"""Read-only executor aids. No installs, product commands, locks or PASS writes."""
from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

sys.dont_write_bytecode = True

from effective_contract import contract_digest, file_hash, load
from render_navigation import chain, containing_ticket
from select_work import entry_dependencies, ext_requirements, git_snapshot, select
from validate_plan import ROOT, validate

GROUPS = ('dod', 'invariants', 'quality_standards', 'completeness_criteria', 'success_criteria')
BASE = 'specs/orchestra-visual'
REPOSITORY = 'gmhelmold/HuGR-Orchestra'


def inside(root, relative):
    """Do not let a document or manifest redirect reads outside its root."""
    if (not isinstance(relative, str) or not relative or '\\' in relative
            or Path(relative).is_absolute() or '..' in Path(relative).parts):
        raise ValueError('Unsafe relative path')
    path = (root / relative).resolve()
    path.relative_to(root.resolve())
    return path


def run_git(repo, *arguments, optional=False):
    result = subprocess.run(
        ['git', '-C', str(repo), *arguments], capture_output=True, text=True,
        timeout=30, env={**os.environ, 'GIT_OPTIONAL_LOCKS': '0'},
    )
    if result.returncode and not optional:
        # Do not echo remote URLs, credential-bearing errors, or environment values.
        raise ValueError('Git read failed: ' + arguments[0])
    return result


def expected_remote(value):
    value = value.strip()
    if value.startswith('git@github.com:'):
        path = value[len('git@github.com:'):]
    else:
        parsed = urlsplit(value)
        if parsed.scheme not in ('https', 'ssh') or parsed.hostname != 'github.com':
            return False
        path = parsed.path.lstrip('/')
    return path.removesuffix('.git').rstrip('/').casefold() == REPOSITORY.casefold()


def contracts(root):
    plan = load(inside(root, 'PLAN.json'))
    surfaces = load(inside(root, 'SURFACES.json'))
    errors = validate(plan, surfaces)
    if errors:
        raise ValueError('; '.join(errors))
    master = inside(root, plan['reference_path'])
    if file_hash(master) != plan['reference_sha256']:
        raise ValueError('Approved reference hash mismatch')
    registry = load(inside(root, 'GITHUB.json'))
    return plan, {node['id']: node for node in plan['nodes']}, registry


def checkout(root, repo):
    repo = Path(run_git(repo, 'rev-parse', '--show-toplevel').stdout.strip()).resolve()
    if (repo / BASE).resolve() != root.resolve():
        raise ValueError('Run the tooling located inside the worktree being inspected')
    if not inside(repo, 'AGENTS.md').is_file():
        raise ValueError('Root AGENTS.md is missing; inspect checkout before execution')
    remote = run_git(repo, 'remote', 'get-url', 'origin', optional=True)
    if remote.returncode or not expected_remote(remote.stdout):
        raise ValueError('origin does not identify the expected Orchestra repository; URL withheld')
    head = run_git(repo, 'rev-parse', 'HEAD').stdout.strip()
    tracked = run_git(repo, 'ls-files', '-z').stdout.split('\0')
    changed = run_git(repo, 'diff', '--name-only', '--no-renames', '-z', 'HEAD').stdout
    untracked = run_git(repo, 'ls-files', '--others', '--exclude-standard', '-z').stdout
    return repo, {
        'head': head,
        'branch': run_git(repo, 'branch', '--show-current').stdout.strip() or 'DETACHED',
        'shallow': run_git(repo, 'rev-parse', '--is-shallow-repository').stdout.strip() == 'true',
        'origin_matches': True,
        'changed_paths': sorted(set(filter(None, (changed + untracked).split('\0')))),
    }, list(filter(None, tracked))


def version(binary):
    executable = shutil.which(binary)
    if not executable:
        return None
    result = subprocess.run([executable, '--version'], capture_output=True, text=True, timeout=5)
    if result.returncode:
        return None
    match = re.fullmatch(r'(?:v)?(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)\s*', result.stdout)
    return match.group(1) if match else None


def package_info(repo, package):
    path = inside(repo, package + '/package.json' if package else 'package.json')
    if not path.is_file():
        return {'path': str(path.relative_to(repo)), 'state': 'MISSING'}
    data = load(path)
    scripts = data.get('scripts', {})
    if not isinstance(scripts, dict):
        raise ValueError('Malformed package scripts')
    allowed = ('typecheck', 'test', 'test:unit', 'test:e2e', 'build', 'dev', 'check:generated', 'generate')
    return {
        'path': str(path.relative_to(repo)), 'sha256': file_hash(path),
        'package_manager': data.get('packageManager'),
        'commands': [{'cwd': package or '.', 'argv': ['bun', 'run', name],
                      'script': scripts[name], 'execution': 'NOT_RUN'}
                     for name in allowed if isinstance(scripts.get(name), str) and package],
    }


def readiness(plan, root, repo, tracked, jobs):
    progress = load(inside(root, 'progress.json'))
    if not isinstance(progress, dict) or not isinstance(progress.get('tasks', {}), dict):
        raise ValueError('Malformed progress; refusing a guessed restart')
    # These are the existing source/evidence checks, not a new scheduling policy.
    snapshot = git_snapshot(repo, progress)
    result = select(plan, progress, root=root, jobs=jobs, tracked=tracked, source_snapshot=snapshot)
    if result.get('status') == 'FAIL':
        raise ValueError('; '.join(result.get('errors', ['Readiness failed'])))
    return result, progress


def doctor(plan, root, repo, state):
    package = package_info(repo, '')
    pin = package.get('package_manager')
    actual = version('bun')
    expected = pin[4:] if isinstance(pin, str) and pin.startswith('bun@') else None
    observations = []
    if actual != expected or expected is None:
        observations.append('Bun absent, unrecognized or different from packageManager; product commands are NOT_READY')
    if not (repo / 'node_modules').is_dir():
        observations.append('Root node_modules absent; no dependency installation was attempted')
    base = plan['source_sha']
    present = run_git(repo, 'cat-file', '-e', base + '^{commit}', optional=True).returncode == 0
    return {
        'kind': 'environment-observations-not-product-approval', 'status': 'OBSERVED',
        'repo': str(repo), 'plan_root': str(root), 'checkout': state,
        'tooling_prerequisites': 'AVAILABLE' if sys.version_info >= (3, 9) else 'NOT_READY',
        'python': '.'.join(map(str, sys.version_info[:3])),
        'bun': {'expected': expected, 'observed': actual, 'matches': expected is not None and actual == expected},
        'source_base': {'sha': base, 'object_present': present,
                        'ancestor': run_git(repo, 'merge-base', '--is-ancestor', base, 'HEAD', optional=True).returncode == 0 if present else None},
        'instructions': [{'path': 'AGENTS.md', 'exists': inside(repo, 'AGENTS.md').is_file()},
                         {'path': BASE + '/EXECUTE.md', 'exists': inside(root, 'EXECUTE.md').is_file()}],
        'observations': observations,
        'product_checks': {'dependencies_resolve': 'NOT_RUN', 'build': 'NOT_RUN', 'native': 'NOT_RUN', 'performance': 'NOT_RUN'},
        'next': 'Use resume; inspect AGENTS.md and package commands before any write. Missing product prerequisites do not prohibit S01 discovery.',
        'mutation_performed': False,
    }


def headings(text):
    """Line-addressable headings, excluding fenced examples."""
    found = []
    fence = None
    for number, line in enumerate(text.splitlines(), 1):
        marker = re.match(r'^\s*(`{3,}|~{3,})', line)
        if marker:
            char = marker.group(1)[0]
            fence = None if fence == char else char if fence is None else fence
            continue
        if fence is None and re.match(r'^#{1,4} ', line):
            found.append({'line': number, 'heading': line})
    return found


def widget_extract(text, requested):
    markers = list(re.finditer(r'^<a id="(w\d{2})"></a>\s*$', text, re.M))
    available = [match.group(1).upper() for match in markers]
    if len(available) != len(set(available)) or not set(requested) <= set(available):
        raise ValueError('Widget section missing or ambiguous; refusing partial packet')
    if not requested:
        return ''
    pieces = [text[:markers[0].start()]]  # Shared source/identity rules are mandatory.
    for index, match in enumerate(markers):
        if available[index] in requested:
            end = markers[index + 1].start() if index + 1 < len(markers) else len(text)
            pieces.append(text[match.start():end])
    return ''.join(pieces)


def packages_for(node):
    return sorted({match.group(0) for path in node.get('read_paths', []) + node.get('write_paths', [])
                   if (match := re.match(r'^packages/[^/*?\[]+', path))})


def packet(plan, by, registry, root, repo, state, ready, progress, ident):
    if ident not in by or by[ident]['kind'] != 'task':
        raise ValueError('packet needs an existing task, not an issue, WP or epic')
    node = by[ident]
    lineage = chain(by, ident)
    ticket = containing_ticket(by, ident)
    selection = [item['id'] for item in ready['selected']]
    record = progress.get('tasks', {}).get(ident, {})
    position = 'SELECTED_BY_EXISTING_POLICY' if ident in selection else 'PREPARATION_OR_RESUME_ONLY'
    docs = []
    for name in node.get('normative_files', []):
        path = inside(root, name)
        item = {'path': name, 'sha256': file_hash(path)}
        if path.suffix == '.md':
            item['sections'] = headings(path.read_text(encoding='utf-8'))
        docs.append(item)
    ancestry = [
        {'id': by[i]['id'], 'axioms': by[i]['axioms'], 'criterion_ids': by[i]['criterion_ids'],
         'criterion_evaluation_stage': by[i].get('criterion_evaluation_stage', {}),
         'axiom_application': by[i].get('axiom_application')}
        for i in lineage[:-1]
    ]
    instructions = {'AGENTS.md'}
    for path in node.get('read_paths', []) + node.get('write_paths', []):
        prefix = re.split(r'[*?\[]', path)[0]
        parent = Path(prefix).parent
        while str(parent) != '.':
            candidate = str(parent / 'AGENTS.md')
            if inside(repo, candidate).is_file():
                instructions.add(candidate)
            parent = parent.parent
    data = {
        'kind': 'derived-task-context-not-a-receipt', 'task_id': ident,
        'position': position, 'repo': str(repo), 'plan_root': str(root), 'checkout': state,
        'plan_sha256': file_hash(root / 'PLAN.json'), 'effective_contract_sha256': contract_digest(node, root, plan),
        'ticket': registry['issues'][ticket]['url'], 'task_contract': node,
        'ancestors_complete_axes': ancestry,
        'inherited_dependencies': entry_dependencies(by, ident), 'external_requirements': ext_requirements(by, ident),
        'current_record_not_automatic_approval': {k: record[k] for k in ('status', 'phase', 'head', 'evidence') if k in record},
        'readiness_reasons': [row for row in ready.get('blocked', []) + ready.get('deferred', []) if row['id'] == ident],
        'invalid_claims': ready.get('invalid_claims', {}),
        'applicable_instruction_files': [{'path': p, 'sha256': file_hash(inside(repo, p))} for p in sorted(instructions) if inside(repo, p).is_file()],
        'declared_package_commands_not_executed': [package_info(repo, p) for p in packages_for(node)],
        'normative_documents_not_replaced_by_packet': docs,
    }
    owner, unit = ident.split('-', 1)
    body = ['# Contexto executável — ' + ident, '',
            '**Derivado das fontes atuais; não é uma nova especificação, recibo ou autorização de execução.**',
            'Regenerar após mudar código/contrato/progresso. Confira dependências pelo seletor imediatamente antes de iniciar.',
            'Os cinco grupos dos ancestrais estão completos; encerramento do pai NÃO é pré-requisito do filho. Aplicar cada obrigação no estágio declarado.',
            'Os trechos WIDGETS são literais. Os demais documentos normativos continuam obrigatórios, localizáveis por linha abaixo; nenhuma ausência é uma dispensa.',
            'Leia AGENTS.md e instruções locais listadas antes de escrever. Comandos de package são descobertos, NÃO executados nem certificados como seguros.',
            '', '```json', json.dumps(data, ensure_ascii=False, indent=2), '```', '',
            '## Rotina da tentativa', '', '```sh', '# CWD: $PLAN_ROOT; caminhos abaixo são relativos a esta pasta.',
            'python3 tools/select_work.py --repo "$REPO" --jobs 4',
            '# Escolha uma tentativa NOVA e capture a baseline antes da implementação.',
            f'EVIDENCE="evidence/{owner}/{unit}/attempt-NN"',
            'test ! -e "$EVIDENCE" && mkdir -p "$EVIDENCE" || exit 1',
            'python3 tools/capture_scope.py --repo "$REPO" --out "$EVIDENCE/source-before.json" || exit 1',
            f'python3 tools/receipt_template.py {shlex.quote(ident)} --out "$EVIDENCE/receipt.draft.json" || exit 1',
            '# Implementar, testar e revisar. Preencher apenas resultados realmente observados.',
            '# Depois de preencher o draft:',
            'python3 tools/seal_receipt.py "$EVIDENCE/receipt.draft.json" --out "$EVIDENCE/receipt.json" || exit 1',
            f'python3 tools/validate_evidence.py {shlex.quote(ident)} "$EVIDENCE/receipt.json" --repo "$REPO"',
            '```', '', 'Nenhum comando acima roda automaticamente. RUNNING/progresso/reservas continuam sob o coordenador único.', '']
    widgets = node.get('widget_contracts', [])
    if widgets:
        body += ['## Trechos literais de WIDGETS.md', '', widget_extract(inside(root, 'WIDGETS.md').read_text(encoding='utf-8'), widgets)]
    return '\n'.join(body) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('doctor', 'resume', 'packet'))
    parser.add_argument('task', nargs='?')
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--jobs', type=int, default=4)
    parser.add_argument('--out', type=Path, help='Explicit NEW output only; parent must exist. Default stdout.')
    args = parser.parse_args()
    os.environ['GIT_OPTIONAL_LOCKS'] = '0'  # This process only; never rewrite the index for observation.
    try:
        if not 1 <= args.jobs <= 8 or (args.mode == 'packet') != bool(args.task):
            raise ValueError('Use packet TASK, otherwise no TASK; --jobs must be 1..8')
        plan, by, registry = contracts(ROOT)
        repo, state, tracked = checkout(ROOT, args.repo)
        if args.mode == 'doctor':
            result = doctor(plan, ROOT, repo, state)
            code = 0 if result['tooling_prerequisites'] == 'AVAILABLE' else 2
        else:
            ready, progress = readiness(plan, ROOT, repo, tracked, args.jobs)
            if args.mode == 'packet':
                result = packet(plan, by, registry, ROOT, repo, state, ready, progress, args.task)
            else:
                result = {'kind': 'derived-resume-not-approval', 'checkout': state, 'readiness': ready,
                          'recorded_work': {i: {k: r[k] for k in ('status', 'phase', 'head', 'evidence') if k in r}
                                            for i, r in progress.get('tasks', {}).items()},
                          'instruction': 'Use packet TASK for selected or recorded work; do not infer next edits from a commit message.',
                          'mutation_performed': False}
            code = 2 if ready.get('invalid_claims') or ready.get('external_errors') else 0
        text = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False, indent=2) + '\n'
        if args.out:
            with args.out.open('x', encoding='utf-8') as handle:
                handle.write(text)
        else:
            print(text, end='')
        return code
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as exc:
        print(json.dumps({'status': 'FAIL', 'kind': 'executor-aid-not-product', 'error': str(exc)}, ensure_ascii=False))
        return 1


if __name__ == '__main__':
    sys.exit(main())
