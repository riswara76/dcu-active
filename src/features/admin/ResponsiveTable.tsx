import type { ReactNode } from 'react';

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

/** Table on ≥ 768px, stacked cards below — no horizontal page scroll (TR-RWD-02, FR-ADM-11). */
export function ResponsiveTable<T>({ caption, columns, rows, rowKey, actions }: {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  actions?: (row: T) => ReactNode;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-white md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-surface text-muted">
            <tr>
              {columns.map((c) => <th key={c.header} scope="col" className="px-3 py-2.5 font-semibold">{c.header}</th>)}
              {actions && <th scope="col" className="px-3 py-2.5 font-semibold"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={rowKey(r)} className="align-top">
                {columns.map((c) => <td key={c.header} className={`px-3 py-2.5 ${c.className ?? ''}`}>{c.cell(r)}</td>)}
                {actions && <td className="px-3 py-2.5 text-right"><div className="flex justify-end gap-2">{actions(r)}</div></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 md:hidden" aria-label={caption}>
        {rows.map((r) => (
          <li key={rowKey(r)} className="rounded-xl border border-line bg-white p-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {columns.map((c) => (
                <div key={c.header} className="contents">
                  <dt className="text-muted">{c.header}</dt>
                  <dd className="min-w-0 break-words">{c.cell(r)}</dd>
                </div>
              ))}
            </dl>
            {actions && <div className="mt-2 flex flex-wrap gap-2">{actions(r)}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}
