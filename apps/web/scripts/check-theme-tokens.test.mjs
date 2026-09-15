import assert from 'node:assert/strict';
import test from 'node:test';
import { findViolations, matchesGlob } from './check-theme-tokens.mjs';

const file = 'apps/web/src/app/example.tsx';

test('rejects neutral classes, nested variants and unusable token opacity', () => {
  for (const value of [
    'text-gray-900',
    'hover:bg-gray-50',
    'dark:bg-gray-800',
    'text-black',
    'bg-white/50',
    'divide-zinc-200',
    'placeholder:text-slate-500',
    'ring-neutral-400',
    'bg-card/50',
  ]) {
    assert.ok(findViolations(file, value, []).length, value);
  }
});

test('finds multiline styles, SVG colors and white/black literals with either quote style', () => {
  for (const value of [
    "color:\n  '#111827'",
    'backgroundColor: "#ffffff"',
    "borderColor: '#eee'",
    'fill="#fff"',
    "stroke: '#000'",
    '"#FFFFFF"',
  ]) {
    assert.ok(findViolations(file, value, []).length, value);
  }
  assert.equal(findViolations(file, '\n\ntext-gray-900', [])[0].line, 3);
});

test('allows semantic utilities, semantic dark variants and CSS variable names', () => {
  assert.deepEqual(
    findViolations(
      file,
      'bg-card text-fg border-line hover:bg-subtle-hover placeholder:text-fg-muted --color-dark: #111;',
      [],
    ),
    [],
  );
  assert.deepEqual(findViolations(file, 'dark:text-red-300', []), []);
  assert.deepEqual(findViolations(file, 'dark:bg-red-950/40', []), []);
});

test('scopes intentional colors to exact expressions and paths', () => {
  const allowlist = [{ path: file, reason: 'Status color', matches: ["color: '#16a34a'"] }];
  assert.deepEqual(findViolations(file, "color: '#16a34a'", allowlist), []);
  assert.ok(findViolations(file, "color: '#16a34a'; text-gray-900", allowlist).length);
  assert.ok(findViolations('apps/web/src/app/other.tsx', "color: '#16a34a'", allowlist).length);
});

test('matches protected globs and treats route brackets literally', () => {
  assert.equal(matchesGlob(file, 'apps/web/src/**'), true);
  assert.equal(matchesGlob(file, 'apps/web/src/app/**/*.tsx'), true);
  assert.equal(
    matchesGlob('apps/web/src/app/nested/example.tsx', 'apps/web/src/app/**/*.tsx'),
    true,
  );
  assert.equal(matchesGlob(file, 'apps/web/src/*.tsx'), false);
  assert.equal(matchesGlob('apps/web/src/app/[id]/page.tsx', 'apps/web/src/app/[id]/*.tsx'), true);
  assert.equal(matchesGlob('apps/web/src/app/i/page.tsx', 'apps/web/src/app/[id]/*.tsx'), false);
  assert.deepEqual(
    findViolations(file, 'text-gray-900', [{ path: 'apps/web/src/app/**', reason: 'Portal' }]),
    [],
  );
});
