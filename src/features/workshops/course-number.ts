import { slugify } from "@/features/shared/slug";

const MIN_DIGITS = 3;

/* The course code after the highest number in use, e.g. 007 after 006. It widens past 999 on its own. */
export function nextCourseCode(highestNumber: number | null) {
  return String((highestNumber ?? 0) + 1).padStart(MIN_DIGITS, "0");
}

const DISPLAY_PREFIX = "AD-";

/* How staff see a course code, e.g. AD-001. It matches the start of the registration reference. */
export function displayCourseCode(courseCode: string) {
  return `${DISPLAY_PREFIX}${courseCode}`;
}

const SLUG_FALLBACK = "workshop";

/* The page slug, e.g. coaching-for-managers-001. The course code keeps it unique. */
export function workshopSlug(title: string, courseCode: string) {
  return `${slugify(title) || SLUG_FALLBACK}-${courseCode.toLowerCase()}`;
}
