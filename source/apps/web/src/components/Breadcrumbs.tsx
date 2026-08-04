import { Link, useMatches } from "react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@ritaj/ui";

type Crumb = { title: string };

interface RouteHandle {
  crumb?: (params: Record<string, string | undefined>) => Crumb;
}

export function Breadcrumbs() {
  const matches = useMatches();
  const crumbs = matches
    .map((match) => {
      const handle = match.handle as RouteHandle | undefined;
      return handle?.crumb ? { crumb: handle.crumb(match.params), pathname: match.pathname } : null;
    })
    .filter((entry) => entry !== null);

  if (crumbs.length === 0) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((entry, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <span key={entry.pathname} className="flex items-center gap-1.5 sm:gap-2.5">
              <BreadcrumbItem>
                {isLast
                  ? <BreadcrumbPage>{entry.crumb.title}</BreadcrumbPage>
                  : <BreadcrumbLink render={<Link to={entry.pathname} />}>{entry.crumb.title}</BreadcrumbLink>}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </span>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
