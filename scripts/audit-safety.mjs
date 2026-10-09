const secretAssignmentPattern = /((?:token|authorization|api[-_]?key|password|secret|cookie|credential|private[-_]?key)\s*[=:]\s*)[^\s,;]+/gi;
const bearerPattern = /(bearer\s+)[A-Za-z0-9._~+/=-]+/gi;

export function formatAuditError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .split('\n')
    .slice(0, 2)
    .join(' | ')
    .replace(bearerPattern, '$1[REDACTED]')
    .replace(secretAssignmentPattern, '$1[REDACTED]');
}
