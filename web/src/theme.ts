type Scheme = "light" | "dark";

// Must match --bg in index.css for each scheme.
const PAGE_BG: Record<Scheme, string> = { light: "#efeff4", dark: "#000000" };

/** Inside Telegram the client's scheme wins; in a plain browser the OS setting does. */
export function syncTheme() {
  const webApp = window.Telegram?.WebApp;
  const inTelegram = Boolean(webApp?.initData);
  const media = matchMedia("(prefers-color-scheme: dark)");

  const apply = () => {
    const scheme: Scheme = inTelegram ? webApp!.colorScheme : media.matches ? "dark" : "light";
    document.documentElement.dataset.theme = scheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", PAGE_BG[scheme]);
    if (inTelegram && webApp!.isVersionAtLeast("6.1")) {
      webApp!.setHeaderColor(PAGE_BG[scheme]);
      webApp!.setBackgroundColor(PAGE_BG[scheme]);
    }
  };

  apply();
  if (inTelegram) webApp!.onEvent("themeChanged", apply);
  else media.addEventListener("change", apply);
}

/** Telegram's native header back button, when this client has one. */
export function nativeBackButton() {
  const webApp = window.Telegram?.WebApp;
  return webApp?.initData && webApp.isVersionAtLeast("6.1") ? webApp.BackButton : null;
}
