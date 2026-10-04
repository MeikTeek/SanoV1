/**
 * IA interpretadora — o "20% de IA" do Sano.
 *
 * Regra de ouro: a IA NUNCA executa nada. Ela recebe a frase do usuário e a
 * lista de intenções existentes, e devolve no máximo o NOME de uma intenção
 * (ou `unknown`). Quem executa continua sendo `matchIntent` + o código. Isso
 * mantém o sistema previsível, barato e seguro — a IA só "traduz".
 *
 * Sem `AI_API_KEY`, tudo aqui vira no-op e o comportamento é o de antes.
 */
import { env } from '../../config/env';

export const aiAvailable = () => Boolean(env.AI_API_KEY && env.AI_BASE_URL);

/**
 * Traduz a frase para o nome de uma intenção conhecida.
 * `validNames` é a lista de intenções reais — recebida do roteador para não
 * criar ciclo de import entre os dois módulos.
 * Devolve null em qualquer falha — o chamador cai no "não entendi".
 */
export async function interpretUnknown(
  normalized: string,
  original: string,
  catalog: { name: string; description: string; example: string }[],
  validNames: string[],
): Promise<string | null> {
  if (!aiAvailable() || !catalog.length) return null;

  const SYSTEM = `Você classifica frases de um assistente pessoal em PT-BR.
Responda APENAS com um destes nomes de intenção, exatamente como está na lista, ou "unknown" se nenhuma servir.
Não responda a pergunta, não explique, não invente nomes.

Lista de intenções:
${catalog.map((c) => `${c.name}: ${c.description} (ex.: "${c.example}")`).join('\n')}`;

  try {
    const res = await fetch(`${env.AI_BASE_URL!.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.AI_API_KEY}` },
      body: JSON.stringify({
        model: env.AI_MODEL,
        temperature: 0,
        max_tokens: 32,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: original.slice(0, 500) || normalized },
        ],
      }),
      signal: AbortSignal.timeout(4000), // classificar precisa ser imperceptível
    });
    if (!res.ok) return null;

    const data = await res.json() as { choices?: { message?: { content?: string | null } }[] };
    const raw = data.choices?.[0]?.message?.content?.trim().toLowerCase() ?? '';
    // Aceita "agenda" ou "Intenção: agenda".
    const name = raw.replace(/^intencao:\s*/, '').replace(/[^a-z_]/g, '');
    return validNames.includes(name) ? name : null;
  } catch {
    return null; // timeout, rede ou modelo fora — silêncio é melhor que erro
  }
}