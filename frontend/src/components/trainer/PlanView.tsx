import { useEffect, useState } from 'react';
import { getWeeklyPlan } from '../../services/trainer.service';
import type { WeeklyPlan } from '../../types/trainer';
import { SwapDrawer } from './ExerciseDrawer';
import MuscleMap from './MuscleMap';
import { I } from './ui';

const ORDER = [1, 2, 3, 4, 5, 6, 0];
const GOAL_LABEL: Record<string, string> = {
  HYPERTROPHY: 'Hipertrofia', STRENGTH: 'Força', WEIGHT_LOSS: 'Emagrecimento', CONDITIONING: 'Condicionamento', HEALTH: 'Saúde',
};

export default function PlanView({ initialWeekday, onStart, onShowExercise, onPlanChanged }: {
  initialWeekday?: number;
  onStart: (weekday: number) => void;
  onShowExercise: (key: string) => void;
  onPlanChanged: () => void;
}) {
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(initialWeekday ?? new Date().getDay());
  const [swapping, setSwapping] = useState<string | null>(null);

  useEffect(() => { getWeeklyPlan().then(setPlan).catch((e) => setError((e as Error).message)); }, []);
  useEffect(() => { if (initialWeekday !== undefined) setSelected(initialWeekday); }, [initialWeekday]);

  if (!plan) return <div className="tr-view">{error ? <div className="tr-alert bad">{error}</div> : <div className="tr-skeleton" style={{ height: 320 }} />}</div>;

  const day = plan.days.find((d) => d.weekday === selected)!;
  const todayIndex = new Date().getDay();
  const totalSets = day.exercises.reduce((sum, e) => sum + e.sets, 0);

  return (
    <div className="tr-view">
      <header className="tr-view-head">
        <div>
          <h2>Plano semanal</h2>
          <p className="muted">{plan.split} · {GOAL_LABEL[plan.goal] ?? plan.goal} · {plan.prescription.sets} séries de {plan.prescription.reps} · RIR {plan.prescription.rir}</p>
        </div>
      </header>

      <div className="tr-daypicker" role="tablist" aria-label="Dia da semana">
        {ORDER.map((weekday) => {
          const d = plan.days.find((item) => item.weekday === weekday)!;
          return (
            <button key={weekday} type="button" role="tab" aria-selected={selected === weekday}
              className={`tr-daypick ${selected === weekday ? 'on' : ''} ${d.isTrainingDay ? '' : 'rest'} ${weekday === todayIndex ? 'today' : ''}`}
              onClick={() => setSelected(weekday)}>
              <small>{d.shortLabel}{weekday === todayIndex ? ' · hoje' : ''}</small>
              <b>{d.isTrainingDay ? d.title : 'Descanso'}</b>
              <span>{d.isTrainingDay ? `${d.exercises.length} exerc. · ~${d.plannedMinutes} min` : 'Recuperação'}</span>
            </button>
          );
        })}
      </div>

      <section className="tr-card tr-day">
        {!day.isTrainingDay ? (
          <div className="tr-day-rest">
            <MuscleMap size="md" />
            <div>
              <h3>{day.label}: descanso</h3>
              <p className="muted">Sem treino planejado. Descansar não quebra a sua ofensiva. Se quiser treinar mesmo assim, comece o treino de outro dia.</p>
            </div>
          </div>
        ) : <>
          <div className="tr-day-head">
            <div>
              <span className="tr-eyebrow">{day.label}</span>
              <h3>{day.title}</h3>
              <p className="muted">{day.exercises.length} exercícios · {totalSets} séries · ~{day.plannedMinutes} min com aquecimento</p>
            </div>
            <button type="button" className="tr-primary" onClick={() => onStart(day.weekday)} disabled={!day.exercises.length}>{I.play(16)} Começar este treino</button>
          </div>
          {day.warnings.map((w) => <div key={w} className="tr-alert warn">{w}</div>)}
          <div className="tr-day-body">
            <MuscleMap primary={day.muscleIds.primary} secondary={day.muscleIds.secondary} size="md" />
            <ol className="tr-plan-list">
              {day.exercises.map((exercise, index) => (
                <li key={exercise.key} className="tr-plan-item">
                  <span className="tr-ex-n">{index + 1}</span>
                  <button type="button" className="tr-plan-main" onClick={() => onShowExercise(exercise.key)}>
                    <b>{exercise.name}{exercise.swappedFrom && <span className="tr-badge">trocado</span>}</b>
                    <small>{exercise.muscleLabel}</small>
                  </button>
                  <span className="tr-plan-presc"><b>{exercise.sets} × {exercise.reps}</b><small>descanso {exercise.restSeconds}s · RIR {exercise.rir}</small></span>
                  <button type="button" className="tr-icon-btn" onClick={() => onShowExercise(exercise.key)} aria-label={`Detalhes de ${exercise.name}`} title="Como fazer e histórico">{I.info(17)}</button>
                  <button type="button" className="tr-icon-btn" onClick={() => setSwapping(exercise.key)} aria-label={`Trocar ${exercise.name}`} title="Trocar por outro do mesmo músculo">{I.swap(17)}</button>
                </li>
              ))}
            </ol>
          </div>
          {!day.exercises.length && <div className="tr-alert warn">Não há exercícios compatíveis com seus equipamentos e restrições. Edite o perfil para liberar opções.</div>}
        </>}
      </section>

      <section className="tr-card">
        <header className="tr-card-head">
          <h3>Volume e recuperação por músculo</h3>
          <div className="tr-legend">
            <span><i className="train" /> treina</span>
            <span><i className="recovery" /> recuperando (&lt;48h)</span>
            <span><i className="recovered" /> pronto</span>
          </div>
        </header>
        <div className="tr-matrix-wrap">
          <table className="tr-matrix">
            <thead>
              <tr>
                <th>Músculo</th>
                {ORDER.map((weekday) => <th key={weekday} className={weekday === selected ? 'sel' : ''}>{plan.days.find((d) => d.weekday === weekday)!.shortLabel}</th>)}
                <th>Séries/semana</th>
              </tr>
            </thead>
            <tbody>
              {plan.matrix.map((row) => {
                const pct = Math.min(1, row.weeklySets / row.targetMax);
                const status = row.weeklySets < row.targetMin ? 'low' : row.weeklySets > row.targetMax ? 'high' : 'ok';
                return (
                  <tr key={row.key}>
                    <th>{row.label}</th>
                    {ORDER.map((weekday) => {
                      const state = row.days.find((d) => d.weekday === weekday)?.state ?? 'RECOVERED';
                      return <td key={weekday} className={weekday === selected ? 'sel' : ''}><i className={`tr-cell ${state.toLowerCase()}`} title={state === 'TRAIN' ? 'Treina' : state === 'RECOVERY' ? 'Recuperando' : 'Recuperado'} /></td>;
                    })}
                    <td className="tr-vol">
                      <span className={`tr-vol-bar ${status}`}><i style={{ width: `${pct * 100}%` }} /><em style={{ left: `${(row.targetMin / row.targetMax) * 100}%` }} /></span>
                      <b>{row.weeklySets}</b><small>/{row.targetMin}–{row.targetMax}</small>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="tr-footnote">A faixa de séries semanais por músculo segue a literatura de hipertrofia ({plan.matrix[0]?.targetMin}–{plan.matrix[0]?.targetMax} para o seu nível). {plan.disclaimer}</p>
      </section>

      {swapping && (
        <SwapDrawer weekday={day.weekday} exerciseKey={swapping} dayLabel={`${day.label} · ${day.title}`}
          onClose={() => setSwapping(null)}
          onSwapped={(next) => { setPlan(next); setSwapping(null); onPlanChanged(); }} />
      )}
    </div>
  );
}
