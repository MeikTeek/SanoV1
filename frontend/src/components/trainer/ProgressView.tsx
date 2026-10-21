import { useState } from 'react';
import { deleteSession } from '../../services/trainer.service';
import type { TrainerOverview } from '../../types/trainer';
import { BarChart, Empty, Heatmap, I, Stat, describeSets, fmtDay, fmtKg, fmtMinutes, fmtNum, fmtVolume, relativeDay } from './ui';

type Metric = 'sessions' | 'volumeKg' | 'sets' | 'minutes';
const METRICS: { key: Metric; label: string }[] = [
  { key: 'sessions', label: 'Treinos' },
  { key: 'volumeKg', label: 'Volume' },
  { key: 'sets', label: 'Séries' },
  { key: 'minutes', label: 'Tempo' },
];

export default function ProgressView({ overview, onShowExercise, onChanged }: {
  overview: TrainerOverview;
  onShowExercise: (key: string) => void;
  onChanged: () => void;
}) {
  const [metric, setMetric] = useState<Metric>('volumeKg');
  const [open, setOpen] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState('');
  const { totals, achievements } = overview;
  const unlocked = achievements.filter((a) => a.unlocked).length;
  const trainedDays = overview.heatmap.filter((d) => d.sessions).length;

  const remove = async (id: string) => {
    setError('');
    try {
      await deleteSession(id);
      setConfirmDelete(null);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const format = (v: number) => (metric === 'volumeKg' ? fmtVolume(v) : metric === 'minutes' ? fmtMinutes(v) : fmtNum(v));

  return (
    <div className="tr-view">
      <header className="tr-view-head">
        <div><h2>Progresso</h2><p className="muted">Tudo calculado a partir dos treinos registrados.</p></div>
      </header>

      <div className="tr-stats">
        <Stat label="Treinos" icon={I.check(15)} value={fmtNum(totals.sessions)} hint={`${trainedDays} dias nas últimas 18 semanas`} />
        <Stat label="Volume total" icon={I.bolt(15)} value={fmtVolume(totals.volumeKg)} hint="carga × repetições" />
        <Stat label="Séries" icon={I.library(15)} value={fmtNum(totals.sets)} hint={totals.sessions ? `${Math.round(totals.sets / totals.sessions)} por treino` : '—'} />
        <Stat label="Tempo treinando" icon={I.clock(15)} value={fmtMinutes(totals.minutes)} hint={totals.sessions ? `média de ${fmtMinutes(Math.round(totals.minutes / totals.sessions))}` : '—'} />
      </div>

      <section className="tr-card">
        <header className="tr-card-head"><h3>Frequência</h3><span className="muted">{overview.streak} de ofensiva · {overview.weekGoal.streakWeeks} {overview.weekGoal.streakWeeks === 1 ? 'semana' : 'semanas'} seguidas na meta</span></header>
        <Heatmap days={overview.heatmap} />
        <div className="tr-legend right"><span>menos</span><i className="heat l0" /><i className="heat l1" /><i className="heat l2" /><i className="heat l3" /><i className="heat l4" /><span>mais volume</span></div>
      </section>

      <section className="tr-card">
        <header className="tr-card-head">
          <h3>Últimas 8 semanas</h3>
          <div className="tr-seg" role="tablist">
            {METRICS.map((m) => <button key={m.key} type="button" role="tab" aria-selected={metric === m.key} className={metric === m.key ? 'on' : ''} onClick={() => setMetric(m.key)}>{m.label}</button>)}
          </div>
        </header>
        <BarChart bars={overview.weekly.map((w, i) => ({ label: i === overview.weekly.length - 1 ? 'Esta' : fmtDay(w.weekStart), value: w[metric] }))} format={format} />
      </section>

      <div className="tr-grid-2">
        <section className="tr-card">
          <header className="tr-card-head"><h3>{I.trophy(16)} Recordes pessoais</h3></header>
          {overview.records.length === 0
            ? <Empty title="Sem recordes ainda">Registre treinos com carga: o melhor de cada exercício aparece aqui.</Empty>
            : <ul className="tr-records">
              {overview.records.map((r) => (
                <li key={r.key}>
                  <button type="button" onClick={() => onShowExercise(r.key)}>
                    <span><b>{r.name}</b><small>{r.loadKg ? `melhor carga ${fmtKg(r.loadKg)}` : `${r.reps} repetições`}</small></span>
                    <span className="tr-record-value">{r.e1rm ? <>{fmtKg(r.e1rm)}<small>1RM est.</small></> : <>{r.reps}<small>reps</small></>}</span>
                  </button>
                </li>
              ))}
            </ul>}
        </section>

        <section className="tr-card">
          <header className="tr-card-head"><h3>Conquistas</h3><span className="muted">{unlocked}/{achievements.length}</span></header>
          <div className="tr-achievements">
            {achievements.map((a) => (
              <div key={a.key} className={`tr-ach ${a.unlocked ? 'on' : ''}`} title={a.description}>
                <span className="tr-ach-icon" aria-hidden="true">{a.icon}</span>
                <span className="tr-ach-info">
                  <b>{a.title}</b>
                  <small>{a.description}</small>
                  {!a.unlocked && <span className="tr-xp"><i style={{ width: `${a.progress * 100}%` }} /></span>}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="tr-card">
        <header className="tr-card-head"><h3>Histórico de treinos</h3><span className="muted">últimos {overview.recentSessions.length}</span></header>
        {error && <div className="tr-alert bad">{error}</div>}
        {overview.recentSessions.length === 0
          ? <Empty title="Nenhum treino registrado">Use “Começar treino” na tela Hoje: as séries marcadas viram histórico, recordes e sugestões de carga.</Empty>
          : <ul className="tr-history">
            {overview.recentSessions.map((s) => (
              <li key={s.id} className={open === s.id ? 'open' : ''}>
                <button type="button" className="tr-history-head" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
                  <span className="tr-history-date"><b>{fmtDay(s.day).split(' ')[0]}</b><small>{fmtDay(s.day).split(' ')[1]}</small></span>
                  <span className="tr-history-main"><b>{s.title}</b><small>{relativeDay(s.day)} · {fmtMinutes(s.durationMinutes)} · {s.exercises.length} exercícios · {s.sets} séries</small></span>
                  <span className="tr-history-vol">{s.volumeKg ? fmtVolume(s.volumeKg) : ''}{s.records > 0 && <em>{I.trophy(14)} {s.records}</em>}</span>
                  <span className="tr-history-chev">{open === s.id ? I.up(16) : I.down(16)}</span>
                </button>
                {open === s.id && (
                  <div className="tr-history-body">
                    <table>
                      <tbody>
                        {s.exercises.map((e, i) => (
                          <tr key={`${e.name}-${i}`}>
                            <th>{e.key ? <button type="button" className="tr-link" onClick={() => onShowExercise(e.key!)}>{e.name}</button> : e.name}</th>
                            <td>{describeSets(e.sets)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {s.notes && <p className="tr-history-notes">“{s.notes}”</p>}
                    {confirmDelete === s.id
                      ? <div className="tr-inline-confirm">Apagar este treino? Recordes e XP são recalculados. <button type="button" className="danger small" onClick={() => void remove(s.id)}>Apagar</button><button type="button" className="ghost small" onClick={() => setConfirmDelete(null)}>Cancelar</button></div>
                      : <button type="button" className="tr-link muted" onClick={() => setConfirmDelete(s.id)}>{I.trash(14)} Apagar treino</button>}
                  </div>
                )}
              </li>
            ))}
          </ul>}
      </section>
    </div>
  );
}
