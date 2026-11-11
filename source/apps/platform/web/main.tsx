import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { Api } from "./api.ts";
import { ApiProvider } from "./api-provider.tsx";
import * as Paths from "./paths.ts";
import { Screens } from "./routes.tsx";

// Wiring only: the platform's API, handed to its screens and the router that
// picks one. What happens after is the app's, in response to whoever uses it.
const api = new Api(location.origin);

// A bookmark from when the platform's URLs were hashes opens where it pointed.
const legacy = Paths.fromLegacyHash(location.hash);
if (legacy) history.replaceState(null, "", legacy);

const router = createBrowserRouter(new Screens(api).routes());

const root = document.getElementById("root");
if (!root) throw new Error("No #root element");
createRoot(root).render(
  <StrictMode>
    <ApiProvider api={api}>
      <RouterProvider router={router} />
    </ApiProvider>
  </StrictMode>,
);
