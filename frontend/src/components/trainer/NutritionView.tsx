import { useEffect, useMemo, useState } from 'react';
import { getDiet } from '../../services/trainer.service';
import type { DietAssessment, DietNumbers, DietResponse, FoodRow, Macros, PlannedFood, PlannedMeal } from '../../types/trainer';
import { I, fmtDec } from './ui';

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

/** Aviso de IMC/saúde. Em `blocked` é a única coisa que a tela mostra. */
function AssessmentCard({ a, disclaimer }: { a: DietAssessment; disclaimer: string }) {
  const tone = a.level === 'blocked' ? 'bad' : a.level === 'caution' ? 'warn' : a.level === 'attention' ? 'attention' : 'ok';
  return (
    <section className={`tr-diet-alert ${tone}`} role={a.level === 'ok' ? undefined : 'alert'}>
      <div className="tr-diet-alert-head">
        <span className="tr-diet-alert-icon">{a.level === 'ok' ? I.check(18) : I.info(18)}</span>
        <div>
          <b>{a.title}</b>
          <small>IMC {fmtDec(a.bmi)} · {a.category}</small>
        </div>
      </div>
      {a.messages.length > 0 && <ul>{a.messages.map((m) => <li key={m}>{m}</li>)}</ul>}
      {a.level !== 'blocked' && <p className="tr-diet-disclaimer">{disclaimer}</p>}
    </section>
  );
}

const sumMacros = (list: Macros[]): Macros => list.reduce((acc, m) => ({
  kcal: acc.kcal + m.kcal, proteinG: acc.proteinG + m.proteinG, carbG: acc.carbG + m.carbG,
  fatG: acc.fatG + m.fatG, fiberG: acc.fiberG + m.fiberG,
}), { kcal: 0, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 });

type Shown = Macros & { key: string; name: string; grams: number; measure: string };

/** Item atual: o original ou a troca escolhida (índice nas alternativas). */
const shownItem = (item: PlannedFood, pick: number | undefined): Shown =>
  pick === undefined || pick < 0 ? item : item.alternatives[pick] ?? item;

function MealCard({ meal, mealIndex, swaps, onSwap }: {
  meal: PlannedMeal; mealIndex: number; swaps: Record<string, number>; onSwap: (id: string) => void;
}) {
  const items = meal.items.map((item, i) => ({ item, shown: shownItem(item, swaps[`${mealIndex}:${i}`]), id: `${mealIndex}:${i}` }));
  const totals = sumMacros(items.map((x) => x.shown));
  return (
    <article className="tr-meal">
      <header>
        <div><small>{meal.time}</small><h4>{meal.title}</h4></div>
        <span className="tr-meal-kcal"><b>{Math.round(totals.kcal)}</b> kcal</span>
      </header>
      <ul>
        {items.map(({ item, shown, id }) => (
          <li key={id}>
            <span className="tr-meal-role">{item.role}</span>
            <div className="tr-meal-food">
              <b>{shown.name}</b>
              <small>{shown.measure} · {shown.grams} g · {Math.round(shown.kcal)} kcal · P {Math.round(shown.proteinG)} · C {Math.round(shown.carbG)} · G {Math.round(shown.fatG)}</small>
            </div>
            {item.alternatives.length > 0 && (
              <button type="button" className="tr-icon-btn" onClick={() => onSwap(id)} title="Trocar por equivalente" aria-label={`Trocar ${shown.name}`}>{I.swap(15)}</button>
            )}
          </li>
        ))}
      </ul>
      <footer>
        P {Math.round(totals.proteinG)} g · C {Math.round(totals.carbG)} g · G {Math.round(totals.fatG)} g
        <span className="muted"> · meta ≈ {meal.target.kcal} kcal</span>
      </footer>
    </article>
  );
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

function FoodTable({ groups, items }: { groups: Record<string, string>; items: FoodRow[] }) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const list = useMemo(() => items
    .filter((f) => !group || f.group === group)
    .filter((f) => !query || norm(f.name).includes(norm(query))), [items, group, query]);
  return (
    <section className="tr-card">
      <header className="tr-card-head"><h3>{I.library(16)} Tabela de alimentos</h3><span className="muted">{items.length} alimentos · valores por 100 g</span></header>
      <div className="tr-food-filters">
        <label className="tr-search">{I.search(16)}<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar alimento" /></label>
        <div className="tr-food-chips">
          <button type="button" className={`tr-chip ${group === '' ? 'on' : ''}`} onClick={() => setGroup('')}>Todos</button>
          {Object.entries(groups).map(([key, label]) => (
            <button type="button" key={key} className={`tr-chip ${group === key ? 'on' : ''}`} onClick={() => setGroup(key)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="tr-food-scroll">
        <table className="tr-food-table">
          <thead><tr><th>Alimento</th><th>kcal</th><th>Prot.</th><th>Carb.</th><th>Gord.</th><th>Fibra</th><th>Medida caseira</th></tr></thead>
          <tbody>
            {list.map((f) => (
              <tr key={f.key}>
                <td>{f.name}</td>
                <td><b>{f.kcal}</b></td>
                <td>{fmtDec(f.proteinG)} g</td>
                <td>{fmtDec(f.carbG)} g</td>
                <td>{fmtDec(f.fatG)} g</td>
                <td>{fmtDec(f.fiberG)} g</td>
                <td className="muted">1 {f.unit.label} ≈ {f.unit.grams} g</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="muted">Nenhum alimento encontrado.</p>}
      </div>
    </section>
  );
}

export default function NutritionView() {
  const [diet, setDiet] = useState<DietResponse | null>(null);
  const [error, setError] = useState('');
  const [swaps, setSwaps] = useState<Record<string, number>>({});
  useEffect(() => { getDiet().then(setDiet).catch((e) => setError((e as Error).message)); }, []);

  if (!diet) return <div className="tr-view">{error ? <div className="tr-alert bad">{error}</div> : <div className="tr-skeleton" style={{ height: 320 }} />}</div>;

  const head = (
    <header className="tr-view-head">
      <div><h2>Nutrição</h2><p className="muted">Levantamento calculado por regras a partir do seu peso, objetivo, treino e de uma tabela de alimentos.</p></div>
    </header>
  );

  // Extremo: só o aviso, sem metas nem cardápio.
  if (diet.assessment.level === 'blocked' || !diet.numbers || !diet.plan) {
    return <div className="tr-view">{head}<AssessmentCard a={diet.assessment} disclaimer={diet.disclaimer} /></div>;
  }

  const n = diet.numbers;
  const plan = diet.plan;
  const pct = (kcal: number) => Math.round((kcal / n.kcal) * 100);
  const aiMeals = diet.meals.split('\n').map((line) => line.trim()).filter(Boolean);
  const swap = (id: string) => {
    const [mealIndex, itemIndex] = id.split(':').map(Number);
    const count = plan.meals[mealIndex].items[itemIndex].alternatives.length;
    setSwaps((current) => {
      const next = (current[id] ?? -1) + 1;
      return { ...current, [id]: next >= count ? -1 : next };
    });
  };
  const dayTotals = sumMacros(plan.meals.flatMap((meal, mealIndex) =>
    meal.items.map((item, i) => shownItem(item, swaps[`${mealIndex}:${i}`]))));

  return (
    <div className="tr-view">
      {head}
      <AssessmentCard a={diet.assessment} disclaimer={diet.disclaimer} />

      <section className="tr-card tr-nutri">
        <MacroDonut n={n} />
        <div className="tr-macros">
          <div className="tr-macro p"><span>Proteína</span><b>{n.proteinG} g</b><small>{pct(n.proteinG * 4)}% das calorias</small></div>
          <div className="tr-macro c"><span>Carboidratos</span><b>{n.carbG} g</b><small>{pct(n.carbG * 4)}% das calorias</small></div>
          <div className="tr-macro f"><span>Gorduras</span><b>{n.fatG} g</b><small>{pct(n.fatG * 9)}% das calorias</small></div>
          <div className="tr-macro w"><span>Água</span><b>{fmtDec(n.waterTarget)} L</b><small>ao longo do dia</small></div>
        </div>
      </section>

      <section className="tr-card">
        <header className="tr-card-head">
          <h3>{I.food(16)} Cardápio do dia</h3>
          <span className="muted">{Math.round(dayTotals.kcal)} de {n.kcal} kcal · P {Math.round(dayTotals.proteinG)} g · C {Math.round(dayTotals.carbG)} g · G {Math.round(dayTotals.fatG)} g</span>
        </header>
        <p className="tr-footnote">Montado sem IA: cada refeição combina alimentos da tabela abaixo para chegar perto das metas. Use {I.swap(12)} para trocar um item por outro equivalente. O cardápio muda a cada dia.</p>
        <div className="tr-meal-grid">
          {plan.meals.map((meal, i) => <MealCard key={`${meal.slot}-${i}`} meal={meal} mealIndex={i} swaps={swaps} onSwap={swap} />)}
        </div>
        {plan.notes.length > 0 && <ul className="tr-rationale tr-plan-notes">{plan.notes.map((note) => <li key={note}>{note}</li>)}</ul>}
      </section>

      <div className="tr-grid-2 wide-left">
        <section className="tr-card">
          <header className="tr-card-head"><h3>Por que esses números</h3></header>
          <ul className="tr-rationale">{n.rationale.map((r, i) => <li key={i}>{r}</li>)}</ul>
          <p className="tr-footnote">Gasto estimado (TDEE): {n.tdee} kcal. Estimativas não substituem um nutricionista.</p>
        </section>
        {diet.aiEnabled && aiMeals.length > 0 && (
          <section className="tr-card">
            <header className="tr-card-head"><h3>{I.spark(16)} Ideias de pratos (IA)</h3></header>
            <ul className="tr-meals">{aiMeals.map((line, i) => {
              const [title, ...rest] = line.split(':');
              return rest.length ? <li key={i}><b>{title}</b><span>{rest.join(':').trim()}</span></li> : <li key={i}><span>{line}</span></li>;
            })}</ul>
          </section>
        )}
      </div>

      <FoodTable groups={diet.foods.groups} items={diet.foods.items} />
    </div>
  );
}
