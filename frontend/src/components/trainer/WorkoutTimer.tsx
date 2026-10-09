import { useCallback, useEffect, useRef, useState } from 'react';
import { getExerciseDetail } from '../../services/trainer.service';
import type { ExerciseDetail } from '../../types/trainer';

interface Props {
  /** Blocos na ordem do treino. */
  blocks: { key: string; name: string; restSeconds?: number }[];
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
  const [running, setRunning] = useState(false);
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);

  const current = blocks[index];
  // Guarda o total do bloco atual: buscar o detalhe é assíncrono e o timer
  // não pode depender disso para contar.
  const total = useRef(40);
  const phaseRef = useRef<Phase>('work');
  const audio = useRef<AudioContext | null>(null);
  const finishBeepPlayed = useRef(false);

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
    finishBeepPlayed.current = false;
    setPhase('work');
    setRunning(false);
    void loadDetail(current.key);
  }, [current, loadDetail]);

  useEffect(() => () => {
    if (audio.current && audio.current.state !== 'closed') void audio.current.close();
  }, []);

  const startTimer = async () => {
    if (!audio.current) audio.current = new AudioContext();
    if (audio.current.state === 'suspended') await audio.current.resume();
    setRunning(true);
  };

  const playFinishBeep = useCallback(() => {
    const context = audio.current;
    if (!context || context.state !== 'running' || finishBeepPlayed.current) return;
    finishBeepPlayed.current = true;
    const now = context.currentTime;
    [0, 0.32].forEach((offset) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.2);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.22);
    });
  }, []);

  // Contagem. Usa intervalo de 250 ms para a barra ficar suave.
  useEffect(() => {
    if (!running || phase === 'done') return;
    const id = window.setInterval(() => {
      setLeft((s) => {
        if (s > 1) return s - 0.25;
        // Troca de fase ao zerar.
        if (phaseRef.current === 'work') {
          if (index + 1 >= blocks.length) {
            phaseRef.current = 'done';
            setPhase('done');
            setRunning(false);
            playFinishBeep();
            onFinish();
            return 0;
          }
          phaseRef.current = 'rest';
          setPhase('rest');
          total.current = current.restSeconds ?? detail?.restSeconds ?? 45;
          return total.current;
        }

        phaseRef.current = 'work';
        setPhase('work');
        setIndex((i) => i + 1);
        return 1;
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [running, phase, index, blocks.length, detail, onFinish, current, playFinishBeep]);

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
          <button onClick={() => running ? setRunning(false) : void startTimer()}>{running ? 'Pausar' : 'Ativar som e iniciar'}</button>
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