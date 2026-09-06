import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { Landing } from "../shared/index.ts";

hydrateRoot(
  document.getElementById("root")!,
  <StrictMode>
    <Landing />
  </StrictMode>,
);
