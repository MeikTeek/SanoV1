/** Erros da OpenRouter traduzidos para o usuário. Sem dependências: o roteador e os testes usam direto. */

export type AiFailureReason = 'quota' | 'rate' | 'invalid' | 'policy' | 'blocked' | 'unavailable';

/**
 * Traduz um erro da OpenRouter. Pela documentação: 401 = chave inválida,
 * 402 = sem créditos, 403 = bloqueio (guardrail, permissão ou moderação),
 * 429 = limite de pedidos. Erros no meio da geração vêm com status 200 e um
 * campo `error` — por isso o corpo também é lido.
 */
export function describeFailure(status: number, body: string): { reason: AiFailureReason; detail?: string } {
  let detail: string | undefined;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown; metadata?: { raw?: unknown } } };
    const message = parsed.error?.message;
    detail = typeof message === 'string' && message.trim() ? message.trim().slice(0, 240) : undefined;
  } catch {
    detail = body.trim() ? body.trim().slice(0, 240) : undefined;
  }
  const text = `${detail ?? ''} ${body}`;
  if (status === 401) return { reason: 'invalid', detail };
  if (/data policy|privacy|guardrail|training/i.test(text)) return { reason: 'policy', detail };
  if (status === 402) return { reason: 'quota', detail };
  if (status === 429) return { reason: /per.day|daily|free-models-per-day/i.test(text) ? 'quota' : 'rate', detail };
  if (status === 403) return { reason: 'blocked', detail };
  return { reason: 'unavailable', detail };
}

/** Frase para o usuário, com o motivo que a própria OpenRouter deu. */
export function failureMessage({ reason, detail }: { reason: AiFailureReason; detail?: string }): string {
  const why = detail ? ` (OpenRouter: "${detail}")` : '';
  switch (reason) {
    case 'invalid': return `A OpenRouter recusou sua chave${why}. Confira em Ajustes → Inteligência artificial.`;
    case 'quota': return `Sua cota da OpenRouter acabou por hoje${why}. Sigo no modo sem IA até ela renovar.`;
    case 'rate': return 'Muitas perguntas à IA em pouco tempo. Espere um minuto e tente de novo.';
    case 'policy': return `A sua conta da OpenRouter está bloqueando os modelos gratuitos${why}. Em openrouter.ai/settings/privacy, permita os modelos gratuitos.`;
    case 'blocked': return `A OpenRouter bloqueou o pedido${why}. Confira as regras (Guardrails) e a privacidade da sua conta em openrouter.ai/settings/privacy.`;
    default: return `A IA não respondeu agora${why}. Sigo no modo sem IA por enquanto.`;
  }
}
