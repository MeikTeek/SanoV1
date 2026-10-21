import { useEffect, useState } from 'react';
import { getDiet } from '../../services/trainer.service';
import type { DietNumbers } from '../../types/trainer';
import { I, fmtDec } from './ui';

type Diet = { numbers: DietNumbers; meals: string; aiEnabled: boolean };

/** Rosca de macros: cada fatia é a parte das calorias que vem do macro. */
function MacroDonut({ n }: { n: DietNumbers }) {
  const parts = [
    { key: 'p', kcal: n.proteinG * 4, color: 'var(--accent)' },
    { key: 'c', kcal: n.carbG * 4, color: 'var(--ok)' },
    { key: 'f', kcal: n.fatG * 9, color: 'var(--warn)' },
  ];
  const total = parts.reduce((s, p) => s + p.kcal, 0) || 1;
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="tr-donut">
      <svg viewBox="0 0 140 140" aria-hidden="true">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--tr-track)" strokeWidth="14" />
        {parts.map((p) => {
          const len = (p.kcal / total) * c;
          const el = <circle key={p.key} cx="70" cy="70" r={r} fill="none" stroke={p.color} strokeWidth="14"
            strokeDasharray={`${Math.max(0, len - 3)} ${c}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)" />;
          offset += len;
          return el;
        })}
      </svg>
      <div className="tr-donut-center"><b>{n.kcal}</b><span>kcal/dia</span></div>
    </div>
  );
}

export default function NutritionView() {
  const [diet, setDiet] = useState<Diet | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { getDiet().then(setDiet).catch((e) => setError((e as Error).message)); }, []);

  if (!diet) return <div className="tr-view">{error ? <div className="tr-alert bad">{error}</div> : <div className="tr-skeleton" style={{ height: 320 }} />}</div>;
  const n = diet.numbers;
  const pct = (kcal: number) => Math.round((kcal / n.kcal) * 100);
  const meals = diet.meals.split('\n').map((line) => line.trim()).filter(Boolean);

  return (
    <div className="tr-view">
      <header className="tr-view-head">
        <div><h2>Nutrição</h2><p className="muted">Metas calculadas pelo seu peso, objetivo, treino e sono.</p></div>
      </header>

      <section className="tr-card tr-nutri">
        <MacroDonut n={n} />
        <div className="tr-macros">
          <div className="tr-macro p"><span>Proteína</span><b>{n.proteinG} g</b><small>{pct(n.proteinG * 4)}% das calorias</small></div>
          <div className="tr-macro c"><span>Carboidratos</span><b>{n.carbG} g</b><small>{pct(n.carbG * 4)}% das calorias</small></div>
          <div className="tr-macro f"><span>Gorduras</span><b>{n.fatG} g</b><small>{pct(n.fatG * 9)}% das calorias</small></div>
          <div className="tr-macro w"><span>Água</span><b>{fmtDec(n.waterTarget)} L</b><small>ao longo do dia</small></div>
        </div>
      </section>

      <div className="tr-grid-2 wide-left">
        <section className="tr-card">
          <header className="tr-card-head"><h3>{I.food(16)} Sugestão de refeições</h3>{!diet.aiEnabled && <span className="muted">IA desligada</span>}</header>
          {diet.aiEnabled || meals.length > 1
            ? <ul className="tr-meals">{meals.map((line, i) => {
              const [title, ...rest] = line.split(':');
              return rest.length ? <li key={i}><b>{title}</b><span>{rest.join(':').trim()}</span></li> : <li key={i}><span>{line}</span></li>;
            })}</ul>
            : <p className="muted">{diet.meals || 'Sem chave de IA configurada: as metas acima continuam valendo, mas não há sugestão de pratos.'}</p>}
        </section>
        <section className="tr-card">
          <header className="tr-card-head"><h3>Por que esses números</h3></header>
          <ul className="tr-rationale">{n.rationale.map((r, i) => <li key={i}>{r}</li>)}</ul>
          <p className="tr-footnote">Gasto estimado (TDEE): {n.tdee} kcal. Estimativas não substituem um nutricionista.</p>
        </section>
      </div>
    </div>
  );
}
