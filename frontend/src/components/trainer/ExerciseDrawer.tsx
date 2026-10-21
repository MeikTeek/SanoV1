import { useEffect, useState } from 'react';
import { getExerciseStats, getSwapOptions, swapExercise } from '../../services/trainer.service';
import type { ExerciseStats, SwapOption, WeeklyPlan } from '../../types/trainer';
import MuscleMap, { MUSCLE_LABELS } from './MuscleMap';
import { Drawer, EQUIPMENT_LABELS, GROUP_LABELS, I, LineChart, describeSets, fmtDay, fmtKg, relativeDay } from './ui';

type Metric = 'e1rm' | 'loadKg' | 'reps' | 'volumeKg';
const METRIC_LABEL: Record<Metric, string> = { e1rm: '1RM estimado', loadKg: 'Carga máx.', reps: 'Reps máx.', volumeKg: 'Volume' };

/** Detalhe completo: músculos, técnica e o histórico do usuário neste exercício. */
export function ExerciseDrawer({ exerciseKey, onClose }: { exerciseKey: string; onClose: () => void }) {
  const [data, setData] = useState<ExerciseStats | null>(null);
  const [error, setError] = useState('');
  const [metric, setMetric] = useState<Metric>('e1rm');

  useEffect(() => {
    let alive = true;
    setData(null);
    getExerciseStats(exerciseKey).then((d) => {
      if (!alive) return;
      setData(d);
      setMetric(d.history.some((h) => h.loadKg > 0) ? 'e1rm' : 'reps');
    }).catch((e) => alive && setError((e as Error).message));
    return () => { alive = false; };
  }, [exerciseKey]);

  const weighted = data?.history.some((h) => h.loadKg > 0) ?? false;
  const metrics: Metric[] = weighted ? ['e1rm', 'loadKg', 'volumeKg'] : ['reps'];

  return (
    <Drawer title={data?.name ?? 'Carregando…'} subtitle={data ? `${GROUP_LABELS[data.group] ?? data.group} · ${'●'.repeat(data.difficulty)}${'○'.repeat(3 - data.difficulty)}` : undefined} onClose={onClose} wide>
      {error && <div className="tr-alert bad">{error}</div>}
      {!data && !error && <div className="tr-skeleton" style={{ height: 240 }} />}
      {data && <>
        <div className="tr-ex-top">
          <MuscleMap primary={data.primaryMuscles} secondary={data.secondaryMuscles} size="md" />
          <div className="tr-ex-muscles">
            <h4>Principais</h4>
            <div className="tr-tags">{data.primaryMuscles.map((id) => <span key={id} className="tr-tag accent">{MUSCLE_LABELS[id]}</span>)}{!data.primaryMuscles.length && <span className="muted">Mobilidade geral</span>}</div>
            {data.secondaryMuscles.length > 0 && <>
              <h4>Auxiliares</h4>
              <div className="tr-tags">{data.secondaryMuscles.map((id) => <span key={id} className="tr-tag">{MUSCLE_LABELS[id]}</span>)}</div>
            </>}
            <h4>Equipamento</h4>
            <div className="tr-tags">{data.equipment.map((e) => <span key={e} className="tr-tag">{EQUIPMENT_LABELS[e] ?? e}</span>)}</div>
            {data.repsMin && <p className="tr-ex-presc">{data.suggestedSets ?? 3} séries · {data.repsMin}–{data.repsMax} {data.unit} · descanso {data.restSeconds}s</p>}
          </div>
        </div>

        <section className="tr-ex-section">
          <h3>Seu histórico</h3>
          {data.sessions === 0
            ? <p className="muted">Você ainda não registrou este exercício. Na primeira vez, escolha uma carga em que sobrem 2–3 repetições.</p>
            : <>
              <div className="tr-ex-kpis">
                {weighted && <div><span>1RM estimado</span><b>{fmtKg(data.estimated1Rm)}</b></div>}
                {weighted && <div><span>Maior carga</span><b>{fmtKg(data.best?.loadKg ?? null)}</b></div>}
                <div><span>Mais repetições</span><b>{data.best?.reps ?? '—'}</b></div>
                <div><span>Sessões</span><b>{data.sessions}</b></div>
              </div>
              <div className={`tr-suggest ${data.suggestion.trend}`}>
                {data.suggestion.trend === 'up' ? I.up(16) : data.suggestion.trend === 'down' ? I.down(16) : I.spark(16)}
                <span><b>Próxima vez:</b> {data.suggestion.note}</span>
              </div>
              {data.history.length > 1 && <>
                <div className="tr-seg" role="tablist" aria-label="Métrica do gráfico">
                  {metrics.map((m) => <button key={m} type="button" role="tab" aria-selected={metric === m} className={metric === m ? 'on' : ''} onClick={() => setMetric(m)}>{METRIC_LABEL[m]}</button>)}
                </div>
                <LineChart points={data.history.map((h) => ({ label: fmtDay(h.day), value: h[metric] }))} unit={metric === 'reps' ? '' : ' kg'} />
              </>}
              <ul className="tr-ex-log">
                {[...data.history].reverse().slice(0, 6).map((h, i) => (
                  <li key={`${h.day}-${i}`}><span>{relativeDay(h.day)}</span><b>{describeSets(h.sets, data.unit)}</b>{h.records > 0 && <em title="Recorde pessoal">{I.trophy(14)}</em>}</li>
                ))}
              </ul>
            </>}
        </section>

        <section className="tr-ex-section">
          <h3>Como fazer</h3>
          <p>{data.howTo}</p>
          <div className="tr-callout warn"><b>Erro comum</b><p>{data.commonMistake}</p></div>
          {data.benefits && <><h4>Por que fazer</h4><p>{data.benefits}</p></>}
          {(data.progression || data.regression) && (
            <div className="tr-prog-reg">
              {data.regression && <div><span>{I.down(14)} Mais fácil</span><b>{data.regression}</b></div>}
              {data.progression && <div><span>{I.up(14)} Mais difícil</span><b>{data.progression}</b></div>}
            </div>
          )}
        </section>
      </>}
    </Drawer>
  );
}

/** Troca de um exercício do plano por outro do mesmo músculo, liberado pelo filtro de segurança. */
export function SwapDrawer({ weekday, exerciseKey, dayLabel, onClose, onSwapped }: {
  weekday: number; exerciseKey: string; dayLabel: string; onClose: () => void; onSwapped: (plan: WeeklyPlan) => void;
}) {
  const [data, setData] = useState<{ original: string; current: string; options: SwapOption[] } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getSwapOptions(weekday, exerciseKey).then(setData).catch((e) => setError((e as Error).message));
  }, [weekday, exerciseKey]);

  const choose = async (key: string | null) => {
    setBusy(key ?? 'reset');
    setError('');
    try {
      onSwapped(await swapExercise(weekday, exerciseKey, key));
    } catch (e) {
      setError((e as Error).message);
      setBusy('');
    }
  };

  const current = data?.options.find((o) => o.key === data.current);
  const original = data?.options.find((o) => o.key === data.original);

  return (
    <Drawer title="Trocar exercício" subtitle={`${dayLabel} · mesmo músculo, só opções seguras para o seu perfil`} onClose={onClose}>
      {error && <div className="tr-alert bad">{error}</div>}
      {!data && !error && <p className="muted">Buscando alternativas…</p>}
      {data && data.original !== data.current && (
        <div className="tr-alert">
          Você trocou <b>{original?.name ?? data.original}</b> por <b>{current?.name}</b>.
          <button type="button" className="tr-link" disabled={Boolean(busy)} onClick={() => void choose(null)}>Voltar ao original</button>
        </div>
      )}
      <div className="tr-swap-list">
        {data?.options.map((option) => {
          const isCurrent = option.key === data.current;
          return (
            <button key={option.key} type="button" className={`tr-swap ${isCurrent ? 'current' : ''}`} disabled={isCurrent || Boolean(busy)} onClick={() => void choose(option.key)}>
              <MuscleMap primary={option.primaryMuscles} secondary={option.secondaryMuscles} size="sm" only={option.primaryMuscles.some((id) => [5, 7, 8, 9, 11, 12, 15, 16].includes(id)) ? 'back' : 'front'} />
              <span className="tr-swap-info">
                <b>{option.name}{option.key === data.original && data.original !== data.current ? ' (original)' : ''}</b>
                <small>{option.sets} × {option.reps} · {option.equipment.map((e) => EQUIPMENT_LABELS[e] ?? e).join(', ')}</small>
                <small>{'●'.repeat(option.difficulty)}{'○'.repeat(3 - option.difficulty)} dificuldade</small>
              </span>
              <span className="tr-swap-act">{isCurrent ? 'Atual' : busy === option.key ? '…' : I.swap(16)}</span>
            </button>
          );
        })}
        {data && data.options.length <= 1 && <p className="muted">Não há outra opção segura para este músculo com o seu equipamento. Adicionar equipamentos no perfil libera mais exercícios.</p>}
      </div>
    </Drawer>
  );
}

