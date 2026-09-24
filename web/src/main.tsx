import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./globals.css";
import { installAmbient } from "./lib/ambient";

installAmbient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
