import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { getDiet, getTrainerData, saveAssessment } from '../../services/trainer.service';
import type { BodyAssessmentPayload, DietNumbers, TrainerData } from '../../types/trainer';

const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
const numberOrUndefined = (form: FormData, key: string) => {
  const value = String(form.get(key) ?? '').trim();
  return value === '' ? undefined : Number(value);
};

function TrendChart({ title, rows, field, unit, color }: {
  title: string;
  rows: TrainerData['history'];
  field: 'weightKg' | 'waistCm' | 'bodyFatPercent';
  unit: string;
  color: string;
}) {
  const points = rows.map((row) => row[field]).filter((value): value is number => value !== null);
  const width = 520;
  const height = 150;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(max - min, 1);
  const coords = points.map((value, index) => {
    const x = points.length === 1 ? width / 2 : 10 + index * (width - 20) / (points.length - 1);
    const y = height - 18 - ((value - min) / range) * (height - 36);
    return `${x},${y}`;
  }).join(' ');
  return (
    <section className="data-chart">
      <div className="data-chart-heading"><h3>{title}</h3><span>{points.length ? `${points[0]}–${points[points.length - 1]} ${unit}` : 'Registre avaliações para ver a tendência'}</span></div>
      {points.length > 0
        ? <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Gráfico de evolução: ${title}`}>
          <line x1="10" y1={height - 18} x2={width - 10} y2={height - 18} className="chart-axis" />
          <polyline points={coords} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((value, index) => {
            const x = points.length === 1 ? width / 2 : 10 + index * (width - 20) / (points.length - 1);
            const y = height - 18 - ((value - min) / range) * (height - 36);
            return <circle key={`${index}-${value}`} cx={x} cy={y} r="4" fill={color}><title>{value} {unit}</title></circle>;
          })}
        </svg>
        : <div className="chart-empty">As medições aparecem aqui depois do primeiro registro.</div>}
      {rows.length > 1 && <div className="chart-dates"><span>{dayLabel(rows[0].day)}</span><span>{dayLabel(rows[rows.length - 1].day)}</span></div>}
    </section>
  );
}

function StrengthTrend({ rows }: { rows: TrainerData['strengthHistory'] }) {
  const counts = new Map<string, number>();
  rows.forEach((row) => counts.set(row.exercise, (counts.get(row.exercise) ?? 0) + 1));
  const exercise = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  const history = rows.filter((row) => row.exercise === exercise && row.loadKg !== null).slice(-12);
  const width = 520;
  const height = 150;
  const values = history.map((row) => row.loadKg ?? 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : 10 + index * (width - 20) / (values.length - 1);
    const y = height - 18 - ((value - min) / range) * (height - 36);
    return `${x},${y}`;
  }).join(' ');
  return (
    <section className="data-chart">
      <div className="data-chart-heading"><h3>Progressão de carga</h3><span>{exercise ?? 'Registre cargas nos treinos'}</span></div>
      {history.length > 1
        ? <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Evolução das cargas em ${exercise}`}>
          <line x1="10" y1={height - 18} x2={width - 10} y2={height - 18} className="chart-axis" />
          <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {values.map((value, index) => {
            const x = 10 + index * (width - 20) / (values.length - 1);
            const y = height - 18 - ((value - min) / range) * (height - 36);
            return <circle key={`${index}-${value}`} cx={x} cy={y} r="4" fill="var(--accent)"><title>{value} kg · {dayLabel(history[index].day)}</title></circle>;
          })}
        </svg>
        : <div className="chart-empty">Registre duas sessões com carga para ver a evolução deste exercício.</div>}
    </section>
  );
}

export default function TrainerDataPanel() {
  const [data, setData] = useState<TrainerData | null>(null);
  const [diet, setDiet] = useState<DietNumbers | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAssessment, setShowAssessment] = useState(false);

  const load = useCallback(async () => {
    const [summary, dietPlan] = await Promise.all([getTrainerData(), getDiet()]);
    setData(summary);
    setDiet(dietPlan.numbers);
    setShowAssessment(summary.metrics.assessmentDue);
  }, []);

  useEffect(() => {
    load().catch((e) => setError((e as Error).message));
  }, [load]);

  const submitAssessment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSaved('');
    setBusy(true);
    try {
      const form = new FormData(event.currentTarget);
      const payload: BodyAssessmentPayload = {
        weightKg: Number(form.get('weightKg')),
        bodyFatPercent: numberOrUndefined(form, 'bodyFatPercent'),
        waistCm: numberOrUndefined(form, 'waistCm'),
        neckCm: numberOrUndefined(form, 'neckCm'),
        hipCm: numberOrUndefined(form, 'hipCm'),
        chestCm: numberOrUndefined(form, 'chestCm'),
        armCm: numberOrUndefined(form, 'armCm'),
        thighCm: numberOrUndefined(form, 'thighCm'),
        calfCm: numberOrUndefined(form, 'calfCm'),
        wristCm: numberOrUndefined(form, 'wristCm'),
        restingHeartRate: numberOrUndefined(form, 'restingHeartRate'),
        sleepHours: numberOrUndefined(form, 'sleepHours'),
        fatigue: numberOrUndefined(form, 'fatigue'),
        muscleSoreness: numberOrUndefined(form, 'muscleSoreness'),
        nutritionAdherence: numberOrUndefined(form, 'nutritionAdherence'),
        notes: String(form.get('notes') ?? '').trim() || undefined,
      };
      await saveAssessment(payload);
      await load();
      setSaved('Avaliação salva. Suas métricas e gráficos foram atualizados.');
      setShowAssessment(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <div className="card"><p className={error ? 'error' : 'muted'}>{error || 'Carregando seus dados…'}</p></div>;
  const { metrics } = data;

  return (
    <div className="trainer-data">
      <div className="weekly-plan-intro">
        <div><h2 className="tab-title">Dados e evolução</h2><p className="muted">Métricas estimadas a partir das informações que você registrou.</p></div>
        <button type="button" onClick={() => setShowAssessment((visible) => !visible)}>{showAssessment ? 'Fechar avaliação' : 'Nova avaliação'}</button>
      </div>

      {metrics.assessmentDue && <div className="assessment-reminder"><b>Hora da sua avaliação quinzenal.</b> Atualize peso, medidas e recuperação para acompanhar as tendências.</div>}
      {metrics.safetyWarnings.map((warning) => <div className="plan-warning" key={warning}>{warning}</div>)}
      {error && <div className="error">{error}</div>}
      {saved && <div className="notice">{saved}</div>}

      {showAssessment && (
        <form className="assessment-form card" onSubmit={submitAssessment}>
          <h3>Avaliação corporal e de recuperação</h3>
          <p className="muted">Preencha o peso; as outras medidas são opcionais. Faça uma nova avaliação a cada 14 dias.</p>
          <div className="field-grid">
            <label>Peso (kg)<input name="weightKg" type="number" min="30" max="300" step="0.1" defaultValue={metrics.weightKg} required /></label>
            <label>Gordura corporal (%)<input name="bodyFatPercent" type="number" min="3" max="70" step="0.1" /></label>
            <label>Cintura (cm)<input name="waistCm" type="number" min="30" max="250" step="0.1" /></label>
            <label>Pescoço (cm)<input name="neckCm" type="number" min="20" max="100" step="0.1" /></label>
            <label>Quadril (cm)<input name="hipCm" type="number" min="30" max="250" step="0.1" /></label>
            <label>Tórax (cm)<input name="chestCm" type="number" min="30" max="250" step="0.1" /></label>
            <label>Braço (cm)<input name="armCm" type="number" min="10" max="100" step="0.1" /></label>
            <label>coxa (cm)<input name="thighCm" type="number" min="20" max="150" step="0.1" /></label>
            <label>Panturrilha (cm)<input name="calfCm" type="number" min="15" max="100" step="0.1" /></label>
            <label>Punho (cm)<input name="wristCm" type="number" min="8" max="40" step="0.1" /></label>
            <label>Frequência cardíaca em repouso<input name="restingHeartRate" type="number" min="30" max="220" /></label>
            <label>Sono médio (horas)<input name="sleepHours" type="number" min="0" max="14" step="0.1" /></label>
            <label>Fadiga (0–10)<input name="fatigue" type="number" min="0" max="10" /></label>
            <label>Dor muscular (0–10)<input name="muscleSoreness" type="number" min="0" max="10" /></label>
            <label>Aderência à alimentação (1–5)<input name="nutritionAdherence" type="number" min="1" max="5" /></label>
          </div>
          <label>Observações<textarea name="notes" maxLength={500} rows={2} /></label>
          <button disabled={busy}>{busy ? 'Salvando…' : 'Salvar avaliação'}</button>
        </form>
      )}

      <div className="metric-grid">
        <article className="metric-card"><span>IMC</span><b>{metrics.bmi}</b><small>{metrics.bmiCategory} · não é diagnóstico</small></article>
        <article className="metric-card"><span>Peso atual</span><b>{metrics.weightKg} kg</b><small>Referência pelo IMC 22: {metrics.referenceWeightKg} kg</small></article>
        <article className="metric-card"><span>Variação registrada</span><b>{metrics.weightTrendKg === null ? '—' : `${metrics.weightTrendKg > 0 ? '+' : ''}${metrics.weightTrendKg} kg`}</b><small>Entre a primeira e a última avaliação salva</small></article>
        <article className="metric-card"><span>Peso desejado</span><b>{metrics.targetWeightKg === null ? '—' : `${metrics.targetWeightKg} kg`}</b><small>Meta informada no perfil</small></article>
        <article className="metric-card"><span>Gordura corporal</span><b>{metrics.bodyFatPercent === null ? '—' : `${metrics.bodyFatPercent}%`}</b><small>{metrics.bodyFatMethod ?? 'Informe medidas para estimar'}</small></article>
        <article className="metric-card"><span>Massa gorda / magra</span><b>{metrics.fatMassKg === null ? '—' : `${metrics.fatMassKg} / ${metrics.leanMassKg} kg`}</b><small>Estimadas pela composição corporal</small></article>
        <article className="metric-card"><span>FFMI</span><b>{metrics.ffmi ?? '—'}</b><small>Índice de massa livre de gordura</small></article>
        <article className="metric-card"><span>Cintura / altura</span><b>{metrics.waistToHeight ?? '—'}</b><small>Proporção cintura-altura</small></article>
        <article className="metric-card"><span>Cintura / quadril</span><b>{metrics.waistToHip ?? '—'}</b><small>Disponível quando ambas as medidas forem informadas</small></article>
        <article className="metric-card"><span>Superfície corporal</span><b>{metrics.bsaM2} m²</b><small>Estimativa pela fórmula Mosteller</small></article>
        <article className="metric-card"><span>Gasto em repouso</span><b>{metrics.bmr} kcal</b><small>TMB estimada · Mifflin–St Jeor</small></article>
        <article className="metric-card"><span>Gasto diário</span><b>{metrics.tdee} kcal</b><small>TDEE estimado pela frequência de treino</small></article>
        <article className="metric-card"><span>Água de referência</span><b>{metrics.waterLiters} L</b><small>Estimativa de 35 ml/kg; ajuste individual importa</small></article>
        <article className="metric-card"><span>Frequência em repouso</span><b>{metrics.restingHeartRate ? `${metrics.restingHeartRate} bpm` : '—'}</b><small>Valor informado; não é VO₂ máx.</small></article>
        <article className="metric-card"><span>Prontidão estimada</span><b>{metrics.readinessScore === null ? '—' : `${metrics.readinessScore}/100`}</b><small>Calculada com sono, fadiga e dor muscular informados</small></article>
        <article className="metric-card"><span>Sono / fadiga / dor</span><b>{metrics.sleepHours === null ? '—' : `${metrics.sleepHours}h · ${metrics.fatigue}/10 · ${metrics.muscleSoreness}/10`}</b><small>Última avaliação de recuperação</small></article>
        <article className="metric-card"><span>Aderência alimentar</span><b>{metrics.nutritionAdherence === null ? '—' : `${metrics.nutritionAdherence}/5`}</b><small>Nota autorrelatada na última avaliação</small></article>
        <article className="metric-card"><span>VO₂ máx.</span><b>Não medido</b><small>Requer protocolo ou teste cardiorrespiratório validado</small></article>
      </div>

      {diet && <section className="card data-diet">
        <h3>Estimativa alimentar de hoje</h3>
        <div className="macro-row"><span><b>{diet.kcal}</b> kcal</span><span><b>{diet.proteinG}</b> g proteína</span><span><b>{diet.carbG}</b> g carboidratos</span><span><b>{diet.fatG}</b> g gorduras</span></div>
          <p className="muted">Meta hídrica estimada: {diet.waterTarget} L/dia.</p>
        <small className="muted">Estimativas, não prescrição nutricional. A aba Dieta mostra os detalhes.</small>
      </section>}

      <div className="data-charts">
        <TrendChart title="Peso" rows={data.history} field="weightKg" unit="kg" color="var(--accent)" />
        <TrendChart title="Cintura" rows={data.history} field="waistCm" unit="cm" color="var(--ok)" />
        <TrendChart title="Gordura corporal" rows={data.history} field="bodyFatPercent" unit="%" color="var(--warn)" />
        <StrengthTrend rows={data.strengthHistory} />
      </div>

      <div className="data-lower-grid">
        <section className="card">
          <h3>Aderência dos últimos 30 dias</h3>
          <div className="adherence-value">{data.adherence.percent}%</div>
          <p className="muted">{data.adherence.completedSessions} dias de treino registrados de {data.adherence.plannedSessions} dias planejados.</p>
          <div className="xp-bar"><div style={{ width: `${data.adherence.percent}%` }} /></div>
        </section>
        <section className="card">
          <h3>Volume por grupo muscular</h3>
          <div className="volume-bars">{data.weeklyVolume.map((item) => (
            <div className="volume-bar-row" key={item.key}>
              <span>{item.label}</span><div className="volume-bar"><i style={{ width: `${Math.min(100, item.weeklySets / item.targetMax * 100)}%` }} /></div>
              <b>{item.weeklySets} <small>/ {item.targetMin}–{item.targetMax}</small></b>
            </div>
          ))}</div>
        </section>
      </div>

      <section className="card strength-section">
        <h3>Progressão de força estimada</h3>
        {metrics.estimated1Rm.length
          ? <div className="strength-list">{metrics.estimated1Rm.map((entry) => <div key={`${entry.name}-${entry.day}`}><b>{entry.name}</b><span>{entry.estimated1RmKg} kg estimados · {dayLabel(entry.day)}</span></div>)}</div>
          : <p className="muted">Registre treinos com carga para estimar 1RM (fórmula de Epley). Não é teste de carga máxima.</p>}
      </section>

      <p className="trainer-disclaimer">{data.disclaimer} Indicadores como percentual de gordura e gasto energético são aproximações, não diagnósticos nem prescrição profissional.</p>
    </div>
  );
}
