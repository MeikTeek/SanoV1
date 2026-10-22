import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMission, screenOut, type RuleProfile } from '../../backend/src/services/trainer/rules';
import { byKey, GOALS, EXERCISES } from '../../backend/src/services/trainer/exercises';
import { fullDetail } from '../../backend/src/services/trainer/exerciseDetails';

const base: RuleProfile = {
  goal: 'HYPERTROPHY',
  equipment: ['academia'],
  injuries: [],
  age: 30,
  level: 1,
  minutesAvailable: 45,
};

test('filtro de segurança: lesão nunca gera exercício contraindicado', () => {
  const comJoelho: RuleProfile = { ...base, equipment: ['peso-corporal'], injuries: ['joelho'] };
  for (const day of [0, 1, 2, 3, 4, 5, 6]) {
    const mission = generateMission(comJoelho, day);
    for (const b of mission.blocks) {
      const ex = byKey(b.key.replace(/_\d+$/, ''));
      assert.ok(ex, `bloco desconhecido: ${b.key}`);
      assert.ok(!ex!.contraindicated.includes('joelho'), `prescreveu ${ex!.name} com dor no joelho`);
    }
  }
});

test('agachamento sumido é barrado com dor no joelho', () => {
  const ex = byKey('agachamento_sumido')!;
  // Perfil COM o equipamento necessário, para isolar a regra da lesão.
  const comEquipamento: RuleProfile = { ...base, equipment: ['peso-corporal'], injuries: [] };
  assert.ok(ex.contraindicated.includes('joelho'));
  assert.match(screenOut(ex, { ...comEquipamento, injuries: ['joelho'] }) ?? '', /joelho/);
  assert.equal(screenOut(ex, comEquipamento), null); // sem lesão, é liberado
});

test('filtra por equipamento disponível', () => {
  const semNada: RuleProfile = { ...base, equipment: [], injuries: [] };
  const mission = generateMission(semNada, 0);
  for (const b of mission.blocks) {
    const ex = byKey(b.key.replace(/_\d+$/, ''))!;
    assert.ok(ex.equipment.includes('nenhum') || ex.equipment.includes('peso-corporal'),
      `prescreveu ${ex.name} sem equipamento`);
  }
  // A barra fixa exige equipamento e nunca pode aparecer para quem não tem.
  assert.ok(!mission.blocks.some((b) => b.key.startsWith('barra_fixa')));
});

test('academia completa libera modalidades e peso corporal', () => {
  const academia: RuleProfile = { ...base, equipment: ['academia'], injuries: [] };
  for (const key of ['supino_reto_barra', 'rosca_martelo', 'barra_fixa', 'flexao']) {
    const exercise = byKey(key)!;
    assert.equal(screenOut(exercise, academia), null, `${exercise.name} deveria estar liberado na academia`);
  }
});

test('respeita o tempo disponível', () => {
  const curto = generateMission({ ...base, minutesAvailable: 15 }, 0);
  assert.ok(curto.plannedMinutes <= 15, `passou do tempo: ${curto.plannedMinutes}`);
  assert.ok(curto.blocks.length >= 1);
});

test('volume cresce com o nível', () => {
  const nv1 = generateMission({ ...base, level: 1 }, 0);
  const nv7 = generateMission({ ...base, level: 7 }, 0);
  assert.ok(nv7.totalXp > nv1.totalXp, 'nível alto deve render mais XP');
});

test('é determinístico: mesma entrada, mesma saída', () => {
  assert.deepEqual(generateMission(base, 3), generateMission(base, 3));
});

test('roda o dia: grupos variam entre missões', () => {
  const d0 = generateMission(base, 0).blocks.map((b) => b.group);
  const d1 = generateMission(base, 1).blocks.map((b) => b.group);
  assert.notDeepEqual(d0, d1, 'missões de dias diferentes devem variar');
});

test('objetivo muda o equilíbrio de cardio vs força', () => {
  const forca = generateMission({ ...base, goal: 'HYPERTROPHY' }, 0);
  const peso = generateMission({ ...base, goal: 'WEIGHT_LOSS', minutesAvailable: 60 }, 0);
  const pctCardio = (m: typeof forca) => m.blocks.filter((b) => b.group === 'cardio').length / m.blocks.length;
  assert.ok(pctCardio(peso) >= pctCardio(forca), 'emagrecimento deve ter mais cardio');
});

test('relata o que foi excluído e por quê', () => {
  const mission = generateMission({ ...base, equipment: [], injuries: ['joelho'] }, 0);
  assert.ok(mission.excluded.length > 0);
  assert.ok(mission.excluded.every((e) => e.reason));
  assert.ok(mission.excluded.some((e) => /joelho/.test(e.reason)));
});

test('faixa etária: evita dificuldade máxima acima dos 60', () => {
  const mission = generateMission({ ...base, age: 65 }, 0);
  for (const b of mission.blocks) {
    const ex = byKey(b.key.replace(/_\d+$/, ''))!;
    assert.ok(ex.difficulty < 3, `prescreveu exercício difícil (nível 3) para 65 anos: ${ex.name}`);
  }
});

test('o foco declarado ao usuário é o que o motor aplica', () => {
  // Cada objetivo promete uma lista `focus`; o treino tem de sair dela.
  // É a garantia que impede a UI de mentir sobre o resultado.
  for (const goal of GOALS) {
    for (const day of [0, 1, 2]) {
      const mission = generateMission({ ...base, goal: goal.key }, day);
      for (const b of mission.blocks) {
        const ex = byKey(b.key.replace(/_\d+$/, ''))!;
        assert.ok(
          goal.focus.includes(ex.group),
          `${goal.label}: ${ex.name} (${ex.group}) está fora do foco declarado [${goal.focus.join(', ')}]`,
        );
      }
    }
  }
});

test('todo objetivo tem rótulo e resumo legíveis', () => {
  // Sem rótulo vago do tipo "Monarca": o texto precisa ser concreto.
  for (const goal of GOALS) {
    assert.ok(goal.label.length > 4, `rótulo vazio em ${goal.key}`);
    assert.ok(goal.summary.length > 20, `resumo curto demais em ${goal.key}`);
    assert.ok(goal.focus.length > 0, `objetivo sem grupos definidos: ${goal.key}`);
  }
});

test('todo exercício tem detalhe de execução e tempos de cronômetro', () => {
  // Os detalhes podem vir do catálogo importado ou do catálogo local legado.
  for (const e of EXERCISES) {
    const detail = fullDetail(e);
    assert.ok(detail.muscles.length > 10, `músculo vago em ${e.key}`);
    assert.ok(detail.howTo.length > 30, `execução curta demais em ${e.key}`);
    assert.ok(detail.commonMistake.length > 20, `erro comum vago em ${e.key}`);
    assert.ok(detail.workSeconds >= 15 && detail.restSeconds >= 15, `tempos absurdos em ${e.key}`);
  }
});

test('fullDetail nunca devolve placeholder para exercício do catálogo', () => {
  for (const e of EXERCISES) {
    assert.notEqual(fullDetail(e).muscles, 'Não mapeado.', `mapeado ausente: ${e.key}`);
  }
});

test('catálogo enviado inclui todos os exercícios com dados de detalhe e prescrição', () => {
  const imported = EXERCISES.filter((exercise) => exercise.sourceId !== undefined);
  assert.ok(imported.length >= 160, `catálogo com ${imported.length} exercícios`);
  assert.equal(new Set(imported.map((exercise) => exercise.sourceId)).size, imported.length);
  assert.equal(new Set(imported.map((exercise) => exercise.key)).size, imported.length);

  for (const exercise of imported) {
    const detail = fullDetail(exercise);
    assert.ok(detail.howTo.length > 30, `${exercise.name} sem instrução`);
    assert.ok(detail.progression, `${exercise.name} sem progressão`);
    assert.ok(detail.regression, `${exercise.name} sem regressão`);
    assert.ok(detail.restSeconds >= 15, `${exercise.name} sem descanso válido`);
    assert.ok(exercise.sourceMuscles?.length, `${exercise.name} sem grupos musculares`);
  }
});