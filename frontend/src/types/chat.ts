/**
 * Tipos do Módulo 1 — bate-papo criptografado.
 * Reexportados a partir de `chat.service.ts` para a tela ter um único lugar
 * de importação, mas ficam aqui porque são contrato entre tela e serviço.
 */
export type {
  Conversation,
  ConversationMember,
  DirectoryEntry,
  Message,
  MessageKind,
  MessageMeta,
  MyNumber,
  Person,
  PersonProfile,
} from '../services/chat.service';

/** Como a tela do perfil está aberta. */
export type ProfileTab = 'posts' | 'followers' | 'following';