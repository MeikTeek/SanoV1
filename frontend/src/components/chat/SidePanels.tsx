import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { fetchPanels, type PanelTraining } from '../../services/sano.service';
import type { Appointment } from '../../types/appointment';

interface Props {
  /** Quando muda, os painéis recarregam (ex.: depois de um comando). */
  refreshKey: number;
  /** 'left' = agenda e treino; 'right' = sistema e conexão. */
  side: 'left' | 'right';
}

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** Minutos até o próximo compromisso — vira o alerta proativo do painel. */
const minutesUntil = (iso: string) => (new Date(iso).getTime() - Date.now()) / 60_000;

/**
 * Painéis laterais: o que está para acontecer hoje, como está o treino e se o
 * sistema está de pé. Substituem a tela vazia do chat — o usuário vê informação
 * útil sem precisar perguntar nada.
 *
 * Divididos em duas colunas para que ambas tenham conteúdo e a composição
 * fique equilibrada (esquerda = o dia, direita = o estado do sistema).
 */
export default function SidePanels({ refreshKey, side }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [today, setToday] = useState<Appointment[]>([]);
  const [training, setTraining] = useState<PanelTraining | null>(null);
  const [dbMs, setDbMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchPanels()
      .then((d) => {
        if (!alive) return;
        setToday(d.today);
        setTraining(d.training);
        setDbMs(d.system.dbMs);
      })
      .catch(() => { /* painel é informativo: falha não pode virar erro em tela */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [refreshKey]);

  const next = today[0];
  const nextIn = next ? minutesUntil(next.startsAt) : null;
  const mission = training?.mission;
  const missionPct = mission && mission.total > 0 ? (mission.done / mission.total) * 100 : 0;

  if (side === 'left') {
    return (
      <aside className="hud-col">
        <section className="hud-card hud-grow">
          <h4 className="hud-title">Hoje</h4>
          {loading ? (
            <p className="muted">Carregando…</p>
          ) : today.length === 0 ? (
            <p className="muted">Agenda livre, nada marcado.</p>
          ) : (
            <>
              {/* Alerta proativo: o Sano avisa antes, sem o usuário perguntar. */}
              {nextIn !== null && nextIn > 0 && nextIn <= 60 && (
                <p className="hud-alert">Faltam {Math.round(nextIn)} min para {next.title}</p>
              )}
              <ul className="hud-side-list">
                {today.map((a) => (
                  <li key={a.id} className={a.status === 'DONE' ? 'done' : ''}>
                    <span className="t">{fmtTime(a.startsAt)}</span>
                    <span className="n">{a.title}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <button className="hud-link" onClick={() => navigate('/agenda')}>Abrir agenda</button>
        </section>

        <section className="hud-card">
          <h4 className="hud-title">Treino</h4>
          {!training?.onboarded ? (
            <p className="muted">Sem personagem criado ainda.</p>
          ) : (
            <>
              <div className="hud-stats">
                <div><b>{training.level ?? 1}</b><span>Nível</span></div>
                <div><b>{training.streak ?? 0}</b><span>Ofensiva</span></div>
                <div><b>{mission?.plannedMinutes ?? 0}</b><span>Min</span></div>
              </div>
              <div className="hud-meter-track"><div style={{ width: `${missionPct}%` }} /></div>
              <p className="muted small">{mission ? mission.title : 'Nenhuma missão hoje'}</p>
              <button className="hud-link" onClick={() => navigate('/treino')}>Abrir treino</button>
            </>
          )}
        </section>
      </aside>
    );
  }

  return (
    <aside className="hud-col">
      <section className="hud-card">
        <h4 className="hud-title">Atalhos</h4>
        <div className="hud-actions">
          <button className="hud-btn" onClick={() => navigate('/agenda')}>Agenda</button>
          <button className="hud-btn" onClick={() => navigate('/treino')}>Treino</button>
          <button className="hud-btn" onClick={() => navigate('/config')}>Ajustes</button>
          {user?.role === 'ADMIN' && (
            <button className="hud-btn" onClick={() => navigate('/admin')}>Admin</button>
          )}
        </div>
      </section>

      <section className="hud-card">
        <h4 className="hud-title">Conexão</h4>
        <p className="muted small">
          {dbMs === null ? 'Banco de dados: indisponível' : `Banco de dados: ${dbMs} ms`}
        </p>
      </section>
    </aside>
  );
}