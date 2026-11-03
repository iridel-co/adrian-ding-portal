import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

/*
  Reads a cookie from the request while the server renders the page, and from
  the browser after that. Both see the same value, so the first render matches.
*/
export const readCookie = createIsomorphicFn()
  .server((name: string) => getCookie(name))
  .client((name: string) => {
    const match = document.cookie.split("; ").find((part) => part.startsWith(`${name}=`));
    return match === undefined ? undefined : decodeURIComponent(match.slice(name.length + 1));
  });
