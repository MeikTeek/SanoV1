import { useCallback, useEffect, useRef, useState } from 'react';
import { getExerciseDetail } from '../../services/trainer.service';
import type { ExerciseDetail } from '../../types/trainer';

interface Props {
  /** Blocos na ordem do treino. */
  blocks: { key: string; name: string }[];
  onFinish: () => void;
  onClose: () => void;
}

type Phase = 'work' | 'rest' | 'done';

const mmss = (total: number) => {
  const s = Math.max(0, Math.ceil(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Cronômetro de sequência: percorre os blocos, avisa quando o descanso acaba
 * e passa sozinho para o próximo. Pausar congela a contagem sem perder o
 * bloco atual.
 */
export default function WorkoutTimer({ blocks, onFinish, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('work');
  const [left, setLeft] = useState(0);
  const [running, setRunning] = useState(true);
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);

  const current = blocks[index];
  // Guarda o total do bloco atual: buscar o detalhe é assíncrono e o timer
  // não pode depender disso para contar.
  const total = useRef(40);
  const phaseRef = useRef<Phase>('work');

  const loadDetail = useCallback(async (key: string) => {
    try {
      const d = await getExerciseDetail(key.replace(/_\d+$/, ''));
      setDetail(d);
      total.current = phaseRef.current === 'work' ? d.workSeconds : d.restSeconds;
      setLeft(total.current);
    } catch {
      setDetail(null);
      total.current = phaseRef.current === 'work' ? 40 : 45;
      setLeft(total.current);
    }
  }, []);

  // Carrega o detalhe e o tempo do bloco ao trocar de exercício.
  useEffect(() => {
    if (!current) return;
    phaseRef.current = 'work';
    setPhase('work');
    setRunning(true);
    void loadDetail(current.key);
  }, [current, loadDetail]);

  // Contagem. Usa intervalo de 250 ms para a barra ficar suave.
  useEffect(() => {
    if (!running || phase === 'done') return;
    const id = window.setInterval(() => {
      setLeft((s) => {
        if (s > 1) return s - 0.25;
        // Troca de fase ao zerar.
        const wasWork = phaseRef.current === 'work';
        phaseRef.current = wasWork ? 'rest' : 'work';
        setPhase(phaseRef.current);

        if (!wasWork) {
          // Descanso terminou: próximo bloco ou fim do treino.
          if (index + 1 < blocks.length) {
            setIndex((i) => i + 1);
          } else {
            setPhase('done');
            setRunning(false);
            onFinish();
          }
          return 1;
        }
        return detail?.restSeconds ?? 45;
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [running, phase, index, blocks.length, detail, onFinish]);

  if (!current) return null;

  const pct = total.current ? Math.min(100, ((total.current - left) / total.current) * 100) : 0;
  const phaseLabel = phase === 'work' ? 'TRABALHO' : phase === 'rest' ? 'DESCANSO' : 'FIM';

  return (
    <div className="timer-overlay" role="dialog" aria-modal="true" aria-label="Cronômetro do treino">
      <div className="timer-card">
        <div className="timer-head">
          <span className="muted">Bloco {index + 1} de {blocks.length}</span>
          <button className="ghost" onClick={onClose} aria-label="Fechar cronômetro">✕</button>
        </div>

        <h2 className="timer-name">{current.name}</h2>

        {detail && (
          <div className="timer-detail">
            <p><b>Músculos:</b> {detail.muscles}</p>
            <p><b>Como fazer:</b> {detail.howTo}</p>
            <p className="warn"><b>Erro comum:</b> {detail.commonMistake}</p>
          </div>
        )}

        <div className={`timer-phase ${phase}`}>{phaseLabel}</div>
        <div className="timer-clock">{mmss(left)}</div>
        <div className="timer-bar"><div style={{ width: `${pct}%` }} /></div>

        <div className="nav-row">
          <button onClick={() => setRunning((r) => !r)}>{running ? 'Pausar' : 'Continuar'}</button>
          <button
            className="ghost"
            onClick={() => {
              // Pula o resto do descanso e vai direto ao próximo bloco.
              if (phase === 'rest') { setIndex((i) => Math.min(i + 1, blocks.length - 1)); }
              else { setLeft(Math.min(left, 5)); }
            }}
          >
            {phase === 'rest' ? 'Pular descanso' : 'Faltam 5s'}
          </button>
        </div>

        {phase === 'rest' && <small className="muted">O próximo exercício começa sozinho ao terminar o descanso.</small>}
      </div>
    </div>
  );
}