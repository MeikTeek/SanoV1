import { env } from '../../config/env';

/**
 * Camada de IA do trainer � os "20% de toque m�gico".
 *
 * Regra de ouro do m�dulo: a IA NUNCA calcula exerc�cio, volume ou seguran�a.
 * Tudo isso j� vem pronto do motor determin�stico (rules.ts); aqui ela s�
 * transforma n�meros em texto com a tem�tica do sistema. Isso mant�m o m�dulo
 * funcionando (e seguro) mesmo sem chave configurada.
 *
 * Se AI_API_KEY faltar ou a chamada falhar, cai no texto local � o usu�rio
 * nunca fica sem resposta.
 */

export const aiEnabled = () => Boolean(env.AI_API_KEY && env.AI_BASE_URL);

const SYSTEM_PROMPT = `Voc� � o Sistema/Coach de um aplicativo pessoal gamificado, no estilo "Solo Leveling".
Regras inviol�veis:
- NUNCA invente exerc�cios, s�ries, repeti��es ou valores de treino. Use SOMENTE os dados fornecidos.
- NUNCA recomende exerc�cio que n�o esteja na lista recebida.
- N�o d� diagn�stico m�dico. Se houver les�o ou dor, recomende avalia��o profissional.
- Fale em portugu�s do Brasil, direto, motivador e curto (m�ximo 6 linhas).`;

/** Chamada � IA. Devolve null em qualquer falha � nunca lan�a. */
async function ask(prompt: string, opts: { effort?: 'low' | 'medium'; timeout?: number } = {}): Promise<string | null> {
  if (!aiEnabled()) return null;
  const { effort = 'low', timeout = 25_000 } = opts;
  try {
    const res = await fetch(`${env.AI_BASE_URL!.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.AI_API_KEY}` },
      body: JSON.stringify({
        model: env.AI_MODEL,
        temperature: 0.7,
        max_tokens: 16000,
        // Este modelo raciocina por padr�o, e isso custava ~5 s por resposta.
        // `effort: low` mant�m a qualidade e corta o tempo pela metade.
        ...(effort ? { reasoning: { effort } } : {}),
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      }),
      // Teto por chamada: a UI n�o pode ficar pendurada.
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[IA] ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
      return null;
    }

    const data = await res.json() as {
      choices?: { message?: { content?: string | null; reasoning?: string | null } }[];
    };
    const msg = data.choices?.[0]?.message;
    // Alguns modelos respondem em `reasoning` e deixam `content` vazio quando
    // o or�amento de tokens corta a resposta final � nesse caso, usa o que houver.
    const text = msg?.content?.trim() || msg?.reasoning?.trim();
    return text ? text : null;
  } catch (err) {
    console.error('[IA] falha na chamada:', (err as Error).message);
    return null;
  }
}
export interface MissionIntro {
  username: string;
  goalLabel: string;
  plan: { title: string; blocks: { name: string; target: string }[]; plannedMinutes: number };
  exclusions: { name: string; reason: string }[];
}

/** Abertura do treino do jogador. */
export async function narrateMission(i: MissionIntro): Promise<string> {
  const fallback = [
    `Plano montado para ${i.username} � objetivo: ${i.goalLabel}.`,
    `Treino de hoje: ${i.plan.plannedMinutes} minutos, ${i.plan.blocks.length} exerc�cios.`,
    i.exclusions.length ? `${i.exclusions.length} exerc�cio(s) foram removidos por seguran�a.` : '',
  ].filter(Boolean).join('\n');

  const viaAi = await ask([
    `Jogador: ${i.username}. Objetivo: ${i.goalLabel}.`,
    `Treino de hoje: ${i.plan.title} � ${i.plan.plannedMinutes} min.`,
    `Exerc�cios: ${i.plan.blocks.map((b) => `${b.name} (${b.target})`).join('; ')}.`,
    i.exclusions.length ? `Removidos por seguran�a: ${i.exclusions.map((e) => `${e.name} � ${e.reason}`).join('; ')}.` : '',
    'Escreva uma abertura curta (2-4 linhas) explicando o foco do treino de hoje.',
  ].join('\n'));

  return viaAi ?? fallback;
}

/** Relat�rio semanal em tom imersivo, a partir dos dados brutos. */
export async function weeklyReport(a: {
  username: string; goalLabel: string; level: number; levelTitle: string;
  streak: number; completedDays: number; totalMinutes: number;
  statGains: { attr: string; gain: number }[]; weakDay?: string;
}): Promise<string> {
  const fallback = [
    `Resumo da semana � ${a.username}. Objetivo: ${a.goalLabel}.`,
    `${a.completedDays} dia(s) conclu�do(s), ${a.totalMinutes} minutos, ofensiva de ${a.streak}.`,
    a.statGains.length ? `Ganhos: ${a.statGains.map((g) => `${g.attr} +${g.gain.toFixed(1)}`).join(', ')}.` : 'Sem ganhos registrados nesta semana.',
    a.weakDay ? `Aten��o: queda de rendimento em ${a.weakDay}.` : '',
  ].filter(Boolean).join('\n');

  const viaAi = await ask([
    `Jogador ${a.username}, objetivo ${a.goalLabel}, n�vel ${a.level} (${a.levelTitle}).`,
    `Semana: ${a.completedDays} dias conclu�dos, ${a.totalMinutes} minutos, ofensiva ${a.streak}.`,
    `Ganhos por atributo: ${a.statGains.map((g) => `${g.attr} +${g.gain.toFixed(1)}`).join(', ') || 'nenhum'}.`,
    a.weakDay ? `Ponto fraco: ${a.weakDay}.` : '',
    'Escreva o resumo semanal (3-5 linhas), direto e pr�tico.',
  ].join('\n'));

  return viaAi ?? fallback;
}

/** Tira-d�vidas biomec�nico, sempre ciente das les�es e do equipamento. */
export async function biomechanicsAnswer(question: string, ctx: {
  injuries: string[]; equipment: string[]; exerciseList: string;
}): Promise<string> {
  const fallback = [
    'Este m�dulo est� rodando sem IA configurada (falta AI_API_KEY no backend/.env).',
    'Dica geral: mantenha a coluna neutra, controle a descida e pare se houver dor.',
  ].join('\n');

  const viaAi = await ask([
    `Pergunta: ${question}`,
    `Les�es declaradas: ${ctx.injuries.join(', ') || 'nenhuma'}.`,
    `Equipamento dispon�vel: ${ctx.equipment.join(', ') || 'nenhum'}.`,
    `Pode mencionar apenas estes exerc�cios: ${ctx.exerciseList}.`,
    'Explique a execu��o com foco em seguran�a e biomec�nica. M�ximo 8 linhas. Se pedirem diagn�stico ou tratamento de les�o, recomende um profissional.',
  ].join('\n'), { timeout: 20_000 });

  return viaAi ?? fallback;
}

/** Card�pio: a IA recebe os n�meros j� calculados pelo c�digo. */
export async function mealPlan(a: {
  kcal: number; proteinG: number; carbG: number; fatG: number;
  mealsPerDay: number; restrictions: string[]; plantBased: boolean; dietNotes?: string;
}): Promise<string> {
  const fallback = [
    `Meta di�ria: ${a.kcal} kcal � ${a.proteinG} g prote�na � ${a.carbG} g carboidrato � ${a.fatG} g gordura.`,
    `Distribua em ${a.mealsPerDay} refei��es.`,
    a.restrictions.length ? `Respeite: ${a.restrictions.join(', ')}.` : '',
    'Configure AI_API_KEY para receber sugest�es de pratos.',
  ].filter(Boolean).join('\n');

  const viaAi = await ask([
    `Meta J� CALCULADA pelo sistema � n�o recalcule: ${a.kcal} kcal, ${a.proteinG} g prote�na, ${a.carbG} g carbo, ${a.fatG} g gordura.`,
    `Refei��es por dia: ${a.mealsPerDay}.`,
    `Restri��es: ${a.restrictions.join(', ') || 'nenhuma'}. ${a.plantBased ? 'Dieta � base vegetal.' : ''}`,
    a.dietNotes ? `O usu�rio come habitualmente: ${a.dietNotes}.` : '',
    `Monte ${a.mealsPerDay} refei��es pr�ticas, baratas e f�ceis de preparar no dia a dia.`,
    'Liste apenas os alimentos, com quantidades aproximadas. N�o repita os n�meros de calorias.',
  ].join('\n'));

  return viaAi ?? fallback;
}

/**
 * Revis�o cr�tica do treino pela IA.
 *
 * A IA pode apontar furos que regras fixas n�o pegam (exerc�cios repetidos
 * demais, ordem ruim, excesso de volume) � mas ela NUNCA adiciona exerc�cio
 * bloqueado nem altera s�ries: essas decis�es ficam no motor determin�stico.
 */
export async function reviewTraining(a: {
  profile: string;
  blocks: { name: string; target: string; minutes: number }[];
  blocked: string[];
}): Promise<string> {
  const fallback = [
    'Revis�o autom�tica indispon�vel (sem AI_API_KEY).',
    'Revise: descanso suficiente entre os blocos e progress�o gradual.',
  ].join('\n');

  const viaAi = await ask([
    `Perfil: ${a.profile}.`,
    `Treino de hoje: ${a.blocks.map((b) => `${b.name} (${b.target}, ${b.minutes} min)`).join('; ')}.`,
    `Bloqueados por seguran�a (NUNCA sugerir): ${a.blocked.join(', ') || 'nenhum'}.`,
    'Aponte falhas: repeti��o excessiva, ordem inadequada, excesso de volume, falta de descanso.',
    'Seja breve: 3 a 5 pontos pr�ticos. N�o proponha exerc�cio fora da lista nem altere s�ries.',
  ].join('\n'));

  return viaAi ?? fallback;
}