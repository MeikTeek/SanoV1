import { useCallback, useEffect, useState } from 'react';
import AppShell from '../../components/layout/AppShell';
import StatRadar from '../../components/trainer/StatRadar';
import Onboarding from '../../components/trainer/Onboarding';
import WorkoutTimer from '../../components/trainer/WorkoutTimer';
import ExerciseDetailModal from '../../components/trainer/ExerciseDetailModal';
import { completeBlock, getDashboard, getReport, getDiet, getReview, askCoach } from '../../services/trainer.service';
import type { TrainerDashboard, DietNumbers } from '../../types/trainer';
import '../../styles/trainer.css';

const GOAL_TEXT: Record<string, string> = {
  HYPERTROPHY: 'Ganhar massa muscular',
  WEIGHT_LOSS: 'Emagrecer',
  CONDITIONING: 'Melhorar condicionamento',
  HEALTH: 'Saúde e mobilidade',
};

const goalLabelOf = (goal: string) => GOAL_TEXT[goal] ?? goal;

type Tab = 'treino' | 'dieta' | 'coach';

export default function TrainerPage() {
  const [data, setData] = useState<TrainerDashboard | null>(null);
  const [intro, setIntro] = useState('');
  const [error, setError] = useState('');
  const [busyBlock, setBusyBlock] = useState('');
  const [tab, setTab] = useState<Tab>('treino');
  const [timerOn, setTimerOn] = useState(false);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const [diet, setDiet] = useState<{ numbers: DietNumbers; meals: string; aiEnabled: boolean } | null>(null);
  const [review, setReview] = useState('');
  const [report, setReport] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await getDashboard());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const doBlock = async (missionId: string, blockKey: string) => {
    setBusyBlock(blockKey);
    setError('');
    try {
      const r = await completeBlock(missionId, blockKey);
      if (r.leveledUp) setIntro(`Level up! Você chegou ao nível ${r.level}.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyBlock('');
    }
  };

  // Carrega um dado pesado só quando a aba é aberta pela primeira vez.
  const openDiet = useCallback(async () => {
    setTab('dieta');
    if (diet) return;
    try { setDiet(await getDiet()); } catch (e) { setError((e as Error).message); }
  }, [diet]);

  const openCoach = useCallback(async () => {
    setTab('coach');
    if (review || report) return;
    try {
      const [r, w] = await Promise.all([getReview(), getReport()]);
      setReview(r.review);
      setReport(w.report);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [review, report]);

  const submitQuestion = async () => {
    if (!question.trim()) return;
    setError('');
    try {
      setAnswer((await askCoach(question.trim())).answer);
      setQuestion('');
    } catch (e) {
      setError((e as Error).message);
    }
  };
if (!data) return <AppShell title="Treino" status="carregando" workspace><div className="card"><p className="muted">Carregando...</p></div></AppShell>;

  if (!data.onboarded) {
    return (
      <AppShell title="Treino" status="primeiro acesso" workspace>
        <Onboarding onDone={async (text) => { setIntro(text); await load(); }} />
      </AppShell>
    );
  }

  if (editing && data.profile) {
    return (
      <AppShell
        title="Seu perfil"
        status="dados usados pelo treino"
        workspace
        actions={<button className="ghost" onClick={() => setEditing(false)}>Cancelar</button>}
      >
        <Onboarding
          initial={{
            goal: data.profile.goal,
            weightKg: String(data.profile.weightKg),
            heightCm: String(data.profile.heightCm),
            birthYear: String(data.profile.birthYear),
            sex: data.profile.sex,
            somatotype: data.profile.somatotype ?? '',
            experience: data.profile.experience as 'BEGINNER',
            trainingDays: data.profile.trainingDays,
            minutesPerDay: String(data.profile.minutesPerDay),
            equipment: data.profile.equipment,
            injuries: data.profile.injuries,
            sleepHours: String(data.profile.sleepHours),
            waterLiters: String(data.profile.waterLiters),
            mealsPerDay: data.profile.mealsPerDay,
            dietQuality: data.profile.dietQuality as 'FAIR',
            dietNotes: data.profile.dietNotes ?? '',
            dietRestrictions: data.profile.dietRestrictions,
            restrictionNotes: data.profile.restrictionNotes ?? '',
          }}
          onDone={async () => { setEditing(false); await load(); }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Treino"
      status={data.level ? `Nv. ${data.level.current} · ${data.level.title}` : undefined}
      workspace
      actions={<button className="ghost" onClick={() => setEditing(true)}>Editar perfil</button>}
    >

      {error && <div className="error">{error}</div>}

      {intro && (
        <div className="system-msg">
          <span className="sys-icon">?</span>
          <p>{intro}</p>
          <button className="ghost" onClick={() => setIntro('')}>OK</button>
        </div>
      )}

      {data.penalty && (
        <div className="penalty">
          <b>Penalidade ativa</b> · {data.penalty.daysMissed} dia(s) sem treinar. Sua ofensiva zerou e os
          atributos estão -{data.penalty.percent}%. Conclua o treino de hoje para limpar.
        </div>
      )}

      <div className="trainer-grid">
            <section className="card status-card">
              <h2>Status do jogador</h2>
              <div className="level-line">
                <b>Nv. {data.level?.current}</b>
                <span className="muted">{data.level?.title}</span>
                <span className="streak">?? {data.stats?.streak}</span>
              </div>
              <div className="xp-bar">
                <div style={{ width: `${Math.min(100, ((data.level?.xp ?? 0) / (data.level?.xpNeeded || 1)) * 100)}%` }} />
              </div>
              <small className="muted">{data.level?.xp} / {data.level?.xpNeeded} XP</small>
              {data.stats && <StatRadar stats={data.stats} />}
              {data.profile && (
                <small className="muted center-text">
                  {goalLabelOf(data.profile.goal)} · {data.profile.minutesPerDay} min/dia
                  {data.stats?.debuffed && ' · atributos penalizados'}
                </small>
              )}
            </section>

            <section className="card">
              <div className="tabs">
                <button className={tab === 'treino' ? 'active' : ''} onClick={() => setTab('treino')}>Treino de hoje</button>
                <button className={tab === 'dieta' ? 'active' : ''} onClick={openDiet}>Dieta</button>
                <button className={tab === 'coach' ? 'active' : ''} onClick={openCoach}>Coach</button>
              </div>

              {tab === 'treino' && data.mission && (
                <>
                  <h2 className="tab-title">{data.mission.title}</h2>
                  <p className="muted">{data.mission.plannedMinutes} min planejados</p>
                  {data.mission.completedAt && <div className="notice">Treino concluído! +{data.mission.xpAwarded} XP.</div>}

                  <div className="blocks">
                    {data.mission.blocks.map((b) => {
                      const done = data.mission!.progress.some((p) => p.blockKey === b.key);
                      return (
                        <div key={b.key} className={`block ${done ? 'done' : ''}`}>
                          <button
                            className="block-check"
                            disabled={done || busyBlock === b.key || Boolean(data.mission!.completedAt)}
                            onClick={() => doBlock(data.mission!.id, b.key)}
                            aria-label={`Marcar ${b.name} como concluído`}
                          >{done ? '✓' : busyBlock === b.key ? '…' : '○'}</button>
                          <span className="block-info">
                            <b>{b.name}</b>
                            <span className="muted"> · {b.target} · {b.minutes} min</span>
                          </span>
                          <button className="ghost" onClick={() => setDetailKey(b.key)}>Detalhes</button>
                        </div>
                      );
                    })}
                  </div>

                  {!data.mission.completedAt && (
                    <button onClick={() => setTimerOn(true)}>Iniciar cronômetro</button>
                  )}
                </>
              )}

              {tab === 'dieta' && (
                <>
                  <h2 className="tab-title">Sua dieta hoje</h2>
                  {!diet && <p className="muted">Carregando...</p>}
                  {diet && (
                    <>
                      <div className="macro-row">
                        <span><b>{diet.numbers.kcal}</b> kcal</span>
                        <span><b>{diet.numbers.proteinG}</b> g proteína</span>
                        <span><b>{diet.numbers.carbG}</b> g carbo</span>
                        <span><b>{diet.numbers.fatG}</b> g gordura</span>
                        <span><b>{diet.numbers.waterTarget}</b> L água</span>
                      </div>
                      <details>
                        <summary>Por que estes números?</summary>
                        <ul className="rationale">{diet.numbers.rationale.map((r, i) => <li key={i}>{r}</li>)}</ul>
                      </details>
                      <h2 className="tab-title">Refeições</h2>
                      <pre className="report">{diet.meals}</pre>
                      {!diet.aiEnabled && <small className="muted">IA sem chave: só os números, sem pratos.</small>}
                    </>
                  )}
                </>
              )}

              {tab === 'coach' && (
                <>
                  <h2 className="tab-title">Revisão do seu treino</h2>
                  {!review && !report && <p className="muted">Analisando...</p>}
                  {review && <pre className="report">{review}</pre>}
                  <h2 className="tab-title">Resumo da semana</h2>
                  {report && <pre className="report">{report}</pre>}
                  <h2 className="tab-title">Tira-dúvidas biomecânico</h2>
                  <div className="ask-row">
                    <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Como faço flexão diamante?" maxLength={800} />
                    <button onClick={submitQuestion}>Perguntar</button>
                  </div>
                  {answer && <pre className="report">{answer}</pre>}
                </>
              )}
            </section>
          </div>

          {timerOn && data.mission && (
            <WorkoutTimer
              blocks={data.mission.blocks.map((b) => ({ key: b.key, name: b.name }))}
              onFinish={() => { setTimerOn(false); void load(); }}
              onClose={() => setTimerOn(false)}
            />
          )}

          {detailKey && <ExerciseDetailModal exerciseKey={detailKey.replace(/_\d+$/, '')} onClose={() => setDetailKey(null)} />}
    </AppShell>
  );
}