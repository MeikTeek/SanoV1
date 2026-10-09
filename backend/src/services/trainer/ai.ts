import { env } from '../../config/env';

/**
 * Camada de IA do trainer — os "20% de toque mágico".
 *
 * Regra de ouro do módulo: a IA NUNCA calcula exercício, volume ou segurança.
 * Tudo isso já vem pronto do motor determinístico (rules.ts); aqui ela só
 * transforma números em texto com a temática do sistema. Isso mantém o módulo
 * funcionando (e seguro) mesmo sem chave configurada.
 *
 * Se AI_API_KEY faltar ou a chamada falhar, cai no texto local — o usuário
 * nunca fica sem resposta.
 */

export const aiEnabled = () => Boolean(env.AI_API_KEY && env.AI_BASE_URL);

const SYSTEM_PROMPT = `Você — o Sistema/Coach de um aplicativo pessoal gamificado, no estilo "Solo Leveling".
Regras invioláveis:
- NUNCA invente exercícios, séries, repetições ou valores de treino. Use SOMENTE os dados fornecidos.
- NUNCA recomende exercício que não esteja na lista recebida.
- Não dá diagnóstico médico. Se houver lesão ou dor, recomende avaliação profissional.
- Fale em português do Brasil, direto, motivador e curto (máximo 6 linhas).`;

/** Chamada — IA. Devolve null em qualquer falha — nunca lança. */
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
        // Este modelo raciocina por padrão, e isso custava ~5 s por resposta.
        // `effort: low` mantém a qualidade e corta o tempo pela metade.
        ...(effort ? { reasoning: { effort } } : {}),
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      }),
      // Teto por chamada: a UI não pode ficar pendurada.
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
    // o orçamento de tokens corta a resposta final — nesse caso, usa o que houver.
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
    `Plano montado para ${i.username} — objetivo: ${i.goalLabel}.`,
    `Treino de hoje: ${i.plan.plannedMinutes} minutos, ${i.plan.blocks.length} exercícios.`,
    i.exclusions.length ? `${i.exclusions.length} exercício(s) foram removidos por segurança.` : '',
  ].filter(Boolean).join('\n');

  const viaAi = await ask([
    `Jogador: ${i.username}. Objetivo: ${i.goalLabel}.`,
    `Treino de hoje: ${i.plan.title} — ${i.plan.plannedMinutes} min.`,
    `Exercícios: ${i.plan.blocks.map((b) => `${b.name} (${b.target})`).join('; ')}.`,
    i.exclusions.length ? `Removidos por segurança: ${i.exclusions.map((e) => `${e.name} — ${e.reason}`).join('; ')}.` : '',
    'Escreva uma abertura curta (2-4 linhas) explicando o foco do treino de hoje.',
  ].join('\n'));

  return viaAi ?? fallback;
}

/** Relatório semanal em tom imersivo, a partir dos dados brutos. */
export async function weeklyReport(a: {
  username: string; goalLabel: string; level: number; levelTitle: string;
  streak: number; completedDays: number; totalMinutes: number;
  statGains: { attr: string; gain: number }[]; weakDay?: string;
}): Promise<string> {
  const fallback = [
    `Resumo da semana — ${a.username}. Objetivo: ${a.goalLabel}.`,
    `${a.completedDays} dia(s) concluído(s), ${a.totalMinutes} minutos, ofensiva de ${a.streak}.`,
    a.statGains.length ? `Ganhos: ${a.statGains.map((g) => `${g.attr} +${g.gain.toFixed(1)}`).join(', ')}.` : 'Sem ganhos registrados nesta semana.',
    a.weakDay ? `Atenção: queda de rendimento em ${a.weakDay}.` : '',
  ].filter(Boolean).join('\n');

  const viaAi = await ask([
    `Jogador ${a.username}, objetivo ${a.goalLabel}, nível ${a.level} (${a.levelTitle}).`,
    `Semana: ${a.completedDays} dias conclu—dos, ${a.totalMinutes} minutos, ofensiva ${a.streak}.`,
    `Ganhos por atributo: ${a.statGains.map((g) => `${g.attr} +${g.gain.toFixed(1)}`).join(', ') || 'nenhum'}.`,
    a.weakDay ? `Ponto fraco: ${a.weakDay}.` : '',
    'Escreva o resumo semanal (3-5 linhas), direto e prático.',
  ].join('\n'));

  return viaAi ?? fallback;
}

/** Tira-dúvidas biomecânico, sempre ciente das lesões e do equipamento. */
export async function biomechanicsAnswer(question: string, ctx: {
  injuries: string[]; equipment: string[]; exerciseList: string;
}): Promise<string> {
  const fallback = [
    'Este módulo está rodando sem IA configurada (falta AI_API_KEY no backend/.env).',
    'Dica geral: mantenha a coluna neutra, controle a descida e pare se houver dor.',
  ].join('\n');

  const viaAi = await ask([
    `Pergunta: ${question}`,
    `Lesões declaradas: ${ctx.injuries.join(', ') || 'nenhuma'}.`,
    `Equipamento disponível: ${ctx.equipment.join(', ') || 'nenhum'}.`,
    `Pode mencionar apenas estes exercícios: ${ctx.exerciseList}.`,
    'Explique a execução com foco em segurança e biomecânica. Máximo 8 linhas. Se pedirem diagnóstico ou tratamento de lesão, recomende um profissional.',
  ].join('\n'), { timeout: 20_000 });

  return viaAi ?? fallback;
}

/** Cardápio: a IA recebe os números já calculados pelo código. */
export async function mealPlan(a: {
  kcal: number; proteinG: number; carbG: number; fatG: number;
  mealsPerDay: number; restrictions: string[]; plantBased: boolean; dietNotes?: string;
}): Promise<string> {
  const fallback = [
    `Meta diária: ${a.kcal} kcal — ${a.proteinG} g proteína — ${a.carbG} g carboidrato — ${a.fatG} g gordura.`,
    `Distribua em ${a.mealsPerDay} refeições.`,
    a.restrictions.length ? `Respeite: ${a.restrictions.join(', ')}.` : '',
    'Configure AI_API_KEY para receber sugestões de pratos.',
  ].filter(Boolean).join('\n');

  const viaAi = await ask([
    `Meta Já CALCULADA pelo sistema — não recalcule: ${a.kcal} kcal, ${a.proteinG} g proteína, ${a.carbG} g carbo, ${a.fatG} g gordura.`,
    `Refeições por dia: ${a.mealsPerDay}.`,
    `Restrições: ${a.restrictions.join(', ') || 'nenhuma'}. ${a.plantBased ? 'Dieta — base vegetal.' : ''}`,
    a.dietNotes ? `O usuário come habitualmente: ${a.dietNotes}.` : '',
    `Monte ${a.mealsPerDay} refeições práticas, baratas e fáceis de preparar no dia a dia.`,
    'Liste apenas os alimentos, com quantidades aproximadas. Não repita os números de calorias.',
  ].join('\n'));

  return viaAi ?? fallback;
}

/**
 * Revisão crítica do treino pela IA.
 *
 * A IA pode apontar furos que regras fixas não pegam (exercícios repetidos
 * demais, ordem ruim, excesso de volume) — mas ela NUNCA adiciona exercício
 * bloqueado nem altera séries: essas decisões ficam no motor determinístico.
 */
export async function reviewTraining(a: {
  profile: string;
  blocks: { name: string; target: string; minutes: number }[];
  blocked: string[];
}): Promise<string> {
  const fallback = [
    'Revisão automática indisponível (sem AI_API_KEY).',
    'Revise: descanso suficiente entre os blocos e progressão gradual.',
  ].join('\n');

  const viaAi = await ask([
    `Perfil: ${a.profile}.`,
    `Treino de hoje: ${a.blocks.map((b) => `${b.name} (${b.target}, ${b.minutes} min)`).join('; ')}.`,
    `Bloqueados por segurança (NUNCA sugerir): ${a.blocked.join(', ') || 'nenhum'}.`,
    'Aponte falhas: repetição excessiva, ordem inadequada, excesso de volume, falta de descanso.',
    'Seja breve: 3 a 5 pontos práticos. Não proponha exercício fora da lista nem altere séries.',
  ].join('\n'));

  return viaAi ?? fallback;
}