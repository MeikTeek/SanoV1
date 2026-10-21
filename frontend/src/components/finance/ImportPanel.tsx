import { useMemo, useState } from 'react';
import { financeApi } from '../../services/finance.service';
import type { FinanceAccount, FinanceOverview, ImportResult, ImportRow } from '../../types/finance';
import { dayLabel, guessColumns, money, parseCsv, type CsvColumn } from './format';

interface Props {
  data: FinanceOverview;
  account: FinanceAccount;
  onDone: () => Promise<void>;
}

const COLUMN_LABEL: Record<CsvColumn, string> = {
  date: 'Data', payee: 'Descrição', amount: 'Valor', category: 'Categoria (opcional)', notes: 'Notas (opcional)',
};
const REQUIRED: CsvColumn[] = ['date', 'payee', 'amount'];

/**
 * Importação de extrato em duas etapas: o servidor primeiro devolve a prévia
 * (válidas, duplicadas, com erro) e só grava quando o usuário confirma.
 */
export default function ImportPanel({ data, account, onDone }: Props) {
  const [cells, setCells] = useState<string[][]>([]);
  const [columns, setColumns] = useState<Record<CsvColumn, number> | null>(null);
  const [invert, setInvert] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const headers = cells[0] ?? [];
  const categoryName = useMemo(
    () => new Map(data.groups.flatMap((g) => g.categories).map((c) => [c.id, c.name])),
    [data.groups],
  );

  const readFile = async (file: File) => {
    setError(''); setPreview(null);
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) { setError('O arquivo precisa de um cabeçalho e ao menos uma linha.'); return; }
    setCells(parsed);
    setColumns(guessColumns(parsed[0]));
  };

  const buildRows = (): ImportRow[] => cells.slice(1).map((values, index) => {
    const get = (key: CsvColumn) => (columns && columns[key] >= 0 ? values[columns[key]] ?? '' : '');
    let amount = get('amount');
    // Alguns bancos exportam gastos como positivos: o usuário inverte o sinal.
    if (invert) amount = amount.trim().startsWith('-') ? amount.trim().slice(1) : `-${amount.trim()}`;
    return {
      line: index + 2,
      date: get('date'),
      amount,
      payee: get('payee'),
      notes: get('notes') || undefined,
      category: get('category') || undefined,
    };
  });

  const ready = columns && REQUIRED.every((key) => columns[key] >= 0);

  const send = async (commit: boolean) => {
    setBusy(true); setError('');
    try {
      const result = await financeApi.importRows(account.id, buildRows(), commit);
      if (commit) await onDone();
      else setPreview(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const counts = preview && {
    ok: preview.rows.filter((r) => r.status === 'ok').length,
    duplicate: preview.rows.filter((r) => r.status === 'duplicate').length,
    error: preview.rows.filter((r) => r.status === 'error').length,
  };

  return (
    <section className="card fin-import">
      <h3>Importar extrato para {account.name}</h3>
      <p className="muted">
        CSV separado por vírgula ou ponto e vírgula, com cabeçalho. Datas em DD/MM/AAAA ou AAAA-MM-DD; valores
        como 1.234,56 ou -12.50. Linhas que já existem na conta são ignoradas.
      </p>
      <input type="file" accept=".csv,text/csv" onChange={(e) => { const file = e.target.files?.[0]; if (file) void readFile(file); }} />

      {columns && (
        <>
          <div className="fin-import-map">
            {(Object.keys(COLUMN_LABEL) as CsvColumn[]).map((key) => (
              <label key={key}>{COLUMN_LABEL[key]}
                <select value={columns[key]} onChange={(e) => { setColumns({ ...columns, [key]: Number(e.target.value) }); setPreview(null); }}>
                  <option value={-1}>{REQUIRED.includes(key) ? 'Escolha a coluna' : 'Não usar'}</option>
                  {headers.map((header, index) => <option key={index} value={index}>{header || `Coluna ${index + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
          <label className="fin-check">
            <input type="checkbox" checked={invert} onChange={(e) => { setInvert(e.target.checked); setPreview(null); }} />
            Inverter sinal (o banco exporta gastos como valores positivos)
          </label>
          <div className="fin-entry-actions">
            <span className="muted">{cells.length - 1} linha(s) no arquivo</span>
            <button type="button" className="ghost" disabled={!ready || busy} onClick={() => void send(false)}>Pré-visualizar</button>
            <button type="button" disabled={!preview || !counts?.ok || counts.error > 0 || busy} onClick={() => void send(true)}>
              Importar {counts?.ok ?? ''} transação(ões)
            </button>
          </div>
        </>
      )}

      {error && <p className="error">{error}</p>}

      {preview && counts && (
        <>
          <p className="fin-import-counts">
            <span className="fin-pos">{counts.ok} novas</span> · <span>{counts.duplicate} já existentes</span> · <span className={counts.error ? 'fin-neg' : ''}>{counts.error} com erro</span>
          </p>
          <div className="table-wrap fin-import-preview">
            <table>
              <thead><tr><th>Linha</th><th>Data</th><th>Descrição</th><th>Categoria</th><th className="fin-num">Valor</th><th>Status</th></tr></thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.line} className={`fin-import-${row.status}`}>
                    <td>{row.line}</td>
                    <td>{row.status === 'error' ? row.date : dayLabel(row.date)}</td>
                    <td>{row.payee}</td>
                    <td>{row.categoryId ? categoryName.get(row.categoryId) : <span className="muted">—</span>}</td>
                    <td className={`fin-num ${row.amount < 0 ? 'fin-neg' : 'fin-pos'}`}>{row.status === 'error' ? '' : money(row.amount)}</td>
                    <td>{row.status === 'ok' ? 'Nova' : row.status === 'duplicate' ? 'Já existe' : row.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
