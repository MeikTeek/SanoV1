import type { Intent } from '../sano/types';
import { registerIntent } from './registry';

export function registerSanoIntents(intents: Intent[]): void {
  for (const intent of intents) {
    registerIntent({
      id: intent.name,
      module: intent.name === 'treino' ? 'trainer' : intent.name === 'musica' ? 'music' : intent.name,
      patterns: [...intent.patterns, ...intent.examples, intent.name],
      entities: intent.name === 'agenda' ? ['title', 'date', 'time', 'participants', 'reminder'] : [],
      handler: intent,
      threshold: ['agenda', 'treino', 'whoami', 'settings'].includes(intent.name) ? 0.75 : 1.5,
    });
  }
}
