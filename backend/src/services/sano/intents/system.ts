/**
 * Comandos do computador (abrir programas e pastas, bloquear, desligar).
 *
 * Quem executa é o app Sano para Windows, que intercepta a frase antes de ela
 * chegar aqui. Se a frase chegou ao servidor, o usuário está no navegador (ou
 * no celular): a resposta só explica isso. O servidor nunca executa nada.
 */
import type { Intent } from '../types';

const LOCK_POWER = /^(?:bloquear|bloqueia|bloqueie|trancar|tranca|desligar|desliga|desligue|reiniciar|reinicia|reinicie)\s+(?:a\s+|o\s+)?(?:tela|computador|pc|maquina|notebook)$/;
const ABORT = /^(?:cancelar|cancela|cancele|abortar)\s+(?:o\s+)?(?:desligamento|reinicio|reinicializacao)$/;
const OPEN_GUIDED = /^(?:abrir|abre|abra|iniciar|inicia|inicie|executar|executa|execute)\s+(?:(?:o|a)\s+)?(?:programa|aplicativo|app|pasta)\s+\S/;
const OPEN_BUILTIN = /^(?:abrir|abre|abra|iniciar|inicia|inicie|executar|executa|execute)\s+(?:(?:o|a)\s+)?(?:calculadora|bloco de notas|notepad|paint|gerenciador de tarefas|explorador(?: de arquivos)?|configuracoes do windows|downloads|documentos|area de trabalho|imagens|fotos|musicas|videos)$/;

/** A frase (já normalizada) pede algo ao computador? */
export const isSystemCommand = (normalized: string) =>
  LOCK_POWER.test(normalized) || ABORT.test(normalized) || OPEN_GUIDED.test(normalized) || OPEN_BUILTIN.test(normalized);

export const systemIntent: Intent = {
  name: 'sistema',
  description: 'Abrir programas e pastas, bloquear ou desligar o computador (app Windows)',
  examples: ['abrir calculadora', 'abrir pasta downloads', 'bloquear tela'],
  patterns: [LOCK_POWER, ABORT, OPEN_GUIDED, OPEN_BUILTIN],
  handle: () => ({
    reply: 'Comandos do computador funcionam só no app Sano para Windows. Aqui no navegador eu não tenho acesso ao seu PC.',
  }),
};
