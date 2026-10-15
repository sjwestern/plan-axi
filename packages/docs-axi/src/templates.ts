export function docBody(title: string): string {
  return `# ${title}\n`;
}

export function adrBody(title: string): string {
  return `# ${title}\n\n## Context\n\n## Decision\n\n## Consequences\n`;
}
