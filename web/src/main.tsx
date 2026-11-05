import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./index.css";
import { syncTheme } from "./theme.ts";

const webApp = window.Telegram?.WebApp;
webApp?.ready();
webApp?.expand();
syncTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
