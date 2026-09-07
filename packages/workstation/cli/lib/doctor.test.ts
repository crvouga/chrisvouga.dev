import { expect, test } from 'bun:test';

import { doctorSummary, type DoctorCheck } from './doctor';
import { kvPath, DEFAULT_VAULT } from './vault-config';

test('doctorSummary counts severities', () => {
  const checks: DoctorCheck[] = [
    { id: 'a', label: 'a', severity: 'pass', detail: 'ok' },
    { id: 'b', label: 'b', severity: 'warn', detail: 'hmm' },
    { id: 'c', label: 'c', severity: 'fail', detail: 'bad' },
  ];
  expect(doctorSummary(checks)).toEqual({ pass: 1, warn: 1, fail: 1 });
  expect(doctorSummary([])).toEqual({ pass: 0, warn: 0, fail: 0 });
});

test('kvPath joins mount/project/config', () => {
  expect(kvPath(DEFAULT_VAULT)).toBe('secret/data/personal/prd');
  expect(
    kvPath({ addr: 'https://x', mount: 'm', project: 'p', config: 'c' })
  ).toBe('m/data/p/c');
});
