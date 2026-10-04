import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * Sem isto, qualquer erro em render derrubava a aplicação inteira (tela
 * branca sem explicação). Aqui o erro vira uma tela com o motivo e um botão
 * para recarregar — o restante do app continua utilizável.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro não tratado na interface:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="center">
        <div className="card auth-card">
          <h1 className="logo">ERRO</h1>
          <p className="muted">Algo quebrou nesta tela. Seus dados estão salvos no servidor.</p>
          <div className="error">{error.message}</div>
          <button onClick={() => window.location.reload()}>Recarregar</button>
        </div>
      </div>
    );
  }
}