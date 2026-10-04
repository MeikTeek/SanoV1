import type { Exercise } from './exercises';

/**
 * Detalhes de execu��o, separados do cat�logo.
 *
 * Ficam aqui (e n�o no array principal) para o cat�logo continuar leg�vel: o que
 * define o que � prescrito s�o `equipment`/`contraindicated`/`minutes`; o texto
 * educativo � detalhe de apresenta��o.
 *
 * `workSeconds`/`restSeconds` alimentam o cron�metro da sequ�ncia.
 */
export type Detail = Pick<Exercise, 'muscles' | 'howTo' | 'commonMistake' | 'benefits' | 'workSeconds' | 'restSeconds'>;

export const DETAILS: Record<string, Detail> = {
  // -- Peito ------------------------------------------------
  // -- Peito ------------------------------------------------
  flexao: {
    muscles: 'Peito (peitoral maior), tr�ceps, deltoide anterior e core.',
    howTo: 'Deitado de bru�os, m�os um pouco mais largas que os ombros. Junte as esc�pulas, estenda os cotovelos e leve o peito perto do ch�o. Suba empurrando o ch�o, mantendo o tronco alinhado.',
    commonMistake: 'Afastar os cotovelos demais (a carga vai para os ombros) e deixar o quadril afundar. Mantenha os cotovelos a uns 45 graus do tronco e contraia o abd�men.',
    benefits: 'Base da for�a de empurrar. � o primeiro movimento que se aprende em qualquer programa de peito.',
    workSeconds: 40, restSeconds: 40,
  },
  flexao_diamante: {
    muscles: 'Peito (parte medial), tr�ceps e deltoide anterior.',
    howTo: 'Igual � flex�o, mas com as m�os juntas formando um losango abaixo do peito. Isso recruta mais o tr�ceps e a parte medial do peitoral.',
    commonMistake: 'Deixar os cotovelos abrirem para tr�s, tirando o recrutamento do tr�ceps. Mantenha-os colados ao corpo.',
    benefits: 'Complementa a flex�o comum, mirando a parte mais dif�cil do peitoral e o tr�ceps ao mesmo tempo.',
    workSeconds: 30, restSeconds: 45,
  },
  flexao_declaracao: {
    muscles: 'Peito (com menos recrutamento de ombro) e tr�ceps.',
    howTo: 'Apoie os p�s num banco e fa�a a flex�o com o corpo inclinado. A inclina��o reduz a carga e facilita a amplitude.',
    commonMistake: 'Colocar o banco longe demais e transformar em flex�o normal. Comece com inclina��o suave.',
    benefits: 'Progress�o segura para iniciantes ou retorno de les�o, e cobre a parte alta do peitoral.',
    workSeconds: 40, restSeconds: 40,
  },
  supino_retrato: {
    muscles: 'Peitoral maior, tr�ceps e deltoide anterior.',
    howTo: 'Deitado no banco, halteres com as palmas voltadas para os p�s. Des�a com controle at� o peito na altura do mamilo e empurre para cima.',
    commonMistake: 'Afastar os cotovelos a 90 graus, o que sobrecarrega o ombro. Deixe a uns 45 graus.',
    benefits: 'Principal movimento de for�a para peito quando h� halteres ou academia.',
    workSeconds: 45, restSeconds: 75,
  },
  supino_inclinado: {
    muscles: 'Peitoral maior (parte alta), deltoides e tr�ceps.',
    howTo: 'Banco inclinado de 30 a 45 graus, halteres na altura do peito. Empurre no topo inclinando levemente o tronco para a frente.',
    commonMistake: 'Inclinar demais, virando um desenvolvimento. 30 a 45 graus � o ponto.',
    benefits: 'Prioriza a parte superior do peitoral, que responde bem � progress�o.',
    workSeconds: 45, restSeconds: 75,
  },

  // -- Costas -----------------------------------------------
  barra_fixa: {
    muscles: 'Costas (dorsal largo, romboide), b�ceps e core.',
    howTo: 'Segure a barra com as palmas voltadas para voc�, bra�os estendidos. Comece puxando o ombro para baixo e o peito em dire��o � barra.',
    commonMistake: 'Balan�ar o tronco em vez de puxar com as costas. Comece com el�stico nos p�s at� dominar.',
    benefits: 'O melhor exerc�cio de costas em peso corporal. A puxada vertical puxa mais dorsal largo.',
    workSeconds: 30, restSeconds: 90,
  },
  puxada_horizontal: {
    muscles: 'Costas (dorsal largo, trap�zio m�dio), b�ceps e ombros.',
    howTo: 'Com o el�stico na altura do peito, puxe na dire��o do abd�men com os cotovelos para tr�s. Tronco levemente inclinado.',
    commonMistake: 'Puxar com os bra�os � frente do corpo. O gesto tem que ser na horizontal.',
    benefits: 'Treina o dorsal em puxada horizontal, o oposto da barra fixa, cobrindo todas as costas.',
    workSeconds: 35, restSeconds: 60,
  },
  remada_baixa: {
    muscles: 'Costas (dorsal largo, trap�zio), b�ceps e core.',
    howTo: 'Incline o tronco, haltere pendurado, puxe o cotovelo para tr�s e para cima at� o tronco ficar paralelo ao ch�o.',
    commonMistake: 'Arredondar a lombar ao inclinar. Com dor lombar, prefira a puxada horizontal.',
    benefits: 'Excelente para engrossar as costas quando se tem halteres. Complementa a barra fixa.',
    workSeconds: 45, restSeconds: 75,
  },
  superman: {
    muscles: 'Extensores da coluna, gl�teos e deltoides posteriores.',
    howTo: 'Deitado de bru�os, eleve bra�os e pernas ao mesmo tempo estendendo o corpo. Pause no topo e des�a devagar.',
    commonMistake: 'Subir r�pido e descer r�pido, o que quase n�o trabalha. O esfor�o � na descida.',
    benefits: 'Fortalecimento da lombar em alongamento, �til para quem passa muito tempo sentado.',
    workSeconds: 30, restSeconds: 45,
  },
  prone_y_raise: {
    muscles: 'Trap�zio inferior, deltoides posteriores, infraespinado e lombar.',
    howTo: 'Deitado de bru�os, abra os bra�os em Y e eleve-os do ch�o, mantendo o pesco�o comprido.',
    commonMistake: 'Esticar o pesco�o para cima. A cabe�a continua alinhada com a coluna.',
    benefits: 'Corrige a postura e equilibra o trabalho de puxada com o de empurrar.',
    workSeconds: 30, restSeconds: 45,
  },

  // -- Pernas ------------------------------------------------
  agachamento_livre: {
    muscles: 'Quadr�ceps, gl�teos, adutores e core.',
    howTo: 'P�s na largura dos ombros, pontas levemente abertas. Des�a como se fosse sentar, joelhos na linha dos p�s, e suba empurrando o ch�o.',
    commonMistake: 'Joelhos colapsando para dentro e tronco dobrando demais para a frente.',
    benefits: 'O movimento fundamental de inferiores. Com dor no joelho, prefira a caixa.',
    workSeconds: 45, restSeconds: 75,
  },
  agachamento_sumido: {
    muscles: 'Quadr�ceps, gl�teos, adutores e core, com alto est�mulo do reto femoral.',
    howTo: 'A partir do agachamento, d� um passo para tr�s com um p� e volte sem tocar o ch�o, mantendo o peso na perna da frente.',
    commonMistake: 'Perder o equil�brio e deixar o joelho da frente passar para dentro.',
    benefits: 'Est�mulo alto de quadr�ceps e gl�teos. Exige joelho e lombar �ntegros.',
    workSeconds: 40, restSeconds: 60,
  },
  agachamento_caixa: {
    muscles: 'Quadr�ceps, gl�teos e core, com menos carga sobre o joelho.',
    howTo: 'Sente e levante de uma cadeira, com o peso nos calcanhares e o peito ereto. A caixa limita a descida.',
    commonMistake: 'Cair para a frente no final. O tronco deve ficar ereto o tempo todo.',
    benefits: 'A alternativa mais segura para dor no joelho ou para quem est� come�ando. Mesmo padr�o de movimento, carga menor.',
    workSeconds: 40, restSeconds: 60,
  },
  agachamento_bulgario: {
    muscles: 'Quadr�ceps, gl�teo m�dio e core.',
    howTo: 'P�s um pouco mais afastados que a largura dos ombros, pontas para fora. Des�a com o tronco ereto e o peso nos calcanhares.',
    commonMistake: 'Juntar os joelhos e perder a postura ereta no final.',
    benefits: 'Carrega bastante gl�teo m�dio, que evita les�o de joelho na corrida e melhora a estabilidade.',
    workSeconds: 45, restSeconds: 75,
  },
  afundo_estatico: {
    muscles: 'Quadr�ceps, gl�teos e equil�brio, de forma est�tica e sem impacto.',
    howTo: 'D� um passo � frente e des�a at� o joelho de tr�s quase tocar o ch�o. Segure a posi��o ou fa�a repeti��es controladas.',
    commonMistake: 'O joelho da frente passar a linha do p� ou colapsar para dentro.',
    benefits: 'Trabalha perna em carga sem impacto: bom para joelho sens�vel e para quem evita saltos.',
    workSeconds: 40, restSeconds: 60,
  },
  ponte_gluteo: {
    muscles: 'Gl�teo m�ximo, isquiotibiais e core.',
    howTo: 'Deitado de costas, joelhos flexionados e p�s no ch�o. Eleve o quadril at� formar uma linha reta dos joelhos ao ombro.',
    commonMistake: 'Subir o quadril com a lombar em vez de usar os gl�teos.',
    benefits: 'Ativa o gl�teo m�ximo sem carga na coluna: essencial para joelho e lombar.',
    workSeconds: 45, restSeconds: 45,
  },
  elevacao_calf: {
    muscles: 'Panturrilha (gastrocn�mio e s�leo).',
    howTo: 'Em p�, apoiado na ponta dos p�s. Suba o calcanhar o m�ximo e des�a devagar, com o joelho estendido.',
    commonMistake: 'Subir r�pido e descer batendo o calcanhar. O trabalho est� na descida.',
    benefits: 'Completa o treino de pernas e ajuda na for�a de corrida e no salto.',
    workSeconds: 40, restSeconds: 40,
  },

  // -- Ombros, bra�os e core ----------------------------------
  desenvolvimento_militar: {
    muscles: 'Deltoide, trap�zio e tr�ceps.',
    howTo: 'Em p� ou sentado, halteres na altura do ombro. Eleve os bra�os lateralmente at� a altura dos ombros, sem passar disso.',
    commonMistake: 'Subir al�m da horizontal, o que comprime o manguito rotador.',
    benefits: 'Desenvolvimento lateral do ombro, equilibrando o trabalho de empurrar.',
    workSeconds: 40, restSeconds: 60,
  },
  elevacao_lateral: {
    muscles: 'Deltoide lateral.',
    howTo: 'Halteres ou el�stico, cotovelos levemente flexionados. Eleve lateralmente at� a altura do ombro e des�a devagar.',
    commonMistake: 'Usar impulso do tronco para compensar o peso. Volume pequeno, controle grande.',
    benefits: 'Trabalha a parte do ombro que quase nenhum movimento de empurrar alcan�a.',
    workSeconds: 35, restSeconds: 50,
  },
  face_pull: {
    muscles: 'Deltoide posterior, trap�zio e infraespinado.',
    howTo: 'El�stico na altura do rosto, puxe em dire��o ao rosto abrindo as m�os no final, como se abra�asse.',
    commonMistake: 'Puxar muito alto. O alvo � a parte de tr�s do ombro.',
    benefits: 'O melhor preventivo de ombro para quem faz muito empurrar ou digita.',
    workSeconds: 40, restSeconds: 45,
  },
  triceps_cabo: {
    muscles: 'Tr�ceps, com foco na cabe�a longa.',
    howTo: 'El�stico ou corda, cotovelos junto ao corpo e fixos. Estenda o cotovelo at� o bra�o ficar reto.',
    commonMistake: 'Deixar o cotovelo andar para fora: o trabalho migra para os ombros.',
    benefits: 'Isola o tr�ceps e libera o ombro, complemento das flex�es.',
    workSeconds: 40, restSeconds: 50,
  },
  triceps_bench: {
    muscles: 'Tr�ceps e parte medial do peitoral.',
    howTo: 'Apoie as m�os num banco atr�s do corpo, com o quadril � frente. Flexione o cotovelo descendo o corpo e volte.',
    commonMistake: 'Deixar os ombros afundarem para a frente.',
    benefits: 'Tr�ceps em peso corporal, com alongamento maior que o no cabo.',
    workSeconds: 40, restSeconds: 50,
  },
  curl_mao: {
    muscles: 'B�ceps, braquial e antebra�o.',
    howTo: 'Em p�, halteres ou peso corporal. Flexione o cotovelo levando a m�o ao ombro, com o cotovelo colado ao corpo.',
    commonMistake: 'Balan�ar o tronco para levantar o peso.',
    benefits: 'B�ceps em geral, importante para equilibrar quem treina costas.',
    workSeconds: 40, restSeconds: 50,
  },
  prancha: {
    muscles: 'Core inteiro: transverso, reto abdominal e obl�quos.',
    howTo: 'Apoie os cotovelos sob os ombros, pernas estendidas. Eleve o quadril at� formar uma linha reta e segure.',
    commonMistake: 'Afundar o quadril e arquear a lombar. A linha tem que ser reta.',
    benefits: 'Estabiliza o tronco, o que protege a lombar em todos os outros exerc�cios.',
    workSeconds: 45, restSeconds: 45,
  },
  hollow_hold: {
    muscles: 'Reto abdominal e flexores do quadril.',
    howTo: 'Deitado de costas, eleve ombros e pernas do ch�o mantendo a lombar colada. Segure.',
    commonMistake: 'Deixar a lombar arqueiar at� tocar o ch�o. Reduza a eleva��o das pernas.',
    benefits: 'Core profundo, muito usado em condicionamento e preven��o de les�o lombar.',
    workSeconds: 30, restSeconds: 45,
  },
  dead_bug: {
    muscles: 'Transverso abdominal, reto abdominal e quadr�ceps (isom�trico).',
    howTo: 'Deitado de costas, bra�os ao teto e joelhos a 90 graus. Estenda um bra�o e a perna opostos, com a lombar no ch�o.',
    commonMistake: 'Deixar o quadril girar junto com a perna.',
    benefits: 'O melhor trabalho de core sem carga na coluna: seguro mesmo com dor lombar.',
    workSeconds: 40, restSeconds: 40,
  },
  leg_raise: {
    muscles: 'Reto abdominal e flexores do quadril.',
    howTo: 'Deitado de costas, pernas estendidas no ch�o. Eleve as pernas at� 90 graus e des�a controlando, sem tocar o ch�o.',
    commonMistake: 'Deixar a lombar arqueear na descida. Se perder a t�cnica, reduza a amplitude.',
    benefits: 'Core alto com pouco impacto, bom para joelho sens�vel.',
    workSeconds: 35, restSeconds: 45,
  },
// -- Cardio e mobilidade ------------------------------------
  caminhada: {
    muscles: 'Cardio de baixo impacto: resist�ncia geral, panturrilhas e quadril.',
    howTo: 'Caminhe num ritmo em que voc� consiga falar, mas n�o cantar. Sustentar por todo o bloco.',
    commonMistake: 'Caminhar devagar demais para gerar est�mulo, ou r�pido demais para durar.',
    benefits: 'Cardio sem impacto: a op��o mais segura para joelho e para quem est� voltando a treinar.',
    workSeconds: 300, restSeconds: 60,
  },
  corrida_esteira: {
    muscles: 'Cardio: quadr�ceps, panturrilhas e sistema cardiovascular.',
    howTo: 'Incline levemente o tronco, passos curtos e cad�ncia alta. N�o segure nos corrim�es.',
    commonMistake: 'Pisar com o calcanhar muito � frente, o que aumenta o impacto no joelho.',
    benefits: 'Alto gasto cal�rico em pouco tempo, com intensidade controlada pela m�quina.',
    workSeconds: 240, restSeconds: 90,
  },
  pulo_corda: {
    muscles: 'Cardio, panturrilhas, coordena��o e condicionamento geral.',
    howTo: 'Pule com os p�s juntos, girando apenas com os punhos. Fa�a blocos curtos se precisar.',
    commonMistake: 'Saltar alto demais. O que vale � a frequ�ncia, n�o a altura.',
    benefits: 'Alto gasto cal�rico em pouco espa�o e tempo: �timo para emagrecimento.',
    workSeconds: 45, restSeconds: 45,
  },
  mountain_climber: {
    muscles: 'Core, ombros, quadril e cardio.',
    howTo: 'Em posi��o de prancha, alterne os joelhos em dire��o ao peito, mantendo o quadril est�vel.',
    commonMistake: 'Deixar o quadril subir e descer junto com o movimento.',
    benefits: 'Cardio intenso sem salto: n�o sobrecarrega o joelho.',
    workSeconds: 40, restSeconds: 40,
  },
  burpee: {
    muscles: 'Corpo inteiro: peito, pernas, core e cardio.',
    howTo: 'Agache, apoie as m�os, salte os p�s para tr�s, fa�a uma flex�o, volte ao agachamento e levante.',
    commonMistake: 'Fazer a flex�o com as costas r�gidas e baixas. � onde a t�cnica mais importa.',
    benefits: 'O exerc�cio de condicionamento mais completo que existe. Exige joelho e punho �ntegros.',
    workSeconds: 40, restSeconds: 60,
  },
  bike_estatica: {
    muscles: 'Cardio de baixo impacto: quadr�ceps, gl�teos e panturrilhas.',
    howTo: 'Sente ereto e pedale em ritmo constante, com resist�ncia moderada. Ajuste a altura do banco.',
    commonMistake: 'Assento baixo demais, o que sobrecarrega o joelho.',
    benefits: 'Cardio sem impacto e sem limite de dist�ncia: excelente para joelho sens�vel.',
    workSeconds: 300, restSeconds: 60,
  },
  gato_camelo: {
    muscles: 'Coluna, gl�teos e musculatura do core.',
    howTo: 'De quatro apoios, arqueie as costas olhando para cima e depois arredonde olhando para o umbigo. Devagar.',
    commonMistake: 'Mover r�pido demais e transformar em exerc�cio de flex�o.',
    benefits: 'Mobilidade da coluna e al�vio de dor lombar postural.',
    workSeconds: 60, restSeconds: 30,
  },
  bird_dog: {
    muscles: 'Core profundo, gl�teos, multifidus e coluna.',
    howTo: 'De quatro apoios, estenda um bra�o e a perna opostos at� ficarem na horizontal, volte e alterne.',
    commonMistake: 'Levantar a perna s� um pouco e rodar o quadril.',
    benefits: 'Estabiliza a coluna e treina o core sem compress�o: seguro para dor lombar.',
    workSeconds: 50, restSeconds: 40,
  },
  stretch_hamstring: {
    muscles: '�squiotibiais e panturrilha.',
    howTo: 'Em p�, apoie o calcanhar num apoio � frente com o joelho estendido. Puxe o quadril para tr�s.',
    commonMistake: 'Curvar o joelho para for�ar. O alongamento tem que ser no posterior da coxa.',
    benefits: 'Previne les�o na corrida e melhora a amplitude de todos os exerc�cios de perna.',
    workSeconds: 60, restSeconds: 20,
  },
  rotacao_externa_elastico: {
    muscles: 'Manguito rotador e deltoide posterior.',
    howTo: 'Cotovelo colado ao corpo a 90 graus, segurando o el�stico. Gire o antebra�o para fora sem separar o cotovelo.',
    commonMistake: 'Afastar o cotovelo do corpo: a� deixa de ser rota��o externa.',
    benefits: 'Preven��o de les�o de ombro, essencial para quem treina peito e ombro pesado.',
    workSeconds: 45, restSeconds: 45,
  },
  elevacao_ombro_elastico: {
    muscles: 'Deltoide, trap�zio e mobilidade de ombro.',
    howTo: 'Segure o el�stico mais largo que os ombros. Eleve os bra�os em Y at� a altura dos olhos, devagar.',
    commonMistake: 'Subir apenas at� a altura do ombro e perder amplitude.',
    benefits: 'Aquece o ombro antes de treinar e melhora a postura.',
    workSeconds: 40, restSeconds: 40,
  },
};

/** Detalhe completo de um exerc�cio, j� com valores padr�o quando n�o mapeado. */
export function fullDetail(e: Exercise) {
  const d = DETAILS[e.key];
  return {
    muscles: d?.muscles ?? 'N�o mapeado.',
    howTo: d?.howTo ?? 'Execute com controle e amplitude completa.',
    commonMistake: d?.commonMistake ?? 'Sem erro comum mapeado para este exerc�cio.',
    benefits: d?.benefits ?? '',
    workSeconds: d?.workSeconds ?? 40,
    restSeconds: d?.restSeconds ?? 45,
  };
}