import type { Exercise } from './exercises';

/**
 * Detalhes de execução, separados do catálogo.
 *
 * Ficam aqui (e não no array principal) para o catálogo continuar legível: o que
 * define o que — prescrito são `equipment`/`contraindicated`/`minutes`; o texto
 * educativo — detalhe de apresentação.
 *
 * `workSeconds`/`restSeconds` alimentam o cronômetro da sequência.
 */
export type Detail = Pick<Exercise, 'muscles' | 'howTo' | 'commonMistake' | 'benefits' | 'workSeconds' | 'restSeconds'>;

export const DETAILS: Record<string, Detail> = {
  // -- Peito ------------------------------------------------
  // -- Peito ------------------------------------------------
  flexao: {
    muscles: 'Peito (peitoral maior), tríceps, deltoide anterior e core.',
    howTo: 'Deitado de bruços, mãos um pouco mais largas que os ombros. Junte as escápulas, estenda os cotovelos e leve o peito perto do chão. Suba empurrando o chão, mantendo o tronco alinhado.',
    commonMistake: 'Afastar os cotovelos demais (a carga vai para os ombros) e deixar o quadril afundar. Mantenha os cotovelos a uns 45 graus do tronco e contraia o abdômen.',
    benefits: 'Base da força de empurrar. — o primeiro movimento que se aprende em qualquer programa de peito.',
    workSeconds: 40, restSeconds: 40,
  },
  flexao_diamante: {
    muscles: 'Peito (parte medial), tríceps e deltoide anterior.',
    howTo: 'Igual — flexão, mas com as mãos juntas formando um losango abaixo do peito. Isso recruta mais o tríceps e a parte medial do peitoral.',
    commonMistake: 'Deixar os cotovelos abrirem para trás, tirando o recrutamento do tríceps. Mantenha-os colados ao corpo.',
    benefits: 'Complementa a flexão comum, mirando a parte mais difícil do peitoral e o tríceps ao mesmo tempo.',
    workSeconds: 30, restSeconds: 45,
  },
  flexao_declaracao: {
    muscles: 'Peito (com menos recrutamento de ombro) e tríceps.',
    howTo: 'Apoie os pés num banco e faça a flexão com o corpo inclinado. A inclinação reduz a carga e facilita a amplitude.',
    commonMistake: 'Colocar o banco longe demais e transformar em flexão normal. Comece com inclinação suave.',
    benefits: 'Progressão segura para iniciantes ou retorno de lesão, e cobre a parte alta do peitoral.',
    workSeconds: 40, restSeconds: 40,
  },
  supino_retrato: {
    muscles: 'Peitoral maior, tríceps e deltoide anterior.',
    howTo: 'Deitado no banco, halteres com as palmas voltadas para os pés. Desça com controle at— o peito na altura do mamilo e empurre para cima.',
    commonMistake: 'Afastar os cotovelos a 90 graus, o que sobrecarrega o ombro. Deixe a uns 45 graus.',
    benefits: 'Principal movimento de força para peito quando há halteres ou academia.',
    workSeconds: 45, restSeconds: 75,
  },
  supino_inclinado: {
    muscles: 'Peitoral maior (parte alta), deltoides e tríceps.',
    howTo: 'Banco inclinado de 30 a 45 graus, halteres na altura do peito. Empurre no topo inclinando levemente o tronco para a frente.',
    commonMistake: 'Inclinar demais, virando um desenvolvimento. 30 a 45 graus — o ponto.',
    benefits: 'Prioriza a parte superior do peitoral, que responde bem — progressão.',
    workSeconds: 45, restSeconds: 75,
  },

  // -- Costas -----------------------------------------------
  barra_fixa: {
    muscles: 'Costas (dorsal largo, romboide), bíceps e core.',
    howTo: 'Segure a barra com as palmas voltadas para você, braços estendidos. Comece puxando o ombro para baixo e o peito em direção — barra.',
    commonMistake: 'Balançar o tronco em vez de puxar com as costas. Comece com elástico nos pés at— dominar.',
    benefits: 'O melhor exercício de costas em peso corporal. A puxada vertical puxa mais dorsal largo.',
    workSeconds: 30, restSeconds: 90,
  },
  puxada_horizontal: {
    muscles: 'Costas (dorsal largo, trapézio médio), bíceps e ombros.',
    howTo: 'Com o elástico na altura do peito, puxe na direção do abdômen com os cotovelos para trás. Tronco levemente inclinado.',
    commonMistake: 'Puxar com os braços — frente do corpo. O gesto tem que ser na horizontal.',
    benefits: 'Treina o dorsal em puxada horizontal, o oposto da barra fixa, cobrindo todas as costas.',
    workSeconds: 35, restSeconds: 60,
  },
  remada_baixa: {
    muscles: 'Costas (dorsal largo, trapézio), bíceps e core.',
    howTo: 'Incline o tronco, haltere pendurado, puxe o cotovelo para trás e para cima at— o tronco ficar paralelo ao chão.',
    commonMistake: 'Arredondar a lombar ao inclinar. Com dor lombar, prefira a puxada horizontal.',
    benefits: 'Excelente para engrossar as costas quando se tem halteres. Complementa a barra fixa.',
    workSeconds: 45, restSeconds: 75,
  },
  superman: {
    muscles: 'Extensores da coluna, glúteos e deltoides posteriores.',
    howTo: 'Deitado de bruços, eleve braços e pernas ao mesmo tempo estendendo o corpo. Pause no topo e desça devagar.',
    commonMistake: 'Subir rápido e descer rápido, o que quase não trabalha. O esforço — na descida.',
    benefits: 'Fortalecimento da lombar em alongamento, útil para quem passa muito tempo sentado.',
    workSeconds: 30, restSeconds: 45,
  },
  prone_y_raise: {
    muscles: 'Trapézio inferior, deltoides posteriores, infraespinado e lombar.',
    howTo: 'Deitado de bruços, abra os braços em Y e eleve-os do chão, mantendo o pescoço comprido.',
    commonMistake: 'Esticar o pescoço para cima. A cabeça continua alinhada com a coluna.',
    benefits: 'Corrige a postura e equilibra o trabalho de puxada com o de empurrar.',
    workSeconds: 30, restSeconds: 45,
  },

  // -- Pernas ------------------------------------------------
  agachamento_livre: {
    muscles: 'Quadríceps, glúteos, adutores e core.',
    howTo: 'Pés na largura dos ombros, pontas levemente abertas. Desça como se fosse sentar, joelhos na linha dos pés, e suba empurrando o chão.',
    commonMistake: 'Joelhos colapsando para dentro e tronco dobrando demais para a frente.',
    benefits: 'O movimento fundamental de inferiores. Com dor no joelho, prefira a caixa.',
    workSeconds: 45, restSeconds: 75,
  },
  agachamento_sumido: {
    muscles: 'Quadríceps, glúteos, adutores e core, com alto estímulo do reto femoral.',
    howTo: 'A partir do agachamento, dá um passo para trás com um pé e volte sem tocar o chão, mantendo o peso na perna da frente.',
    commonMistake: 'Perder o equilíbrio e deixar o joelho da frente passar para dentro.',
    benefits: 'Estímulo alto de quadríceps e glúteos. Exige joelho e lombar íntegros.',
    workSeconds: 40, restSeconds: 60,
  },
  agachamento_caixa: {
    muscles: 'Quadríceps, glúteos e core, com menos carga sobre o joelho.',
    howTo: 'Sente e levante de uma cadeira, com o peso nos calcanhares e o peito ereto. A caixa limita a descida.',
    commonMistake: 'Cair para a frente no final. O tronco deve ficar ereto o tempo todo.',
    benefits: 'A alternativa mais segura para dor no joelho ou para quem está começando. Mesmo padrão de movimento, carga menor.',
    workSeconds: 40, restSeconds: 60,
  },
  agachamento_bulgario: {
    muscles: 'Quadríceps, glúteo médio e core.',
    howTo: 'Pés um pouco mais afastados que a largura dos ombros, pontas para fora. Desça com o tronco ereto e o peso nos calcanhares.',
    commonMistake: 'Juntar os joelhos e perder a postura ereta no final.',
    benefits: 'Carrega bastante glúteo médio, que evita lesão de joelho na corrida e melhora a estabilidade.',
    workSeconds: 45, restSeconds: 75,
  },
  afundo_estatico: {
    muscles: 'Quadríceps, glúteos e equilíbrio, de forma estática e sem impacto.',
    howTo: 'Dá um passo — frente e desça at— o joelho de trás quase tocar o chão. Segure a posição ou faça repetições controladas.',
    commonMistake: 'O joelho da frente passar a linha do pé ou colapsar para dentro.',
    benefits: 'Trabalha perna em carga sem impacto: bom para joelho sensível e para quem evita saltos.',
    workSeconds: 40, restSeconds: 60,
  },
  ponte_gluteo: {
    muscles: 'Glúteo máximo, isquiotibiais e core.',
    howTo: 'Deitado de costas, joelhos flexionados e pés no chão. Eleve o quadril at— formar uma linha reta dos joelhos ao ombro.',
    commonMistake: 'Subir o quadril com a lombar em vez de usar os glúteos.',
    benefits: 'Ativa o glúteo máximo sem carga na coluna: essencial para joelho e lombar.',
    workSeconds: 45, restSeconds: 45,
  },
  elevacao_calf: {
    muscles: 'Panturrilha (gastrocnêmio e sóleo).',
    howTo: 'Em pé, apoiado na ponta dos pés. Suba o calcanhar o máximo e desça devagar, com o joelho estendido.',
    commonMistake: 'Subir rápido e descer batendo o calcanhar. O trabalho está na descida.',
    benefits: 'Completa o treino de pernas e ajuda na força de corrida e no salto.',
    workSeconds: 40, restSeconds: 40,
  },

  // -- Ombros, braços e core ----------------------------------
  desenvolvimento_militar: {
    muscles: 'Deltoide, trapézio e tríceps.',
    howTo: 'Em pé ou sentado, halteres na altura do ombro. Eleve os braços lateralmente at— a altura dos ombros, sem passar disso.',
    commonMistake: 'Subir além da horizontal, o que comprime o manguito rotador.',
    benefits: 'Desenvolvimento lateral do ombro, equilibrando o trabalho de empurrar.',
    workSeconds: 40, restSeconds: 60,
  },
  elevacao_lateral: {
    muscles: 'Deltoide lateral.',
    howTo: 'Halteres ou elástico, cotovelos levemente flexionados. Eleve lateralmente at— a altura do ombro e desça devagar.',
    commonMistake: 'Usar impulso do tronco para compensar o peso. Volume pequeno, controle grande.',
    benefits: 'Trabalha a parte do ombro que quase nenhum movimento de empurrar alcança.',
    workSeconds: 35, restSeconds: 50,
  },
  face_pull: {
    muscles: 'Deltoide posterior, trapézio e infraespinado.',
    howTo: 'Elástico na altura do rosto, puxe em direção ao rosto abrindo as mãos no final, como se abraçasse.',
    commonMistake: 'Puxar muito alto. O alvo — a parte de trás do ombro.',
    benefits: 'O melhor preventivo de ombro para quem faz muito empurrar ou digita.',
    workSeconds: 40, restSeconds: 45,
  },
  triceps_cabo: {
    muscles: 'Tríceps, com foco na cabeça longa.',
    howTo: 'Elástico ou corda, cotovelos junto ao corpo e fixos. Estenda o cotovelo at— o braço ficar reto.',
    commonMistake: 'Deixar o cotovelo andar para fora: o trabalho migra para os ombros.',
    benefits: 'Isola o tríceps e libera o ombro, complemento das flexões.',
    workSeconds: 40, restSeconds: 50,
  },
  triceps_bench: {
    muscles: 'Tríceps e parte medial do peitoral.',
    howTo: 'Apoie as mãos num banco atrás do corpo, com o quadril — frente. Flexione o cotovelo descendo o corpo e volte.',
    commonMistake: 'Deixar os ombros afundarem para a frente.',
    benefits: 'Tríceps em peso corporal, com alongamento maior que o no cabo.',
    workSeconds: 40, restSeconds: 50,
  },
  curl_mao: {
    muscles: 'Bíceps, braquial e antebraço.',
    howTo: 'Em pé, halteres ou peso corporal. Flexione o cotovelo levando a mão ao ombro, com o cotovelo colado ao corpo.',
    commonMistake: 'Balançar o tronco para levantar o peso.',
    benefits: 'Bíceps em geral, importante para equilibrar quem treina costas.',
    workSeconds: 40, restSeconds: 50,
  },
  rosca_direta: {
    muscles: 'Bíceps braquial e braquial anterior.',
    howTo: 'Em pé, segure a barra ou os halteres com as palmas para a frente. Flexione os cotovelos sem mover os braços e desça a carga devagar.',
    commonMistake: 'Balançar o tronco ou levar os cotovelos para a frente para ajudar a subir a carga.',
    benefits: 'Movimento básico para desenvolver força e volume dos flexores do cotovelo.',
    workSeconds: 40, restSeconds: 60,
  },
  rosca_martelo: {
    muscles: 'Braquial, braquiorradial e bíceps.',
    howTo: 'Segure os halteres com as palmas voltadas uma para a outra. Flexione os cotovelos mantendo essa posição e retorne com controle.',
    commonMistake: 'Girar os punhos ou balançar os cotovelos durante a repetição.',
    benefits: 'Fortalece braços e antebraços com pegada neutra.',
    workSeconds: 40, restSeconds: 60,
  },
  extensao_triceps: {
    muscles: 'Tríceps braquial.',
    howTo: 'Com o braço acima da cabeça ou junto ao tronco, flexione o cotovelo e estenda-o contraindo o tríceps. Use amplitude confortável.',
    commonMistake: 'Abrir os cotovelos ou arquear a lombar para compensar a carga.',
    benefits: 'Complementa os movimentos de empurrar com trabalho direto de tríceps.',
    workSeconds: 40, restSeconds: 60,
  },
  stiff_romeno: {
    muscles: 'Posterior da coxa, glúteos e eretores da coluna.',
    howTo: 'Com joelhos levemente flexionados, leve o quadril para trás e desça a carga junto às pernas. Suba estendendo o quadril sem arredondar as costas.',
    commonMistake: 'Arredondar a lombar ou transformar o movimento em agachamento.',
    benefits: 'Treina a cadeia posterior com controle de quadril e tensão muscular.',
    workSeconds: 45, restSeconds: 90,
  },
  mesa_flexora: {
    muscles: 'Isquiotibiais e panturrilhas.',
    howTo: 'Ajuste a máquina, alinhe os joelhos ao eixo e flexione as pernas contra a resistência. Retorne devagar sem soltar a carga.',
    commonMistake: 'Usar impulso ou encurtar o movimento por excesso de carga.',
    benefits: 'Isola a flexão dos joelhos para fortalecer a parte posterior das pernas.',
    workSeconds: 40, restSeconds: 60,
  },
  prancha: {
    muscles: 'Core inteiro: transverso, reto abdominal e oblíquos.',
    howTo: 'Apoie os cotovelos sob os ombros, pernas estendidas. Eleve o quadril at— formar uma linha reta e segure.',
    commonMistake: 'Afundar o quadril e arquear a lombar. A linha tem que ser reta.',
    benefits: 'Estabiliza o tronco, o que protege a lombar em todos os outros exercícios.',
    workSeconds: 45, restSeconds: 45,
  },
  hollow_hold: {
    muscles: 'Reto abdominal e flexores do quadril.',
    howTo: 'Deitado de costas, eleve ombros e pernas do chão mantendo a lombar colada. Segure.',
    commonMistake: 'Deixar a lombar arqueiar at— tocar o chão. Reduza a elevação das pernas.',
    benefits: 'Core profundo, muito usado em condicionamento e prevenção de lesão lombar.',
    workSeconds: 30, restSeconds: 45,
  },
  dead_bug: {
    muscles: 'Transverso abdominal, reto abdominal e quadríceps (isométrico).',
    howTo: 'Deitado de costas, braços ao teto e joelhos a 90 graus. Estenda um braço e a perna opostos, com a lombar no chão.',
    commonMistake: 'Deixar o quadril girar junto com a perna.',
    benefits: 'O melhor trabalho de core sem carga na coluna: seguro mesmo com dor lombar.',
    workSeconds: 40, restSeconds: 40,
  },
  leg_raise: {
    muscles: 'Reto abdominal e flexores do quadril.',
    howTo: 'Deitado de costas, pernas estendidas no chão. Eleve as pernas at— 90 graus e desça controlando, sem tocar o chão.',
    commonMistake: 'Deixar a lombar arqueear na descida. Se perder a técnica, reduza a amplitude.',
    benefits: 'Core alto com pouco impacto, bom para joelho sensível.',
    workSeconds: 35, restSeconds: 45,
  },
// -- Cardio e mobilidade ------------------------------------
  caminhada: {
    muscles: 'Cardio de baixo impacto: resistência geral, panturrilhas e quadril.',
    howTo: 'Caminhe num ritmo em que você consiga falar, mas não cantar. Sustentar por todo o bloco.',
    commonMistake: 'Caminhar devagar demais para gerar estímulo, ou rápido demais para durar.',
    benefits: 'Cardio sem impacto: a opção mais segura para joelho e para quem está voltando a treinar.',
    workSeconds: 300, restSeconds: 60,
  },
  corrida_esteira: {
    muscles: 'Cardio: quadríceps, panturrilhas e sistema cardiovascular.',
    howTo: 'Incline levemente o tronco, passos curtos e cadência alta. Não segure nos corrimões.',
    commonMistake: 'Pisar com o calcanhar muito — frente, o que aumenta o impacto no joelho.',
    benefits: 'Alto gasto calórico em pouco tempo, com intensidade controlada pela máquina.',
    workSeconds: 240, restSeconds: 90,
  },
  pulo_corda: {
    muscles: 'Cardio, panturrilhas, coordenação e condicionamento geral.',
    howTo: 'Pule com os pés juntos, girando apenas com os punhos. Faça blocos curtos se precisar.',
    commonMistake: 'Saltar alto demais. O que vale — a frequência, não a altura.',
    benefits: 'Alto gasto calórico em pouco espaço e tempo: ótimo para emagrecimento.',
    workSeconds: 45, restSeconds: 45,
  },
  mountain_climber: {
    muscles: 'Core, ombros, quadril e cardio.',
    howTo: 'Em posição de prancha, alterne os joelhos em direção ao peito, mantendo o quadril estável.',
    commonMistake: 'Deixar o quadril subir e descer junto com o movimento.',
    benefits: 'Cardio intenso sem salto: não sobrecarrega o joelho.',
    workSeconds: 40, restSeconds: 40,
  },
  burpee: {
    muscles: 'Corpo inteiro: peito, pernas, core e cardio.',
    howTo: 'Agache, apoie as mãos, salte os pés para trás, faça uma flexão, volte ao agachamento e levante.',
    commonMistake: 'Fazer a flexão com as costas rígidas e baixas. — onde a técnica mais importa.',
    benefits: 'O exercício de condicionamento mais completo que existe. Exige joelho e punho íntegros.',
    workSeconds: 40, restSeconds: 60,
  },
  bike_estatica: {
    muscles: 'Cardio de baixo impacto: quadríceps, glúteos e panturrilhas.',
    howTo: 'Sente ereto e pedale em ritmo constante, com resistência moderada. Ajuste a altura do banco.',
    commonMistake: 'Assento baixo demais, o que sobrecarrega o joelho.',
    benefits: 'Cardio sem impacto e sem limite de distância: excelente para joelho sensível.',
    workSeconds: 300, restSeconds: 60,
  },
  gato_camelo: {
    muscles: 'Coluna, glúteos e musculatura do core.',
    howTo: 'De quatro apoios, arqueie as costas olhando para cima e depois arredonde olhando para o umbigo. Devagar.',
    commonMistake: 'Mover rápido demais e transformar em exercício de flexão.',
    benefits: 'Mobilidade da coluna e alívio de dor lombar postural.',
    workSeconds: 60, restSeconds: 30,
  },
  bird_dog: {
    muscles: 'Core profundo, glúteos, multifidus e coluna.',
    howTo: 'De quatro apoios, estenda um braço e a perna opostos at— ficarem na horizontal, volte e alterne.',
    commonMistake: 'Levantar a perna só um pouco e rodar o quadril.',
    benefits: 'Estabiliza a coluna e treina o core sem compressão: seguro para dor lombar.',
    workSeconds: 50, restSeconds: 40,
  },
  stretch_hamstring: {
    muscles: 'isquiotibiais e panturrilha.',
    howTo: 'Em pé, apoie o calcanhar num apoio — frente com o joelho estendido. Puxe o quadril para trás.',
    commonMistake: 'Curvar o joelho para forçar. O alongamento tem que ser no posterior da coxa.',
    benefits: 'Previne lesão na corrida e melhora a amplitude de todos os exercícios de perna.',
    workSeconds: 60, restSeconds: 20,
  },
  rotacao_externa_elastico: {
    muscles: 'Manguito rotador e deltoide posterior.',
    howTo: 'Cotovelo colado ao corpo a 90 graus, segurando o elástico. Gire o antebraço para fora sem separar o cotovelo.',
    commonMistake: 'Afastar o cotovelo do corpo: até deixa de ser rotação externa.',
    benefits: 'Prevenção de lesão de ombro, essencial para quem treina peito e ombro pesado.',
    workSeconds: 45, restSeconds: 45,
  },
  elevacao_ombro_elastico: {
    muscles: 'Deltoide, trapézio e mobilidade de ombro.',
    howTo: 'Segure o elástico mais largo que os ombros. Eleve os braços em Y at— a altura dos olhos, devagar.',
    commonMistake: 'Subir apenas at— a altura do ombro e perder amplitude.',
    benefits: 'Aquece o ombro antes de treinar e melhora a postura.',
    workSeconds: 40, restSeconds: 40,
  },
};

/** Detalhe completo de um exercício, já com valores padrão quando não mapeado. */
export function fullDetail(e: Exercise) {
  const d = DETAILS[e.key];
  return {
    muscles: d?.muscles ?? 'Não mapeado.',
    howTo: d?.howTo ?? 'Execute com controle e amplitude completa.',
    commonMistake: d?.commonMistake ?? 'Sem erro comum mapeado para este exercício.',
    benefits: d?.benefits ?? '',
    workSeconds: d?.workSeconds ?? 40,
    restSeconds: d?.restSeconds ?? 45,
  };
}