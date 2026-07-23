import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

declare global {
  // deno-lint-ignore no-var
  var env: Record<string, string>;
}

function App() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-950 text-slate-50">
      <h1 className="text-4xl font-bold">Hello, world!</h1>
      <p className="text-slate-400">API_ENDPOINT: {globalThis.env.API_ENDPOINT ?? "unset"}</p>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
