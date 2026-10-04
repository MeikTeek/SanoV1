import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ChatProvider } from './store/chatStore';
import ErrorBoundary from './components/ui/ErrorBoundary';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Impede que um erro em qualquer tela derrube a aplicação inteira. */}
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          {/* O histórico do chat vive fora das rotas: navegar não apaga a conversa. */}
          <ChatProvider>
            <App />
          </ChatProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
