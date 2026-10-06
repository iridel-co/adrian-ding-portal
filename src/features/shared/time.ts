export const MANILA_TIME_ZONE = "Asia/Manila";

const manilaDateTimeFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: MANILA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});

/* Wall-clock date and time in Manila, as "YYYY-MM-DD" and "HH:MM:SS". */
export function manilaWallClock(now: Date = new Date()) {
  const parts = Object.fromEntries(
    manilaDateTimeFormat.formatToParts(now).map((part) => [part.type, part.value])
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`
  };
}

export function manilaToday(now: Date = new Date()) {
  return manilaWallClock(now).date;
}

type SessionTimes = {
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
};

function hasManilaMomentPassed(date: string, time: string, now: Date) {
  const current = manilaWallClock(now);
  return `${current.date}T${current.time}` >= `${date}T${normalizeTime(time)}`;
}

export function hasSessionStarted(session: SessionTimes, now: Date = new Date()) {
  return hasManilaMomentPassed(session.date, session.startTime, now);
}

export function hasSessionEnded(session: SessionTimes, now: Date = new Date()) {
  return hasManilaMomentPassed(session.endDate, session.endTime, now);
}

/* Postgres returns "HH:MM:SS"; form inputs give "HH:MM". */
export function normalizeTime(time: string) {
  return time.length === 5 ? `${time}:00` : time;
}

const MANILA_UTC_OFFSET = "+08:00";

/* A Manila wall-clock "YYYY-MM-DDTHH:MM" as an instant. Manila has no daylight saving. */
export function manilaLocalToDate(local: string) {
  return new Date(`${local}:00${MANILA_UTC_OFFSET}`);
}

/* An instant as a Manila wall-clock "YYYY-MM-DDTHH:MM", for datetime-local inputs. */
export function dateToManilaLocal(instant: Date) {
  const wallClock = manilaWallClock(instant);
  return `${wallClock.date}T${wallClock.time.slice(0, 5)}`;
}
