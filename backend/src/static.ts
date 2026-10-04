/**
 * Entrega o frontend buildado a partir do próprio Express.
 *
 * Por que isso existe: em desenvolvimento o Vite (porta 5173) serve o site e
 * faz proxy de `/api`. Em produção sobre hospedagem de **processo único** (como
 * a Discloud) não existe nginx na frente — o Express precisa servir também o
 * `index.html` e os assets.
 *
 * Servir os dois na MESMA origem é o que mantém os cookies `SameSite=strict`
 * funcionando: o navegador nunca faz cross-site.
 */
import express, { type Express } from 'express';
import fs from 'fs';
import path from 'path';

const DIST = path.resolve(__dirname, '../../frontend/dist');
const INDEX = path.join(DIST, 'index.html');

/** Monta as rotas estáticas no app. Silencioso se o build ainda não existir. */
export function serveFrontend(app: Express) {
  if (!fs.existsSync(INDEX)) {
    // Em desenvolvimento (`npm run dev`) quem serve o site é o Vite — normal.
    console.warn('[static] frontend/dist não encontrado; apenas a API será servida.');
    return;
  }

  console.log(`[static] servindo frontend de ${DIST}`);

  // Assets têm hash no nome (index-Df1q6fE.js): podem ficar em cache longo.
  app.use('/assets', express.static(path.join(DIST, 'assets'), {
    immutable: true,
    maxAge: '1y',
  }));

  app.use(express.static(DIST, { index: false, maxAge: '7d' }));

  // Fallback da SPA: /mensagens, /perfil/joao etc. são rotas do React Router e
  // não existem como arquivo — precisam voltar ao index.html.
  // No Express 5 o wildcard de string `'*'` foi removido do path-to-regexp.
  // A forma suportada agora é um RegExp — `.*` casa qualquer caminho de GET.
  app.get(/.*/, (_req, res) => res.sendFile(INDEX));
}