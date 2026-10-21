import { useEffect, useState } from 'react';
import { financeApi } from '../../services/finance.service';
import type { FinanceReports } from '../../types/finance';
import { money, monthLabel } from './format';

interface Props {
  month: string;
  refreshKey: number;
  onError: (message: string) => void;
}

/** Paleta validada (CVD e contraste) contra a superfície escura #1a1a1a. */
const INCOME = '#00a4b8';
const SPENDING = '#d9733a';

const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const axisMoney = (cents: number) => `R$ ${compact.format(cents / 100)}`;

/** Escala "bonita" para o eixo: 0 até um teto arredondado, 4 divisões. */
function niceMax(value: number) {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude * 4 >= value) ?? 10;
  return step * magnitude * 4;
}

/** Retângulo com cantos de 4px só no topo (ancorado na linha de base). */
function barPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function CashflowChart({ data }: { data: FinanceReports['cashflow'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 240, left = 64, right = 12, top = 12, bottom = 28;
  const plotW = W - left - right, plotH = H - top - bottom;
  const max = niceMax(Math.max(...data.flatMap((d) => [d.income, d.spending])));
  const slot = plotW / data.length;
  const barW = Math.min(28, (slot - 18) / 2);
  const y = (v: number) => top + plotH - (Math.max(v, 0) / max) * plotH;
  const active = hover !== null ? data[hover] : null;

  return (
    <div className="fin-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Receitas e gastos dos últimos 6 meses" onMouseLeave={() => setHover(null)}>
        {[0, 1, 2, 3, 4].map((i) => {
          const v = (max / 4) * i;
          return (
            <g key={i}>
              <line x1={left} x2={W - right} y1={y(v)} y2={y(v)} className={i === 0 ? 'fin-axis' : 'fin-grid'} />
              <text x={left - 8} y={y(v) + 4} textAnchor="end" className="fin-tick">{axisMoney(v)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const cx = left + slot * i + slot / 2;
          return (
            <g key={d.month}>
              {hover === i && <rect x={left + slot * i + 2} y={top} width={slot - 4} height={plotH} className="fin-hover-band" />}
              <path d={barPath(cx - barW - 1, y(d.income), barW, top + plotH - y(d.income))} fill={INCOME} />
              <path d={barPath(cx + 1, y(d.spending), barW, top + plotH - y(d.spending))} fill={SPENDING} />
              <text x={cx} y={H - 8} textAnchor="middle" className="fin-tick">{monthLabel(d.month, 'short')}</text>
              {/* Alvo de hover maior que as barras. */}
              <rect x={left + slot * i} y={top} width={slot} height={plotH + bottom} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      {active && hover !== null && (
        <div className="fin-tooltip" style={{ left: `${((left + slot * hover + slot / 2) / W) * 100}%` }}>
          <strong>{monthLabel(active.month)}</strong>
          <span><i style={{ background: INCOME }} />Receitas {money(active.income)}</span>
          <span><i style={{ background: SPENDING }} />Gastos {money(active.spending)}</span>
          <span>Resultado {money(active.net)}</span>
        </div>
      )}
    </div>
  );
}

function NetWorthChart({ data }: { data: FinanceReports['netWorth'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 180, left = 64, right = 16, top = 14, bottom = 28;
  const plotW = W - left - right, plotH = H - top - bottom;
  const values = data.map((d) => d.value);
  const lo = Math.min(0, ...values);
  const hi = Math.max(...values, lo + 100);
  const x = (i: number) => left + (data.length === 1 ? plotW / 2 : (plotW / (data.length - 1)) * i);
  const y = (v: number) => top + plotH - ((v - lo) / (hi - lo)) * plotH;
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.value)}`).join('');
  const active = hover !== null ? data[hover] : null;

  return (
    <div className="fin-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Patrimônio no fim de cada mês" onMouseLeave={() => setHover(null)}>
        {[lo, (lo + hi) / 2, hi].map((v, i) => (
          <g key={i}>
            <line x1={left} x2={W - right} y1={y(v)} y2={y(v)} className={v === 0 ? 'fin-axis' : 'fin-grid'} />
            <text x={left - 8} y={y(v) + 4} textAnchor="end" className="fin-tick">{axisMoney(v)}</text>
          </g>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={top} y2={top + plotH} className="fin-crosshair" />}
        <path d={line} fill="none" stroke={INCOME} strokeWidth={2} strokeLinejoin="round" />
        {data.map((d, i) => (
          <g key={d.month}>
            <circle cx={x(i)} cy={y(d.value)} r={hover === i ? 5 : 4} fill={INCOME} stroke="#1a1a1a" strokeWidth={2} />
            <text x={x(i)} y={H - 8} textAnchor="middle" className="fin-tick">{monthLabel(d.month, 'short')}</text>
            <rect x={x(i) - plotW / data.length / 2} y={top} width={plotW / data.length} height={plotH + bottom} fill="transparent" onMouseEnter={() => setHover(i)} />
          </g>
        ))}
      </svg>
      {active && hover !== null && (
        <div className="fin-tooltip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <strong>{monthLabel(active.month)}</strong>
          <span>Patrimônio {money(active.value)}</span>
        </div>
      )}
    </div>
  );
}

export default function ReportsView({ month, refreshKey, onError }: Props) {
  const [data, setData] = useState<FinanceReports | null>(null);
  const [asTable, setAsTable] = useState(false);

  useEffect(() => {
    financeApi.reports(month).then(setData).catch((e: Error) => onError(e.message));
  }, [month, refreshKey, onError]);

  if (!data) return <p className="muted">Carregando relatórios…</p>;
  const current = data.cashflow[data.cashflow.length - 1];
  const maxCategory = Math.max(1, ...data.byCategory.map((c) => c.spent));

  return (
    <div className="fin-reports">
      <div className="fin-stats">
        <section className="card"><span>Receitas · {monthLabel(month)}</span><strong>{money(current.income)}</strong></section>
        <section className="card"><span>Gastos · {monthLabel(month)}</span><strong>{money(current.spending)}</strong></section>
        <section className="card">
          <span>Resultado do mês</span>
          <strong className={current.net >= 0 ? 'fin-pos' : 'fin-neg'}>{current.net >= 0 ? '▲ ' : '▼ '}{money(current.net)}</strong>
        </section>
      </div>

      <section className="card">
        <div className="fin-card-head">
          <h3>Receitas × gastos · últimos 6 meses</h3>
          <div className="fin-legend">
            <span><i style={{ background: INCOME }} />Receitas</span>
            <span><i style={{ background: SPENDING }} />Gastos</span>
            <button type="button" className="fin-link" onClick={() => setAsTable((v) => !v)}>{asTable ? 'ver gráfico' : 'ver tabela'}</button>
          </div>
        </div>
        {asTable ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Mês</th><th className="fin-num">Receitas</th><th className="fin-num">Gastos</th><th className="fin-num">Resultado</th></tr></thead>
              <tbody>{data.cashflow.map((row) => (
                <tr key={row.month}><td>{monthLabel(row.month)}</td><td className="fin-num">{money(row.income)}</td><td className="fin-num">{money(row.spending)}</td><td className="fin-num">{money(row.net)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        ) : <CashflowChart data={data.cashflow} />}
      </section>

      <div className="fin-report-columns">
        <section className="card">
          <h3>Gastos por categoria · {monthLabel(month)}</h3>
          {data.byCategory.length === 0 && <p className="muted">Nenhum gasto categorizado neste mês.</p>}
          <ul className="fin-hbars">
            {data.byCategory.map((row) => (
              <li key={row.categoryId} title={`${row.group} › ${row.name}: ${money(row.spent)}`}>
                <div className="fin-hbar-label"><span>{row.name}</span><strong>{money(row.spent)}</strong></div>
                <div className="fin-hbar-track"><div style={{ width: `${(row.spent / maxCategory) * 100}%`, background: SPENDING }} /></div>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h3>Patrimônio</h3>
          <p className="muted fin-networth">{money(data.netWorth[data.netWorth.length - 1]?.value ?? 0)} no fim de {monthLabel(month)}</p>
          <NetWorthChart data={data.netWorth} />
        </section>
      </div>
    </div>
  );
}
