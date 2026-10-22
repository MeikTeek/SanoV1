import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getLibrary, saveSession } from '../../services/trainer.service';
import type { DayExercise, ExerciseUnit, LibraryResponse, SessionResult, SetEntry, WorkoutDay } from '../../types/trainer';
import { Drawer, I, Ring, describeSets, fmtClock, fmtDay, fmtKg, fmtVolume, unitShort } from './ui';

/* ── Estado da sessão (salvo no navegador a cada mudança) ───────────────── */

export interface LiveSet { id: string; loadKg: string; reps: string; rir: string; done: boolean }
export interface LiveExercise {
  uid: string;
  key: string;
  name: string;
  muscleLabel: string;
  unit: ExerciseUnit;
  repsLabel: string;
  restSeconds: number;
  bodyweight: boolean;
  target: { loadKg: number | null; reps: number };
  /** Carga prescrita em texto ("24 kg por halter", "Peso do corpo"). */
  loadLabel: string;
  /** Duração estimada de uma série, em segundos. */
  setSeconds: number;
  tempo: string | null;
  bodyweightKg: number | null;
  perSide: boolean;
  note: string;
  trend: 'up' | 'hold' | 'down' | 'new';
  previous: { day: string; sets: SetEntry[] } | null;
  sets: LiveSet[];
}
export interface LiveSession {
  title: string;
  weekday: number | null;
  startedAt: string;
  exercises: LiveExercise[];
  notes: string;
  /** Exercício em foco no palco (uid); null = o primeiro com série pendente. */
  focus: string | null;
  /** Série em execução: cronômetro de trabalho. */
  work: { setId: string; startedAt: number; total: number } | null;
  rest: { endsAt: number; total: number; exercise: string } | null;
}

export const LIVE_KEY = 'sano:treino:sessao';
const uid = () => Math.random().toString(36).slice(2, 10);
const emptySet = (): LiveSet => ({ id: uid(), loadKg: '', reps: '', rir: '', done: false });
const SECONDS_PER_REP = 4;

const estimateSetSeconds = (unit: ExerciseUnit, reps: number) =>
  unit === 'segundos' ? reps : unit === 'minutos' ? reps * 60 : reps * SECONDS_PER_REP;

/** Sessões salvas antes do player novo não têm os campos de prescrição. */
function migrate(session: LiveSession): LiveSession {
  return {
    ...session,
    focus: session.focus ?? null,
    work: session.work ?? null,
    exercises: session.exercises.map((e) => ({
      ...e,
      loadLabel: e.loadLabel ?? (e.target.loadKg ? fmtKg(e.target.loadKg) : 'Peso do corpo'),
      setSeconds: e.setSeconds ?? estimateSetSeconds(e.unit, e.target.reps || 10),
      tempo: e.tempo ?? (e.unit === 'reps' ? '2-0-2' : null),
      bodyweightKg: e.bodyweightKg ?? null,
      perSide: e.perSide ?? false,
    })),
  };
}

export function loadLiveSession(): LiveSession | null {
  try {
    const raw = localStorage.getItem(LIVE_KEY);
    return raw ? migrate(JSON.parse(raw) as LiveSession) : null;
  } catch { return null; }
}
export function storeLiveSession(session: LiveSession | null) {
  try {
    if (session) localStorage.setItem(LIVE_KEY, JSON.stringify(session));
    else localStorage.removeItem(LIVE_KEY);
  } catch { /* sem storage: a sessão só não sobrevive a um recarregamento */ }
}

const fromPlanned = (exercise: DayExercise): LiveExercise => {
  const p = exercise.prescription;
  const reps = p?.reps ?? exercise.suggestion.reps;
  return {
    uid: uid(),
    key: exercise.key,
    name: exercise.name,
    muscleLabel: exercise.muscleLabel,
    unit: exercise.unit,
    repsLabel: exercise.reps,
    restSeconds: p?.restSeconds ?? exercise.restSeconds,
    bodyweight: exercise.equipment.every((item) => item === 'nenhum' || item === 'peso-corporal') || exercise.unit !== 'reps',
    target: { loadKg: p?.loadKg ?? exercise.suggestion.loadKg, reps },
    loadLabel: p?.loadLabel ?? (exercise.suggestion.loadKg ? fmtKg(exercise.suggestion.loadKg) : 'Peso do corpo'),
    setSeconds: p?.setSeconds ?? estimateSetSeconds(exercise.unit, reps),
    tempo: p?.tempo ?? (exercise.unit === 'reps' ? '2-0-2' : null),
    bodyweightKg: p?.bodyweightKg ?? null,
    perSide: p?.perSide ?? false,
    note: exercise.suggestion.note,
    trend: exercise.suggestion.trend,
    previous: exercise.previous,
    sets: Array.from({ length: exercise.sets }, emptySet),
  };
};

export function sessionFromDay(day: WorkoutDay): LiveSession {
  return {
    title: day.title,
    weekday: day.weekday,
    startedAt: new Date().toISOString(),
    exercises: day.exercises.map(fromPlanned),
    notes: '',
    focus: null,
    work: null,
    rest: null,
  };
}

/* ── Som e tela ligada ──────────────────────────────────────────────────── */

function useBeep() {
  const ctx = useRef<AudioContext | null>(null);
  const prime = useCallback(() => {
    try {
      if (!ctx.current) ctx.current = new AudioContext();
      if (ctx.current.state === 'suspended') void ctx.current.resume();
    } catch { /* sem áudio */ }
  }, []);
  const beep = useCallback(() => {
    const context = ctx.current;
    navigator.vibrate?.([180, 80, 180]);
    if (!context || context.state !== 'running') return;
    const now = context.currentTime;
    [0, 0.25, 0.5].forEach((offset, i) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.frequency.value = i === 2 ? 1175 : 880;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.2, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
      osc.connect(gain).connect(context.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.2);
    });
  }, []);
  useEffect(() => () => { void ctx.current?.close(); }, []);
  return { prime, beep };
}

/** Mantém a tela acesa no celular enquanto o treino está aberto. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const request = () => nav.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => undefined);
    void request();
    const onVisible = () => { if (document.visibilityState === 'visible') void request(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); void lock?.release().catch(() => undefined); };
  }, [active]);
}

/* ── Regras do palco ────────────────────────────────────────────────────── */

const pendingIndex = (exercise: LiveExercise) => exercise.sets.findIndex((s) => !s.done);
const isComplete = (exercise: LiveExercise) => exercise.sets.length > 0 && pendingIndex(exercise) < 0;

/** Valores da série: o que o usuário digitou ou, vazio, o prescrito. */
function setValues(exercise: LiveExercise, set: LiveSet, index: number) {
  const previous = exercise.previous?.sets[index];
  const reps = set.reps || String(exercise.target.reps || previous?.reps || '');
  const loadKg = set.loadKg || (exercise.bodyweight ? '' : String(exercise.target.loadKg ?? previous?.loadKg ?? ''));
  return { reps, loadKg };
}

/** Próximo exercício com série pendente, começando depois de `afterUid`. */
function nextPending(exercises: LiveExercise[], afterUid: string | null) {
  const start = afterUid ? exercises.findIndex((e) => e.uid === afterUid) + 1 : 0;
  return [...exercises.slice(start), ...exercises.slice(0, start)].find((e) => !isComplete(e)) ?? null;
}

/* ── Player ─────────────────────────────────────────────────────────────── */

export default function WorkoutPlayer({ session, onChange, onMinimize, onDiscard, onSaved, onShowExercise }: {
  session: LiveSession;
  onChange: (session: LiveSession) => void;
  onMinimize: () => void;
  onDiscard: () => void;
  onSaved: (result: SessionResult) => void;
  onShowExercise: (key: string) => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<'finish' | 'discard' | null>(null);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [picking, setPicking] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const { prime, beep } = useBeep();
  const beeped = useRef<number | null>(null);
  const finishedWork = useRef<string | null>(null);
  useWakeLock(!result);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const focused = session.exercises.find((e) => e.uid === session.focus)
    ?? nextPending(session.exercises, null)
    ?? session.exercises[session.exercises.length - 1]
    ?? null;
  const focusIndex = focused ? session.exercises.indexOf(focused) : -1;
  const setIndex = focused ? pendingIndex(focused) : -1;
  const currentSet = focused && setIndex >= 0 ? focused.sets[setIndex] : null;
  const allDone = session.exercises.length > 0 && session.exercises.every(isComplete);

  const elapsed = (now - new Date(session.startedAt).getTime()) / 1000;
  const totalSets = session.exercises.reduce((sum, e) => sum + e.sets.length, 0);
  const doneSets = session.exercises.reduce((sum, e) => sum + e.sets.filter((s) => s.done).length, 0);
  const volume = session.exercises.reduce((sum, e) => sum + e.sets.filter((s) => s.done).reduce((v, s) => v + (Number(s.loadKg) || 0) * (Number(s.reps) || 0), 0), 0);
  const remainingSeconds = session.exercises.reduce((sum, e) =>
    sum + e.sets.filter((s) => !s.done).length * (e.setSeconds + e.restSeconds), 0);

  const rest = session.rest;
  const restLeft = rest ? Math.max(0, (rest.endsAt - now) / 1000) : 0;
  const work = session.work && currentSet && session.work.setId === currentSet.id ? session.work : null;
  const workElapsed = work ? (now - work.startedAt) / 1000 : 0;
  const timedWork = focused ? focused.unit !== 'reps' : false;

  const updateExercise = (exerciseUid: string, fn: (e: LiveExercise) => LiveExercise) =>
    onChange({ ...session, exercises: session.exercises.map((e) => (e.uid === exerciseUid ? fn(e) : e)) });

  const updateSet = (exerciseUid: string, setId: string, patch: Partial<LiveSet>) =>
    updateExercise(exerciseUid, (e) => ({ ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) }));

  /** Marca a série como feita, inicia o descanso e já aponta o próximo exercício. */
  const completeSet = useCallback((exercise: LiveExercise, set: LiveSet, index: number, override?: { reps?: string }) => {
    const values = setValues(exercise, set, index);
    const reps = override?.reps ?? values.reps;
    if (!reps || Number(reps) <= 0) {
      setError(`Informe as ${exercise.unit === 'reps' ? 'repetições' : unitShort(exercise.unit)} da série ${index + 1} de ${exercise.name}.`);
      return;
    }
    setError('');
    setAdjusting(false);
    const exercises = session.exercises.map((e) => (e.uid !== exercise.uid ? e : {
      ...e,
      // Propaga a carga para as próximas séries ainda vazias.
      sets: e.sets.map((s, i) => (s.id === set.id
        ? { ...s, reps, loadKg: values.loadKg, done: true }
        : i > index && !s.done && !s.loadKg && values.loadKg && set.loadKg ? { ...s, loadKg: values.loadKg } : s)),
    }));
    const updated = exercises.find((e) => e.uid === exercise.uid)!;
    const following = isComplete(updated) ? nextPending(exercises, exercise.uid) : updated;
    const finishedAll = !following;
    onChange({
      ...session,
      exercises,
      focus: following?.uid ?? exercise.uid,
      work: null,
      rest: !finishedAll && exercise.restSeconds > 0
        ? { endsAt: Date.now() + exercise.restSeconds * 1000, total: exercise.restSeconds, exercise: exercise.name }
        : null,
    });
  }, [onChange, session]);

  const startWork = () => {
    if (!focused || !currentSet) return;
    prime();
    finishedWork.current = null;
    onChange({ ...session, focus: focused.uid, rest: null, work: { setId: currentSet.id, startedAt: Date.now(), total: Math.max(5, focused.setSeconds) } });
  };

  const stopWork = () => {
    if (!focused || !currentSet || !work) return;
    // Isométrico encerrado antes: registra o tempo real feito.
    if (timedWork) {
      const done = focused.unit === 'minutos' ? Math.max(1, Math.round(workElapsed / 60)) : Math.max(1, Math.round(workElapsed));
      completeSet(focused, currentSet, setIndex, { reps: String(Math.min(done, focused.unit === 'minutos' ? Math.round(work.total / 60) : work.total)) });
    } else {
      completeSet(focused, currentSet, setIndex);
    }
  };

  // Fim do descanso: bipa uma vez e some alguns segundos depois.
  useEffect(() => {
    if (!rest) return;
    if (restLeft <= 0 && beeped.current !== rest.endsAt) {
      beeped.current = rest.endsAt;
      beep();
    }
    if (restLeft <= 0 && now - rest.endsAt > 4000) onChange({ ...session, rest: null });
  }, [rest, restLeft, now, beep, onChange, session]);

  // Série por tempo (prancha, isometria): termina sozinha quando o tempo acaba.
  useEffect(() => {
    if (!work || !timedWork || !focused || !currentSet) return;
    if (workElapsed >= work.total && finishedWork.current !== work.setId) {
      finishedWork.current = work.setId;
      beep();
      completeSet(focused, currentSet, setIndex, { reps: String(focused.target.reps || (focused.unit === 'minutos' ? Math.round(work.total / 60) : work.total)) });
    }
  }, [work, timedWork, workElapsed, focused, currentSet, setIndex, beep, completeSet]);

  const adjustRest = (delta: number) => {
    if (!rest) return;
    onChange({ ...session, rest: { ...rest, endsAt: Math.max(Date.now(), rest.endsAt + delta * 1000), total: Math.max(1, rest.total + delta) } });
  };

  const focusOn = (exerciseUid: string) => {
    setAdjusting(false);
    onChange({ ...session, focus: exerciseUid, work: null });
    setPanelOpen(false);
  };

  const removeExercise = (exerciseUid: string) => onChange({
    ...session,
    exercises: session.exercises.filter((e) => e.uid !== exerciseUid),
    focus: session.focus === exerciseUid ? null : session.focus,
    work: null,
  });

  const finish = async () => {
    const entries = session.exercises
      .map((e) => ({
        exerciseKey: e.key,
        sets: e.sets.filter((s) => s.done && Number(s.reps) > 0).map((s) => ({
          reps: Math.round(Number(s.reps)),
          loadKg: s.loadKg === '' ? null : Number(s.loadKg),
          rir: s.rir === '' ? null : Number(s.rir),
        })),
      }))
      .filter((e) => e.sets.length);
    if (!entries.length) {
      setConfirm(null);
      setError('Marque ao menos uma série como feita antes de finalizar.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = await saveSession({ title: session.title, startedAt: session.startedAt, notes: session.notes.trim() || undefined, entries });
      // Sai do navegador já: recarregar a tela do resumo não pode salvar de novo.
      storeLiveSession(null);
      setResult(saved);
      setConfirm(null);
    } catch (e) {
      setError((e as Error).message);
      setConfirm(null);
    } finally {
      setSaving(false);
    }
  };

  if (result) return <SessionSummary result={result} onClose={() => onSaved(result)} />;

  const pending = totalSets - doneSets;
  const upNext = focused ? nextPending(session.exercises, focused.uid) : null;
  const upNextAfterThis = focused && currentSet && setIndex < focused.sets.length - 1 ? focused : upNext;

  /* Palco: o que o anel mostra agora. */
  const stage = rest
    ? { kind: 'rest' as const, value: rest.total ? 1 - restLeft / rest.total : 1, clock: restLeft, color: restLeft <= 0 ? 'var(--ok)' : 'var(--warn)' }
    : work
      ? timedWork
        ? { kind: 'work' as const, value: workElapsed / work.total, clock: Math.max(0, work.total - workElapsed), color: 'var(--accent)' }
        : { kind: 'work' as const, value: Math.min(1, workElapsed / work.total), clock: workElapsed, color: workElapsed > work.total * 1.6 ? 'var(--warn)' : 'var(--accent)' }
      : { kind: 'ready' as const, value: 0, clock: focused?.setSeconds ?? 0, color: 'var(--accent)' };

  const values = focused && currentSet ? setValues(focused, currentSet, setIndex) : null;
  const repsNumber = values ? Number(values.reps) || focused!.target.reps : 0;
  // Carga digitada no ajuste vence a prescrita.
  const typedLoad = currentSet?.loadKg ? Number(currentSet.loadKg) : 0;
  const loadText = !focused ? '' : typedLoad
    ? (focused.bodyweight ? `Corpo + ${fmtKg(typedLoad)}` : fmtKg(typedLoad))
    : focused.loadLabel;

  const panel = (
    <ExercisePanel
      session={session}
      focusUid={focused?.uid ?? null}
      onFocus={focusOn}
      onUpdateSet={updateSet}
      onUpdateExercise={updateExercise}
      onRemove={removeExercise}
      onAdd={() => setPicking(true)}
      onNotes={(notes) => onChange({ ...session, notes })}
      onDiscard={() => setConfirm('discard')}
      onShowExercise={onShowExercise}
      onToggleDone={(exercise, set, index) => {
        prime();
        if (set.done) updateSet(exercise.uid, set.id, { done: false });
        else completeSet(exercise, set, index);
      }}
    />
  );

  return (
    <div className="tr-player" role="dialog" aria-modal="true" aria-label={`Treino em andamento: ${session.title}`}>
      <header className="tr-player-head">
        <button type="button" className="tr-icon-btn" onClick={onMinimize} aria-label="Minimizar treino" title="Minimizar (o treino continua)">{I.down(20)}</button>
        <div className="tr-player-title">
          <b>{session.title}</b>
          <span><span className="tr-live-dot" />{fmtClock(elapsed)} · {doneSets}/{totalSets} séries{volume ? ` · ${fmtVolume(volume)}` : ''}{pending ? ` · ~${Math.ceil(remainingSeconds / 60)} min restantes` : ''}</span>
        </div>
        <button type="button" className="tr-icon-btn tr-panel-toggle" onClick={() => setPanelOpen(true)} aria-label="Editar treino" title="Editar treino">{I.menu(20)}</button>
        <button type="button" className="tr-finish-btn" onClick={() => setConfirm('finish')} disabled={saving}>Finalizar</button>
      </header>
      <div className="tr-player-progress"><i style={{ width: `${totalSets ? (doneSets / totalSets) * 100 : 0}%` }} /></div>

      <div className="tr-player-main">
        <section className="tr-stage" aria-live="polite">
          {error && <div className="tr-alert bad">{error}</div>}

          {!focused ? (
            <div className="tr-stage-empty">
              <p className="muted">Nenhum exercício neste treino.</p>
              <button type="button" className="tr-primary" onClick={() => setPicking(true)}>{I.plus(16)} Adicionar exercício</button>
            </div>
          ) : allDone && !rest ? (
            <div className="tr-stage-empty">
              <div className="tr-summary-badge">{I.check(34)}</div>
              <h2>Todas as séries feitas!</h2>
              <p className="muted">{doneSets} séries em {fmtClock(elapsed)}. Salve para registrar no histórico.</p>
              <button type="button" className="tr-primary tr-stage-cta" onClick={() => setConfirm('finish')}>Finalizar e salvar</button>
            </div>
          ) : (
            <>
              <div className="tr-stage-eyebrow">
                <span>Exercício {focusIndex + 1} de {session.exercises.length}</span>
                <span>{focused.muscleLabel}</span>
              </div>
              <button type="button" className="tr-stage-name" onClick={() => onShowExercise(focused.key)} title="Ver como executar">
                {focused.name} {I.info(18)}
              </button>
              <div className="tr-set-dots" aria-label={`Série ${Math.max(1, setIndex + 1)} de ${focused.sets.length}`}>
                {focused.sets.map((s, i) => <i key={s.id} className={`${s.done ? 'done' : ''} ${i === setIndex ? 'current' : ''}`} />)}
              </div>

              <div className={`tr-stage-ring ${stage.kind}`}>
                <Ring value={stage.value} size={232} stroke={11} color={stage.color}>
                  <div className="tr-stage-clock">
                    <small>{stage.kind === 'rest' ? (restLeft <= 0 ? 'Bora!' : 'Descanso') : stage.kind === 'work' ? (timedWork ? 'Restante' : 'Em execução') : 'Duração estimada'}</small>
                    <b>{fmtClock(stage.clock)}</b>
                    {stage.kind === 'rest'
                      ? <span>{upNextAfterThis ? (upNextAfterThis === focused ? `Série ${setIndex + 1} a seguir` : `A seguir: ${upNextAfterThis.name}`) : 'Último descanso'}</span>
                      : <span>{currentSet ? `Série ${setIndex + 1} de ${focused.sets.length}` : 'Exercício concluído'}</span>}
                  </div>
                </Ring>
              </div>

              {currentSet && values ? (
                <>
                  <div className="tr-presc" role="list" aria-label="Prescrição da série">
                    <div role="listitem" className="load">
                      <span>{I.weight(15)} Carga</span>
                      <b>{loadText}</b>
                      {focused.bodyweightKg ? <small>você move ~{focused.bodyweightKg} kg</small> : focused.trend === 'new' && focused.target.loadKg ? <small>estimativa inicial</small> : null}
                    </div>
                    <div role="listitem" className="reps">
                      <span>{I.repeat(15)} {focused.unit === 'reps' ? 'Repetições' : 'Tempo'}</span>
                      <b>{repsNumber} {focused.unit === 'reps' ? '' : unitShort(focused.unit)}</b>
                      <small>{focused.perSide ? 'cada lado' : `faixa ${focused.repsLabel}`}</small>
                    </div>
                    <div role="listitem" className="time">
                      <span>{I.clock(15)} Série</span>
                      <b>~{fmtClock(focused.unit === 'reps' ? repsNumber * SECONDS_PER_REP * (focused.perSide ? 2 : 1) : focused.setSeconds)}</b>
                      <small>{focused.tempo ? `cadência ${focused.tempo}` : 'cronômetro automático'}</small>
                    </div>
                    <div role="listitem" className="rest">
                      <span>{I.pause(15)} Descanso</span>
                      <b>{fmtClock(focused.restSeconds)}</b>
                      <small>entre as séries</small>
                    </div>
                  </div>

                  <p className={`tr-stage-note ${focused.trend}`}>
                    {focused.trend === 'up' ? I.up(14) : focused.trend === 'down' ? I.down(14) : I.spark(14)}
                    <span>{focused.note}{focused.previous && <span className="muted"> · última vez ({fmtDay(focused.previous.day)}): {describeSets(focused.previous.sets, focused.unit)}</span>}</span>
                  </p>

                  {adjusting && (
                    <div className="tr-adjust">
                      <label>{focused.bodyweight ? 'Carga extra (kg)' : 'Carga (kg)'}
                        <input inputMode="decimal" type="number" min="0" step="0.5" value={currentSet.loadKg}
                          placeholder={focused.bodyweight ? '0' : focused.target.loadKg !== null ? String(focused.target.loadKg) : 'kg'}
                          onChange={(e) => updateSet(focused.uid, currentSet.id, { loadKg: e.target.value })} />
                      </label>
                      <label>{focused.unit === 'reps' ? 'Repetições' : focused.unit === 'segundos' ? 'Segundos' : 'Minutos'}
                        <input inputMode="numeric" type="number" min="1" value={currentSet.reps} placeholder={String(focused.target.reps || '')}
                          onChange={(e) => updateSet(focused.uid, currentSet.id, { reps: e.target.value })} />
                      </label>
                      <label title="Repetições em reserva: quantas ainda conseguiria fazer">RIR
                        <select value={currentSet.rir} onChange={(e) => updateSet(focused.uid, currentSet.id, { rir: e.target.value })}>
                          <option value="">—</option>
                          {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}{n === 5 ? '+' : ''}</option>)}
                        </select>
                      </label>
                      <label>Descanso (s)
                        <input inputMode="numeric" type="number" min="0" step="15" value={focused.restSeconds}
                          onChange={(e) => updateExercise(focused.uid, (ex) => ({ ...ex, restSeconds: Math.max(0, Number(e.target.value) || 0) }))} />
                      </label>
                    </div>
                  )}

                  <div className="tr-stage-actions">
                    {stage.kind === 'rest' ? <>
                      <button type="button" className="tr-rest-btn" onClick={() => adjustRest(-15)} aria-label="Menos 15 segundos">−15s</button>
                      <button type="button" className="tr-primary tr-stage-cta" onClick={startWork}>{I.play(16)} {restLeft <= 0 ? 'Começar série' : 'Pular descanso'}</button>
                      <button type="button" className="tr-rest-btn" onClick={() => adjustRest(15)} aria-label="Mais 15 segundos">+15s</button>
                    </> : stage.kind === 'work' ? (
                      <button type="button" className="tr-primary tr-stage-cta ok" onClick={stopWork}>{I.check(18)} {timedWork ? 'Encerrar série' : 'Concluí a série'}</button>
                    ) : (
                      <button type="button" className="tr-primary tr-stage-cta" onClick={startWork}>{I.play(16)} Começar série {setIndex + 1}</button>
                    )}
                  </div>
                  <div className="tr-stage-links">
                    <button type="button" className="tr-link" onClick={() => setAdjusting((v) => !v)}>{I.edit(14)} {adjusting ? 'Fechar ajuste' : 'Ajustar carga e reps'}</button>
                    {stage.kind !== 'work' && <button type="button" className="tr-link muted" onClick={() => { prime(); completeSet(focused, currentSet, setIndex); }}>{I.check(14)} Marcar feita</button>}
                    {upNext && <button type="button" className="tr-link muted" onClick={() => focusOn(upNext.uid)}>{I.next(14)} Pular exercício</button>}
                  </div>
                </>
              ) : (
                <div className="tr-stage-actions">
                  {upNext
                    ? <button type="button" className="tr-primary tr-stage-cta" onClick={() => focusOn(upNext.uid)}>{I.next(16)} Próximo: {upNext.name}</button>
                    : <button type="button" className="tr-primary tr-stage-cta" onClick={() => setConfirm('finish')}>Finalizar treino</button>}
                </div>
              )}

              {upNext && upNext !== focused && (
                <button type="button" className="tr-stage-next" onClick={() => focusOn(upNext.uid)}>
                  <small>Depois</small>
                  <b>{upNext.name}</b>
                  <span>{upNext.sets.length} × {upNext.target.reps}{upNext.unit === 'reps' ? '' : ` ${unitShort(upNext.unit)}`} · {upNext.loadLabel}</span>
                </button>
              )}
            </>
          )}
        </section>

        <aside className="tr-player-side" aria-label="Exercícios do treino">{panel}</aside>
      </div>

      {panelOpen && (
        <Drawer title="Editar treino" subtitle="Toque num exercício para focar, ajuste séries, cargas e a ordem." onClose={() => setPanelOpen(false)}>
          {panel}
        </Drawer>
      )}

      {confirm && (
        <div className="tr-confirm-backdrop" onClick={() => setConfirm(null)}>
          <div className="tr-confirm" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            {confirm === 'finish' ? <>
              <h3>Finalizar treino?</h3>
              <p>{doneSets} de {totalSets} séries feitas em {fmtClock(elapsed)}.{pending > 0 && ` As ${pending} séries não marcadas não serão registradas.`}</p>
              <div className="tr-confirm-actions">
                <button type="button" className="ghost" onClick={() => setConfirm(null)}>Continuar treinando</button>
                <button type="button" onClick={() => void finish()} disabled={saving}>{saving ? 'Salvando…' : 'Salvar treino'}</button>
              </div>
            </> : <>
              <h3>Descartar este treino?</h3>
              <p>Nada será registrado e as séries marcadas serão perdidas.</p>
              <div className="tr-confirm-actions">
                <button type="button" className="ghost" onClick={() => setConfirm(null)}>Voltar</button>
                <button type="button" className="danger" onClick={onDiscard}>Descartar</button>
              </div>
            </>}
          </div>
        </div>
      )}

      {picking && (
        <ExercisePicker
          exclude={session.exercises.map((e) => e.key)}
          onClose={() => setPicking(false)}
          onPick={(exercise) => {
            setPicking(false);
            onChange({ ...session, exercises: [...session.exercises, exercise] });
          }}
        />
      )}
    </div>
  );
}

/* ── Painel lateral: lista, séries e edição ─────────────────────────────── */

function ExercisePanel({ session, focusUid, onFocus, onUpdateSet, onUpdateExercise, onRemove, onAdd, onNotes, onDiscard, onShowExercise, onToggleDone }: {
  session: LiveSession;
  focusUid: string | null;
  onFocus: (uid: string) => void;
  onUpdateSet: (exerciseUid: string, setId: string, patch: Partial<LiveSet>) => void;
  onUpdateExercise: (exerciseUid: string, fn: (e: LiveExercise) => LiveExercise) => void;
  onRemove: (uid: string) => void;
  onAdd: () => void;
  onNotes: (notes: string) => void;
  onDiscard: () => void;
  onShowExercise: (key: string) => void;
  onToggleDone: (exercise: LiveExercise, set: LiveSet, index: number) => void;
}) {
  const [open, setOpen] = useState<string | null>(focusUid);
  useEffect(() => { setOpen(focusUid); }, [focusUid]);

  return (
    <div className="tr-panel">
      <ol className="tr-panel-list">
        {session.exercises.map((exercise, index) => {
          const done = exercise.sets.filter((s) => s.done).length;
          const complete = isComplete(exercise);
          const expanded = open === exercise.uid;
          const repsHeader = exercise.unit === 'reps' ? 'Reps' : exercise.unit === 'segundos' ? 'Seg' : 'Min';
          return (
            <li key={exercise.uid} className={`tr-panel-ex ${exercise.uid === focusUid ? 'focus' : ''} ${complete ? 'complete' : ''}`}>
              <div className="tr-panel-row">
                <span className="tr-live-index">{complete ? I.check(15) : index + 1}</span>
                <button type="button" className="tr-panel-name" onClick={() => setOpen(expanded ? null : exercise.uid)} aria-expanded={expanded}>
                  <b>{exercise.name}</b>
                  <small>{done}/{exercise.sets.length} séries · {exercise.target.reps}{exercise.unit === 'reps' ? ' reps' : ` ${unitShort(exercise.unit)}`} · {exercise.loadLabel}</small>
                </button>
                {exercise.uid !== focusUid && !complete && (
                  <button type="button" className="tr-icon-btn" onClick={() => onFocus(exercise.uid)} aria-label={`Ir para ${exercise.name}`} title="Fazer agora">{I.play(14)}</button>
                )}
              </div>

              {expanded && (
                <div className="tr-panel-body">
                  <div className={`tr-set-table ${exercise.bodyweight ? 'bw' : ''}`} role="table" aria-label={`Séries de ${exercise.name}`}>
                    <div className="tr-set-row head" role="row">
                      <span role="columnheader">Série</span>
                      <span role="columnheader">Anterior</span>
                      <span role="columnheader">{exercise.bodyweight ? 'Extra kg' : 'Kg'}</span>
                      <span role="columnheader">{repsHeader}</span>
                      <span role="columnheader" title="Repetições em reserva: quantas ainda conseguiria fazer">RIR</span>
                      <span role="columnheader" aria-label="Feita" />
                    </div>
                    {exercise.sets.map((set, i) => {
                      const previous = exercise.previous?.sets[i];
                      return (
                        <div key={set.id} className={`tr-set-row ${set.done ? 'done' : ''}`} role="row">
                          <span className="tr-set-n">{i + 1}</span>
                          <button type="button" className="tr-set-prev" disabled={!previous || set.done}
                            title={previous ? 'Copiar a série anterior' : undefined}
                            onClick={() => previous && onUpdateSet(exercise.uid, set.id, { reps: String(previous.reps), loadKg: previous.loadKg ? String(previous.loadKg) : '' })}>
                            {previous ? `${previous.loadKg ? `${previous.loadKg}×` : ''}${previous.reps}` : '—'}
                          </button>
                          <input inputMode="decimal" type="number" min="0" step="0.5" value={set.loadKg} disabled={set.done}
                            placeholder={exercise.bodyweight ? '—' : exercise.target.loadKg !== null ? String(exercise.target.loadKg) : 'kg'}
                            aria-label={`Carga da série ${i + 1}`}
                            onChange={(e) => onUpdateSet(exercise.uid, set.id, { loadKg: e.target.value })} />
                          <input inputMode="numeric" type="number" min="1" value={set.reps} disabled={set.done}
                            placeholder={String(exercise.target.reps || '')}
                            aria-label={`${repsHeader} da série ${i + 1}`}
                            onChange={(e) => onUpdateSet(exercise.uid, set.id, { reps: e.target.value })} />
                          <select value={set.rir} disabled={set.done} aria-label={`RIR da série ${i + 1}`}
                            onChange={(e) => onUpdateSet(exercise.uid, set.id, { rir: e.target.value })}>
                            <option value="">—</option>
                            {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}{n === 5 ? '+' : ''}</option>)}
                          </select>
                          <button type="button" className={`tr-set-check ${set.done ? 'on' : ''}`} onClick={() => onToggleDone(exercise, set, i)}
                            aria-label={set.done ? `Desmarcar série ${i + 1}` : `Marcar série ${i + 1} como feita`}>{I.check(18)}</button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="tr-live-actions">
                    <button type="button" className="tr-link" onClick={() => onUpdateExercise(exercise.uid, (e) => ({ ...e, sets: [...e.sets, { ...emptySet(), loadKg: e.sets[e.sets.length - 1]?.loadKg ?? '' }] }))}>{I.plus(14)} Série</button>
                    {exercise.sets.length > 1 && !exercise.sets[exercise.sets.length - 1].done && (
                      <button type="button" className="tr-link muted" onClick={() => onUpdateExercise(exercise.uid, (e) => ({ ...e, sets: e.sets.slice(0, -1) }))}>{I.minus(14)} Série</button>
                    )}
                    <button type="button" className="tr-link muted" onClick={() => onShowExercise(exercise.key)}>{I.info(14)} Como fazer</button>
                    <button type="button" className="tr-link tr-link-danger" onClick={() => onRemove(exercise.uid)}>{I.trash(14)} Remover</button>
                  </div>
                  <label className="tr-panel-rest">Descanso entre séries
                    <span>
                      <button type="button" className="tr-rest-btn" onClick={() => onUpdateExercise(exercise.uid, (e) => ({ ...e, restSeconds: Math.max(0, e.restSeconds - 15) }))} aria-label="Menos 15 segundos de descanso">−15</button>
                      <b>{fmtClock(exercise.restSeconds)}</b>
                      <button type="button" className="tr-rest-btn" onClick={() => onUpdateExercise(exercise.uid, (e) => ({ ...e, restSeconds: e.restSeconds + 15 }))} aria-label="Mais 15 segundos de descanso">+15</button>
                    </span>
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <button type="button" className="tr-add-exercise" onClick={onAdd}>{I.plus(16)} Adicionar exercício</button>
      <label className="tr-notes">Anotações do treino
        <textarea rows={2} maxLength={500} value={session.notes} placeholder="Como foi? Dor, energia, ajustes para a próxima…"
          onChange={(e) => onNotes(e.target.value)} />
      </label>
      <button type="button" className="tr-discard" onClick={onDiscard}>Descartar treino</button>
    </div>
  );
}

/* ── Adicionar exercício avulso ─────────────────────────────────────────── */

function ExercisePicker({ exclude, onPick, onClose }: { exclude: string[]; onPick: (e: LiveExercise) => void; onClose: () => void }) {
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [query, setQuery] = useState('');
  useEffect(() => { getLibrary().then(setData).catch(() => setData({ allowed: [], blocked: [], filters: { query: '', group: '', equipment: '' } })); }, []);
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const list = useMemo(() => (data?.allowed ?? [])
    .filter((e) => !exclude.includes(e.key))
    .filter((e) => !query || norm(`${e.name} ${e.group} ${e.muscles}`).includes(norm(query))), [data, exclude, query]);

  return (
    <Drawer title="Adicionar exercício" subtitle="Só aparecem exercícios liberados para o seu perfil." onClose={onClose}>
      <label className="tr-search">{I.search(16)}<input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome ou músculo" /></label>
      {!data && <p className="muted">Carregando…</p>}
      <div className="tr-pick-list">
        {list.map((e) => {
          const reps = e.repsMin ?? 10;
          return (
            <button type="button" key={e.key} className="tr-pick" onClick={() => onPick({
              uid: uid(), key: e.key, name: e.name, muscleLabel: e.group, unit: e.unit,
              repsLabel: e.repsMin ? `${e.repsMin}–${e.repsMax}${e.unit === 'reps' ? '' : ` ${e.unit}`}` : '8–12',
              restSeconds: e.restSeconds ?? 60,
              bodyweight: e.equipment.every((item) => item === 'nenhum' || item === 'peso-corporal') || e.unit !== 'reps',
              target: { loadKg: null, reps },
              loadLabel: 'Escolha a carga',
              setSeconds: estimateSetSeconds(e.unit, reps),
              tempo: e.unit === 'reps' ? '2-0-2' : null,
              bodyweightKg: null,
              perSide: false,
              note: 'Exercício extra: ajuste a carga em "Ajustar carga e reps".', trend: 'new', previous: null,
              sets: Array.from({ length: e.suggestedSets ?? 3 }, emptySet),
            })}>
              <b>{e.name}</b><small>{e.muscles.replace('Músculos principais: ', '')}</small>
            </button>
          );
        })}
      </div>
    </Drawer>
  );
}

/* ── Resumo ao salvar ───────────────────────────────────────────────────── */

function SessionSummary({ result, onClose }: { result: SessionResult; onClose: () => void }) {
  const { level } = result;
  return (
    <div className="tr-player tr-summary" role="dialog" aria-modal="true" aria-label="Resumo do treino">
      <div className="tr-summary-card">
        <div className="tr-summary-badge">{I.check(34)}</div>
        <h2>Treino concluído!</h2>
        <p className="muted">{result.leveledUp ? `Subiu para o nível ${level.current} — ${level.title}!` : 'Registrado no seu histórico.'}</p>
        <div className="tr-summary-stats">
          <div><b>{fmtClock(result.durationSeconds)}</b><span>duração</span></div>
          <div><b>{result.totals.sets}</b><span>séries</span></div>
          <div><b>{fmtVolume(result.totals.volumeKg)}</b><span>volume</span></div>
          <div><b>+{result.xpEarned}</b><span>XP</span></div>
        </div>
        <div className="tr-summary-level">
          <span>Nível {level.current} · {level.title}</span>
          <div className="tr-xp"><i style={{ width: `${(level.xp / level.xpNeeded) * 100}%` }} /></div>
          <small className="muted">{level.xp} / {level.xpNeeded} XP</small>
        </div>
        {result.records.length > 0 && (
          <div className="tr-summary-records">
            <h3>{I.trophy(16)} {result.records.length === 1 ? 'Novo recorde' : `${result.records.length} novos recordes`}</h3>
            {result.records.map((r, i) => (
              <div key={`${r.exercise}-${r.kind}-${i}`}>
                <span>{r.exercise}</span>
                <b>{r.kind === 'reps' ? `${r.value} reps` : fmtKg(r.value)}<small> {r.kind === 'load' ? 'carga' : r.kind === 'e1rm' ? '1RM est.' : ''} (antes {r.kind === 'reps' ? r.previous : fmtKg(r.previous)})</small></b>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="tr-primary" onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}
