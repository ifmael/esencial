import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./globals.css";
import { installPointerHalo } from "./lib/pointer-halo";
import { applyTheme, readTheme } from "./lib/theme";

applyTheme(readTheme());
installPointerHalo();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
