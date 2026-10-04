/** Estados da linha de onda — reagem ao que o Sano está fazendo. */
export type SanoState = 'idle' | 'thinking' | 'speaking';

interface Props {
  state: SanoState;
  /** Palavras ao lado da onda (ex.: "processando"). */
  label?: string;
}

/** Quantidade de barras na onda. Mais barras = onda mais contínua. */
const BARS = 28;

/**
 * Linha de onda que substitui o orbe.
 *
 * Fica no topo do painel central e é o indicador de estado do Sano:
 * - `idle`    → onda baixa e lenta, respirando
 * - `thinking`→ onda agitada e rápida
 * - `speaking`→ onda alta, como quem fala
 *
 * São `div`s animadas por CSS (sem JS por frame) e cada barra tem um atraso
 * próprio, produzindo o deslocamento da onda ao longo da linha.
 */
export default function SanoWave({ state, label }: Props) {
  return (
    <div className={`wave wave-${state}`} role="status" aria-live="polite">
      <span className="sr-only">{label ?? 'Sano online'}</span>
      {Array.from({ length: BARS }, (_, i) => (
        <span
          className="wave-bar"
          key={i}
          // Atraso centrado cria a onda que viaja da esquerda para a direita.
          style={{ animationDelay: `${((i % 7) - 3) * 0.09}s` }}
        />
      ))}
    </div>
  );
}