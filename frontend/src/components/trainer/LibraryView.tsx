import { useEffect, useMemo, useState } from 'react';
import { getLibrary } from '../../services/trainer.service';
import type { LibraryResponse } from '../../types/trainer';
import MuscleMap, { MUSCLE_LABELS } from './MuscleMap';
import { EQUIPMENT_LABELS, I } from './ui';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
const BACK_MUSCLES = [5, 7, 8, 9, 11, 12, 15, 16];

/**
 * Biblioteca no estilo do wger: filtra tocando no músculo do mapa, por
 * equipamento ou por nome. Carrega tudo de uma vez (é pequena) e filtra local.
 */
export default function LibraryView({ onShowExercise }: { onShowExercise: (key: string) => void }) {
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [muscles, setMuscles] = useState<number[]>([]);
  const [equipment, setEquipment] = useState('');

  useEffect(() => { getLibrary().then(setData).catch((e) => setError((e as Error).message)); }, []);

  const toggleMuscle = (id: number) => setMuscles((list) => (list.includes(id) ? list.filter((m) => m !== id) : [...list, id]));

  const list = useMemo(() => (data?.allowed ?? []).filter((e) => {
    if (query && !norm(`${e.name} ${e.muscles} ${e.group}`).includes(norm(query))) return false;
    if (equipment && !e.equipment.includes(equipment as never)) return false;
    if (muscles.length && !muscles.some((id) => e.primaryMuscles.includes(id) || e.secondaryMuscles.includes(id))) return false;
    return true;
  }).sort((a, b) => {
    // Quem tem o músculo filtrado como PRINCIPAL vem antes.
    const score = (e: typeof a) => muscles.filter((id) => e.primaryMuscles.includes(id)).length;
    return score(b) - score(a) || a.name.localeCompare(b.name, 'pt-BR');
  }), [data, query, equipment, muscles]);

  const equipmentOptions = useMemo(() => Array.from(new Set((data?.allowed ?? []).flatMap((e) => e.equipment))), [data]);

  return (
    <div className="tr-view">
      <header className="tr-view-head">
        <div>
          <h2>Exercícios</h2>
          <p className="muted">{data ? `${data.allowed.length} liberados para o seu perfil` : 'Carregando…'} · toque no corpo para filtrar por músculo</p>
        </div>
      </header>
      {error && <div className="tr-alert bad">{error}</div>}

      <div className="tr-library">
        <aside className="tr-library-filter">
          <MuscleMap selected={muscles} onToggle={toggleMuscle} size="md" />
          <div className="tr-tags tr-tags-center">
            {muscles.length === 0
              ? <span className="muted small">Nenhum músculo escolhido</span>
              : <>
                {muscles.map((id) => <button key={id} type="button" className="tr-tag accent removable" onClick={() => toggleMuscle(id)}>{MUSCLE_LABELS[id]} {I.close(12)}</button>)}
                <button type="button" className="tr-link" onClick={() => setMuscles([])}>Limpar</button>
              </>}
          </div>
          <div className="tr-muscle-chips">
            {Object.entries(MUSCLE_LABELS).map(([id, label]) => (
              <button key={id} type="button" className={`tr-chip ${muscles.includes(Number(id)) ? 'on' : ''}`} onClick={() => toggleMuscle(Number(id))}>{label}</button>
            ))}
          </div>
        </aside>

        <div className="tr-library-main">
          <div className="tr-library-bar">
            <label className="tr-search">{I.search(16)}<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar: supino, agachamento, glúteo…" /></label>
            <div className="tr-chips">
              <button type="button" className={`tr-chip ${equipment === '' ? 'on' : ''}`} onClick={() => setEquipment('')}>Todos</button>
              {equipmentOptions.map((e) => <button key={e} type="button" className={`tr-chip ${equipment === e ? 'on' : ''}`} onClick={() => setEquipment(equipment === e ? '' : e)}>{EQUIPMENT_LABELS[e] ?? e}</button>)}
            </div>
          </div>

          {data && list.length === 0 && <div className="tr-empty"><b>Nada encontrado</b><p>Tente outro músculo ou limpe os filtros.</p></div>}
          <div className="tr-lib-grid">
            {list.map((e) => (
              <button key={e.key} type="button" className="tr-lib-card" onClick={() => onShowExercise(e.key)}>
                <MuscleMap primary={e.primaryMuscles} secondary={e.secondaryMuscles} size="sm" only={e.primaryMuscles.some((id) => BACK_MUSCLES.includes(id)) ? 'back' : 'front'} />
                <span className="tr-lib-info">
                  <b>{e.name}</b>
                  <small>{e.primaryMuscles.map((id) => MUSCLE_LABELS[id]).join(', ') || 'Mobilidade'}</small>
                  <span className="tr-lib-meta">
                    <span>{'●'.repeat(Number(e.difficulty))}{'○'.repeat(3 - Number(e.difficulty))}</span>
                    {e.repsMin && <span>{e.suggestedSets}×{e.repsMin}–{e.repsMax}{e.unit === 'reps' ? '' : e.unit === 'segundos' ? 's' : 'min'}</span>}
                    <span>{e.equipment.map((x) => EQUIPMENT_LABELS[x] ?? x).join(' / ')}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>

          {data && data.blocked.length > 0 && (
            <details className="tr-blocked">
              <summary>{data.blocked.length} exercícios bloqueados pelo seu perfil (lesão, equipamento ou idade)</summary>
              <ul>{data.blocked.map((b) => <li key={`${b.key}-${b.reason}`}><b>{b.name}</b> — {b.reason}</li>)}</ul>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
