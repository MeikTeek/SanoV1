import app from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';

// Hospedagens de processo único (Discloud, Heroku, ...) injetam a porta por
// variável de ambiente; em desenvolvimento vale 8080. `env.PORT` já faz o
// coalescer do valor string para número.
const server = app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`🚀 Sano rodando na porta ${env.PORT} (${env.NODE_ENV})`);
});

// A hospedagem pode repor o container a qualquer momento; sair limpo evita
// conexões presas no banco.
const shutdown = async () => {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
