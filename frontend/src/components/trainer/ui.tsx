import { useId, useState, type ReactNode } from 'react';
import type { ExerciseUnit, SetEntry } from '../../types/trainer';

/* ── Formatação ─────────────────────────────────────────────────────────── */

const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export const fmtKg = (kg: number | null | undefined) => (kg === null || kg === undefined ? '—' : `${nf1.format(kg)} kg`);
export const fmtNum = (n: number) => nf0.format(n);
export const fmtDec = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: digits });
/** 12.400 kg → "12,4 t"; abaixo de 1 t continua em kg. */
export const fmtVolume = (kg: number) => (kg >= 1000 ? `${nf1.format(kg / 1000)} t` : `${nf0.format(kg)} kg`);
export const fmtMinutes = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min} min`);
export const fmtClock = (totalSeconds: number) => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

const asDate = (day: string) => new Date(`${day}T12:00:00`);
export const fmtDay = (day: string) => asDate(day).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
export const fmtWeekday = (day: string) => asDate(day).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
export const relativeDay = (day: string, today = new Date()) => {
  const diff = Math.round((asDate(day).getTime() - new Date(today.toDateString()).getTime() - 12 * 3_600_000) / 86_400_000);
  if (diff === 0) return 'hoje';
  if (diff === -1) return 'ontem';
  if (diff > -7 && diff < 0) return `há ${-diff} dias`;
  return fmtDay(day);
};

export const unitShort = (unit: ExerciseUnit) => (unit === 'segundos' ? 's' : unit === 'minutos' ? 'min' : 'reps');

/** "3 × 10 · 40 kg" a partir das séries; agrupa séries iguais. */
export const describeSets = (sets: SetEntry[], unit: ExerciseUnit = 'reps') => {
  if (!sets.length) return '—';
  const suffix = unit === 'reps' ? '' : ` ${unitShort(unit)}`;
  const same = sets.every((set) => set.reps === sets[0].reps && set.loadKg === sets[0].loadKg);
  if (same) return `${sets.length} × ${sets[0].reps}${suffix}${sets[0].loadKg ? ` · ${fmtKg(sets[0].loadKg)}` : ''}`;
  return sets.map((set) => `${set.loadKg ? `${nf1.format(set.loadKg)}×` : ''}${set.reps}${suffix}`).join(' · ');
};

export const GROUP_LABELS: Record<string, string> = {
  peito: 'Peito', costas: 'Costas', pernas: 'Pernas', ombros: 'Ombros',
  bracos: 'Braços', core: 'Core', cardio: 'Cardio', mobilidade: 'Mobilidade',
};

export const EQUIPMENT_LABELS: Record<string, string> = {
  nenhum: 'Sem equipamento', 'peso-corporal': 'Calistenia', halteres: 'Halteres',
  academia: 'Academia', elastico: 'Elástico', 'barra-fixa': 'Barra fixa',
};

/* ── Ícones do módulo (mesmo traço dos ícones do app) ───────────────────── */

const icon = (path: ReactNode, size = 18) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
);
export const I = {
  today: (s?: number) => icon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, s),
  plan: (s?: number) => icon(<><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4M7 13h3M7 17h3M14 13h3" /></>, s),
  library: (s?: number) => icon(<><path d="M6.5 6.5h11M6.5 17.5h11" /><path d="M3 9v6M21 9v6M6.5 5v14M17.5 5v14" /></>, s),
  progress: (s?: number) => icon(<><path d="M3 20h18" /><path d="M6 16l4-5 3 3 5-7" /><path d="M15 7h3v3" /></>, s),
  body: (s?: number) => icon(<><circle cx="12" cy="4.5" r="2" /><path d="M5 9l7-1 7 1M12 8v6M12 14l-3 7M12 14l3 7" /></>, s),
  food: (s?: number) => icon(<><path d="M7 3v8a2 2 0 0 0 2 2v8M7 3v5M11 3v5M7 8h4" /><path d="M17 21V3c-2 1.5-3 4-3 7v3h3" /></>, s),
  play: (s?: number) => icon(<path d="M7 4l13 8-13 8z" fill="currentColor" stroke="none" />, s),
  check: (s?: number) => icon(<path d="M5 12.5l4.5 4.5L19 7.5" />, s),
  swap: (s?: number) => icon(<><path d="M7 4L3 8l4 4M3 8h14" /><path d="M17 20l4-4-4-4M21 16H7" /></>, s),
  info: (s?: number) => icon(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>, s),
  close: (s?: number) => icon(<path d="M6 6l12 12M18 6L6 18" />, s),
  plus: (s?: number) => icon(<path d="M12 5v14M5 12h14" />, s),
  minus: (s?: number) => icon(<path d="M5 12h14" />, s),
  trash: (s?: number) => icon(<><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>, s),
  flame: (s?: number) => icon(<path d="M12 21c-4 0-7-2.7-7-6.5 0-3 2-5 3.5-6.5.3 2 1.5 3 2.5 3 0-3 1-6 4-8 0 3 1.5 4.5 3 6.5 1 1.3 1 2.5 1 5C19 18.3 16 21 12 21z" />, s),
  trophy: (s?: number) => icon(<><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 21l1-4h4l1 4" /></>, s),
  clock: (s?: number) => icon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, s),
  bolt: (s?: number) => icon(<path d="M13 3L5 13h6l-1 8 8-10h-6z" />, s),
  edit: (s?: number) => icon(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></>, s),
  chevron: (s?: number) => icon(<path d="M9 6l6 6-6 6" />, s),
  up: (s?: number) => icon(<path d="M6 15l6-6 6 6" />, s),
  down: (s?: number) => icon(<path d="M6 9l6 6 6-6" />, s),
  search: (s?: number) => icon(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>, s),
  spark: (s?: number) => icon(<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />, s),
};

/* ── Peças visuais ──────────────────────────────────────────────────────── */

/** Anel de progresso (0–1) com conteúdo no centro. */
export function Ring({ value, size = 64, stroke = 6, color = 'var(--accent)', children }: {
  value: number; size?: number; stroke?: number; color?: string; children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="tr-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--tr-track)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div className="tr-ring-inner">{children}</div>
    </div>
  );
}

export function Stat({ label, value, hint, icon: iconNode, tone }: {
  label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: 'accent' | 'ok' | 'warn' | 'fire';
}) {
  return (
    <div className={`tr-stat ${tone ?? ''}`}>
      <span className="tr-stat-label">{iconNode}{label}</span>
      <b className="tr-stat-value">{value}</b>
      {hint && <small className="tr-stat-hint">{hint}</small>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="tr-empty">
      <b>{title}</b>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/** Linha com área: rótulo por ponto, valor e dica ao passar o mouse. */
export function LineChart({ points, unit = '', height = 160, color = 'var(--accent)', format = (v: number) => nf1.format(v) }: {
  points: { label: string; value: number }[]; unit?: string; height?: number; color?: string; format?: (v: number) => string;
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return null;
  const width = 560;
  const padX = 14;
  const padTop = 18;
  const padBottom = 22;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.max(1, Math.abs(max) * 0.1);
  const lo = min - span * 0.15;
  const hi = max + span * 0.15;
  const x = (i: number) => (points.length === 1 ? width / 2 : padX + (i * (width - padX * 2)) / (points.length - 1));
  const y = (v: number) => padTop + (1 - (v - lo) / (hi - lo)) * (height - padTop - padBottom);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${height - padBottom} L${x(0)},${height - padBottom} Z`;
  const active = hover ?? points.length - 1;

  return (
    <div className="tr-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Gráfico: ${points.map((p) => `${p.label} ${format(p.value)}${unit}`).join(', ')}`}
        onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity=".28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={padX} x2={width - padX} y1={padTop + f * (height - padTop - padBottom)} y2={padTop + f * (height - padTop - padBottom)} className="tr-chart-grid" />
        ))}
        {points.length > 1 && <path d={area} fill={`url(#${gradientId})`} />}
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={`${p.label}-${i}`}>
            <rect x={x(i) - (width / points.length) / 2} y={0} width={width / points.length} height={height} fill="transparent" onMouseEnter={() => setHover(i)} />
            <circle cx={x(i)} cy={y(p.value)} r={i === active ? 5 : 3} fill={i === active ? color : 'var(--bg)'} stroke={color} strokeWidth="2" />
          </g>
        ))}
        <line x1={x(active)} x2={x(active)} y1={padTop - 6} y2={height - padBottom} className="tr-chart-cursor" />
        <text x={Math.min(width - 60, Math.max(60, x(active)))} y={11} textAnchor="middle" className="tr-chart-tip">
          {format(points[active].value)}{unit} · {points[active].label}
        </text>
        {points.length > 1 && <>
          <text x={padX} y={height - 5} className="tr-chart-axis">{points[0].label}</text>
          <text x={width - padX} y={height - 5} textAnchor="end" className="tr-chart-axis">{points[points.length - 1].label}</text>
        </>}
      </svg>
    </div>
  );
}

/** Barras verticais simples com rótulo embaixo e valor no topo da ativa. */
export function BarChart({ bars, height = 150, format = (v: number) => nf0.format(v), highlightLast = true }: {
  bars: { label: string; value: number; hint?: string }[]; height?: number; format?: (v: number) => string; highlightLast?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const active = hover ?? (highlightLast ? bars.length - 1 : null);
  return (
    <div className="tr-bars" style={{ height }} onMouseLeave={() => setHover(null)}>
      {bars.map((bar, i) => (
        <div key={`${bar.label}-${i}`} className={`tr-bar ${i === active ? 'active' : ''}`} onMouseEnter={() => setHover(i)} title={bar.hint ?? `${bar.label}: ${format(bar.value)}`}>
          <span className="tr-bar-value">{i === active ? format(bar.value) : ''}</span>
          <div className="tr-bar-track"><i style={{ height: `${(bar.value / max) * 100}%` }} /></div>
          <span className="tr-bar-label">{bar.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Calendário estilo GitHub: colunas são semanas (seg → dom). */
export function Heatmap({ days }: { days: { day: string; sessions: number; volumeKg: number; future: boolean }[] }) {
  const weeks: typeof days[] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const maxVolume = Math.max(1, ...days.map((d) => d.volumeKg));
  const level = (d: typeof days[number]) => {
    if (!d.sessions) return 0;
    if (!d.volumeKg) return 2;
    return 1 + Math.min(3, Math.ceil((d.volumeKg / maxVolume) * 3));
  };
  return (
    <div className="tr-heat" role="img" aria-label={`${days.filter((d) => d.sessions).length} dias com treino nas últimas ${weeks.length} semanas`}>
      <div className="tr-heat-days"><span>Seg</span><span /><span>Qua</span><span /><span>Sex</span><span /><span>Dom</span></div>
      <div className="tr-heat-grid">
        {weeks.map((week) => (
          <div className="tr-heat-col" key={week[0].day}>
            {week.map((d) => (
              <i key={d.day} className={`l${level(d)} ${d.future ? 'future' : ''}`}
                title={d.future ? '' : `${fmtDay(d.day)}: ${d.sessions ? `${d.sessions} treino${d.sessions > 1 ? 's' : ''}${d.volumeKg ? ` · ${fmtVolume(d.volumeKg)}` : ''}` : 'sem treino'}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Painel lateral deslizante (detalhe de exercício, troca). */
export function Drawer({ title, subtitle, onClose, children, wide }: {
  title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  return (
    <div className="tr-drawer-backdrop" onClick={onClose} role="presentation">
      <aside className={`tr-drawer ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Detalhes'} onClick={(e) => e.stopPropagation()}>
        <header className="tr-drawer-head">
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button type="button" className="tr-icon-btn" onClick={onClose} aria-label="Fechar">{I.close()}</button>
        </header>
        <div className="tr-drawer-body">{children}</div>
      </aside>
    </div>
  );
}
