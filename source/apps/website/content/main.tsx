import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import * as Website from "@ensemble/website";

/** The docs page the server rendered, from the props it embedded for us. */
function DocsPage() {
  const element = document.getElementById(Website.DOCS_PROPS_ELEMENT_ID);
  const props = JSON.parse(element!.textContent!) as Website.DocsProps;
  return <Website.Docs {...props} />;
}

const Page = location.pathname.startsWith("/docs") ? DocsPage : Website.Landing;

hydrateRoot(
  document.getElementById("root")!,
  <StrictMode>
    <Page />
  </StrictMode>,
);
