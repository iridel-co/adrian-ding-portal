const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/* Two weekdays after submission, preserving the Manila time of day. */
export function inquiryDeadline(submittedAt: Date) {
  if (!Number.isFinite(submittedAt.getTime())) throw new Error("Invalid submission time");
  const due = new Date(submittedAt);
  let weekdays = 0;
  while (weekdays < 2) {
    due.setUTCDate(due.getUTCDate() + 1);
    const day = new Date(due.getTime() + MANILA_OFFSET_MS).getUTCDay();
    if (day !== 0 && day !== 6) weekdays++;
  }
  return due;
}
