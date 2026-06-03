import type { ReactNode } from "react";

type Row = [string, ReactNode | null | undefined];

export function FieldTable({ rows }: { rows: Row[] }) {
  const visibleRows = rows.filter(([, value]) => {
    if (value === null || value === undefined) return false;
    return String(value).trim() !== "";
  });

  if (!visibleRows.length) return null;

  return (
    <table className="field-table">
      <tbody>
        {visibleRows.map(([label, value]) => (
          <tr key={label}>
            <th>{label}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
