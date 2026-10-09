import { useEffect, useMemo, useState } from 'react';
import { getWeeklyPlan, logWorkout } from '../../services/trainer.service';
import type { PlannedExercise, WeeklyPlan } from '../../types/trainer';

const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
const repsValue = (range: string) => {
  const [low, high] = range.split(/[–-]/).map(Number);
  return Math.round((low + high) / 2);
};

export default function WeeklyPlanPanel({ onStartTimer }: {
  onStartTimer: (blocks: { key: string; name: string }[]) => void;
}) {
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const [loads, setLoads] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    getWeeklyPlan().then(setPlan).catch((e) => setError((e as Error).message));
  }, []);

  const days = useMemo(() => weekdayOrder.map((day) => plan?.days.find((item) => item.weekday === day)).filter(Boolean), [plan]);
  const selected = plan?.days.find((day) => day.weekday === selectedDay);
  const plannedExercises = selected?.exercises ?? [];
  const isToday = selectedDay === new Date().getDay();

  const saveSession = async () => {
    if (!plannedExercises.length) return;
    setBusy(true);
    setError('');
    setSaved('');
    try {
      const result = await logWorkout(plannedExercises.map((exercise) => ({
        exerciseKey: exercise.key,
        sets: exercise.sets,
        reps: repsValue(exercise.reps),
        ...(loads[exercise.key] ? { loadKg: Number(loads[exercise.key]) } : {}),
      })));
      setSaved(`Treino registrado em ${result.day}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!plan) return <p className="muted">{error || 'Montando sua semana…'}</p>;

  return (
    <div className="weekly-plan">
      <div className="weekly-plan-intro">
        <div>
          <h2 className="tab-title">Sua semana de treino</h2>
          <p className="muted">{plan.split} · {plan.prescription.sets} séries · {plan.prescription.reps} reps · RIR {plan.prescription.rir}</p>
        </div>
        <span className="plan-badge">{plan.goal === 'STRENGTH' ? 'Força' : plan.goal === 'WEIGHT_LOSS' ? 'Emagrecimento' : 'Plano personalizado'}</span>
      </div>

      <div className="week-cards">
        {days.map((day) => day && (
          <button key={day.weekday} type="button" className={`week-day-card ${selectedDay === day.weekday ? 'active' : ''} ${!day.isTrainingDay ? 'rest-day' : ''}`}
            onClick={() => setSelectedDay(day.weekday)}>
            <small>{day.shortLabel}</small>
            <b>{day.title}</b>
            <span>{day.isTrainingDay ? day.muscleLabels.join(' · ') : 'Recuperação'}</span>
          </button>
        ))}
      </div>

      {selected && (
        <section className="week-detail card">
          <div className="week-detail-head">
            <div><h3>{selected.label} · {selected.title}</h3><p className="muted">{selected.isTrainingDay ? `${selected.plannedMinutes} min estimados` : 'Dia de recuperação'}</p></div>
            {selected.isTrainingDay && <button type="button" className="ghost" onClick={() => onStartTimer(selected.exercises.flatMap((exercise) =>
              Array.from({ length: exercise.sets }, (_, index) => ({
                key: `${exercise.key}_${index + 1}`,
                name: `${exercise.name} · série ${index + 1}/${exercise.sets}`,
                restSeconds: exercise.restSeconds,
              })),
            ))}>Cronômetro</button>}
          </div>
          {!selected.isTrainingDay
            ? <p className="muted">Descanse e deixe os músculos recuperarem. Uma caminhada leve ou mobilidade são opcionais.</p>
            : <>
              {selected.warnings.map((warning) => <p className="plan-warning" key={warning}>{warning}</p>)}
              <div className="planned-exercises">
                {selected.exercises.map((exercise: PlannedExercise) => (
                  <div className="planned-exercise" key={`${exercise.muscle}-${exercise.key}`}>
                    <div>
                      <b>{exercise.name}</b><span className="muted">{exercise.muscleLabel} · {exercise.sets} × {exercise.reps} · descanso {exercise.restSeconds}s · RIR {exercise.rir}</span>
                    </div>
                    <label className="load-field">Carga (kg)
                      <input type="number" min="0" step="0.5" value={loads[exercise.key] ?? ''}
                        onChange={(event) => setLoads({ ...loads, [exercise.key]: event.target.value })}
                        aria-label={`Carga usada em ${exercise.name}`} />
                    </label>
                  </div>
                ))}
              </div>
              {selected.exercises.length === 0 && <p className="plan-warning">Não encontramos exercícios compatíveis com os equipamentos e restrições informados. Edite seu perfil antes de treinar.</p>}
              {!isToday && <p className="muted">Para registrar uma sessão como concluída, selecione o dia de hoje.</p>}
              {error && <p className="error">{error}</p>}
              {saved && <p className="notice">{saved}</p>}
              <div className="nav-row">
                <button type="button" disabled={!selected.exercises.length || !isToday || busy} onClick={saveSession}>{busy ? 'Salvando…' : 'Registrar treino'}</button>
              </div>
            </>}
        </section>
      )}

      <section className="volume-section">
        <h3>Volume semanal e recuperação</h3>
        <p className="muted">A matriz indica treino, as primeiras 48h de recuperação e quando o grupo já está recuperado. A semana é circular.</p>
        <div className="matrix-wrap">
          <table className="muscle-matrix">
            <thead><tr><th>Músculo</th><th>Séries / semana</th><th>Faixa de referência</th>{weekdayOrder.map((day) => <th key={day}>{plan.days.find((item) => item.weekday === day)?.shortLabel}</th>)}</tr></thead>
            <tbody>{plan.matrix.map((row) => (
              <tr key={row.key}>
                <th>{row.label}</th>
                <td>{row.weeklySets}</td>
                <td>{row.targetMin}–{row.targetMax}</td>
                {weekdayOrder.map((day) => {
                  const state = row.days.find((item) => item.weekday === day)?.state;
                  return <td key={day}><span className={`matrix-state ${state?.toLowerCase() ?? ''}`} title={state === 'TRAIN' ? 'Treina' : state === 'RECOVERY' ? 'Descansa: menos de 48h' : 'Recuperado'}>{state === 'TRAIN' ? 'Treina' : state === 'RECOVERY' ? 'Descansa' : 'Recuperado'}</span></td>;
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      <p className="trainer-disclaimer">{plan.disclaimer}</p>
    </div>
  );
}
