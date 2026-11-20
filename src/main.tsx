import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { demoGame } from "./app/demo";
import { actions, devHooks, getState, init, registerDemo, DerivedProvider } from "./app/store";
import "@fontsource-variable/inter";
import "./ui/theme.css";
import "./ui/polish.css";

registerDemo(demoGame);

const view = new URLSearchParams(window.location.search).get("view");
const root = createRoot(document.getElementById("root")!);

if (view === "hud") {
  document.documentElement.classList.add("nexis-layer");
  const Layer = lazy(() => import("./views/Layer"));
  root.render(
    <StrictMode>
      <Suspense fallback={null}>
        <DerivedProvider>
          <Layer />
        </DerivedProvider>
      </Suspense>
    </StrictMode>,
  );
  void init("hud");
} else {
  const html = document.documentElement;
  html.classList.add("nx-main");
  if (!("__TAURI_INTERNALS__" in window)) html.classList.add("nx-browser");
  if (import.meta.env.DEV) {
    // Handy for manual testing and the screenshot script.
    (window as unknown as { __nexis: unknown }).__nexis = { actions, devHooks, getState };
  }
  root.render(
    <StrictMode>
      <DerivedProvider>
        <App />
      </DerivedProvider>
    </StrictMode>,
  );
  void init("main");
}
