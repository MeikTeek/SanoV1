import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { getTrainerData, saveAssessment } from '../../services/trainer.service';
import type { BodyAssessmentPayload, TrainerData } from '../../types/trainer';
import { Drawer, Empty, I, LineChart, Ring, Stat, fmtDay, fmtDec, fmtKg } from './ui';

type Series = 'weightKg' | 'waistCm' | 'bodyFatPercent';
const SERIES: { key: Series; label: string; unit: string }[] = [
  { key: 'weightKg', label: 'Peso', unit: ' kg' },
  { key: 'waistCm', label: 'Cintura', unit: ' cm' },
  { key: 'bodyFatPercent', label: 'Gordura', unit: '%' },
];

const numberOrUndefined = (form: FormData, key: string) => {
  const value = String(form.get(key) ?? '').trim().replace(',', '.');
  return value === '' ? undefined : Number(value);
};

export default function BodyView({ onChanged }: { onChanged: () => void }) {
  const [data, setData] = useState<TrainerData | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [series, setSeries] = useState<Series>('weightKg');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setData(await getTrainerData()), []);
  useEffect(() => { load().catch((e) => setError((e as Error).message)); }, [load]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const form = new FormData(event.currentTarget);
      const payload: BodyAssessmentPayload = { weightKg: Number(String(form.get('weightKg')).replace(',', '.')) };
      for (const key of ['bodyFatPercent', 'waistCm', 'neckCm', 'hipCm', 'chestCm', 'armCm', 'thighCm', 'calfCm', 'wristCm', 'restingHeartRate', 'sleepHours', 'fatigue', 'muscleSoreness', 'nutritionAdherence'] as const) {
        const value = numberOrUndefined(form, key);
        if (value !== undefined) payload[key] = value;
      }
      const notes = String(form.get('notes') ?? '').trim();
      if (notes) payload.notes = notes;
      await saveAssessment(payload);
      await load();
      setEditing(false);
      setNotice('Avaliação salva. Métricas e gráficos atualizados.');
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <div className="tr-view">{error ? <div className="tr-alert bad">{error}</div> : <div className="tr-skeleton" style={{ height: 320 }} />}</div>;
  const { metrics } = data;
  const points = data.history.filter((h) => h[series] !== null).map((h) => ({ label: fmtDay(h.day), value: h[series] as number }));
  const first = data.history[0]?.weightKg ?? metrics.weightKg;
  const target = metrics.targetWeightKg;
  const targetProgress = target !== null && first !== target ? Math.min(1, Math.max(0, (first - metrics.weightKg) / (first - target))) : null;

  return (
    <div className="tr-view">
      <header className="tr-view-head">
        <div><h2>Corpo</h2><p className="muted">Medidas, composição e recuperação. Avalie a cada 2 semanas.</p></div>
        <button type="button" className="tr-primary" onClick={() => setEditing(true)}>{I.plus(16)} Nova avaliação</button>
      </header>

      {metrics.assessmentDue && <div className="tr-alert accent"><b>Hora da avaliação quinzenal.</b> Atualize peso e medidas para manter as tendências confiáveis. <button type="button" className="tr-link" onClick={() => setEditing(true)}>Avaliar agora</button></div>}
      {metrics.safetyWarnings.map((w) => <div className="tr-alert warn" key={w}>{w}</div>)}
      {notice && <div className="tr-alert ok">{notice}</div>}

      <div className="tr-stats six">
        <Stat label="Peso" value={fmtKg(metrics.weightKg)} tone="accent"
          hint={metrics.weightTrendKg === null ? 'primeira medida' : `${metrics.weightTrendKg > 0 ? '+' : ''}${fmtDec(metrics.weightTrendKg)} kg no período`} />
        <Stat label="Gordura corporal" value={metrics.bodyFatPercent === null ? '—' : `${fmtDec(metrics.bodyFatPercent)}%`} hint={metrics.bodyFatMethod ?? 'informe cintura e pescoço'} />
        <Stat label="Massa magra" value={fmtKg(metrics.leanMassKg)} hint={metrics.ffmi ? `FFMI ${fmtDec(metrics.ffmi)}` : 'estimada'} />
        <Stat label="IMC" value={fmtDec(metrics.bmi)} hint={metrics.bmiCategory} />
        <Stat label="Gasto diário" value={`${metrics.tdee} kcal`} hint={`TMB ${metrics.bmr} kcal`} />
        <Stat label="Prontidão" value={metrics.readinessScore === null ? '—' : `${metrics.readinessScore}/100`} hint="sono, fadiga e dor" tone={metrics.readinessScore !== null && metrics.readinessScore >= 70 ? 'ok' : undefined} />
      </div>

      <div className="tr-grid-2 wide-left">
        <section className="tr-card">
          <header className="tr-card-head">
            <h3>Evolução</h3>
            <div className="tr-seg">{SERIES.map((s) => <button key={s.key} type="button" className={series === s.key ? 'on' : ''} onClick={() => setSeries(s.key)}>{s.label}</button>)}</div>
          </header>
          {points.length
            ? <LineChart points={points} unit={SERIES.find((s) => s.key === series)!.unit} color={series === 'weightKg' ? 'var(--accent)' : series === 'waistCm' ? 'var(--ok)' : 'var(--warn)'} />
            : <Empty title="Sem dados ainda">Registre {series === 'weightKg' ? 'o peso' : series === 'waistCm' ? 'a cintura' : 'a gordura (ou cintura + pescoço)'} numa avaliação.</Empty>}
        </section>

        <section className="tr-card tr-target">
          <header className="tr-card-head"><h3>Meta de peso</h3></header>
          {target === null
            ? <Empty title="Sem meta definida">Defina um peso desejado em “Editar perfil”.</Empty>
            : <>
              <Ring value={targetProgress ?? 0} size={110} stroke={9} color="var(--ok)">
                <b>{Math.round((targetProgress ?? 0) * 100)}%</b>
              </Ring>
              <p><b>{fmtKg(metrics.weightKg)}</b> → {fmtKg(target)}</p>
              <small className="muted">{fmtDec(Math.abs(metrics.weightKg - target))} kg para a meta · começou em {fmtKg(first)}</small>
            </>}
          <div className="tr-adherence">
            <span>Aderência (30 dias)</span>
            <b>{data.adherence.percent}%</b>
            <div className="tr-xp"><i style={{ width: `${data.adherence.percent}%` }} /></div>
            <small className="muted">{data.adherence.completedSessions} de {data.adherence.plannedSessions} treinos planejados</small>
          </div>
        </section>
      </div>

      <section className="tr-card">
        <header className="tr-card-head"><h3>Todas as métricas</h3></header>
        <dl className="tr-metrics">
          <div><dt>Massa gorda</dt><dd>{fmtKg(metrics.fatMassKg)}</dd></div>
          <div><dt>Cintura / altura</dt><dd>{fmtDec(metrics.waistToHeight, 2)}</dd><small>abaixo de 0,5 é a referência</small></div>
          <div><dt>Cintura / quadril</dt><dd>{fmtDec(metrics.waistToHip, 2)}</dd></div>
          <div><dt>Peso de referência</dt><dd>{fmtKg(metrics.referenceWeightKg)}</dd><small>IMC 22</small></div>
          <div><dt>Água recomendada</dt><dd>{fmtDec(metrics.waterLiters)} L/dia</dd></div>
          <div><dt>Superfície corporal</dt><dd>{fmtDec(metrics.bsaM2, 2)} m²</dd></div>
          <div><dt>FC em repouso</dt><dd>{metrics.restingHeartRate ? `${metrics.restingHeartRate} bpm` : '—'}</dd></div>
          <div><dt>Sono</dt><dd>{metrics.sleepHours === null ? '—' : `${fmtDec(metrics.sleepHours)} h`}</dd></div>
          <div><dt>Fadiga / dor</dt><dd>{metrics.fatigue === null ? '—' : `${metrics.fatigue}/10 · ${metrics.muscleSoreness ?? '—'}/10`}</dd></div>
          <div><dt>Alimentação</dt><dd>{metrics.nutritionAdherence === null ? '—' : `${metrics.nutritionAdherence}/5`}</dd></div>
          <div><dt>Avaliações</dt><dd>{metrics.assessmentCount}</dd><small>{metrics.assessmentCount ? `última há ${metrics.daysSinceAssessment} dias` : ''}</small></div>
        </dl>
        <p className="tr-footnote">{data.disclaimer} Gordura corporal e gasto energético são estimativas (Navy, Deurenberg, Mifflin–St Jeor), não diagnóstico.</p>
      </section>

      {editing && (
        <Drawer title="Nova avaliação" subtitle="Só o peso é obrigatório. Meça em jejum, pela manhã." onClose={() => setEditing(false)}>
          <form className="tr-form" onSubmit={submit}>
            {error && <div className="tr-alert bad">{error}</div>}
            <fieldset>
              <legend>Corpo</legend>
              <div className="tr-fields">
                <label>Peso (kg) *<input name="weightKg" inputMode="decimal" type="number" min="30" max="300" step="0.1" defaultValue={metrics.weightKg} required /></label>
                <label>Gordura (%)<input name="bodyFatPercent" inputMode="decimal" type="number" min="3" max="70" step="0.1" placeholder="se souber" /></label>
              </div>
            </fieldset>
            <fieldset>
              <legend>Medidas (cm)</legend>
              <div className="tr-fields">
                {([['waistCm', 'Cintura', 30, 250], ['neckCm', 'Pescoço', 20, 100], ['hipCm', 'Quadril', 30, 250], ['chestCm', 'Tórax', 30, 250],
                  ['armCm', 'Braço', 10, 100], ['thighCm', 'Coxa', 20, 150], ['calfCm', 'Panturrilha', 15, 100], ['wristCm', 'Punho', 8, 40]] as const).map(([name, label, min, max]) => (
                  <label key={name}>{label}<input name={name} inputMode="decimal" type="number" min={min} max={max} step="0.1" /></label>
                ))}
              </div>
              <small className="muted">Cintura + pescoço (e quadril, para mulheres) estimam a gordura pelo método Navy.</small>
            </fieldset>
            <fieldset>
              <legend>Recuperação</legend>
              <div className="tr-fields">
                <label>Sono médio (h)<input name="sleepHours" inputMode="decimal" type="number" min="0" max="14" step="0.5" /></label>
                <label>FC repouso (bpm)<input name="restingHeartRate" inputMode="numeric" type="number" min="30" max="220" /></label>
                <label>Fadiga (0–10)<input name="fatigue" inputMode="numeric" type="number" min="0" max="10" /></label>
                <label>Dor muscular (0–10)<input name="muscleSoreness" inputMode="numeric" type="number" min="0" max="10" /></label>
                <label>Alimentação (1–5)<input name="nutritionAdherence" inputMode="numeric" type="number" min="1" max="5" /></label>
              </div>
            </fieldset>
            <label>Observações<textarea name="notes" maxLength={500} rows={2} /></label>
            <button type="submit" className="tr-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar avaliação'}</button>
          </form>
        </Drawer>
      )}
    </div>
  );
}
