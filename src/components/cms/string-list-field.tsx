import { Plus, X } from "lucide-react";
import { useState } from "react";

import { SortableList } from "@/components/cms/sortable-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type StringListFieldProps = {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  maxItems?: number;
};

type ListItem = {
  id: string;
  text: string;
};

function toItems(value: string[]): ListItem[] {
  return value.map((text) => ({ id: crypto.randomUUID(), text }));
}

/* An ordered list of short text items. Blank items are dropped from the value. */
export function StringListField({
  value,
  onChange,
  placeholder,
  addLabel = "Add item",
  maxItems = Number.POSITIVE_INFINITY
}: StringListFieldProps) {
  const [items, setItems] = useState(() => toItems(value));
  const [addedId, setAddedId] = useState<string | null>(null);
  const isFull = items.length >= maxItems;

  const addItem = (afterIndex = items.length - 1) => {
    const id = crypto.randomUUID();
    setAddedId(id);
    const added = { id, text: "" };
    setItems([...items.slice(0, afterIndex + 1), added, ...items.slice(afterIndex + 1)]);
  };

  const update = (next: ListItem[]) => {
    setItems(next);
    onChange(next.map((item) => item.text.trim()).filter(Boolean));
  };

  return (
    <div className="flex flex-col gap-2">
      <SortableList
        items={items}
        getId={(item) => item.id}
        onReorder={update}
        renderItem={(item, index) => (
          <div className="flex items-center gap-2">
            <Input
              autoFocus={item.id === addedId}
              aria-label={`Item ${index + 1}`}
              placeholder={placeholder}
              value={item.text}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                if (isFull) return;
                addItem(index);
              }}
              onChange={(event) =>
                update(
                  items.map((current) =>
                    current.id === item.id ? { ...current, text: event.target.value } : current
                  )
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove item ${index + 1}`}
              onClick={() => update(items.filter((current) => current.id !== item.id))}
            >
              <X />
            </Button>
          </div>
        )}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={isFull}
        onClick={() => addItem()}
      >
        <Plus />
        {addLabel}
      </Button>
    </div>
  );
}
