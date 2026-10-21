import { useEffect, useState, type FormEvent } from 'react';
import { askCoach, getWorkoutDay } from '../../services/trainer.service';
import type { TrainerOverview, WorkoutDay } from '../../types/trainer';
import MuscleMap, { MUSCLE_LABELS } from './MuscleMap';
import type { LiveSession } from './WorkoutPlayer';
import { I, Ring, Stat, describeSets, fmtClock, fmtMinutes, fmtVolume, fmtWeekday, relativeDay } from './ui';

export type TrainerView = 'hoje' | 'plano' | 'exercicios' | 'progresso' | 'corpo' | 'nutricao';

export default function TodayView({ overview, live, aiEnabled, onStart, onResume, onShowExercise, onNavigate }: {
  overview: TrainerOverview;
  live: LiveSession | null;
  aiEnabled: boolean;
  onStart: (weekday: number) => void;
  onResume: () => void;
  onShowExercise: (key: string) => void;
  onNavigate: (view: TrainerView, weekday?: number) => void;
}) {
  const { today, week, weekGoal, streak, level } = overview;
  const workout = today.workout;
  const [detail, setDetail] = useState<WorkoutDay | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!workout.isTrainingDay) return;
    getWorkoutDay(workout.weekday).then(setDetail).catch(() => setDetail(null));
  }, [workout.weekday, workout.isTrainingDay]);

  // Relógio do banner de treino em andamento.
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [live]);

  const thisWeek = overview.weekly[overview.weekly.length - 1];
  const lastWeek = overview.weekly[overview.weekly.length - 2];
  const totalSets = workout.exercises.reduce((sum, e) => sum + e.sets, 0);
  const recovering = overview.recovery.filter((r) => r.hoursSince < 48);

  return (
    <div className="tr-view">
      {live && (
        <button type="button" className="tr-live-banner" onClick={onResume}>
          <span className="tr-live-dot" />
          <span><b>Treino em andamento</b> · {live.title}</span>
          <span className="tr-live-banner-time">{fmtClock((Date.now() - new Date(live.startedAt).getTime()) / 1000)}</span>
          <span className="tr-live-banner-go">Continuar {I.chevron(16)}</span>
        </button>
      )}

      <section className={`tr-hero ${workout.isTrainingDay ? '' : 'rest'} ${today.doneToday ? 'done' : ''}`}>
        <div className="tr-hero-main">
          <span className="tr-eyebrow">{fmtWeekday(today.day)}</span>
          {workout.isTrainingDay ? <>
            <h2>{workout.title}</h2>
            <div className="tr-tags">{workout.muscleLabels.map((m) => <span key={m} className="tr-tag">{m}</span>)}</div>
            <div className="tr-hero-meta">
              <span>{I.library(15)} {workout.exercises.length} exercícios</span>
              <span>{I.bolt(15)} {totalSets} séries</span>
              <span>{I.clock(15)} ~{workout.plannedMinutes} min</span>
            </div>
            {today.doneToday
              ? <div className="tr-hero-done">{I.check(18)} Treino de hoje registrado. Bom trabalho!</div>
              : null}
            <div className="tr-hero-actions">
              {live
                ? <button type="button" className="tr-primary" onClick={onResume}>{I.play(16)} Continuar treino</button>
                : <button type="button" className="tr-primary" onClick={() => onStart(workout.weekday)}>{I.play(16)} {today.doneToday ? 'Treinar de novo' : 'Começar treino'}</button>}
              <button type="button" className="ghost" onClick={() => onNavigate('plano', workout.weekday)}>Ver no plano</button>
            </div>
          </> : <>
            <h2>Dia de descanso</h2>
            <p className="tr-hero-text">A recuperação faz parte do treino: é nela que o músculo se adapta. Uma caminhada leve ou mobilidade são bem-vindas.</p>
            {today.next && <p className="tr-hero-next">Próximo treino: <b>{today.next.title}</b> · {today.next.inDays === 1 ? 'amanhã' : today.next.label}</p>}
            <div className="tr-hero-actions">
              {live
                ? <button type="button" className="tr-primary" onClick={onResume}>{I.play(16)} Continuar treino</button>
                : today.next && <button type="button" className="ghost" onClick={() => onStart(today.next!.weekday)}>Treinar {today.next.title} hoje</button>}
            </div>
          </>}
        </div>
        <div className="tr-hero-map">
          {workout.isTrainingDay
            ? <MuscleMap primary={workout.muscleIds.primary} secondary={workout.muscleIds.secondary} size="lg" />
            : <MuscleMap recovery={overview.recovery} size="lg" />}
        </div>
      </section>

      <div className="tr-stats">
        <Stat label="Ofensiva" tone="fire" icon={I.flame(15)} value={<>{streak}<small> {streak === 1 ? 'treino' : 'treinos'}</small></>}
          hint={streak ? 'Descanso do plano não quebra a sequência' : 'Treine hoje para começar'} />
        <div className="tr-stat ring">
          <Ring value={weekGoal.target ? weekGoal.done / weekGoal.target : 0} size={58} stroke={6} color={weekGoal.done >= weekGoal.target ? 'var(--ok)' : 'var(--accent)'}>
            <b>{weekGoal.done}/{weekGoal.target}</b>
          </Ring>
          <div>
            <span className="tr-stat-label">Meta da semana</span>
            <small className="tr-stat-hint">{weekGoal.done >= weekGoal.target ? 'Cumprida!' : `Faltam ${weekGoal.target - weekGoal.done}`}{weekGoal.streakWeeks > 1 ? ` · ${weekGoal.streakWeeks} semanas seguidas` : ''}</small>
          </div>
        </div>
        <Stat label="Volume da semana" icon={I.bolt(15)} value={fmtVolume(thisWeek?.volumeKg ?? 0)}
          hint={`${thisWeek?.sets ?? 0} séries${lastWeek?.volumeKg ? ` · semana passada ${fmtVolume(lastWeek.volumeKg)}` : ''}`} tone={lastWeek && thisWeek && thisWeek.volumeKg >= lastWeek.volumeKg && thisWeek.volumeKg > 0 ? 'ok' : undefined} />
        <Stat label={`Nível ${level.current}`} icon={I.spark(15)} value={level.title}
          hint={<span className="tr-xp-inline"><span className="tr-xp"><i style={{ width: `${(level.xp / level.xpNeeded) * 100}%` }} /></span>{level.xp}/{level.xpNeeded} XP</span>} />
      </div>

      <section className="tr-card">
        <header className="tr-card-head"><h3>Esta semana</h3><button type="button" className="tr-link" onClick={() => onNavigate('plano')}>Plano completo {I.chevron(14)}</button></header>
        <div className="tr-week">
          {week.map((d) => (
            <button type="button" key={d.day} className={`tr-week-day ${d.isToday ? 'today' : ''} ${d.done ? 'done' : ''} ${d.isTrainingDay ? 'train' : 'rest'} ${d.isPast && d.isTrainingDay && !d.done ? 'missed' : ''}`}
              onClick={() => onNavigate('plano', d.weekday)} title={d.title}>
              <small>{d.shortLabel}</small>
              <span className="tr-week-dot">{d.done ? I.check(14) : d.isTrainingDay ? '' : '·'}</span>
              <em>{d.isTrainingDay ? d.title : 'Descanso'}</em>
            </button>
          ))}
        </div>
      </section>

      <div className="tr-grid-2">
        {workout.isTrainingDay && (
          <section className="tr-card">
            <header className="tr-card-head"><h3>Exercícios de hoje</h3><span className="muted">sugestão de carga pela última vez</span></header>
            <ol className="tr-ex-list">
              {(detail?.exercises ?? workout.exercises).map((exercise, index) => {
                const suggestion = 'suggestion' in exercise ? (exercise as WorkoutDay['exercises'][number]).suggestion : null;
                const previous = 'previous' in exercise ? (exercise as WorkoutDay['exercises'][number]).previous : null;
                return (
                  <li key={exercise.key}>
                    <button type="button" className="tr-ex-row" onClick={() => onShowExercise(exercise.key)}>
                      <span className="tr-ex-n">{index + 1}</span>
                      <span className="tr-ex-main">
                        <b>{exercise.name}</b>
                        <small>{exercise.sets} × {exercise.reps}{previous ? ` · última: ${describeSets(previous.sets, exercise.unit)}` : ''}</small>
                      </span>
                      {suggestion && suggestion.trend !== 'new' && (
                        <span className={`tr-ex-target ${suggestion.trend}`} title={suggestion.note}>
                          {suggestion.trend === 'up' ? I.up(13) : suggestion.trend === 'down' ? I.down(13) : null}
                          {suggestion.loadKg ? `${suggestion.loadKg} kg` : `${suggestion.reps} reps`}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        <section className="tr-card">
          <header className="tr-card-head"><h3>Recuperação muscular</h3></header>
          <div className="tr-recovery">
            <MuscleMap recovery={overview.recovery} size="md" />
            <div>
              <div className="tr-legend">
                <span><i className="rec-3" /> menos de 24h</span>
                <span><i className="rec-2" /> 24–48h</span>
                <span><i className="rec-1" /> 48–72h</span>
              </div>
              {recovering.length
                ? <p className="muted">Ainda se recuperando: {[...new Set(recovering.map((r) => MUSCLE_LABELS[r.id]))].join(', ')}.</p>
                : <p className="muted">Todos os músculos recuperados. Bom momento para treinar pesado.</p>}
            </div>
          </div>
        </section>

        {!workout.isTrainingDay && <CoachCard aiEnabled={aiEnabled} />}
      </div>

      <div className="tr-grid-2">
        <section className="tr-card">
          <header className="tr-card-head"><h3>Últimos treinos</h3><button type="button" className="tr-link" onClick={() => onNavigate('progresso')}>Histórico {I.chevron(14)}</button></header>
          {overview.recentSessions.length === 0
            ? <p className="muted">Seu primeiro treino aparece aqui. Toque em “Começar treino” e marque as séries conforme faz.</p>
            : <ul className="tr-session-mini">
              {overview.recentSessions.slice(0, 4).map((s) => (
                <li key={s.id}>
                  <div><b>{s.title}</b><small>{relativeDay(s.day)} · {fmtMinutes(s.durationMinutes)} · {s.sets} séries</small></div>
                  <span>{s.volumeKg ? fmtVolume(s.volumeKg) : ''}{s.records > 0 && <em title={`${s.records} recorde(s)`}>{I.trophy(14)}</em>}</span>
                </li>
              ))}
            </ul>}
        </section>
        {workout.isTrainingDay && <CoachCard aiEnabled={aiEnabled} />}
      </div>
    </div>
  );
}

/** Tira-dúvidas de técnica: a IA só conhece os exercícios liberados ao perfil. */
function CoachCard({ aiEnabled }: { aiEnabled: boolean }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (question.trim().length < 3) return;
    setBusy(true);
    try {
      setAnswer((await askCoach(question.trim())).answer);
    } catch (err) {
      setAnswer((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="tr-card">
      <header className="tr-card-head"><h3>Pergunte ao coach</h3>{!aiEnabled && <span className="muted">respostas básicas (IA desligada)</span>}</header>
      <form className="tr-coach" onSubmit={submit}>
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ex.: como não sentir o ombro no supino?" maxLength={800} />
        <button type="submit" disabled={busy || question.trim().length < 3}>{busy ? '…' : 'Perguntar'}</button>
      </form>
      {answer && <p className="tr-coach-answer">{answer}</p>}
    </section>
  );
}
