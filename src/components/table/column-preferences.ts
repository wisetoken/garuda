export type ColumnPreference<Id extends string = string> = { id: Id; label: string; enabled: boolean };
export type ColumnDefinition<Id extends string> = { id: Id; label: string; optional?: boolean };
export function normalizeColumns<Id extends string>(value: unknown, defaults: readonly ColumnDefinition<Id>[]): ColumnPreference<Id>[] {
  const result: ColumnPreference<Id>[] = [], seen = new Set<Id>();
  if (Array.isArray(value)) for (const item of value) {
    const original = defaults.find(column => column.id === item?.id);
    if (!original || seen.has(original.id)) continue;
    seen.add(original.id);
    result.push({ id: original.id, label: original.label, enabled: typeof item.enabled === "boolean" ? item.enabled : !original.optional });
  }
  for (const column of defaults) if (!seen.has(column.id)) {
    const index = result.findIndex(item => item.id === "actions");
    result.splice(index < 0 ? result.length : index, 0, { id: column.id, label: column.label, enabled: !column.optional });
  }
  return result.some(column => column.enabled) ? result : defaults.map(column => ({ ...column, enabled: !column.optional }));
}

/** Keep a usable view when its only saved visible column belongs to another order book. */
export function columnsForView<Id extends string>(columns: ColumnPreference<Id>[], excluded: string[]) {
  if (columns.some(column => column.enabled && !excluded.includes(column.id))) return columns;
  const fallback = columns.find(column => !excluded.includes(column.id));
  return columns.map(column => column === fallback ? { ...column, enabled: true } : column);
}
