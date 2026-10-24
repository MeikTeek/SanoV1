import { isNativeApp } from './bridge';
import { isDesktopApp } from './desktop';
import { fmtSize } from './androidRelease';
import { WINDOWS_URL, useWindowsRelease } from './windowsRelease';
import { IconCalendar, IconDownload, IconLock, IconSettings } from '../components/ui/icons';

/**
 * Cartão "App para Windows" (Configurações): download do instalador, o que o
 * app faz a mais que o site e como instalar. Dentro do app mostra a versão
 * instalada e oferece a atualização quando há uma mais nova.
 */
export default function WindowsAppCard() {
  const { release, installed, outdated } = useWindowsRelease();
  const inApp = isDesktopApp();
  // No celular (app Android) o instalador de Windows não serve.
  if (isNativeApp()) return null;

  return (
    <section className="card android-card" id="windows">
      <div className="android-card-head">
        <span className="android-card-icon" aria-hidden="true">S</span>
        <div>
          <h2>App do Sano para Windows</h2>
          <p className="muted">
            {inApp
              ? `Você está usando a versão ${installed} do app.`
              : 'O Sano numa janela própria, com comandos que rodam no seu computador.'}
          </p>
        </div>
      </div>

      <ul className="android-features">
        <li><IconSettings size={18} /><span><b>Abre programas e pastas</b> por voz ou texto: "abrir calculadora", "abrir downloads"</span></li>
        <li><IconLock size={18} /><span><b>Bloqueia a tela, desliga e reinicia</b> o PC, com confirmação antes de desligar</span></li>
        <li><IconCalendar size={18} /><span><b>Sempre à mão</b>: ícone na bandeja e atalho <b>Alt+Shift+S</b></span></li>
      </ul>

      {(!inApp || outdated) && (
        <div className="android-download">
          <a className="android-download-btn" href={WINDOWS_URL} download={`Sano-Setup-${release?.version ?? 'windows'}.exe`}>
            <IconDownload size={18} />
            {outdated ? `Atualizar para a versão ${release?.version}` : 'Baixar o app (Windows)'}
          </a>
          {release && (
            <small className="muted">
              Versão {release.version} · {fmtSize(release.size)} · Windows 10 ou superior
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
            <li>Clique em <b>Baixar o app</b> e abra o arquivo baixado.</li>
            <li>Se o Windows mostrar "O Windows protegeu seu PC", clique em <b>Mais informações</b> e depois em <b>Executar assim mesmo</b> (o instalador ainda não é assinado).</li>
            <li>Abra o Sano pelo menu Iniciar e entre na sua conta.</li>
            <li>Para liberar seus programas e pastas: ícone do Sano na bandeja → <b>Editar configuração</b>.</li>
          </ol>
        </details>
      )}
    </section>
  );
}
