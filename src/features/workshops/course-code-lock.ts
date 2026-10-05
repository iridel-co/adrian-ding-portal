import type { DbOrTx } from "@/features/shared/db-types";

/*
  True when the CRM has active registrations for any session of the workshop.
  The CRM owns registrations, so it supplies the real check.
*/
export async function isCourseCodeLocked(_db: DbOrTx, _workshopId: string) {
  return false;
}
