import type { SanoAppointment } from './types';

const TZ = 'America/Sao_Paulo';

/**
 * Saudação inicial do Sano: variada conforme o horário e com o resumo do dia.
 *
 * Fica no backend de propósito: é o único lugar que sabe resolver "hoje" no
 * fuso do usuário, então o frontend não precisa duplicar essa conta.
 */
export function buildGreeting(username: string, today: SanoAppointment[], now: Date): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(now));
  const period = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  const fmtTime = (d: Date) =>
    new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d);

  const lines = [`${period}, ${username}. Como você está? Em que posso ser útil?`];

  if (!today.length) {
    lines.push('', 'Para hoje você não tem compromissos. Agenda livre!');
    return lines.join('\n');
  }

  // "às" antes de horário plural; o horário já traz o "h" do formato pt-BR.
  const agenda = today
    .slice(0, 4)
    .map((a) => `  • ${fmtTime(new Date(a.startsAt))} — ${a.title}${a.participants ? ` (com ${a.participants})` : ''}`)
    .join('\n');

  const extra = today.length > 4 ? `\n  … e mais ${today.length - 4}.` : '';
  lines.push('', `Para hoje você tem ${today.length} ${today.length === 1 ? 'compromisso' : 'compromissos'}:\n${agenda}${extra}`);

  return lines.join('\n');
}