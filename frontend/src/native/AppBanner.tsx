import { useState } from 'react';
import { isAndroidBrowser } from './bridge';
import { APK_URL, useAndroidRelease } from './androidRelease';
import { IconDownload } from '../components/ui/icons';

const DISMISS_KEY = 'sano:android-banner-dismissed';

const readDismissed = () => {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
};

/**
 * Faixa discreta no topo: convida quem usa o site no Android a instalar o app
 * e, dentro do app, avisa quando há versão nova do APK.
 */
export default function AppBanner() {
  const { release, outdated } = useAndroidRelease();
  const [dismissed, setDismissed] = useState(readDismissed);

  const invite = isAndroidBrowser() && !dismissed;
  if (!release || (!invite && !outdated)) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* sem armazenamento: some só nesta sessão */ }
  };

  return (
    <div className="app-banner" role="status">
      <span className="app-banner-icon" aria-hidden="true">S</span>
      <span className="app-banner-text">
        {outdated
          ? <><b>Nova versão do app ({release.version})</b> — atualize para receber as melhorias.</>
          : <><b>Instale o app do Sano</b> — lembretes que tocam e widget na tela inicial.</>}
      </span>
      <a className="app-banner-btn" href={APK_URL} download={`Sano-${release.version}.apk`}>
        <IconDownload size={15} /> {outdated ? 'Atualizar' : 'Baixar'}
      </a>
      {!outdated && <button className="app-banner-close" onClick={dismiss} aria-label="Dispensar">×</button>}
    </div>
  );
}
