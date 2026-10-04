/** minúsculo, sem acentos, sem pontuação, espaços colapsados. */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Remove o "chamado" no início: "Sano, ...", "Ei Sano ...", "Olá Sano ...". */
export function stripWakeWord(normalized: string): string {
  return normalized.replace(/^(?:(?:ei|ola|oi)\s+)?sano\b\s*/, '').trim();
}