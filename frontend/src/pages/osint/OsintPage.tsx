import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import DomainTab from '../../components/osint/DomainTab';
import EmailTab from '../../components/osint/EmailTab';
import UsernameTab from '../../components/osint/UsernameTab';
import type { OsintRequest } from '../../components/osint/Bits';
import { osintApi } from '../../services/osint.service';
import type { OsintCatalog } from '../../types/osint';
import '../../styles/osint.css';

type Tab = 'domain' | 'username' | 'email';

/**
 * Painel OSINT (só ADMIN): domínio/IP, username e e-mail, com fontes públicas.
 * `?alvo=`, `?username=` e `?email=` — vindos do comando do Sano — já disparam a
 * varredura ao abrir. As abas ficam montadas para não perder resultados ao trocar.
 */
export default function OsintPage() {
  const [params] = useSearchParams();
  const initialTab: Tab = params.get('username') ? 'username' : params.get('email') ? 'email' : 'domain';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [catalog, setCatalog] = useState<OsintCatalog | null>(null);
  const [error, setError] = useState('');
  const [domainReq] = useState<OsintRequest>(() => ({ value: params.get('alvo') ?? '', nonce: params.get('alvo') ? 1 : 0 }));
  const [usernameReq, setUsernameReq] = useState<OsintRequest>(() => ({ value: params.get('username') ?? '', nonce: params.get('username') ? 1 : 0 }));
  const [emailReq] = useState<OsintRequest>(() => ({ value: params.get('email') ?? '', nonce: params.get('email') ? 1 : 0 }));

  useEffect(() => {
    osintApi.catalog().then(setCatalog).catch((e) => setError(e.message));
  }, []);

  const searchUsername = (username: string) => {
    setUsernameReq((r) => ({ value: username, nonce: r.nonce + 1 }));
    setTab('username');
  };

  return (
    <AppShell title="OSINT" status="área restrita · fontes abertas">
      <div className="tabs">
        <button className={tab === 'domain' ? 'active' : ''} onClick={() => setTab('domain')}>Domínio / IP</button>
        <button className={tab === 'username' ? 'active' : ''} onClick={() => setTab('username')}>Username</button>
        <button className={tab === 'email' ? 'active' : ''} onClick={() => setTab('email')}>E-mail</button>
      </div>
      {error && <div className="error">{error}</div>}
      {catalog && (
        <>
          <div hidden={tab !== 'domain'}><DomainTab catalog={catalog} request={domainReq} /></div>
          <div hidden={tab !== 'username'}><UsernameTab catalog={catalog} request={usernameReq} /></div>
          <div hidden={tab !== 'email'}><EmailTab catalog={catalog} request={emailReq} onSearchUsername={searchUsername} /></div>
        </>
      )}
      <p className="osint-legal muted">
        Use apenas em alvos seus ou com autorização. Toda varredura fica registrada nos logs de segurança.
        Só consulta fontes públicas e nunca interage com contas, formulários ou serviços do alvo.
        Créditos: WhatsMyName (CC BY-SA 4.0), Sherlock (MIT) e web-check (MIT).
      </p>
    </AppShell>
  );
}
