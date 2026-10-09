import { useCallback, useEffect, useState } from 'react';
import AppShell from '../../components/layout/AppShell';
import Onboarding from '../../components/trainer/Onboarding';
import TrainerDataPanel from '../../components/trainer/TrainerDataPanel';
import WeeklyPlanPanel from '../../components/trainer/WeeklyPlanPanel';
import WorkoutTimer from '../../components/trainer/WorkoutTimer';
import { getDashboard, getDiet } from '../../services/trainer.service';
import type { TrainerDashboard, DietNumbers } from '../../types/trainer';
import '../../styles/trainer.css';

type Tab = 'treino' | 'dieta' | 'dados';
type TimerBlock = { key: string; name: string };

export default function TrainerPage() {
  const [data, setData] = useState<TrainerDashboard | null>(null);
  const [intro, setIntro] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('treino');
  const [timerBlocks, setTimerBlocks] = useState<TimerBlock[]>([]);
  const [editing, setEditing] = useState(false);
  const [diet, setDiet] = useState<{ numbers: DietNumbers; meals: string; aiEnabled: boolean } | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      setData(await getDashboard());
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openDiet = async () => {
    setTab('dieta');
    if (diet) return;
    try { setDiet(await getDiet()); } catch (e) { setError((e as Error).message); }
  };

  const startTimer = (blocks: TimerBlock[]) => {
    setTimerBlocks(blocks);
  };

  if (!data) return <AppShell title="Treino" status="carregando"><div className="card"><p className="muted">{error || 'Carregando…'}</p></div></AppShell>;

  if (!data.onboarded) {
    return (
      <AppShell title="Treino" status="primeiro acesso">
        <Onboarding onDone={async (text) => { setIntro(text); await load(); }} />
      </AppShell>
    );
  }

  if (editing && data.profile) {
    return (
      <AppShell title="Seu perfil" status="dados usados pelo treino" actions={<button className="ghost" onClick={() => setEditing(false)}>Cancelar</button>}>
        <Onboarding initial={{
          goal: data.profile.goal,
          weightKg: String(data.profile.weightKg),
          targetWeightKg: data.profile.targetWeightKg === null ? '' : String(data.profile.targetWeightKg),
          heightCm: String(data.profile.heightCm),
          birthYear: String(data.profile.birthYear),
          sex: data.profile.sex,
          somatotype: data.profile.somatotype ?? '',
          experience: data.profile.experience as 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED',
          trainingDays: data.profile.trainingDays,
          trainingWeekdays: data.profile.trainingWeekdays,
          trainingLocation: data.profile.trainingLocation,
          pregnancy: data.profile.pregnancy ?? false,
          heartCondition: data.profile.heartCondition ?? false,
          medicationUse: data.profile.medicationUse ?? false,
          parqAnswers: data.profile.parqAnswers ?? {
            heartDiagnosis: false, chestPain: false, dizziness: false, jointCondition: false,
            prescribedMedication: false, supervisedExercise: false, otherReason: false,
          },
          minutesPerDay: String(data.profile.minutesPerDay),
          equipment: data.profile.equipment,
          injuries: data.profile.injuries,
          sleepHours: String(data.profile.sleepHours),
          waterLiters: String(data.profile.waterLiters),
          mealsPerDay: data.profile.mealsPerDay,
          dietQuality: data.profile.dietQuality as 'POOR' | 'FAIR' | 'GOOD',
          dietNotes: data.profile.dietNotes ?? '',
          dietRestrictions: data.profile.dietRestrictions,
          restrictionNotes: data.profile.restrictionNotes ?? '',
        }} onDone={async () => { setEditing(false); await load(); setDataVersion((v) => v + 1); }} />
      </AppShell>
    );
  }

  const profile = data.profile;
  const safetyWarnings = profile ? [
    new Date().getFullYear() - profile.birthYear < 18
      ? 'Menor de 18 anos: treine apenas com orientação de um responsável e de profissional qualificado.'
      : null,
    profile.pregnancy ? 'Gestação informada: procure orientação individualizada de um profissional de saúde antes de treinar.' : null,
    profile.heartCondition ? 'Condição cardíaca informada: confirme liberação médica antes de iniciar ou intensificar exercícios.' : null,
    profile.medicationUse ? 'Uso de medicação informado: verifique com um profissional de saúde os cuidados para exercício.' : null,
    profile.parqAnswers && Object.values(profile.parqAnswers).some(Boolean)
      ? 'Sua triagem PAR-Q teve resposta positiva. Consulte um profissional de saúde antes de iniciar ou intensificar o treino.'
      : null,
  ].filter((warning): warning is string => Boolean(warning)) : [];

  return (
    <AppShell title="Treino" status="planejamento e evolução" actions={<button className="ghost" onClick={() => setEditing(true)}>Editar perfil</button>}>
      {error && <div className="error">{error}</div>}
      {intro && <div className="system-msg"><p>{intro}</p><button className="ghost" onClick={() => setIntro('')}>OK</button></div>}
      {safetyWarnings.map((warning) => <div className="plan-warning" key={warning}>{warning}</div>)}

      <section className="card trainer-main">
        <div className="tabs" role="tablist" aria-label="Seções do treino">
          <button role="tab" aria-selected={tab === 'treino'} className={tab === 'treino' ? 'active' : ''} onClick={() => setTab('treino')}>Treino</button>
          <button role="tab" aria-selected={tab === 'dados'} className={tab === 'dados' ? 'active' : ''} onClick={() => setTab('dados')}>Dados</button>
          <button role="tab" aria-selected={tab === 'dieta'} className={tab === 'dieta' ? 'active' : ''} onClick={() => void openDiet()}>Dieta</button>
        </div>

        {tab === 'treino' && <WeeklyPlanPanel onStartTimer={startTimer} />}
        {tab === 'dados' && <TrainerDataPanel key={dataVersion} />}
        {tab === 'dieta' && (
          <div className="diet-panel">
            <h2 className="tab-title">Sua dieta hoje</h2>
            {!diet && <p className="muted">Carregando…</p>}
            {diet && <>
              <div className="macro-row">
                <span><b>{diet.numbers.kcal}</b> kcal</span><span><b>{diet.numbers.proteinG}</b> g proteína</span>
                <span><b>{diet.numbers.carbG}</b> g carboidratos</span><span><b>{diet.numbers.fatG}</b> g gorduras</span>
                <span><b>{diet.numbers.waterTarget}</b> L água</span>
              </div>
              <details><summary>Por que estes números?</summary><ul className="rationale">{diet.numbers.rationale.map((reason, index) => <li key={index}>{reason}</li>)}</ul></details>
              <h3>Refeições sugeridas</h3><pre className="report">{diet.meals}</pre>
              {!diet.aiEnabled && <small className="muted">IA sem chave: os números calculados continuam disponíveis, mas não há sugestões de pratos.</small>}
              <p className="trainer-disclaimer">Os números são estimativas e não substituem orientação de nutricionista.</p>
            </>}
          </div>
        )}
      </section>

      {timerBlocks.length > 0 && (
        <WorkoutTimer
          blocks={timerBlocks}
          onFinish={() => { setTimerBlocks([]); setDataVersion((version) => version + 1); }}
          onClose={() => setTimerBlocks([])}
        />
      )}
    </AppShell>
  );
}
