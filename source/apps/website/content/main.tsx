import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import * as Website from "@ensemble/website";

hydrateRoot(
  document.getElementById("root")!,
  <StrictMode>
    <Website.Landing />
  </StrictMode>,
);
