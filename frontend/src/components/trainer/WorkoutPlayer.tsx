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
  rest: { endsAt: number; total: number; exercise: string } | null;
}

export const LIVE_KEY = 'sano:treino:sessao';
const uid = () => Math.random().toString(36).slice(2, 10);
const emptySet = (): LiveSet => ({ id: uid(), loadKg: '', reps: '', rir: '', done: false });

export function loadLiveSession(): LiveSession | null {
  try {
    const raw = localStorage.getItem(LIVE_KEY);
    return raw ? (JSON.parse(raw) as LiveSession) : null;
  } catch { return null; }
}
export function storeLiveSession(session: LiveSession | null) {
  try {
    if (session) localStorage.setItem(LIVE_KEY, JSON.stringify(session));
    else localStorage.removeItem(LIVE_KEY);
  } catch { /* sem storage: a sessão só não sobrevive a um recarregamento */ }
}

const fromPlanned = (exercise: DayExercise): LiveExercise => ({
  uid: uid(),
  key: exercise.key,
  name: exercise.name,
  muscleLabel: exercise.muscleLabel,
  unit: exercise.unit,
  repsLabel: exercise.reps,
  restSeconds: exercise.restSeconds,
  bodyweight: exercise.equipment.every((item) => item === 'nenhum' || item === 'peso-corporal') || exercise.unit !== 'reps',
  target: { loadKg: exercise.suggestion.loadKg, reps: exercise.suggestion.reps },
  note: exercise.suggestion.note,
  trend: exercise.suggestion.trend,
  previous: exercise.previous,
  sets: Array.from({ length: exercise.sets }, emptySet),
});

export function sessionFromDay(day: WorkoutDay): LiveSession {
  return {
    title: day.title,
    weekday: day.weekday,
    startedAt: new Date().toISOString(),
    exercises: day.exercises.map(fromPlanned),
    notes: '',
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
  const { prime, beep } = useBeep();
  const beeped = useRef<number | null>(null);
  useWakeLock(!result);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  // Fim do descanso: bipa uma vez e some a barra alguns segundos depois.
  const rest = session.rest;
  const restLeft = rest ? Math.max(0, (rest.endsAt - now) / 1000) : 0;
  useEffect(() => {
    if (!rest) return;
    if (restLeft <= 0 && beeped.current !== rest.endsAt) {
      beeped.current = rest.endsAt;
      beep();
    }
    if (restLeft <= 0 && now - rest.endsAt > 4000) onChange({ ...session, rest: null });
  }, [rest, restLeft, now, beep, onChange, session]);

  const elapsed = (now - new Date(session.startedAt).getTime()) / 1000;
  const totalSets = session.exercises.reduce((sum, e) => sum + e.sets.length, 0);
  const doneSets = session.exercises.reduce((sum, e) => sum + e.sets.filter((s) => s.done).length, 0);
  const volume = session.exercises.reduce((sum, e) => sum + e.sets.filter((s) => s.done).reduce((v, s) => v + (Number(s.loadKg) || 0) * (Number(s.reps) || 0), 0), 0);

  const updateExercise = (exerciseUid: string, fn: (e: LiveExercise) => LiveExercise) =>
    onChange({ ...session, exercises: session.exercises.map((e) => (e.uid === exerciseUid ? fn(e) : e)) });

  const updateSet = (exerciseUid: string, setId: string, patch: Partial<LiveSet>) =>
    updateExercise(exerciseUid, (e) => ({ ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) }));

  const toggleDone = (exercise: LiveExercise, set: LiveSet, index: number) => {
    prime();
    if (set.done) {
      updateSet(exercise.uid, set.id, { done: false });
      return;
    }
    // Campo vazio usa o alvo (o que aparece em cinza): marcar é um toque só.
    const previous = exercise.previous?.sets[index];
    const reps = set.reps || String(exercise.target.reps || previous?.reps || '');
    const loadKg = set.loadKg || (exercise.bodyweight ? '' : String(exercise.target.loadKg ?? previous?.loadKg ?? ''));
    if (!reps || Number(reps) <= 0) {
      setError(`Informe as ${exercise.unit === 'reps' ? 'repetições' : unitShort(exercise.unit)} da série ${index + 1} de ${exercise.name}.`);
      return;
    }
    setError('');
    const next: LiveSession = {
      ...session,
      exercises: session.exercises.map((e) => (e.uid !== exercise.uid ? e : {
        ...e,
        // Propaga a carga para as próximas séries ainda vazias.
        sets: e.sets.map((s, i) => (s.id === set.id ? { ...s, reps, loadKg, done: true } : i > index && !s.done && !s.loadKg && loadKg ? { ...s, loadKg } : s)),
      })),
      rest: exercise.restSeconds > 0 ? { endsAt: Date.now() + exercise.restSeconds * 1000, total: exercise.restSeconds, exercise: exercise.name } : null,
    };
    onChange(next);
  };

  const adjustRest = (delta: number) => {
    if (!rest) return;
    onChange({ ...session, rest: { ...rest, endsAt: Math.max(Date.now(), rest.endsAt + delta * 1000), total: Math.max(1, rest.total + delta) } });
  };

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

  return (
    <div className="tr-player" role="dialog" aria-modal="true" aria-label={`Treino em andamento: ${session.title}`}>
      <header className="tr-player-head">
        <button type="button" className="tr-icon-btn" onClick={onMinimize} aria-label="Minimizar treino" title="Minimizar (o treino continua)">{I.down(20)}</button>
        <div className="tr-player-title">
          <b>{session.title}</b>
          <span><span className="tr-live-dot" />{fmtClock(elapsed)} · {doneSets}/{totalSets} séries{volume ? ` · ${fmtVolume(volume)}` : ''}</span>
        </div>
        <button type="button" className="tr-finish-btn" onClick={() => setConfirm('finish')} disabled={saving}>Finalizar</button>
      </header>
      <div className="tr-player-progress"><i style={{ width: `${totalSets ? (doneSets / totalSets) * 100 : 0}%` }} /></div>

      <div className="tr-player-body">
        {error && <div className="tr-alert bad">{error}</div>}
        {session.exercises.map((exercise, exerciseIndex) => {
          const allDone = exercise.sets.length > 0 && exercise.sets.every((s) => s.done);
          const repsHeader = exercise.unit === 'reps' ? 'Reps' : exercise.unit === 'segundos' ? 'Seg' : 'Min';
          return (
            <section key={exercise.uid} className={`tr-live-ex ${allDone ? 'complete' : ''}`}>
              <header>
                <span className="tr-live-index">{allDone ? I.check(16) : exerciseIndex + 1}</span>
                <button type="button" className="tr-live-name" onClick={() => onShowExercise(exercise.key)}>
                  <b>{exercise.name}</b>
                  <small>{exercise.muscleLabel} · {exercise.repsLabel} · descanso {exercise.restSeconds}s</small>
                </button>
                <button type="button" className="tr-icon-btn" aria-label={`Remover ${exercise.name} deste treino`} title="Remover do treino de hoje"
                  onClick={() => onChange({ ...session, exercises: session.exercises.filter((e) => e.uid !== exercise.uid) })}>{I.trash(16)}</button>
              </header>
              <p className={`tr-live-note ${exercise.trend}`}>
                {exercise.trend === 'up' ? I.up(14) : exercise.trend === 'down' ? I.down(14) : I.spark(14)}
                {exercise.note}
                {exercise.previous && <span className="muted"> · última vez ({fmtDay(exercise.previous.day)}): {describeSets(exercise.previous.sets, exercise.unit)}</span>}
              </p>

              <div className={`tr-set-table ${exercise.bodyweight ? 'bw' : ''}`} role="table" aria-label={`Séries de ${exercise.name}`}>
                <div className="tr-set-row head" role="row">
                  <span role="columnheader">Série</span>
                  <span role="columnheader">Anterior</span>
                  <span role="columnheader">{exercise.bodyweight ? 'Extra kg' : 'Kg'}</span>
                  <span role="columnheader">{repsHeader}</span>
                  <span role="columnheader" title="Repetições em reserva: quantas ainda conseguiria fazer">RIR</span>
                  <span role="columnheader" aria-label="Feita" />
                </div>
                {exercise.sets.map((set, index) => {
                  const previous = exercise.previous?.sets[index];
                  return (
                    <div key={set.id} className={`tr-set-row ${set.done ? 'done' : ''}`} role="row">
                      <span className="tr-set-n">{index + 1}</span>
                      <button type="button" className="tr-set-prev" disabled={!previous || set.done}
                        title={previous ? 'Copiar a série anterior' : undefined}
                        onClick={() => previous && updateSet(exercise.uid, set.id, { reps: String(previous.reps), loadKg: previous.loadKg ? String(previous.loadKg) : '' })}>
                        {previous ? `${previous.loadKg ? `${previous.loadKg}×` : ''}${previous.reps}` : '—'}
                      </button>
                      <input inputMode="decimal" type="number" min="0" step="0.5" value={set.loadKg} disabled={set.done}
                        placeholder={exercise.bodyweight ? '—' : exercise.target.loadKg !== null ? String(exercise.target.loadKg) : 'kg'}
                        aria-label={`Carga da série ${index + 1}`}
                        onChange={(e) => updateSet(exercise.uid, set.id, { loadKg: e.target.value })} />
                      <input inputMode="numeric" type="number" min="1" value={set.reps} disabled={set.done}
                        placeholder={String(exercise.target.reps || '')}
                        aria-label={`${repsHeader} da série ${index + 1}`}
                        onChange={(e) => updateSet(exercise.uid, set.id, { reps: e.target.value })} />
                      <select value={set.rir} disabled={set.done} aria-label={`RIR da série ${index + 1}`}
                        onChange={(e) => updateSet(exercise.uid, set.id, { rir: e.target.value })}>
                        <option value="">—</option>
                        {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}{n === 5 ? '+' : ''}</option>)}
                      </select>
                      <button type="button" className={`tr-set-check ${set.done ? 'on' : ''}`} onClick={() => toggleDone(exercise, set, index)}
                        aria-label={set.done ? `Desmarcar série ${index + 1}` : `Marcar série ${index + 1} como feita`}>{I.check(18)}</button>
                    </div>
                  );
                })}
              </div>
              <div className="tr-live-actions">
                <button type="button" className="tr-link" onClick={() => updateExercise(exercise.uid, (e) => ({ ...e, sets: [...e.sets, { ...emptySet(), loadKg: e.sets[e.sets.length - 1]?.loadKg ?? '' }] }))}>{I.plus(14)} Série</button>
                {exercise.sets.length > 1 && !exercise.sets[exercise.sets.length - 1].done && (
                  <button type="button" className="tr-link muted" onClick={() => updateExercise(exercise.uid, (e) => ({ ...e, sets: e.sets.slice(0, -1) }))}>{I.minus(14)} Remover última</button>
                )}
              </div>
            </section>
          );
        })}

        <button type="button" className="tr-add-exercise" onClick={() => setPicking(true)}>{I.plus(16)} Adicionar exercício</button>
        <label className="tr-notes">Anotações do treino
          <textarea rows={2} maxLength={500} value={session.notes} placeholder="Como foi? Dor, energia, ajustes para a próxima…"
            onChange={(e) => onChange({ ...session, notes: e.target.value })} />
        </label>
        <button type="button" className="tr-discard" onClick={() => setConfirm('discard')}>Descartar treino</button>
      </div>

      {rest && (
        <div className={`tr-rest ${restLeft <= 0 ? 'over' : ''}`} role="timer" aria-live="polite">
          <Ring value={rest.total ? 1 - restLeft / rest.total : 1} size={46} stroke={4} color={restLeft <= 0 ? 'var(--ok)' : 'var(--accent)'}>
            {I.clock(16)}
          </Ring>
          <div className="tr-rest-info">
            <small>{restLeft <= 0 ? 'Descanso terminado — próxima série!' : `Descanso · ${rest.exercise}`}</small>
            <b>{fmtClock(restLeft)}</b>
          </div>
          <button type="button" className="tr-rest-btn" onClick={() => adjustRest(-15)} aria-label="Menos 15 segundos">−15</button>
          <button type="button" className="tr-rest-btn" onClick={() => adjustRest(15)} aria-label="Mais 15 segundos">+15</button>
          <button type="button" className="tr-rest-skip" onClick={() => onChange({ ...session, rest: null })}>Pular</button>
        </div>
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
        {list.map((e) => (
          <button type="button" key={e.key} className="tr-pick" onClick={() => onPick({
            uid: uid(), key: e.key, name: e.name, muscleLabel: e.group, unit: e.unit,
            repsLabel: e.repsMin ? `${e.repsMin}–${e.repsMax}${e.unit === 'reps' ? '' : ` ${e.unit}`}` : '8–12',
            restSeconds: e.restSeconds ?? 60,
            bodyweight: e.equipment.every((item) => item === 'nenhum' || item === 'peso-corporal') || e.unit !== 'reps',
            target: { loadKg: null, reps: e.repsMin ?? 10 },
            note: 'Exercício extra: registre a carga usada.', trend: 'new', previous: null,
            sets: Array.from({ length: e.suggestedSets ?? 3 }, emptySet),
          })}>
            <b>{e.name}</b><small>{e.muscles.replace('Músculos principais: ', '')}</small>
          </button>
        ))}
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
