import { MUSCLE_PATHS } from './musclePaths';

/** Mesmos ids do backend (`services/trainer/muscles.ts`), no padrão do wger. */
export const MUSCLE_LABELS: Record<number, string> = {
  1: 'Bíceps', 2: 'Ombros', 3: 'Serrátil', 4: 'Peitoral', 5: 'Tríceps', 6: 'Abdômen',
  7: 'Panturrilha', 8: 'Glúteos', 9: 'Trapézio', 10: 'Quadríceps', 11: 'Posterior da coxa',
  12: 'Dorsais', 13: 'Braquial', 14: 'Oblíquos', 15: 'Sóleo', 16: 'Lombar',
};

type Props = {
  primary?: number[];
  secondary?: number[];
  /** Modo filtro: músculos clicáveis, os escolhidos ficam acesos. */
  selected?: number[];
  onToggle?: (id: number) => void;
  /** Modo recuperação: horas desde o último treino de cada músculo. */
  recovery?: { id: number; hoursSince: number }[];
  size?: 'sm' | 'md' | 'lg';
  /** Mostra só uma das vistas (útil em listas compactas). */
  only?: 'front' | 'back';
};

const recoveryClass = (hours: number) => (hours < 24 ? 'rec-3' : hours < 48 ? 'rec-2' : hours < 72 ? 'rec-1' : '');

/**
 * Mapa corporal de frente e costas. Os desenhos de fundo e os contornos dos
 * músculos vêm do wger (Wikimedia Commons); a cor vem do CSS, então o mesmo
 * componente serve para "músculos do exercício", filtro e recuperação.
 */
export default function MuscleMap({ primary = [], secondary = [], selected, onToggle, recovery, size = 'md', only }: Props) {
  const recoveryById = new Map((recovery ?? []).map((r) => [r.id, r.hoursSince]));
  const interactive = Boolean(onToggle);

  const stateOf = (id: number) => {
    if (recovery) return recoveryById.has(id) ? recoveryClass(recoveryById.get(id)!) : '';
    if (selected) return selected.includes(id) ? 'primary' : '';
    if (primary.includes(id)) return 'primary';
    if (secondary.includes(id)) return 'secondary';
    return '';
  };

  const side = (front: boolean) => (
    <svg viewBox="0 0 200 369" className="tr-map-side" role={interactive ? 'group' : 'img'}
      aria-label={front ? 'Vista frontal' : 'Vista de costas'}>
      <image href={`/muscles/body-${front ? 'front' : 'back'}.svg`} width="200" height="369" className="tr-map-base" />
      {MUSCLE_PATHS.filter((m) => m.front === front).map((muscle) => {
        const state = stateOf(muscle.id);
        const label = MUSCLE_LABELS[muscle.id];
        return (
          <g key={muscle.id} transform={muscle.transform}
            className={`tr-muscle ${state} ${interactive ? 'clickable' : ''}`}
            onClick={interactive ? () => onToggle!(muscle.id) : undefined}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-pressed={interactive ? state === 'primary' : undefined}
            aria-label={interactive ? label : undefined}
            onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle!(muscle.id); } } : undefined}>
            <title>{label}</title>
            {muscle.d.map((d, i) => <path key={i} d={d} />)}
          </g>
        );
      })}
    </svg>
  );

  return (
    <div className={`tr-map ${size}`}>
      {only !== 'back' && side(true)}
      {only !== 'front' && side(false)}
    </div>
  );
}
