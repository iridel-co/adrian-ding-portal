import { Check, Plus, X } from "lucide-react";
import { useRef, useState } from "react";

import { SortableList } from "@/components/cms/sortable-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type StringListFieldProps = {
  value: string[];
  onChange: (value: string[]) => void;
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

/*
  An ordered list of short text items. The items show as a numbered list you
  can edit and drag, and a blank box at the bottom adds the next one: type,
  then press Enter, press the check, or leave the box. Once the list has items,
  the add box hides until you press "Add more". Blank items are dropped.
*/
export function StringListField({
  value,
  onChange,
  addLabel = "Add item",
  maxItems = Number.POSITIVE_INFINITY
}: StringListFieldProps) {
  const [items, setItems] = useState(() => toItems(value));
  const [draft, setDraft] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const composer = useRef<HTMLInputElement>(null);
  const isFull = items.length >= maxItems;
  const showComposer = !isFull && (items.length === 0 || isComposing);

  const update = (next: ListItem[]) => {
    setItems(next);
    onChange(next.map((item) => item.text.trim()).filter(Boolean));
  };

  const add = () => {
    const text = draft.trim();
    if (!text || isFull) return;
    update([...items, { id: crypto.randomUUID(), text }]);
    setDraft("");
  };

  const openComposer = () => {
    setIsComposing(true);
    composer.current?.focus();
  };

  return (
    <div className="flex flex-col gap-2">
      <SortableList
        items={items}
        getId={(item) => item.id}
        onReorder={update}
        renderItem={(item, index) => (
          <div className="flex flex-1 items-center gap-2 rounded-lg border bg-card pr-1 pl-2.5 shadow-xs focus-within:border-ring">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground tabular-nums">
              {index + 1}
            </span>
            <Input
              aria-label={`Item ${index + 1}`}
              className="h-9 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
              value={item.text}
              onKeyDown={(event) => {
                // Enter moves on to the add box instead of submitting the form.
                if (event.key !== "Enter") return;
                event.preventDefault();
                openComposer();
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
              size="icon-sm"
              aria-label={`Remove item ${index + 1}`}
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={() => update(items.filter((current) => current.id !== item.id))}
            >
              <X />
            </Button>
          </div>
        )}
      />
      {isFull && (
        <p className="pl-8 text-xs text-muted-foreground">That's the most this list can hold.</p>
      )}
      {!showComposer && !isFull && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start sm:ml-8"
          onClick={openComposer}
        >
          <Plus />
          Add more
        </Button>
      )}
      {showComposer && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed bg-card/60 pr-1 pl-2.5 focus-within:border-ring focus-within:border-solid sm:ml-8">
          <Input
            ref={composer}
            autoFocus={isComposing}
            aria-label={addLabel}
            placeholder={`${addLabel}, then press Enter`}
            className="h-9 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              add();
            }}
            onBlur={() => {
              add();
              setIsComposing(false);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={addLabel}
            disabled={!draft.trim()}
            className="text-brand hover:bg-brand/10 hover:text-brand"
            onMouseDown={(event) => event.preventDefault()}
            onClick={add}
          >
            <Check />
          </Button>
        </div>
      )}
    </div>
  );
}
