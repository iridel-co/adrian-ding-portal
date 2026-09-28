import { createAuthClient } from "better-auth/react";

/* Browser-only. Auth lives on the same origin, so no baseURL is needed. */
export const authClient = createAuthClient();
