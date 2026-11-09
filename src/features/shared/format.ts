/* "Fri, Oct 9, 2026" from "2026-10-09". */
export function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

/* "9:00 AM" from "09:00:00". */
export function formatTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date(2000, 0, 1, hours, minutes);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/*
  The ranges below use non-breaking spaces inside each date and time, so a
  narrow table column or chip wraps only at the " - " between start and end,
  never in the middle of "Nov 11, 2026" or "9:00 AM".
*/
function keepTogether(text: string) {
  return text.replaceAll(" ", "\u00a0");
}

/* "9:00 AM - 5:00 PM". */
export function formatTimeRange(startTime: string, endTime: string) {
  return `${keepTogether(formatTime(startTime))} - ${keepTogether(formatTime(endTime))}`;
}

/* "Fri, Oct 9, 2026", or "Fri, Oct 9, 2026 - Sun, Oct 11, 2026" for a multi-day session. */
export function formatDateRange(date: string, endDate: string) {
  if (endDate === date) return keepTogether(formatDate(date));
  return `${keepTogether(formatDate(date))} - ${keepTogether(formatDate(endDate))}`;
}
