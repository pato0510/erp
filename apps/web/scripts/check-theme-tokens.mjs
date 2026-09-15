import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

// Also catch the equivalent neutral families, multiline styles and both quote styles.
const forbiddenPatterns = [
  /(?<![\w-])(?:(?:[\w-]+:)*)(?:text-black|bg-white(?:\/\d+)?|(?:text|bg|border|divide|placeholder|ring)-(?:gray|slate|zinc|neutral)-\d+(?:\/\d+)?)(?![\w-])/g,
  /(?<![\w-])(?:color|background|backgroundColor|borderColor|fill|stroke)\s*:\s*(['"])#[\da-fA-F]{3,8}\1/g,
  /\b(?:fill|stroke)\s*=\s*(['"])#[\da-fA-F]{3,8}\1/g,
  /(['"])#(?:fff(?:fff)?|000(?:000)?)\1/gi,
  // Semantic utilities use complete CSS colors: slash opacity cannot work with these tokens.
  /\b(?:bg|text|border|divide|ring)-(?:surface(?:-2)?|subtle(?:-hover)?|card(?:-solid)?|fg(?:-secondary|-muted)?|line|input|accent(?:-light|-muted|-dim|-surface)?)\/[\d.]+/g,
];

export function matchesGlob(file, glob) {
  const parts = glob.split('/');
  const segments = parts.map((segment, index) => {
    const last = index === parts.length - 1;
    if (segment === '**') return last ? '.*' : '(?:[^/]+/)*';
    const pattern = segment
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/]*');
    return pattern + (last ? '' : '/');
  });
  return new RegExp(`^${segments.join('')}$`).test(file);
}

/** Optional literal matches narrow an exception to a color expression, not its whole file. */
export function findViolations(file, source, allowlist) {
  const exceptions = allowlist.filter((entry) => matchesGlob(file, entry.path));
  if (exceptions.some((entry) => !entry.matches)) return [];

  const allowedRanges = exceptions.flatMap((entry) =>
    entry.matches.flatMap((literal) => {
      const ranges = [];
      let start = source.indexOf(literal);
      while (start !== -1) {
        ranges.push([start, start + literal.length]);
        start = source.indexOf(literal, start + literal.length);
      }
      return ranges;
    }),
  );
  const violations = new Map();
  for (const pattern of forbiddenPatterns) {
    for (const match of source.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (allowedRanges.some(([from, to]) => start >= from && end <= to)) continue;
      const line = source.slice(0, start).split('\n').length;
      violations.set(`${start}:${match[0]}`, { file, line, match: match[0] });
    }
  }
  return [...violations.values()].sort((a, b) => a.line - b.line);
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(name)));
    else if (entry.isFile() && /\.(?:ts|tsx|css)$/.test(name)) files.push(name);
  }
  return files.sort();
}

async function main() {
  const allowlist = JSON.parse(
    await readFile(new URL('./theme-allowlist.json', import.meta.url), 'utf8'),
  );
  if (
    !Array.isArray(allowlist) ||
    allowlist.some(
      (entry) =>
        typeof entry.path !== 'string' ||
        !entry.path.startsWith('apps/web/src/') ||
        typeof entry.reason !== 'string' ||
        !entry.reason.trim() ||
        (entry.matches !== undefined &&
          (!Array.isArray(entry.matches) ||
            !entry.matches.length ||
            entry.matches.some((match) => typeof match !== 'string' || !match.length))),
    )
  ) {
    throw new Error(
      'Each theme allowlist entry needs a source path/glob, a reason and optional nonempty literal matches.',
    );
  }
  const files = await walk(path.join(repositoryRoot, 'apps/web/src'));
  const violations = [];
  for (const filename of files) {
    const file = path.relative(repositoryRoot, filename).split(path.sep).join('/');
    violations.push(...findViolations(file, await readFile(filename, 'utf8'), allowlist));
  }
  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line}: ${violation.match}`);
  }
  if (violations.length) {
    console.error(`Theme tokens: FAIL (${violations.length} violations)`);
    process.exitCode = 1;
  } else {
    console.log(`Theme tokens: OK (${files.length} files checked, 0 violations outside allowlist)`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
