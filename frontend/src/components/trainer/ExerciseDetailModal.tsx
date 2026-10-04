import { useEffect, useState } from 'react';
import { getExerciseDetail } from '../../services/trainer.service';
import type { ExerciseDetail } from '../../types/trainer';

/**
 * Detalhe do exercício: como executar, músculo, por que foi escolhido e os
 * tempos do cronômetro. As imagens ficam a cargo do usuário — sem URL
 * configurada, o quadro simplesmente não aparece (sem espaço quebrado).
 */
export default function ExerciseDetailModal({ exerciseKey, onClose }: {
  exerciseKey: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<ExerciseDetail | null>(null);
  const [images, setImages] = useState<{ muscle: string; form: string }>({ muscle: '', form: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    getExerciseDetail(exerciseKey)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError((e as Error).message); });

    // Recupera imagens salvas localmente para este exercício.
    try {
      const raw = localStorage.getItem(`sano:ex-img:${exerciseKey}`);
      if (raw && alive) setImages(JSON.parse(raw));
    } catch { /* storage indisponível */ }

    return () => { alive = false; };
  }, [exerciseKey]);

  const saveImages = () => {
    try {
      localStorage.setItem(`sano:ex-img:${exerciseKey}`, JSON.stringify(images));
    } catch { /* ignorado: é opcional */ }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Detalhe do exercício">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="timer-head">
          <h2 className="tab-title">{data?.name ?? 'Carregando…'}</h2>
          <button className="ghost" onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        {error && <div className="error">{error}</div>}

        {data && (
          <>
            <section>
              <b>Músculos treinados</b>
              <p>{data.muscles}</p>
            </section>
            <section>
              <b>Como executar</b>
              <p>{data.howTo}</p>
            </section>
            <section>
              <b className="warn">Erro mais comum</b>
              <p>{data.commonMistake}</p>
            </section>
            {data.benefits && (
              <section>
                <b>Por que está no seu treino</b>
                <p>{data.benefits}</p>
              </section>
            )}
            <section>
              <b>No cronômetro</b>
              <p>{data.workSeconds}s de trabalho · {data.restSeconds}s de descanso</p>
            </section>

            <section className="img-section">
              <b>Suas imagens</b>
              <small className="muted">Cole a URL de uma foto do músculo e de como fazer. Fica salvo só neste navegador.</small>
              <div className="field-grid">
                <label>Músculo (URL)
                  <input value={images.muscle} onChange={(e) => setImages({ ...images, muscle: e.target.value })} placeholder="https://…" />
                </label>
                <label>Posição correta (URL)
                  <input value={images.form} onChange={(e) => setImages({ ...images, form: e.target.value })} placeholder="https://…" />
                </label>
              </div>
              <button className="ghost" onClick={saveImages}>Salvar imagens</button>
              {(images.muscle || images.form) && (
                <div className="img-preview">
                  {images.muscle && <img src={images.muscle} alt={`Músculo de ${data.name}`} />}
                  {images.form && <img src={images.form} alt={`Posição correta de ${data.name}`} />}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}