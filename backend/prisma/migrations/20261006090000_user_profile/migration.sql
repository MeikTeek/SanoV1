-- Perfil pessoal: nome de exibição (trocável a cada 60 dias) e avatar em data URL.
-- Colunas opcionais e sem backfill: quem já existe continua funcionando e cai
-- no username / sem foto.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "nameChangedAt" TIMESTAMP(3),
ADD COLUMN     "avatarDataUrl" TEXT;