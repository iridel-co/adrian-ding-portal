import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

const DEFAULT_THEME: Theme = "dark";
const STORAGE_KEY = "theme";

/*
  Sets the theme class on <html> before the page paints, so there's no flash
  of the wrong theme. Uses the saved choice, or dark by default.
*/
const themeInitializerScript = `(function(){var t=${JSON.stringify(DEFAULT_THEME)};try{var s=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});if(s==='light'||s==='dark'){t=s}}catch(e){}var r=document.documentElement;r.classList.remove('light','dark');r.classList.add(t);r.style.colorScheme=t})()`;

export function ThemeInitializer() {
  return <script dangerouslySetInnerHTML={{ __html: themeInitializerScript }} />;
}

function getTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => DEFAULT_THEME);

  const setTheme = (next: Theme) => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(next);
    root.style.colorScheme = next;
    localStorage.setItem(STORAGE_KEY, next);
  };

  return { theme, setTheme };
}

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle theme"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </Button>
  );
}
