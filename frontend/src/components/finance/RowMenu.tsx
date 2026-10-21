import { useEffect, useRef, useState } from 'react';
import { IconMore } from './icons';

export interface RowMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

/** Botão "⋯" com menu suspenso; fecha ao clicar fora ou com Esc. */
export default function RowMenu({ items, label = 'Mais ações' }: { items: RowMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);

  return (
    <div className="fin-menu" ref={ref}>
      <button type="button" className={`fin-icon-btn ${open ? 'on' : ''}`} aria-label={label} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <IconMore />
      </button>
      {open && (
        <div className="fin-menu-pop" role="menu">
          {items.map((item) => (
            <button key={item.label} type="button" role="menuitem" className={item.danger ? 'danger' : ''}
              onClick={() => { setOpen(false); item.onSelect(); }}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
