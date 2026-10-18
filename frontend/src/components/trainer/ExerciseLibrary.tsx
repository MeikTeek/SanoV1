import { useEffect, useMemo, useState } from 'react';
import { getLibrary } from '../../services/trainer.service';
import type { LibraryResponse } from '../../types/trainer';

const groupLabels: Record<string, string> = {
  peito: 'Peito', costas: 'Costas', pernas: 'Pernas', ombros: 'Ombros',
  bracos: 'Braços', core: 'Core', cardio: 'Cardio', mobilidade: 'Mobilidade',
};

export default function ExerciseLibrary() {
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [equipment, setEquipment] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      getLibrary({ q: query.trim(), group, equipment })
        .then((result) => { if (active) { setData(result); setError(''); } })
        .catch((reason) => { if (active) setError((reason as Error).message); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, group, equipment]);

  const groups = useMemo(
    () => Array.from(new Set(data?.allowed.map((exercise) => exercise.group) ?? [])).sort(),
    [data],
  );

  return (
    <div className="exercise-library">
      <div className="weekly-plan-intro">
        <div>
          <h2 className="tab-title">Biblioteca de exercícios</h2>
          <p className="muted">Pesquise por nome, grupo muscular ou equipamento. Exercícios incompatíveis com seu perfil não são liberados.</p>
        </div>
        <span className="plan-badge">{data?.allowed.length ?? '…'} disponíveis</span>
      </div>

      <div className="library-filters">
        <label>Pesquisar
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex.: remada, peito, barra" />
        </label>
        <label>Grupo muscular
          <select value={group} onChange={(event) => setGroup(event.target.value)}>
            <option value="">Todos os grupos</option>
            {groups.map((item) => <option key={item} value={item}>{groupLabels[item] ?? item}</option>)}
          </select>
        </label>
        <label>Equipamento
          <select value={equipment} onChange={(event) => setEquipment(event.target.value)}>
            <option value="">Todos</option>
            <option value="nenhum">Peso corporal</option>
            <option value="peso-corporal">Calistenia</option>
            <option value="halteres">Halteres</option>
            <option value="academia">Academia</option>
            <option value="elastico">Elástico</option>
            <option value="barra-fixa">Barra fixa</option>
          </select>
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="muted">Carregando biblioteca…</p>}
      {data && data.allowed.length === 0 && <p className="plan-warning">Nenhum exercício liberado corresponde aos filtros atuais.</p>}
      <div className="library-grid">
        {data?.allowed.map((exercise) => (
          <article className="library-card" key={exercise.key}>
            <div className="library-card-head">
              <div><h3>{exercise.name}</h3><span className="muted">{groupLabels[exercise.group] ?? exercise.group} · dificuldade {exercise.difficulty}/3</span></div>
              <button type="button" className="ghost" onClick={() => setExpanded(expanded === exercise.key ? null : exercise.key)}>
                {expanded === exercise.key ? 'Fechar' : 'Detalhes'}
              </button>
            </div>
            <div className="library-tags">{exercise.equipment.map((item) => <span key={item}>{item}</span>)}</div>
            <p className="muted">{exercise.muscles || 'Músculos não informados'}</p>
            {exercise.suggestedSets && <small>{exercise.suggestedSets} séries · {exercise.repsMin}–{exercise.repsMax} repetições · descanso {exercise.restSeconds ?? '—'}s</small>}
            {expanded === exercise.key && (
              <div className="library-details">
                <p><b>Como fazer:</b> {exercise.howTo || 'Instruções não cadastradas.'}</p>
                {exercise.benefits && <p><b>Benefícios:</b> {exercise.benefits}</p>}
                {exercise.progression && <p><b>Progressão:</b> {exercise.progression}</p>}
                {exercise.regression && <p><b>Regressão:</b> {exercise.regression}</p>}
              </div>
            )}
          </article>
        ))}
      </div>

      {data && data.blocked.length > 0 && (
        <details className="library-blocked">
          <summary>{data.blocked.length} exercícios bloqueados por segurança ou equipamento</summary>
          <ul>{data.blocked.map((exercise) => <li key={`${exercise.name}-${exercise.reason}`}><b>{exercise.name}</b>: {exercise.reason}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
