import { useState } from "react";
import { normalizeColumns, type ColumnDefinition, type ColumnPreference } from "./column-preferences";
export function useTableColumns<Id extends string>(key: string, defaults: readonly ColumnDefinition<Id>[]) {
  const [columns, setColumns] = useState(() => {
    try { return normalizeColumns(JSON.parse(localStorage.getItem(key) ?? "null"), defaults); }
    catch { return normalizeColumns(null, defaults); }
  });
  function update(next: ColumnPreference<Id>[]) {
    const normalized = normalizeColumns(next, defaults);
    setColumns(normalized);
    try { localStorage.setItem(key, JSON.stringify(normalized)); } catch { /* Session preferences remain usable. */ }
  }
  return { columns, update, reset: () => update(normalizeColumns(null, defaults)),
    visible: columns.filter(column => column.enabled).map(column => column.id) };
}
