import { cn } from "cn";
import type { KeyboardEvent, PointerEvent } from "react";

import {
  focusFromPoint,
  type ImageFocus,
  nudgeFocus,
  toObjectPosition
} from "@/features/shared/image-focus";

const ARROW_STEPS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1]
};

/*
  The whole photo with a dot on it. Drag the dot, click anywhere, or use the
  arrow keys (Shift for bigger steps) to mark the part that must always show.
  The two small frames below show how a tall card and a wide row crop it.
*/
export function ImageFocusPicker({
  image,
  value,
  onChange
}: {
  image: { url: string; alt: string };
  value: ImageFocus;
  onChange: (focus: ImageFocus) => void;
}) {
  const moveTo = (event: PointerEvent<HTMLDivElement>) =>
    onChange(
      focusFromPoint({ x: event.clientX, y: event.clientY }, event.currentTarget.getBoundingClientRect())
    );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = ARROW_STEPS[event.key];
    if (!step) return;
    event.preventDefault();
    const size = event.shiftKey ? 10 : 2;
    onChange(nudgeFocus(value, step[0] * size, step[1] * size));
  };

  const objectPosition = toObjectPosition(value);

  return (
    <div className="flex flex-col gap-3">
      <div
        role="slider"
        tabIndex={0}
        aria-label="Photo focus"
        aria-valuenow={value.x}
        aria-valuetext={`${value.x}% across, ${value.y}% down`}
        className="relative cursor-crosshair touch-none overflow-hidden rounded-md border bg-muted select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          moveTo(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) moveTo(event);
        }}
        onKeyDown={onKeyDown}
      >
        <img
          src={image.url}
          alt={image.alt}
          draggable={false}
          className="pointer-events-none block h-auto w-full"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white/30 shadow-[0_0_0_1px_rgb(0_0_0/0.4),0_2px_6px_rgb(0_0_0/0.4)]"
          style={{ left: `${value.x}%`, top: `${value.y}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Drag the dot onto the part of the photo that must always show.
      </p>
      <div className="flex items-end gap-2">
        <CropFrame
          label="Card"
          className="w-16"
          aspectClassName="aspect-[22/34]"
          src={image.url}
          objectPosition={objectPosition}
        />
        <CropFrame
          label="Wide row"
          className="flex-1"
          aspectClassName="aspect-[3/1]"
          src={image.url}
          objectPosition={objectPosition}
        />
      </div>
    </div>
  );
}

function CropFrame({
  label,
  className,
  aspectClassName,
  src,
  objectPosition
}: {
  label: string;
  className: string;
  aspectClassName: string;
  src: string;
  objectPosition: string;
}) {
  return (
    <figure className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className={cn("overflow-hidden rounded border bg-muted", aspectClassName)}>
        <img src={src} alt="" className="size-full object-cover" style={{ objectPosition }} />
      </div>
      <figcaption className="text-[0.7rem] text-muted-foreground">{label}</figcaption>
    </figure>
  );
}
