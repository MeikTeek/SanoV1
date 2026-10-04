import AppShell from '../../components/layout/AppShell';
import ChatTerminal from '../../components/chat/ChatTerminal';
import SanoWave, { type SanoState } from '../../components/chat/SanoWave';
import SidePanels from '../../components/chat/SidePanels';
import ReminderWatcher from '../../components/agenda/ReminderWatcher';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../store/chatStore';

/**
 * Tela em três colunas de mesma altura e mesmo topo:
 *
 *   [ Hoje / Treino ]  [ Console do Sano ]  [ Atalhos / Conexão ]
 *
 * A coluna central é a única que cresce; as laterais acompanham. Assim o olho
 * encontra uma grade única em vez de blocos soltos.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const { messages, busy, thinking, refreshKey } = useChat();

  // A onda reflete o que o Sano está fazendo agora.
  const lastRole = messages[messages.length - 1]?.role;
  const state: SanoState = busy ? 'thinking' : lastRole === 'sano' ? 'speaking' : 'idle';

  const name = user?.displayName || user?.username || '';

  return (
    <AppShell title="Sano" status={`${name} · online`} flush>
      <ReminderWatcher />
      <div className="hud">
        <SidePanels side="left" refreshKey={refreshKey} />

        <main className="hud-center">
          <SanoWave state={state} label={busy ? thinking : 'Sano online'} />
          <ChatTerminal />
        </main>

        <SidePanels side="right" refreshKey={refreshKey} />
      </div>
    </AppShell>
  );
}
