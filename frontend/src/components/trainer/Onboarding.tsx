import { useEffect, useState, type FormEvent } from 'react';
import { getMeta, onboard } from '../../services/trainer.service';
import type { Equipment, Goal, Injury, Somatotype, TrainerMeta } from '../../types/trainer';

const toggle = <T,>(list: T[], value: T): T[] =>
  list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

const LAST_STEP = 5;

export interface ProfileDraft {
  goal: Goal;
  weightKg: string; heightCm: string; birthYear: string; sex: 'M' | 'F' | 'OTHER';
  somatotype: Somatotype | '';
  experience: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  trainingDays: number;
  minutesPerDay: string;
  equipment: Equipment[];
  injuries: Injury[];
  sleepHours: string;
  waterLiters: string;
  mealsPerDay: number;
  dietQuality: 'POOR' | 'FAIR' | 'GOOD';
  dietNotes: string;
  dietRestrictions: string[];
  restrictionNotes: string;
}

/**
 * Cadastro do treino.
 *
 * Sem rótulos decorativos: cada opção diz o que muda. O formulário é longo de
 * propósito — o planejador só é realmente adaptado com dieta, sono, hidratação
 * e experiência declarado. `LAST_STEP` impede o Enter de pular etapas.
 */
export default function Onboarding({ onDone, initial }: {
  onDone: (intro: string) => void;
  initial?: Partial<ProfileDraft>;
}) {
  const [meta, setMeta] = useState<TrainerMeta | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [f, setF] = useState<ProfileDraft>({
    goal: 'HYPERTROPHY',
    weightKg: '', heightCm: '',
    birthYear: String(new Date().getFullYear() - 25),
    sex: 'M',
    somatotype: '',
    experience: 'BEGINNER',
    trainingDays: 3,
    minutesPerDay: '45',
    equipment: ['peso-corporal'],
    injuries: [],
    sleepHours: '7',
    waterLiters: '2',
    mealsPerDay: 3,
    dietQuality: 'FAIR',
    dietNotes: '',
    dietRestrictions: [],
    restrictionNotes: '',
    ...initial,
  });

  useEffect(() => { getMeta().then(setMeta).catch((e) => setError((e as Error).message)); }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // Enter num campo numérico dispara submit e pulava direto para o fim.
    if (step < LAST_STEP) { setStep(step + 1); return; }
    setError('');
    setBusy(true);
    try {
      const { intro } = await onboard({
        weightKg: Number(f.weightKg),
        heightCm: Number(f.heightCm),
        birthYear: Number(f.birthYear),
        sex: f.sex,
        goal: f.goal,
        somatotype: f.somatotype || undefined,
        experience: f.experience,
        trainingDays: f.trainingDays,
        equipment: f.equipment,
        injuries: f.injuries,
        sleepHours: Number(f.sleepHours),
        waterLiters: Number(f.waterLiters),
        mealsPerDay: f.mealsPerDay,
        dietQuality: f.dietQuality,
        dietNotes: f.dietNotes || undefined,
        dietRestrictions: f.dietRestrictions,
        minutesPerDay: Number(f.minutesPerDay),
        restrictionNotes: f.restrictionNotes || undefined,
      });
      onDone(intro);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  if (!meta) return <section className="card"><p className="muted">Carregando…</p></section>;

  const selected = meta.goals.find((g) => g.key === f.goal);
  const next = () => setStep((s) => Math.min(s + 1, LAST_STEP));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const chip = (on: boolean) => `chip ${on ? 'active' : ''}`;

  return (
    <section className="card">
      <h2>{initial ? 'Editar perfil' : 'Seu treino'}</h2>
      <p className="muted">Passo {step + 1} de {LAST_STEP + 1} — cada resposta muda diretamente o plano.</p>

      <form onSubmit={submit}>
        {/* 1 — objetivo e corpo */}
        {step === 0 && (
          <>
            <h3>Qual é o seu objetivo?</h3>
            <div className="goal-list">
              {meta.goals.map((g) => (
                <button key={g.key} type="button" className={`goal-option ${f.goal === g.key ? 'active' : ''}`} onClick={() => setF({ ...f, goal: g.key })}>
                  <b>{g.label}</b>
                  <span className="muted">{g.summary}</span>
                  <small>Foco: {g.focus.join(', ')}</small>
                </button>
              ))}
            </div>

            <h3>Seus dados corporais</h3>
            <div className="field-grid">
              <label>Peso (kg)<input type="number" step="0.1" value={f.weightKg} onChange={(e) => setF({ ...f, weightKg: e.target.value })} required /></label>
              <label>Altura (cm)<input type="number" value={f.heightCm} onChange={(e) => setF({ ...f, heightCm: e.target.value })} required /></label>
              <label>Ano de nascimento<input type="number" value={f.birthYear} onChange={(e) => setF({ ...f, birthYear: e.target.value })} required /></label>
              <label>Sexo
                <select value={f.sex} onChange={(e) => setF({ ...f, sex: e.target.value as 'M' | 'F' | 'OTHER' })}>
                  <option value="M">Masculino</option><option value="F">Feminino</option><option value="OTHER">Outro</option>
                </select>
              </label>
            </div>

            <h3>Seu biótipo</h3>
            <p className="muted">Como seu corpo costuma reagir — isso muda o treino e a dieta sugeridos.</p>
            <div className="chip-grid">
              {([['ECTOMORPH', 'Ectomorfo — magro, difícil ganhar massa'],
                 ['MESOMORPH', 'Mesomorfo — intermediário, reage bem'],
                 ['ENDOMORPH', 'Endomorfo — ganha peso fácil']] as const).map(([k, label]) => (
                <button key={k} type="button" className={chip(f.somatotype === k)} onClick={() => setF({ ...f, somatotype: f.somatotype === k ? '' : k as Somatotype })}>{label}</button>
              ))}
            </div>
          </>
        )}
{/* 2 — experiência e rotina */}
        {step === 1 && (
          <>
            <h3>Há quanto tempo você treina?</h3>
            <div className="chip-grid">
              {([['BEGINNER', 'Começando (menos de 6 meses)'],
                 ['INTERMEDIATE', 'Intermediário (6 meses a 2 anos)'],
                 ['ADVANCED', 'Avançado (mais de 2 anos)']] as const).map(([k, label]) => (
                <button key={k} type="button" className={chip(f.experience === k)} onClick={() => setF({ ...f, experience: k })}>{label}</button>
              ))}
            </div>

            <h3>Dias por semana</h3>
            <div className="chip-grid">
              {[2, 3, 4, 5, 6].map((d) => (
                <button key={d} type="button" className={chip(f.trainingDays === d)} onClick={() => setF({ ...f, trainingDays: d })}>{d}x</button>
              ))}
            </div>

            <h3>Minutos por treino</h3>
            <div className="chip-grid">
              {[20, 30, 45, 60, 90].map((m) => (
                <button key={m} type="button" className={chip(f.minutesPerDay === String(m))} onClick={() => setF({ ...f, minutesPerDay: String(m) })}>{m} min</button>
              ))}
            </div>

            <h3>Quanto você dorme por noite?</h3>
            <div className="chip-grid">
              {[5, 6, 7, 8, 9].map((h) => (
                <button key={h} type="button" className={chip(f.sleepHours === String(h))} onClick={() => setF({ ...f, sleepHours: String(h) })}>{h}h</button>
              ))}
            </div>
            <small className="muted">Menos de 6h reduz recuperação e ganho de massa, e o plano ajusta a intensidade.</small>
          </>
        )}

        {/* 3 — equipamento e lesões */}
        {step === 2 && (
          <>
            <h3>O que você tem para treinar?</h3>
            <p className="muted">Marque tudo que estiver disponível. Nada que exija equipamento ausente será prescrito.</p>
            <div className="chip-grid">
              {(Object.keys(meta.equipment) as Equipment[]).map((k) => (
                <button key={k} type="button" className={chip(f.equipment.includes(k))} onClick={() => setF({ ...f, equipment: toggle(f.equipment, k) })}>{meta.equipment[k]}</button>
              ))}
            </div>

            <h3>Alguma dor ou lesão?</h3>
            <p className="muted">Esses exercícios serão <b>removidos</b> do seu treino automaticamente.</p>
            <div className="chip-grid">
              {(Object.keys(meta.injuries) as Injury[]).map((k) => (
                <button key={k} type="button" className={`chip danger ${f.injuries.includes(k) ? 'active' : ''}`} onClick={() => setF({ ...f, injuries: toggle(f.injuries, k) })}>{meta.injuries[k]}</button>
              ))}
            </div>
            <label>Outras observações sobre o corpo (opcional)
              <textarea value={f.restrictionNotes} onChange={(e) => setF({ ...f, restrictionNotes: e.target.value })} rows={2} maxLength={500} />
            </label>
            <small className="muted">Isto não substitui avaliação médica profissional.</small>
          </>
        )}

        {/* 4 — alimentação */}
        {step === 3 && (
          <>
            <h3>Como você se alimenta hoje?</h3>
            <div className="chip-grid">
              {([['POOR', 'Ruim — irregular, ultraprocessado'],
                 ['FAIR', 'Razoável — como quando dá'],
                 ['GOOD', 'Boa — planejada e variada']] as const).map(([k, label]) => (
                <button key={k} type="button" className={chip(f.dietQuality === k)} onClick={() => setF({ ...f, dietQuality: k })}>{label}</button>
              ))}
            </div>

            <h3>Quantas refeições por dia?</h3>
            <div className="chip-grid">
              {[2, 3, 4, 5, 6].map((m) => (
                <button key={m} type="button" className={chip(f.mealsPerDay === m)} onClick={() => setF({ ...f, mealsPerDay: m })}>{m}</button>
              ))}
            </div>

            <h3>Restrições ou o que você não come?</h3>
            <div className="chip-grid">
              {['lactose', 'glúten', 'vegetariano', 'vegano', 'sem carne vermelha', 'ovo', 'frutos do mar'].map((r) => (
                <button key={r} type="button" className={chip(f.dietRestrictions.includes(r))} onClick={() => setF({ ...f, dietRestrictions: toggle(f.dietRestrictions, r) })}>{r}</button>
              ))}
            </div>

            <label>O que você costuma comer? (opcional, mas ajuda muito)
              <textarea value={f.dietNotes} onChange={(e) => setF({ ...f, dietNotes: e.target.value })} rows={3} maxLength={500}
                placeholder="Ex.: café da manhã pão com ovo, almoço arroz e feijão, janta…" />
            </label>
          </>
        )}

        {/* 5 — hidratação e confirmação */}
        {step === 4 && (
          <>
            <h3>Quanto água você bebe por dia?</h3>
            <div className="chip-grid">
              {(['0.5', '1', '2', '3', '4'] as const).map((v) => (
                <button key={v} type="button" className={chip(f.waterLiters === v)} onClick={() => setF({ ...f, waterLiters: v })}>{v} L</button>
              ))}
            </div>
            <small className="muted">A referência é ~35 ml por kg de peso. Hidratação baixa reduz a vitalidade.</small>

            <h3>Resumo</h3>
            <div className="summary-box">
              <b>Seu plano</b>
              <span>Objetivo: {selected?.label}</span>
              <span>Biótipo: {f.somatotype || 'não informado'}</span>
              <span>{f.trainingDays}x por semana · {f.minutesPerDay} min</span>
              <span>Equipamento: {f.equipment.map((e) => meta.equipment[e]).join(', ')}</span>
              <span>Alimentação: {({ POOR: 'ruim', FAIR: 'razoável', GOOD: 'boa' } as const)[f.dietQuality]} · {f.mealsPerDay} refeições/dia</span>
              <span>Sono: {f.sleepHours}h · Água: {f.waterLiters} L</span>
              {f.injuries.length > 0 && (
                <span className="warn">Serão evitados exercícios para: {f.injuries.map((i) => meta.injuries[i]).join(', ')}</span>
              )}
              {f.dietRestrictions.length > 0 && (
                <span className="warn">Dieta seguirá sem: {f.dietRestrictions.join(', ')}</span>
              )}
            </div>
          </>
        )}

        {error && <div className="error">{error}</div>}

        <div className="nav-row">
          {step > 0 && <button type="button" className="ghost" onClick={back}>Voltar</button>}
          {step < LAST_STEP
            ? <button type="button" onClick={next}>Continuar</button>
            : <button disabled={busy || f.equipment.length === 0}>{busy ? 'Montando plano…' : initial ? 'Salvar perfil' : 'Montar meu treino'}</button>}
        </div>
      </form>
    </section>
  );
}