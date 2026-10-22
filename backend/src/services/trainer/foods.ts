/**
 * Tabela de alimentos para o cardápio montado por regras (sem IA).
 *
 * Valores por 100 g do alimento PRONTO para comer (cozido, grelhado ou cru,
 * como indicado no nome), aproximados da TACO/Unicamp e de rótulos comuns.
 * É uma referência para estimativa — variações de marca e preparo são normais.
 */

export type FoodGroup = 'proteina' | 'laticinio' | 'leguminosa' | 'carboidrato' | 'fruta' | 'vegetal' | 'gordura';
export type MealSlot = 'cafe' | 'almoco' | 'lanche' | 'jantar' | 'ceia';
/** Marcadores usados para respeitar restrições alimentares. */
export type FoodTag = 'animal' | 'carne' | 'peixe' | 'porco' | 'ovo' | 'lactose' | 'gluten' | 'amendoim' | 'castanha' | 'soja';

export interface Food {
  key: string;
  name: string;
  group: FoodGroup;
  /** Por 100 g. */
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  fiberG: number;
  /** Medida caseira: quantos gramas tem 1 unidade/porção e como chamá-la. */
  unit: { grams: number; label: string; plural: string };
  /** Arredonda para unidades inteiras (ovo, pão, fruta). */
  wholeUnits?: boolean;
  meals: MealSlot[];
  tags: FoodTag[];
}

const ALL_DAY: MealSlot[] = ['cafe', 'almoco', 'lanche', 'jantar', 'ceia'];
const MAIN: MealSlot[] = ['almoco', 'jantar'];
const MORNING: MealSlot[] = ['cafe', 'lanche'];
const SNACK: MealSlot[] = ['cafe', 'lanche', 'ceia'];

type Row = [
  key: string, name: string, group: FoodGroup,
  kcal: number, protein: number, carb: number, fat: number, fiber: number,
  unitGrams: number, unitLabel: string, unitPlural: string,
  meals: MealSlot[], tags: FoodTag[], wholeUnits?: boolean,
];

const ROWS: Row[] = [
  // ── Proteínas animais ──
  ['frango_peito', 'Peito de frango grelhado', 'proteina', 159, 32, 0, 2.5, 0, 100, 'filé médio', 'filés médios', MAIN, ['animal', 'carne']],
  ['frango_coxa', 'Coxa de frango assada sem pele', 'proteina', 190, 26, 0, 9, 0, 70, 'coxa', 'coxas', MAIN, ['animal', 'carne']],
  ['frango_desfiado', 'Frango desfiado cozido', 'proteina', 163, 31, 0, 3.6, 0, 30, 'colher de sopa cheia', 'colheres de sopa cheias', ['almoco', 'jantar', 'lanche', 'cafe'], ['animal', 'carne']],
  ['patinho_moido', 'Patinho moído refogado', 'proteina', 219, 35.9, 0, 7.3, 0, 30, 'colher de sopa cheia', 'colheres de sopa cheias', MAIN, ['animal', 'carne']],
  ['alcatra', 'Alcatra grelhada', 'proteina', 241, 31.9, 0, 11.6, 0, 100, 'bife médio', 'bifes médios', MAIN, ['animal', 'carne']],
  ['acem_moido', 'Carne moída (acém) refogada', 'proteina', 212, 26.7, 0, 10.9, 0, 30, 'colher de sopa cheia', 'colheres de sopa cheias', MAIN, ['animal', 'carne']],
  ['lombo_porco', 'Lombo de porco assado', 'proteina', 210, 35.7, 0, 6.4, 0, 100, 'fatia média', 'fatias médias', MAIN, ['animal', 'carne', 'porco']],
  ['figado', 'Fígado bovino grelhado', 'proteina', 225, 29.9, 4.2, 9, 0, 100, 'bife médio', 'bifes médios', MAIN, ['animal', 'carne']],
  ['tilapia', 'Filé de tilápia grelhado', 'proteina', 128, 26, 0, 2.7, 0, 100, 'filé', 'filés', MAIN, ['animal', 'peixe']],
  ['salmao', 'Salmão grelhado', 'proteina', 208, 22, 0, 13, 0, 100, 'posta média', 'postas médias', MAIN, ['animal', 'peixe']],
  ['atum_agua', 'Atum em conserva em água', 'proteina', 116, 25.5, 0, 0.8, 0, 60, 'lata escorrida', 'latas escorridas', ['almoco', 'jantar', 'lanche'], ['animal', 'peixe']],
  ['sardinha', 'Sardinha em conserva (escorrida)', 'proteina', 208, 24.6, 0, 11.5, 0, 25, 'sardinha', 'sardinhas', MAIN, ['animal', 'peixe']],
  ['camarao', 'Camarão cozido', 'proteina', 99, 21, 0, 1, 0, 100, 'porção', 'porções', MAIN, ['animal', 'peixe']],
  ['peito_peru', 'Peito de peru fatiado', 'proteina', 104, 18, 3, 2, 0, 15, 'fatia', 'fatias', SNACK, ['animal', 'carne']],
  ['ovo', 'Ovo cozido', 'proteina', 146, 13.3, 0.6, 9.5, 0, 50, 'ovo', 'ovos', ['cafe', 'lanche', 'almoco', 'jantar', 'ceia'], ['animal', 'ovo'], true],
  ['ovo_mexido', 'Ovos mexidos', 'proteina', 166, 11.5, 1.5, 12.5, 0, 50, 'ovo', 'ovos', ['cafe', 'jantar'], ['animal', 'ovo'], true],
  ['clara', 'Clara de ovo cozida', 'proteina', 52, 11, 0.7, 0.2, 0, 33, 'clara', 'claras', ['cafe', 'lanche', 'jantar'], ['animal', 'ovo'], true],

  // ── Laticínios ──
  ['iogurte_natural', 'Iogurte natural integral', 'laticinio', 63, 3.5, 4.7, 3.3, 0, 170, 'pote', 'potes', SNACK, ['animal', 'lactose'], true],
  ['iogurte_grego', 'Iogurte grego natural desnatado', 'laticinio', 59, 10, 3.6, 0.4, 0, 100, 'pote', 'potes', SNACK, ['animal', 'lactose'], true],
  ['leite_desnatado', 'Leite desnatado', 'laticinio', 35, 3.4, 4.9, 0.1, 0, 200, 'copo', 'copos', SNACK, ['animal', 'lactose']],
  ['leite_integral', 'Leite integral', 'laticinio', 61, 3.2, 4.7, 3.3, 0, 200, 'copo', 'copos', SNACK, ['animal', 'lactose']],
  ['leite_sem_lactose', 'Leite desnatado sem lactose', 'laticinio', 35, 3.4, 4.9, 0.1, 0, 200, 'copo', 'copos', SNACK, ['animal']],
  ['queijo_minas', 'Queijo minas frescal', 'laticinio', 264, 17.4, 3.2, 20.2, 0, 30, 'fatia média', 'fatias médias', SNACK, ['animal', 'lactose']],
  ['cottage', 'Queijo cottage', 'laticinio', 98, 11, 3.4, 4.3, 0, 30, 'colher de sopa', 'colheres de sopa', SNACK, ['animal', 'lactose']],
  ['ricota', 'Ricota', 'laticinio', 140, 12.6, 3.8, 8.1, 0, 30, 'fatia', 'fatias', SNACK, ['animal', 'lactose']],
  ['mucarela', 'Queijo muçarela', 'laticinio', 330, 22.6, 3, 25.2, 0, 20, 'fatia', 'fatias', SNACK, ['animal', 'lactose']],
  ['whey', 'Whey protein concentrado', 'laticinio', 400, 78, 8, 6, 0, 30, 'scoop', 'scoops', ['cafe', 'lanche'], ['animal', 'lactose']],
  ['requeijao_light', 'Requeijão light', 'laticinio', 180, 10, 4, 14, 0, 15, 'colher de sopa', 'colheres de sopa', ['cafe', 'lanche'], ['animal', 'lactose']],

  // ── Proteínas vegetais ──
  ['tofu', 'Tofu firme', 'proteina', 120, 13, 2.5, 7, 1, 100, 'fatia grossa', 'fatias grossas', ALL_DAY, ['soja']],
  ['pts', 'Proteína de soja texturizada (hidratada)', 'proteina', 110, 17.5, 10, 0.4, 4, 30, 'colher de sopa cheia', 'colheres de sopa cheias', MAIN, ['soja']],
  ['tempeh', 'Tempeh', 'proteina', 192, 20, 7.6, 10.8, 4, 100, 'porção', 'porções', MAIN, ['soja']],
  ['seitan', 'Seitan (glúten de trigo)', 'proteina', 120, 21, 4, 2, 0.6, 100, 'porção', 'porções', MAIN, ['gluten']],
  ['proteina_ervilha', 'Proteína de ervilha em pó', 'proteina', 380, 80, 4, 6, 1, 30, 'scoop', 'scoops', ['cafe', 'lanche'], []],
  ['iogurte_soja', 'Iogurte de soja natural', 'laticinio', 60, 3.5, 6, 2, 0.5, 170, 'pote', 'potes', SNACK, ['soja'], true],
  ['leite_soja', 'Bebida de soja sem açúcar', 'laticinio', 40, 3.3, 2.6, 1.8, 0.5, 200, 'copo', 'copos', SNACK, ['soja']],

  // ── Leguminosas ──
  ['feijao_carioca', 'Feijão carioca cozido', 'leguminosa', 76, 4.8, 13.6, 0.5, 8.5, 86, 'concha média', 'conchas médias', MAIN, []],
  ['feijao_preto', 'Feijão preto cozido', 'leguminosa', 77, 4.5, 14, 0.5, 8.4, 86, 'concha média', 'conchas médias', MAIN, []],
  ['lentilha', 'Lentilha cozida', 'leguminosa', 93, 6.3, 16.3, 0.5, 7.9, 86, 'concha média', 'conchas médias', MAIN, []],
  ['grao_bico', 'Grão-de-bico cozido', 'leguminosa', 164, 8.9, 27.4, 2.6, 7.6, 25, 'colher de sopa cheia', 'colheres de sopa cheias', MAIN, []],
  ['ervilha', 'Ervilha cozida', 'leguminosa', 81, 5.4, 14.5, 0.4, 5.1, 25, 'colher de sopa cheia', 'colheres de sopa cheias', MAIN, []],
  ['edamame', 'Edamame cozido', 'leguminosa', 121, 11.9, 8.9, 5.2, 5.2, 50, 'xícara rasa', 'xícaras rasas', ['almoco', 'jantar', 'lanche'], ['soja']],
  ['hummus', 'Homus (pasta de grão-de-bico)', 'leguminosa', 166, 8, 14, 9.6, 6, 30, 'colher de sopa cheia', 'colheres de sopa cheias', ['lanche', 'cafe'], []],

  // ── Carboidratos ──
  ['arroz_branco', 'Arroz branco cozido', 'carboidrato', 128, 2.5, 28.1, 0.2, 1.6, 25, 'colher de sopa cheia', 'colheres de sopa cheias', MAIN, []],
  ['arroz_integral', 'Arroz integral cozido', 'carboidrato', 124, 2.6, 25.8, 1, 2.7, 25, 'colher de sopa cheia', 'colheres de sopa cheias', MAIN, []],
  ['macarrao', 'Macarrão cozido', 'carboidrato', 158, 5.8, 30.9, 0.9, 1.8, 50, 'pegador', 'pegadores', MAIN, ['gluten']],
  ['macarrao_integral', 'Macarrão integral cozido', 'carboidrato', 124, 5.3, 26.5, 0.5, 3.9, 50, 'pegador', 'pegadores', MAIN, ['gluten']],
  ['batata', 'Batata inglesa cozida', 'carboidrato', 52, 1.2, 11.9, 0, 1.3, 70, 'batata média', 'batatas médias', MAIN, []],
  ['batata_doce', 'Batata-doce cozida', 'carboidrato', 77, 0.6, 18.4, 0.1, 2.2, 70, 'fatia grossa', 'fatias grossas', ['almoco', 'jantar', 'cafe', 'lanche'], []],
  ['mandioca', 'Mandioca cozida', 'carboidrato', 125, 0.6, 30.1, 0.3, 1.6, 50, 'pedaço', 'pedaços', MAIN, []],
  ['inhame', 'Inhame cozido', 'carboidrato', 118, 1.5, 27.9, 0.1, 1.7, 50, 'pedaço', 'pedaços', ['almoco', 'jantar', 'cafe'], []],
  ['cuscuz', 'Cuscuz de milho cozido', 'carboidrato', 113, 2.2, 25.3, 0.7, 2.1, 50, 'fatia', 'fatias', ['cafe', 'jantar', 'lanche'], []],
  ['quinoa', 'Quinoa cozida', 'carboidrato', 120, 4.4, 21.3, 1.9, 2.8, 25, 'colher de sopa cheia', 'colheres de sopa cheias', MAIN, []],
  ['milho', 'Milho verde cozido', 'carboidrato', 98, 3.2, 17.1, 2.4, 4.6, 25, 'colher de sopa', 'colheres de sopa', MAIN, []],
  ['aveia', 'Aveia em flocos', 'carboidrato', 394, 13.9, 66.6, 8.5, 9.1, 15, 'colher de sopa', 'colheres de sopa', SNACK, ['gluten']],
  ['pao_frances', 'Pão francês', 'carboidrato', 300, 8, 58.6, 3.1, 2.3, 50, 'pão', 'pães', ['cafe', 'lanche'], ['gluten'], true],
  ['pao_integral', 'Pão de forma integral', 'carboidrato', 253, 9.4, 49.9, 3.7, 6.9, 25, 'fatia', 'fatias', ['cafe', 'lanche', 'ceia'], ['gluten'], true],
  ['pao_sirio', 'Pão sírio integral', 'carboidrato', 275, 9, 55, 1.2, 5, 50, 'unidade', 'unidades', ['cafe', 'lanche', 'jantar'], ['gluten'], true],
  ['wrap', 'Wrap integral (rap10)', 'carboidrato', 290, 8, 50, 6, 4, 40, 'disco', 'discos', ['cafe', 'lanche', 'jantar'], ['gluten'], true],
  ['tapioca', 'Tapioca (goma pronta)', 'carboidrato', 240, 0, 60, 0, 0, 30, 'colher de sopa', 'colheres de sopa', ['cafe', 'lanche', 'jantar'], []],
  ['granola', 'Granola sem açúcar', 'carboidrato', 420, 10, 63, 14, 7, 15, 'colher de sopa', 'colheres de sopa', SNACK, ['gluten']],
  ['biscoito_arroz', 'Biscoito de arroz', 'carboidrato', 387, 8, 81, 3, 4, 9, 'biscoito', 'biscoitos', SNACK, [], true],
  ['pipoca', 'Pipoca estourada sem óleo', 'carboidrato', 387, 13, 78, 4.5, 14.5, 10, 'xícara', 'xícaras', ['lanche'], []],
  ['mel', 'Mel', 'carboidrato', 309, 0.4, 84, 0, 0.2, 10, 'colher de chá cheia', 'colheres de chá cheias', ['cafe', 'lanche'], ['animal']],

  // ── Frutas ──
  ['banana', 'Banana prata', 'fruta', 98, 1.3, 26, 0.1, 2, 70, 'banana média', 'bananas médias', SNACK, [], true],
  ['maca', 'Maçã', 'fruta', 56, 0.3, 15.2, 0, 1.3, 130, 'maçã média', 'maçãs médias', SNACK, [], true],
  ['mamao', 'Mamão papaia', 'fruta', 40, 0.5, 10.4, 0.1, 1, 150, 'meia papaia', 'meias papaias', MORNING, []],
  ['laranja', 'Laranja pera', 'fruta', 37, 1, 8.9, 0.1, 0.8, 140, 'laranja média', 'laranjas médias', SNACK, [], true],
  ['morango', 'Morango', 'fruta', 30, 0.9, 6.8, 0.3, 1.7, 12, 'morango', 'morangos', SNACK, []],
  ['abacaxi', 'Abacaxi', 'fruta', 48, 0.9, 12.3, 0.1, 1, 75, 'fatia média', 'fatias médias', SNACK, []],
  ['manga', 'Manga tommy', 'fruta', 51, 0.9, 12.8, 0.2, 2.1, 140, 'meia manga', 'meias mangas', SNACK, []],
  ['melancia', 'Melancia', 'fruta', 33, 0.9, 8.1, 0, 0.1, 200, 'fatia média', 'fatias médias', SNACK, []],
  ['uva', 'Uva', 'fruta', 53, 0.7, 13.6, 0.2, 0.9, 8, 'uva', 'uvas', SNACK, []],
  ['pera', 'Pera', 'fruta', 53, 0.6, 14, 0.1, 3, 130, 'pera média', 'peras médias', SNACK, [], true],
  ['kiwi', 'Kiwi', 'fruta', 51, 1.3, 11.5, 0.6, 2.7, 75, 'kiwi', 'kiwis', SNACK, [], true],
  ['goiaba', 'Goiaba', 'fruta', 54, 1.1, 13, 0.4, 6.2, 170, 'goiaba média', 'goiabas médias', SNACK, [], true],
  ['melao', 'Melão', 'fruta', 29, 0.7, 7.5, 0, 0.3, 115, 'fatia média', 'fatias médias', SNACK, []],
  ['acai', 'Açaí (polpa sem açúcar)', 'fruta', 58, 0.8, 6.2, 3.9, 2.6, 100, 'polpa', 'polpas', ['lanche'], []],
  ['abacate', 'Abacate', 'fruta', 96, 1.2, 6, 8.4, 6.3, 45, 'colher de sopa cheia', 'colheres de sopa cheias', SNACK, []],

  // ── Vegetais ──
  ['brocolis', 'Brócolis cozido', 'vegetal', 25, 2.1, 4.4, 0.5, 3.4, 60, 'ramo', 'ramos', MAIN, []],
  ['alface', 'Alface', 'vegetal', 11, 1.3, 1.7, 0.2, 1.8, 10, 'folha', 'folhas', MAIN, []],
  ['tomate', 'Tomate', 'vegetal', 15, 1.1, 3.1, 0.2, 1.2, 15, 'rodela', 'rodelas', MAIN, []],
  ['cenoura', 'Cenoura crua ralada', 'vegetal', 34, 1.3, 7.7, 0.2, 3.2, 12, 'colher de sopa', 'colheres de sopa', MAIN, []],
  ['abobrinha', 'Abobrinha cozida', 'vegetal', 15, 1.1, 3, 0.2, 1.6, 30, 'colher de sopa cheia', 'colheres de sopa cheias', MAIN, []],
  ['couve', 'Couve manteiga crua', 'vegetal', 27, 2.9, 4.3, 0.5, 3.1, 20, 'colher de sopa', 'colheres de sopa', MAIN, []],
  ['espinafre', 'Espinafre cozido', 'vegetal', 23, 2.9, 3.8, 0.3, 2.5, 25, 'colher de sopa cheia', 'colheres de sopa cheias', MAIN, []],
  ['pepino', 'Pepino', 'vegetal', 10, 0.9, 2, 0, 1.1, 10, 'rodela', 'rodelas', MAIN, []],
  ['beterraba', 'Beterraba cozida', 'vegetal', 32, 1.3, 7.2, 0.1, 1.9, 15, 'colher de sopa', 'colheres de sopa', MAIN, []],
  ['abobora', 'Abóbora cabotiá cozida', 'vegetal', 48, 1.4, 10.8, 0.7, 2.5, 35, 'pedaço', 'pedaços', MAIN, []],
  ['chuchu', 'Chuchu cozido', 'vegetal', 19, 0.4, 4.8, 0, 1, 30, 'colher de sopa cheia', 'colheres de sopa cheias', MAIN, []],
  ['couve_flor', 'Couve-flor cozida', 'vegetal', 19, 1.2, 3.9, 0.3, 2.1, 30, 'ramo', 'ramos', MAIN, []],
  ['vagem', 'Vagem cozida', 'vegetal', 25, 1.8, 5, 0.2, 2.4, 25, 'colher de sopa cheia', 'colheres de sopa cheias', MAIN, []],
  ['repolho', 'Repolho cru', 'vegetal', 17, 0.9, 3.9, 0.1, 1.9, 15, 'colher de sopa', 'colheres de sopa', MAIN, []],
  ['berinjela', 'Berinjela cozida', 'vegetal', 19, 0.7, 4.5, 0.1, 2.5, 30, 'colher de sopa cheia', 'colheres de sopa cheias', MAIN, []],
  ['pimentao', 'Pimentão', 'vegetal', 21, 1, 4.9, 0.2, 2.6, 20, 'fatia', 'fatias', MAIN, []],
  ['rucula', 'Rúcula', 'vegetal', 13, 1.8, 2.2, 0.1, 1.7, 5, 'folha', 'folhas', MAIN, []],
  ['quiabo', 'Quiabo cozido', 'vegetal', 22, 1.9, 4.6, 0.2, 3.2, 25, 'colher de sopa cheia', 'colheres de sopa cheias', MAIN, []],

  // ── Gorduras boas ──
  ['azeite', 'Azeite de oliva extravirgem', 'gordura', 884, 0, 0, 100, 0, 4, 'colher de chá', 'colheres de chá', MAIN, []],
  ['pasta_amendoim', 'Pasta de amendoim integral', 'gordura', 588, 25, 20, 50, 6, 15, 'colher de sopa', 'colheres de sopa', ['cafe', 'lanche'], ['amendoim']],
  ['amendoim', 'Amendoim torrado sem sal', 'gordura', 606, 22.5, 18.7, 54, 8, 10, 'colher de sopa', 'colheres de sopa', ['lanche'], ['amendoim']],
  ['castanha_para', 'Castanha-do-pará', 'gordura', 643, 14.5, 15.1, 63.5, 7.9, 4, 'castanha', 'castanhas', SNACK, ['castanha'], true],
  ['castanha_caju', 'Castanha de caju torrada', 'gordura', 570, 18.5, 29.1, 46.3, 3.7, 2.5, 'castanha', 'castanhas', SNACK, ['castanha']],
  ['amendoas', 'Amêndoas', 'gordura', 581, 18.6, 29.5, 47.3, 11.6, 1.2, 'amêndoa', 'amêndoas', SNACK, ['castanha']],
  ['nozes', 'Nozes', 'gordura', 620, 14, 18.4, 59.4, 7.2, 5, 'metade de noz', 'metades de noz', SNACK, ['castanha']],
  ['chia', 'Semente de chia', 'gordura', 486, 16.5, 42, 30.7, 34.4, 10, 'colher de sopa', 'colheres de sopa', SNACK, []],
  ['linhaca', 'Linhaça dourada', 'gordura', 495, 14.1, 43.3, 32.3, 33.5, 10, 'colher de sopa', 'colheres de sopa', SNACK, []],
  ['semente_girassol', 'Semente de girassol', 'gordura', 570, 21, 20, 49, 8.6, 10, 'colher de sopa', 'colheres de sopa', SNACK, []],
  ['manteiga', 'Manteiga', 'gordura', 726, 0.4, 0.1, 82.4, 0, 5, 'ponta de faca', 'pontas de faca', ['cafe', 'lanche'], ['animal', 'lactose']],
];

export const FOODS: Food[] = ROWS.map(([key, name, group, kcal, proteinG, carbG, fatG, fiberG, grams, label, plural, meals, tags, wholeUnits]) => ({
  key, name, group, kcal, proteinG, carbG, fatG, fiberG,
  unit: { grams, label, plural },
  wholeUnits: wholeUnits ?? false,
  meals, tags,
}));

export const FOOD_BY_KEY = new Map(FOODS.map((food) => [food.key, food]));

export const FOOD_GROUP_LABELS: Record<FoodGroup, string> = {
  proteina: 'Proteínas', laticinio: 'Laticínios e bebidas', leguminosa: 'Leguminosas',
  carboidrato: 'Carboidratos', fruta: 'Frutas', vegetal: 'Verduras e legumes', gordura: 'Gorduras boas',
};
