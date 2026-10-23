/**
 * Porteiro da agenda: decide, por regra e sem IA, se uma frase é mesmo sobre
 * compromissos ou só cita um dia ("como vocês estão hoje?").
 *
 * - strong: pedido claro (verbo de agenda, horário, consulta, frase curta com data);
 * - weak: fala um dia, mas parece conversa — vale perguntar antes de anotar;
 * - none: nada de agenda ali.
 */
import { CREATE, fold, understandAgenda } from '../agenda/nlu';

export type ScheduleEvidence = 'strong' | 'weak' | 'none';

/** Sinais de conversa: sentimentos, perguntas ao assistente, cumprimentos, testes. */
const CHATTY = /\b(voce|voces|vc|vcs|sano|estou|estamos|estao|to|tou|me sinto|sinto|sentindo|como (esta|estao|vai|vao|voce|voces|vc)|quem (e|eh|sao)|obrigad[oa]|valeu|teste|testando|numero|nome)\b/;

const MAX_PLAIN_WORDS = 6;

export function scheduleEvidence(text: string, now: Date): ScheduleEvidence {
  const f = fold(text).replace(/\s+/g, ' ').trim();
  const req = understandAgenda(text, now);

  // Consultar, cancelar, remarcar etc. já são comandos explícitos.
  if (req.act !== 'create') return 'strong';
  if (CREATE.test(f) || req.hasTime || req.recurrence) return 'strong';
  if (!req.hasDate) return 'none';

  // "almoço com o João amanhã": substantivo + dia, curto e sem tom de conversa.
  const words = f.split(' ').length;
  return words <= MAX_PLAIN_WORDS && !CHATTY.test(f) ? 'strong' : 'weak';
}

/** Respostas a um rascunho que significam "esquece isso". */
const DROP_DRAFT = /^(nenhum|nenhuma|nada|esquece|esqueca|deixa|deixa pra la|deixa quieto|nao precisa|nao quero|nao marca|nao anota|era (so )?(um )?teste|foi (so )?(um )?teste|isso era (so )?(um )?teste|so (um )?teste|so testando|estava testando|testando)( (isso|mesmo|nao|obrigado|obrigada))*$/;

export const wantsToDropDraft = (normalized: string) => DROP_DRAFT.test(normalized);

/**
 * A frase responde à pergunta do rascunho ("para qual dia?", "que horas?")?
 * Só nesse caso o rascunho continua; qualquer outra coisa segue o fluxo normal.
 */
export function fillsDraft(text: string, now: Date): boolean {
  const f = fold(text).replace(/\s+/g, ' ').trim();
  if (/\b(dia inteiro|o dia todo|dia todo)\b/.test(f)) return true;
  const req = understandAgenda(text, now);
  return (req.hasDate || req.hasTime) && f.split(' ').length <= 8;
}
