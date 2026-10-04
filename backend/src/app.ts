import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import routes from './routes';
import { globalLimiter, originCheck } from './middleware/security';
import { errorHandler } from './middleware/errorHandler';
import { serveFrontend } from './static';

const app = express();

app.set('trust proxy', 1); // atrás do proxy da hospedagem (IP real nos logs/rate limit)
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(globalLimiter);
// O avatar chega como data URL no corpo: essa rota precisa de uma janela maior.
// Fica ANTES do parser padrão para ser quem faz o parse desse corpo.
app.use('/api/profile/avatar', express.json({ limit: '1mb' }));
// Mensagens do bate-papo carregam imagem/áudio já cifrados (base64). 4 MB
// cobrem o envelope de mídia + a cópia por participante de um grupo pequeno.
app.use('/api/chat/conversations', express.json({ limit: '4mb' }));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
app.use(originCheck);

app.use('/api', routes);

// API inexistente responde 404 em JSON — ANTES do fallback da SPA, senão
// `/api/foo` receberia o index.html e o cliente receberia HTML onde esperava JSON.
app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

// `serveFrontend` entrega o build do Vite e o index.html das rotas da SPA.
// Precisa vir depois das rotas da API: é o que sobrou (navegação do site).
serveFrontend(app);

app.use(errorHandler);

export default app;
