const ABBREVIATIONS: Record<string, string> = {
  amanha: 'amanha',
  amnh: 'amanha',
  hj: 'hoje',
  vc: 'voce',
  vcs: 'voces',
  pq: 'porque',
};

export function normalizeMessage(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s/:-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => ABBREVIATIONS[word] ?? word)
    .join(' ');
}
