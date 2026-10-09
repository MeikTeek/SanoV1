import { Link } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';

export default function AboutPage() {
  return (
    <AppShell title="Sobre o Sano" status="informações e privacidade">
      <div className="about-page">
        <section className="card">
          <h2>Um espaço pessoal, com conexões por escolha</h2>
          <p>
            O Sano reúne conversa com o assistente, agenda, treino e mensagens
            privadas. As pessoas se conectam compartilhando um código temporário;
            não há um diretório público para procurar usuários.
          </p>
        </section>

        <section className="card">
          <h2>Mensagens e amizades</h2>
          <p>
            As mensagens diretas são cifradas no dispositivo antes de serem
            enviadas. O servidor guarda os envelopes cifrados e dados necessários
            para entregar as mensagens, como participantes e horários, mas não
            consegue ler o conteúdo.
          </p>
          <p>
            Depois que existir uma mensagem direta, você pode abrir o perfil da
            outra pessoa pelo cabeçalho do chat e enviar um pedido de amizade. A amizade
            só é criada quando o pedido é aceito; ele também pode ser recusado.
          </p>
        </section>

        <section className="card">
          <h2>Presença e privacidade</h2>
          <p>
            Somente amigos podem ver sua presença online e atividade atual.
            Você pode desativar cada informação separadamente em{' '}
            <Link to="/config">Configurações → Privacidade</Link>.
          </p>
          <p>
            Dados de conta e de uso necessários para o serviço — por exemplo,
            perfil, agenda e treino — são associados à sua conta. O acesso à
            administração é restrito e as ações administrativas relevantes são
            registradas em logs de auditoria.
          </p>
        </section>

        <section className="card">
          <h2>Segurança da conta</h2>
          <p>
            O acesso usa senha e autenticação em dois fatores. Se sua conta for
            desativada por um administrador e você achar que isso é um erro,
            contate o suporte.
          </p>
        </section>

        <p className="muted small">
          Este resumo explica os recursos atuais do Sano e não substitui uma
          política de privacidade ou aviso legal completo.
        </p>
      </div>
    </AppShell>
  );
}
