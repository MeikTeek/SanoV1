import type { PlayerStats } from '../../types/trainer';

interface Props {
  stats: PlayerStats;
  /** Escala máxima do radar (o maior atributo fica perto da borda). */
  max?: number;
  size?: number;
}

const AXES: { key: keyof PlayerStats; label: string }[] = [
  { key: 'strength', label: 'FOR' },
  { key: 'stamina', label: 'RES' },
  { key: 'vitality', label: 'VIT' },
  { key: 'agility', label: 'AGI' },
];

/**
 * Radar de atributos em SVG puro — sem biblioteca externa.
 * Eixos fixos (4) mantêm o desenho estável entre renders, o que evita a
 * "animação maluca" quando um atributo sobe e outro desce.
 */
export default function StatRadar({ stats, max, size = 220 }: Props) {
  const values = AXES.map((a) => Number(stats[a.key] ?? 0));
  const top = max ?? Math.max(20, ...values) * 1.15;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 34;

  const point = (i: number, ratio: number) => {
    const angle = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
    return [cx + Math.cos(angle) * radius * ratio, cy + Math.sin(angle) * radius * ratio] as const;
  };

  const polygon = values
    .map((v, i) => point(i, Math.max(0.08, Math.min(1, v / top))).map((n) => n.toFixed(1)).join(','))
    .join(' ');

  return (
    <svg className="radar" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Atributos do jogador">
      {/* Grade */}
      {[0.25, 0.5, 0.75, 1].map((r) => (
        <polygon key={r} className="radar-grid" points={AXES.map((_, i) => point(i, r).join(',')).join(' ')} />
      ))}
      {/* Eixos e rótulos */}
      {AXES.map((a, i) => {
        const [x, y] = point(i, 1);
        const [lx, ly] = point(i, 1.16);
        return (
          <g key={a.key}>
            <line className="radar-axis" x1={cx} y1={cy} x2={x} y2={y} />
            <text className="radar-label" x={lx} y={ly} textAnchor="middle" dominantBaseline="middle">{a.label}</text>
            <text className="radar-value" x={lx} y={ly + 12} textAnchor="middle" dominantBaseline="middle">
              {Number(stats[a.key] ?? 0).toFixed(1)}
            </text>
          </g>
        );
      })}
      {/* Área do jogador */}
      <polygon className={`radar-area ${stats.debuffed ? 'debuffed' : ''}`} points={polygon} />
      {AXES.map((_, i) => {
        const [x, y] = point(i, Math.max(0.08, Math.min(1, values[i] / top)));
        return <circle key={i} className="radar-dot" cx={x} cy={y} r={3.5} />;
      })}
    </svg>
  );
}