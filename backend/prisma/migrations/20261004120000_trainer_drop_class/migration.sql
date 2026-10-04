-- A coluna className era puramente decorativa e ambígua ("Monarca", "Guerreiro").
-- Removida: o usuário escolhe agora um OBJETIVO com efeito descrito, e é o goal
-- que o motor de regras realmente usa.
ALTER TABLE "TrainingProfile" DROP COLUMN "className";