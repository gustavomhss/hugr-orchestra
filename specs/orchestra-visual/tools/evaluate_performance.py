"""Recalculate fixed budgets. Static manifests are not noisy timing samples."""
from __future__ import annotations
import argparse
import json
import math
import re
import statistics
import sys
from pathlib import Path
from effective_contract import load, digest

ROOT = Path(__file__).resolve().parents[1]


def statistic(xs, kind):
    if not xs or any(type(x) not in (int, float) or not math.isfinite(x) for x in xs):
        raise ValueError('missing/non-finite numeric samples')
    ys = sorted(xs)
    if kind == 'max': return max(ys)
    if kind == 'median': return statistics.median(ys)
    return ys[max(0, math.ceil(float(kind[1:]) / 100 * len(ys)) - 1)]


def artifact_values(raw):
    """Derive P01 values from the two build manifests; never repeat static values as trials."""
    found = []
    for label in ('baseline', 'candidate'):
        record = raw.get('artifact_manifests', {}).get(label)
        if not isinstance(record, dict) or record.get('kind') != 'build-cost-manifest':
            raise ValueError('two actual build-cost manifests required for P01')
        if record.get('build_sha256') != raw.get(label + '_build_sha256'):
            raise ValueError('cost manifest build mismatch: ' + label)
        chunks, decorations, deps = record.get('initial_chunks'), record.get('decorations'), record.get('runtime_dependencies')
        if not isinstance(chunks, list) or not isinstance(decorations, list) or not isinstance(deps, list):
            raise ValueError('cost manifest arrays missing')
        if any(not isinstance(x, str) or not x.strip() for x in deps) or len(deps) != len(set(deps)):
            raise ValueError('runtime dependency names invalid/duplicated')
        seen = set(); js = css = transfer = decode = 0
        for item in chunks + decorations:
            if not isinstance(item, dict) or not isinstance(item.get('path'), str) or not item['path'] or item['path'] in seen:
                raise ValueError('asset path missing/duplicated')
            seen.add(item['path'])
            if item['path'].startswith(('/', '~')) or '..' in item['path'].split('/') or '\\' in item['path']:
                raise ValueError('asset path unsafe')
            if not isinstance(item.get('sha256'), str) or not re.fullmatch('[0-9a-f]{64}', item['sha256']):
                raise ValueError('asset content hash missing')
        for item in chunks:
            size = item.get('gzip_bytes')
            if type(size) is not int or size < 0 or item.get('kind') not in ('js', 'css'):
                raise ValueError('initial chunk size/kind invalid')
            if item['kind'] == 'js': js += size
            else: css += size
        for item in decorations:
            for key in ('transfer_bytes', 'decode_bytes'):
                if type(item.get(key)) is not int or item[key] < 0:
                    raise ValueError('decorative asset size invalid')
            transfer += item['transfer_bytes']; decode += item['decode_bytes']
        found.append({'initial_js': js, 'initial_css': css, 'new_runtime_dependencies': set(deps),
                      'decoration_transfer': transfer, 'decoration_decode': decode})
    added = len(found[1]['new_runtime_dependencies'] - found[0]['new_runtime_dependencies'])
    found[0]['new_runtime_dependencies'] = 0; found[1]['new_runtime_dependencies'] = added
    return found


def evaluate(raw, budgets, gates):
    errors = []; results = []
    if not isinstance(budgets, dict) or not isinstance(budgets.get('metrics'), list):
        return {'status': 'FAIL', 'errors': ['budget contract invalid']}
    ids = set()
    for m in budgets['metrics']:
        if not isinstance(m, dict): return {'status': 'FAIL', 'errors': ['invalid quantitative rule']}
        minimum = 1 if m.get('observation_kind') == 'artifact' else 5
        if (not isinstance(m.get('id'), str) or m['id'] in ids
            or m.get('observation_kind') not in ('paired', 'artifact')
            or m.get('domain') not in ('signed', 'nonnegative')
            or (m.get('observation_kind') == 'artifact' and (m.get('gate') != 'P01' or m['id'] not in {'initial_js','initial_css','new_runtime_dependencies','decoration_transfer','decoration_decode'} or m.get('min_samples') != 1 or m.get('min_pairs') != 1))
            or (m.get('domain') == 'signed' and (m['id'] != 'residual_slope' or m.get('unit') != 'bytes/min'))
            or (m['id'] == 'residual_slope' and (m.get('domain') != 'signed' or m.get('noise_policy') != 'mixed-signs-inconclusive'))
            or m.get('mode') not in ('absolute', 'absolute_and_delta', 'delta', 'relative_delta')
            or m.get('stat') not in ('max', 'median', 'p95', 'p99')
            or type(m.get('min_samples')) is not int or m['min_samples'] < minimum
            or type(m.get('min_pairs')) is not int or m['min_pairs'] < minimum):
            return {'status': 'FAIL', 'errors': ['invalid quantitative rule; no implicit PASS']}
        for k in ('delta_floor', 'relative'):
            if type(m.get(k)) not in (int, float) or not math.isfinite(m[k]) or m[k] < 0:
                return {'status': 'FAIL', 'errors': ['invalid comparison bound: ' + k]}
        if m['mode'] != 'relative_delta' and (type(m.get('limit')) not in (int, float) or not math.isfinite(m['limit'])):
            return {'status': 'FAIL', 'errors': ['invalid absolute limit']}
        ids.add(m['id'])
    known = {m['gate'] for m in budgets['metrics']} | set(budgets['computed_gates'])
    if not isinstance(gates, list) or not gates or any(not isinstance(g, str) for g in gates) or not set(gates) <= known or len(gates) != len(set(gates)):
        return {'status': 'FAIL', 'errors': ['invalid requested gates']}
    if not isinstance(raw, dict) or raw.get('kind') != 'paired-performance-observations':
        return {'status': 'FAIL', 'errors': ['invalid observations kind']}
    try: raw_digest = digest(raw)
    except (ValueError, TypeError): return {'status': 'FAIL', 'errors': ['non-finite or non-JSON raw observations']}
    env = raw.get('environment', {})
    if not isinstance(env, dict) or any(k not in env or env[k] is None for k in budgets['environment_keys']): errors.append('environment incomplete')
    if raw.get('baseline_environment') != env: errors.append('A/B environments differ')
    if raw.get('budget_sha256') != digest(budgets): errors.append('budget identity mismatch')
    for k in ('candidate_head', 'baseline_head'):
        if not isinstance(raw.get(k), str) or not re.fullmatch('[0-9a-f]{40}', raw[k]): errors.append('source head missing ' + k)
    for k in ('candidate_build_sha256', 'baseline_build_sha256', 'fixture_sha256', 'candidate_features_sha256', 'baseline_features_sha256'):
        if not isinstance(raw.get(k), str) or not re.fullmatch('[0-9a-f]{64}', raw[k]): errors.append('build/fixture identity missing ' + k)
    if raw.get('candidate_features_sha256') != raw.get('baseline_features_sha256'): errors.append('baseline/candidate capabilities differ')
    paired = any(m['gate'] in gates and m['observation_kind'] == 'paired' for m in budgets['metrics'])
    if raw.get('build_mode') != 'production': errors.append('production build required')
    if paired and raw.get('quiet_host') is not True: errors.append('quiet host required during paired collection')
    observed = raw.get('observations', [])
    if not isinstance(observed, list): return {'status': 'FAIL', 'errors': errors + ['observations not array']}
    by = {}
    for ob in observed:
        if not isinstance(ob, dict) or not isinstance(ob.get('metric'), str): errors.append('invalid observation'); continue
        if ob['metric'] not in ids: errors.append('unknown observed metric ' + ob['metric'])
        if any(m['id'] == ob['metric'] and m['observation_kind'] == 'artifact' for m in budgets['metrics']):
            errors.append('static P01 evidence must come from manifests, not repeated trial samples')
        if ob['metric'] in by: errors.append('duplicate metric ' + ob['metric'])
        by[ob['metric']] = ob
    static = None
    if 'P01' in gates:
        try: static = artifact_values(raw)
        except (ValueError, TypeError, AttributeError) as exc: errors.append(str(exc))
    for rule in budgets['metrics']:
        if rule['gate'] not in gates: continue
        ident = rule['id']; e = []; vals = []; deltas = []; aggregate = None
        if rule['observation_kind'] == 'artifact':
            if static is None:
                results.append({'id': ident, 'gate': rule['gate'], 'status': 'FAIL', 'errors': ['cost manifests unavailable']}); continue
            b, c = static[0][ident], static[1][ident]
            value = c - b if rule['mode'] == 'delta' else c
            results.append({'id': ident, 'gate': rule['gate'], 'status': 'PASS' if value <= rule['limit'] else 'FAIL',
                            'errors': [], 'aggregate': {'base': b, 'candidate': c, 'method': 'two-build-manifests'}})
            continue
        ob = by.get(ident)
        if not ob:
            results.append({'id': ident, 'gate': rule['gate'], 'status': 'FAIL', 'errors': ['metric absent']}); continue
        if ob.get('unit') != rule['unit'] or ob.get('profile') != rule['profile']: e.append('unit/profile mismatch')
        if (raw.get('profiles') if isinstance(raw.get('profiles'), dict) else {}).get(rule['profile']) != budgets['profiles'][rule['profile']]: e.append('workload mismatch')
        pairs = ob.get('pairs')
        if not isinstance(pairs, list) or len(pairs) < rule['min_pairs']: e.append('insufficient A/B pairs'); pairs = []
        counts = [0, 0]; names = set()
        for pair in pairs:
            try:
                name = pair['id']
                if not isinstance(name, str) or not name or name in names: raise ValueError('pair IDs invalid/duplicated')
                names.add(name)
                if pair.get('order') not in ('AB', 'BA'): raise ValueError('pair order not recorded')
                arrays = [pair['baseline'], pair['candidate']]
                for j, a in enumerate(arrays):
                    if not isinstance(a, list): raise ValueError('samples not array')
                    counts[j] += len(a)
                b, c = [statistic(a, rule['stat']) for a in arrays]
                if rule['domain'] == 'nonnegative' and any(v < 0 for a in arrays for v in a): raise ValueError('negative measurement invalid for nonnegative metric')
                vals.append(c); deltas.append((b, c - b))
            except (KeyError, ValueError, TypeError) as exc: e.append(str(exc))
        if min(counts) < rule['min_samples']: e.append('insufficient samples')
        if pairs and len({x.get('order') for x in pairs if isinstance(x, dict)}) < 2: e.append('A/B order must alternate')
        status = 'FAIL' if e else 'PASS'
        if not e:
            flatb = [x for pair in pairs for x in pair['baseline']]; flatc = [x for pair in pairs for x in pair['candidate']]
            b = statistic(flatb, rule['stat']); c = statistic(flatc, rule['stat'])
            aggregate = {'base': b, 'candidate': c, 'samples': counts, 'pairs': len(pairs)}
            checks = []; local = []
            if rule['mode'] in ('absolute', 'absolute_and_delta'):
                checks.append(c <= rule['limit']); local += [v <= rule['limit'] for v in vals]
            if rule['mode'] == 'delta':
                checks.append(statistics.median(d for _, d in deltas) <= rule['limit']); local += [d <= rule['limit'] for _, d in deltas]
            if rule['mode'] in ('relative_delta', 'absolute_and_delta'):
                margins = [d - max(rule['delta_floor'], abs(v) * rule['relative']) for v, d in deltas]
                checks.append(statistics.median(margins) <= 0); local += [v <= 0 for v in margins]
            if not all(checks): status = 'FAIL'
            elif not all(local): status = 'INCONCLUSIVE'
            if rule.get('noise_policy') == 'mixed-signs-inconclusive' and min(flatc) < 0 < max(flatc):
                status = 'INCONCLUSIVE'
                aggregate['noise'] = 'mixed signed trend estimates; extend settle/window, do not round or discard'
        results.append({'id': ident, 'gate': rule['gate'], 'status': status, 'errors': e, 'aggregate': aggregate})
    gate_results = []
    for g in gates:
        items = [x for x in results if x['gate'] == g]
        passed = not errors and (all(x['status'] == 'PASS' for x in items) if g not in budgets['computed_gates'] else True)
        gate_results.append({'id': g, 'status': 'PASS' if passed else 'FAIL', 'metrics': items})
    return {'kind': 'performance-evaluation', 'evaluator_version': budgets['evaluator_version'],
            'status': 'FAIL' if errors or any(g['status'] != 'PASS' for g in gate_results) else 'PASS',
            'head': raw.get('candidate_head'), 'build_sha256': raw.get('candidate_build_sha256'), 'environment': env,
            'budget_sha256': digest(budgets), 'raw_sha256': raw_digest, 'gates': gate_results, 'errors': errors}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('observations', type=Path); ap.add_argument('--gates', nargs='+', required=True); ap.add_argument('--out', type=Path)
    a = ap.parse_args()
    try:
        result = evaluate(load(a.observations), load(ROOT / 'BUDGETS.json'), a.gates)
        text = json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
        if a.out:
            a.out.parent.mkdir(parents=True, exist_ok=True)
            with a.out.open('x', encoding='utf-8') as f: f.write(text)
        else: print(text, end='')
        return int(result['status'] != 'PASS')
    except (OSError, ValueError, KeyError, TypeError) as e:
        print(json.dumps({'status': 'FAIL', 'errors': [str(e)]})); return 1


if __name__ == '__main__': sys.exit(main())
