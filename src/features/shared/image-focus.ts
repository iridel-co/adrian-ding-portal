import { z } from "zod";

/*
  The spot on a photo that must stay in view when a card crops it,
  in whole percent from the top-left. Used as CSS object-position, which
  lines that spot up with the same spot in the frame, so it never falls
  out of view whatever shape the frame is.
*/
export const imageFocusSchema = z.object({
  x: z.number().int().min(0).max(100),
  y: z.number().int().min(0).max(100)
});

export type ImageFocus = z.infer<typeof imageFocusSchema>;

export const CENTER_FOCUS: ImageFocus = { x: 50, y: 50 };

export function toObjectPosition(focus: ImageFocus) {
  return `${focus.x}% ${focus.y}%`;
}

function toPercent(value: number) {
  return Math.round(Math.min(100, Math.max(0, value)));
}

/* Turns a pointer position over the photo into a focus, clamped to the photo's edges. */
export function focusFromPoint(
  point: { x: number; y: number },
  rect: { left: number; top: number; width: number; height: number }
): ImageFocus {
  return {
    x: toPercent(((point.x - rect.left) / rect.width) * 100),
    y: toPercent(((point.y - rect.top) / rect.height) * 100)
  };
}

/* Moves the focus by a step for the arrow keys, staying inside the photo. */
export function nudgeFocus(focus: ImageFocus, dx: number, dy: number): ImageFocus {
  return { x: toPercent(focus.x + dx), y: toPercent(focus.y + dy) };
}
