import { useCallback, useEffect, useState, type ReactNode } from 'react';
import AppShell from '../../components/layout/AppShell';
import Onboarding, { type ProfileDraft } from '../../components/trainer/Onboarding';
import TodayView, { type TrainerView } from '../../components/trainer/TodayView';
import PlanView from '../../components/trainer/PlanView';
import LibraryView from '../../components/trainer/LibraryView';
import ProgressView from '../../components/trainer/ProgressView';
import BodyView from '../../components/trainer/BodyView';
import NutritionView from '../../components/trainer/NutritionView';
import { ExerciseDrawer } from '../../components/trainer/ExerciseDrawer';
import WorkoutPlayer, { loadLiveSession, sessionFromDay, storeLiveSession, type LiveSession } from '../../components/trainer/WorkoutPlayer';
import { I, Ring } from '../../components/trainer/ui';
import { getDashboard, getOverview, getWorkoutDay } from '../../services/trainer.service';
import type { TrainerDashboard, TrainerOverview, TrainingProfile } from '../../types/trainer';
import '../../styles/trainer.css';

/**
 * Treino:
 *
 *   ┌ nível · ofensiva · semana ┐ ┌ Hoje | Plano | Exercícios | Progresso | Corpo | Nutrição ┐
 *   │ navegação                 │ │                                                      │
 *   └───────────────────────────┘ └──────────────────────────────────────────────────────┘
 *                                   + player de treino ao vivo (tela cheia, minimizável)
 */
const NAV: { key: TrainerView; label: string; icon: (s?: number) => ReactNode }[] = [
  { key: 'hoje', label: 'Hoje', icon: I.today },
  { key: 'plano', label: 'Plano', icon: I.plan },
  { key: 'exercicios', label: 'Exercícios', icon: I.library },
  { key: 'progresso', label: 'Progresso', icon: I.progress },
  { key: 'corpo', label: 'Corpo', icon: I.body },
  { key: 'nutricao', label: 'Nutrição', icon: I.food },
];
const VIEW_KEY = 'sano:treino:view';

const toDraft = (p: TrainingProfile): Partial<ProfileDraft> => ({
  goal: p.goal,
  weightKg: String(p.weightKg),
  targetWeightKg: p.targetWeightKg === null ? '' : String(p.targetWeightKg),
  heightCm: String(p.heightCm),
  birthYear: String(p.birthYear),
  sex: p.sex,
  somatotype: p.somatotype ?? '',
  experience: p.experience as ProfileDraft['experience'],
  trainingDays: p.trainingDays,
  trainingWeekdays: p.trainingWeekdays,
  trainingLocation: p.trainingLocation,
  pregnancy: p.pregnancy ?? false,
  heartCondition: p.heartCondition ?? false,
  medicationUse: p.medicationUse ?? false,
  parqAnswers: p.parqAnswers ?? {
    heartDiagnosis: false, chestPain: false, dizziness: false, jointCondition: false,
    prescribedMedication: false, supervisedExercise: false, otherReason: false,
  },
  minutesPerDay: String(p.minutesPerDay),
  equipment: p.equipment,
  injuries: p.injuries,
  sleepHours: String(p.sleepHours),
  waterLiters: String(p.waterLiters),
  mealsPerDay: p.mealsPerDay,
  dietQuality: p.dietQuality as ProfileDraft['dietQuality'],
  dietNotes: p.dietNotes ?? '',
  dietRestrictions: p.dietRestrictions,
  restrictionNotes: p.restrictionNotes ?? '',
});

function safetyWarnings(profile: TrainingProfile) {
  return [
    new Date().getFullYear() - profile.birthYear < 18 ? 'Menor de 18 anos: treine apenas com orientação de um responsável e de profissional qualificado.' : null,
    profile.pregnancy ? 'Gestação informada: procure orientação individualizada antes de treinar.' : null,
    profile.heartCondition ? 'Condição cardíaca informada: confirme liberação médica antes de iniciar ou intensificar exercícios.' : null,
    profile.medicationUse ? 'Uso de medicação informado: verifique com um profissional de saúde os cuidados para exercício.' : null,
    profile.parqAnswers && Object.values(profile.parqAnswers).some(Boolean) ? 'Sua triagem PAR-Q teve resposta positiva. Consulte um profissional de saúde antes de intensificar o treino.' : null,
  ].filter((w): w is string => Boolean(w));
}

export default function TrainerPage() {
  const [dash, setDash] = useState<TrainerDashboard | null>(null);
  const [overview, setOverview] = useState<TrainerOverview | null>(null);
  const [error, setError] = useState('');
  const [intro, setIntro] = useState('');
  const [editing, setEditing] = useState(false);
  const [view, setView] = useState<TrainerView>(() => {
    try { return (localStorage.getItem(VIEW_KEY) as TrainerView) || 'hoje'; } catch { return 'hoje'; }
  });
  const [planDay, setPlanDay] = useState<number | undefined>(undefined);
  const [exerciseKey, setExerciseKey] = useState<string | null>(null);
  const [live, setLive] = useState<LiveSession | null>(() => loadLiveSession());
  const [playerOpen, setPlayerOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [version, setVersion] = useState(0);
  const [warningsHidden, setWarningsHidden] = useState(false);

  const loadOverview = useCallback(async () => {
    try { setOverview(await getOverview()); } catch (e) { setError((e as Error).message); }
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await getDashboard();
      setDash(d);
      setError('');
      if (d.onboarded) await loadOverview();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [loadOverview]);

  useEffect(() => { void load(); }, [load]);

  const go = (next: TrainerView, weekday?: number) => {
    setView(next);
    if (weekday !== undefined) setPlanDay(weekday);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* só não lembra */ }
    document.querySelector('.tr-main')?.scrollTo({ top: 0 });
  };

  const updateLive = useCallback((next: LiveSession | null) => {
    setLive(next);
    storeLiveSession(next);
  }, []);

  const start = async (weekday: number) => {
    if (live) { setPlayerOpen(true); return; }
    setStarting(true);
    try {
      const day = await getWorkoutDay(weekday);
      updateLive(sessionFromDay(day));
      setPlayerOpen(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const refreshAll = () => { setVersion((v) => v + 1); void loadOverview(); };

  if (!dash) {
    return <AppShell title="Treino" status="carregando"><div className="tr-loading">{error ? <div className="tr-alert bad">{error}</div> : <div className="tr-skeleton" style={{ height: 280 }} />}</div></AppShell>;
  }

  if (!dash.onboarded || !dash.profile) {
    return (
      <AppShell title="Treino" status="primeiro acesso">
        <Onboarding onDone={async (text) => { setIntro(text); await load(); }} />
      </AppShell>
    );
  }

  if (editing) {
    return (
      <AppShell title="Seu perfil de treino" status="cada resposta muda o plano" actions={<button className="ghost" onClick={() => setEditing(false)}>Cancelar</button>}>
        <Onboarding initial={toDraft(dash.profile)} onDone={async () => { setEditing(false); await load(); setVersion((v) => v + 1); }} />
      </AppShell>
    );
  }

  const warnings = safetyWarnings(dash.profile);
  const level = overview?.level;

  return (
    <AppShell title="Treino" status={overview ? `${overview.goalLabel} · ${overview.split}` : 'carregando'} flush>
      <div className="tr-page">
        <aside className="tr-side">
          {overview && level ? <>
            <div className="tr-side-level">
              <Ring value={level.xp / level.xpNeeded} size={62} stroke={5}>
                <b className="tr-level-n">{level.current}</b>
              </Ring>
              <div>
                <small>Nível {level.current}</small>
                <b>{level.title}</b>
                <span className="muted">{level.xpNeeded - level.xp} XP para o próximo</span>
              </div>
            </div>
            <div className="tr-side-kpis">
              <div className={overview.streak ? 'fire' : ''}>{I.flame(16)}<b>{overview.streak}</b><small>ofensiva</small></div>
              <div>{I.check(16)}<b>{overview.weekGoal.done}/{overview.weekGoal.target}</b><small>semana</small></div>
            </div>
            <div className="tr-side-week" aria-label="Semana">
              {overview.week.map((d) => (
                <span key={d.day} className={`${d.done ? 'done' : ''} ${d.isToday ? 'today' : ''} ${d.isTrainingDay ? 'train' : ''}`} title={`${d.shortLabel}: ${d.isTrainingDay ? d.title : 'descanso'}${d.done ? ' ✓' : ''}`}>
                  <i />{d.shortLabel.slice(0, 1)}
                </span>
              ))}
            </div>
          </> : <div className="tr-skeleton" style={{ height: 150 }} />}

          <nav className="tr-nav" aria-label="Seções do treino">
            {NAV.map((item) => (
              <button key={item.key} type="button" className={view === item.key ? 'on' : ''} aria-current={view === item.key ? 'page' : undefined} onClick={() => go(item.key)}>
                {item.icon(18)}<span>{item.label}</span>
              </button>
            ))}
          </nav>

          {live && !playerOpen && (
            <button type="button" className="tr-side-live" onClick={() => setPlayerOpen(true)}>
              <span className="tr-live-dot" /> Treino em andamento <b>{live.title}</b>
            </button>
          )}

          <button type="button" className="tr-side-profile" onClick={() => setEditing(true)}>{I.edit(15)} Editar perfil</button>
        </aside>

        <main className="tr-main">
          {intro && <div className="tr-alert accent tr-intro"><p>{intro}</p><button type="button" className="tr-link" onClick={() => setIntro('')}>OK</button></div>}
          {warnings.length > 0 && !warningsHidden && (
            <div className="tr-alert warn tr-safety">
              <div>{warnings.map((w) => <p key={w}>{w}</p>)}</div>
              <button type="button" className="tr-icon-btn" onClick={() => setWarningsHidden(true)} aria-label="Ocultar avisos">{I.close(16)}</button>
            </div>
          )}
          {error && <div className="tr-alert bad">{error}</div>}
          {starting && <div className="tr-alert accent">Preparando o treino…</div>}

          {!overview && (view === 'hoje' || view === 'progresso')
            ? <div className="tr-view"><div className="tr-skeleton" style={{ height: 300 }} /></div>
            : <>
              {view === 'hoje' && overview && (
                <TodayView overview={overview} live={live} aiEnabled={Boolean(dash.aiEnabled)}
                  onStart={(w) => void start(w)} onResume={() => setPlayerOpen(true)} onShowExercise={setExerciseKey} onNavigate={go} />
              )}
              {view === 'plano' && <PlanView key={version} initialWeekday={planDay} onStart={(w) => void start(w)} onShowExercise={setExerciseKey} onPlanChanged={() => void loadOverview()} />}
              {view === 'exercicios' && <LibraryView onShowExercise={setExerciseKey} />}
              {view === 'progresso' && overview && <ProgressView overview={overview} onShowExercise={setExerciseKey} onChanged={refreshAll} />}
              {view === 'corpo' && <BodyView key={version} onChanged={() => void loadOverview()} />}
              {view === 'nutricao' && <NutritionView key={version} />}
            </>}
        </main>
      </div>

      {live && !playerOpen && view !== 'hoje' && (
        <button type="button" className="tr-live-fab" onClick={() => setPlayerOpen(true)}>
          <span className="tr-live-dot" />Treino em andamento · {live.title}
        </button>
      )}

      {live && playerOpen && (
        <WorkoutPlayer
          session={live}
          onChange={updateLive}
          onMinimize={() => setPlayerOpen(false)}
          onDiscard={() => { updateLive(null); setPlayerOpen(false); }}
          onShowExercise={setExerciseKey}
          onSaved={() => { updateLive(null); setPlayerOpen(false); go('hoje'); refreshAll(); }}
        />
      )}

      {exerciseKey && <ExerciseDrawer exerciseKey={exerciseKey} onClose={() => setExerciseKey(null)} />}
    </AppShell>
  );
}
