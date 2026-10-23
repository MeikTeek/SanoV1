import { isNativeApp } from './bridge';
import { APK_URL, fmtSize, useAndroidRelease } from './androidRelease';
import { IconBell, IconCalendar, IconDownload, IconMic } from '../components/ui/icons';

/**
 * Cartão "App para Android" (Configurações): download do APK, o que o app faz
 * a mais que o site e como instalar. Dentro do app mostra a versão instalada e
 * oferece a atualização quando há build mais novo.
 */
export default function AndroidAppCard() {
  const { release, installed, outdated } = useAndroidRelease();
  const inApp = isNativeApp();

  return (
    <section className="card android-card" id="android">
      <div className="android-card-head">
        <span className="android-card-icon" aria-hidden="true">S</span>
        <div>
          <h2>App do Sano para Android</h2>
          <p className="muted">
            {inApp
              ? installed ? `Você está usando a versão ${installed.version} do app.` : 'Você está usando o app do Sano.'
              : 'Tudo do site, com recursos que só o celular oferece.'}
          </p>
        </div>
      </div>

      <ul className="android-features">
        <li><IconBell size={18} /><span><b>Lembretes que tocam</b> mesmo com o app fechado ou o celular reiniciado</span></li>
        <li><IconCalendar size={18} /><span><b>Widget na tela inicial</b> com o próximo compromisso e a agenda do dia</span></li>
        <li><IconMic size={18} /><span><b>Atalhos no ícone</b>, envio de fotos e áudios e upload de músicas</span></li>
      </ul>

      {(!inApp || outdated) && (
        <div className="android-download">
          <a className="android-download-btn" href={APK_URL} download={`Sano-${release?.version ?? 'android'}.apk`}>
            <IconDownload size={18} />
            {outdated ? `Atualizar para a versão ${release?.version}` : 'Baixar o app (APK)'}
          </a>
          {release && (
            <small className="muted">
              Versão {release.version} · {fmtSize(release.size)} · Android 7 ou superior
            </small>
          )}
        </div>
      )}

      {release && release.notes.length > 0 && (
        <details className="android-notes">
          <summary>Novidades da versão {release.version}</summary>
          <ul>{release.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </details>
      )}

      {!inApp && (
        <details className="android-notes">
          <summary>Como instalar</summary>
          <ol>
            <li>Toque em <b>Baixar o app</b> no celular Android.</li>
            <li>Abra o arquivo baixado. Se o Android pedir, permita <b>instalar apps desta fonte</b>.</li>
            <li>Abra o Sano, entre na sua conta e permita as notificações.</li>
            <li>Para o widget: segure um espaço vazio da tela inicial → <b>Widgets</b> → <b>Agenda do Sano</b>.</li>
          </ol>
        </details>
      )}
    </section>
  );
}
