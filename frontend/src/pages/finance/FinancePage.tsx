import AppShell from '../../components/layout/AppShell';

function getActualUrl() {
  const value = (import.meta.env.VITE_ACTUAL_URL || '').trim();
  if (!value) return '';

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

const actualUrl = getActualUrl();

export default function FinancePage() {
  return (
    <AppShell title="Finanças" status="Actual integrado">
      {actualUrl ? (
        <div className="finance-module">
          <div className="finance-module-head">
            <div>
              <h2>Actual</h2>
              <p className="muted">Seu orçamento e suas contas em um módulo separado do Sano.</p>
            </div>
            <a className="button-link" href={actualUrl} target="_blank" rel="noreferrer">
              Abrir em nova aba
            </a>
          </div>
          <iframe
            className="finance-frame"
            src={actualUrl}
            title="Actual - controle financeiro"
          />
        </div>
      ) : (
        <section className="card finance-setup">
          <h2>Conecte o Actual</h2>
          <p>
            O módulo está pronto, mas ainda não há uma instância do Actual
            configurada para ser exibida aqui.
          </p>
          <p className="muted">
            Defina <code>VITE_ACTUAL_URL</code> no ambiente do frontend e
            reinicie o Vite. Em desenvolvimento, essa URL normalmente é a
            porta do navegador do Actual.
          </p>
        </section>
      )}
    </AppShell>
  );
}
