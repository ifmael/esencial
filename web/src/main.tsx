import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./globals.css";
import { ensureApiSession } from "./lib/session-bridge";

void ensureApiSession().then((ready) => {
  if (!ready) return;
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
