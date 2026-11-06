import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

export function TableHeader<T extends string>({ columns, sort, direction, onSort }: {
  columns: readonly { id: T; label: string; sortable?: boolean }[];
  sort: T;
  direction: "asc" | "desc";
  onSort: (id: T) => void;
}) {
  return <thead><tr>{columns.map(({ id, label, sortable }) => (
    <th key={id} scope="col" data-column={id}
      aria-sort={sort === id ? direction === "asc" ? "ascending" : "descending" : undefined}>
      {sortable ? <button onClick={() => onSort(id)}>
        {label}
        {sort !== id ? <ChevronsUpDown size={13} aria-hidden="true" />
          : direction === "asc" ? <ArrowUp size={15} aria-hidden="true" />
          : <ArrowDown size={15} aria-hidden="true" />}
      </button> : label}
    </th>
  ))}</tr></thead>;
}
