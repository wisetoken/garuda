import { useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, EyeOff, GripVertical, Search, Settings } from "lucide-react";
import { TablePopover } from "./TablePopover";
import type { ColumnPreference } from "./column-preferences";

function ColumnRow({ column, disabled, onToggle }: { column: ColumnPreference; disabled: boolean; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: column.id });
  const Icon = column.enabled ? Eye : EyeOff;
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
    className="table-column-row" data-visible={column.enabled} data-dragging={isDragging}>
    <button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners}
      aria-label={`Reorder ${column.label}`} className="table-column-drag"><GripVertical size={16} /><span>{column.label}</span></button>
    <button type="button" className="table-column-eye" disabled={disabled} onClick={onToggle}
      aria-label={`${column.enabled ? "Hide" : "Show"} ${column.label}`} aria-pressed={column.enabled}
      title={disabled ? "Keep at least one column visible" : undefined}><Icon size={16} /></button>
  </div>;
}
function ColumnOptions<Id extends string>({ columns, onChange, onReset, exclude = [] }: {
  columns: ColumnPreference<Id>[]; onChange: (columns: ColumnPreference<Id>[]) => void; onReset: () => void; exclude?: string[];
}) {
  const [search, setSearch] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const shown = columns.filter(column => !exclude.includes(column.id));
  const filtered = shown.filter(column => column.label.toLowerCase().includes(search.toLowerCase()));
  const count = shown.filter(column => column.enabled).length;
  return <>
    <label className="table-column-search"><Search size={16} /><input aria-label="Search columns" placeholder="Search columns"
      value={search} onChange={event => setSearch(event.target.value)} /></label>
    <div className="table-column-list">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id) return;
        const from = columns.findIndex(c => c.id === active.id), to = columns.findIndex(c => c.id === over.id);
        if (from >= 0 && to >= 0) onChange(arrayMove(columns, from, to));
      }}>
        <SortableContext items={filtered.map(column => column.id)} strategy={verticalListSortingStrategy}>
          {filtered.map(column => <ColumnRow key={column.id} column={column} disabled={column.enabled && count === 1}
            onToggle={() => onChange(columns.map(item => item.id === column.id ? { ...item, enabled: !item.enabled } : item))} />)}
        </SortableContext>
      </DndContext>
      {!filtered.length && <p className="table-columns-empty">No matching columns.</p>}
    </div>
    <footer className="table-column-footer"><button type="button" onClick={onReset}>Reset to defaults</button>
      <span aria-live="polite">{count}/{shown.length} visible</span></footer>
  </>;
}
export function TableColumnSettings<Id extends string>(props: {
  columns: ColumnPreference<Id>[]; onChange: (columns: ColumnPreference<Id>[]) => void; onReset: () => void; exclude?: string[];
}) {
  return <TablePopover label="Table settings" end variant="columns" trigger={<Settings size={16} />}>
    <ColumnOptions {...props} />
  </TablePopover>;
}
