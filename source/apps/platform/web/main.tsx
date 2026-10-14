import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Api } from "./api.ts";
import { ApiProvider } from "./api-provider.tsx";
import { App } from "./app.tsx";

// Wiring only: the platform's API, handed to the app. What happens after is
// the app's, in response to whoever uses it.
const api = new Api(location.origin);

const root = document.getElementById("root");
if (!root) throw new Error("No #root element");
createRoot(root).render(
  <StrictMode>
    <ApiProvider api={api}>
      <App />
    </ApiProvider>
  </StrictMode>,
);
