import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { type ComponentProps, type ReactNode, useId } from "react";

import { TableBody, TableCell, TableRow } from "@/components/ui/table";

type SortableProps<T> = {
  items: T[];
  getId: (item: T) => string;
  onReorder: (items: T[]) => void;
  disabled?: boolean;
};

/* The drag-and-drop setup both lists share: mouse and keyboard dragging, and the new order on drop. */
function SortableArea<T>({
  items,
  getId,
  onReorder,
  disabled = false,
  children
}: SortableProps<T> & { children: ReactNode }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const ids = items.map(getId);
  const dndContextId = useId();

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;

    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    onReorder(arrayMove(items, from, to));
  };

  return (
    <DndContext id={dndContextId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={disabled}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

function DragHandle(props: ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-label="Drag to reorder"
      className="relative z-10 cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
      {...props}
    >
      <GripVertical className="size-4" />
    </button>
  );
}

export function SortableList<T>({
  renderItem,
  ...props
}: SortableProps<T> & { renderItem: (item: T, index: number) => ReactNode }) {
  return (
    <SortableArea {...props}>
      <ul className="flex flex-col gap-2">
        {props.items.map((item, index) => (
          <SortableRow key={props.getId(item)} id={props.getId(item)} disabled={props.disabled ?? false}>
            {renderItem(item, index)}
          </SortableRow>
        ))}
      </ul>
    </SortableArea>
  );
}

function SortableRow({
  id,
  disabled,
  children
}: {
  id: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-dragging={isDragging || undefined}
      className="flex items-center gap-2 rounded-md bg-card data-dragging:z-10 data-dragging:shadow-md"
    >
      {!disabled && <DragHandle {...attributes} {...listeners} />}
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

/*
  A table body whose rows can be dragged by a handle in their first cell.
  renderRow returns the rest of the row's cells. When it isn't disabled, give
  the table a matching narrow first header cell for the handles.
*/
export function SortableTableBody<T>({
  renderRow,
  ...props
}: SortableProps<T> & { renderRow: (item: T, index: number) => ReactNode }) {
  return (
    <SortableArea {...props}>
      <TableBody>
        {props.items.map((item, index) => (
          <SortableTableRow key={props.getId(item)} id={props.getId(item)} disabled={props.disabled ?? false}>
            {renderRow(item, index)}
          </SortableTableRow>
        ))}
      </TableBody>
    </SortableArea>
  );
}

function SortableTableRow({
  id,
  disabled,
  children
}: {
  id: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id
  });

  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-dragging={isDragging || undefined}
      className="data-dragging:z-20 data-dragging:bg-card data-dragging:shadow-md"
    >
      {!disabled && (
        <TableCell className="w-10 pr-0">
          <DragHandle {...attributes} {...listeners} />
        </TableCell>
      )}
      {children}
    </TableRow>
  );
}
