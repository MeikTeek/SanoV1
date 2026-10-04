// Gera backend/.env de desenvolvimento com segredos aleatorios validos.
// Uso: node infrastructure/scripts/gen-dev-env.cjs
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const target = path.resolve(__dirname, '..', '..', 'backend', '.env');

if (fs.existsSync(target)) {
  console.log('backend/.env ja existe. Nada foi alterado (apague o arquivo para regerar).');
  process.exit(0);
}

const lines = [
  'NODE_ENV=development',
  'PORT=8080',
  'DATABASE_URL="postgresql://sano:sano_dev_senha@localhost:5432/sano?schema=public"',
  '',
  '# JWT_SECRET: 64 bytes hex',
  'JWT_SECRET=' + crypto.randomBytes(64).toString('hex'),
  '# ENCRYPTION_KEY: 32 bytes hex (usado no AES-256-GCM dos segredos 2FA)',
  'ENCRYPTION_KEY=' + crypto.randomBytes(32).toString('hex'),
  '',
  'FRONTEND_URL=http://localhost:5173',
  'COOKIE_SAMESITE=strict',
  'APP_NAME=Sano',
  '',
  '# Usados apenas pelo seed (primeiro admin)',
  'ADMIN_USERNAME=admin',
  // Aspas sao obrigatorias: sem elas o "#" inicia comentario no dotenv e a
  // senha seria truncada silenciosamente para "TroqueEssaSenha".
  'ADMIN_PASSWORD="TroqueEssaSenha#2026"',
  '',
];

fs.writeFileSync(target, lines.join('\n'));
console.log('backend/.env gerado com segredos aleatorios.');