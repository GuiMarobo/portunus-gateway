import type { z } from 'zod';

type ConfigIssue = z.ZodError['issues'][number];

const HEADER = 'Invalid configuration:';
const INDENT = '  ';
const PATH_SEPARATOR = '.';

export class ConfigValidationError extends Error {
  override readonly name = 'ConfigValidationError';

  constructor(issues: readonly ConfigIssue[]) {
    super([HEADER, ...issues.map(describeIssue)].join('\n'));
  }
}

function describeIssue(issue: ConfigIssue): string {
  const variable = issue.path.map(String).join(PATH_SEPARATOR);
  return `${INDENT}${variable} → ${issue.message}`;
}
