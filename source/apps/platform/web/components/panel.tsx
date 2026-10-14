import type { ReactNode } from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from "@ritaj/ui";

/** One titled block of a screen: a Fluid card on a raised surface. */
export function Panel(
  { title, description, action, children, className, label }: {
    title: ReactNode;
    description?: ReactNode;
    /** Controls in the header's trailing corner. */
    action?: ReactNode;
    children?: ReactNode;
    className?: string;
    /** Names the panel for assistive technology, when the title alone doesn't. */
    label?: string;
  },
) {
  return (
    <section
      aria-label={label}
      className={cn(
        "min-w-0 rounded-xl bg-surface-2 shadow-surface-2",
        className,
      )}
    >
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
          {action && <CardAction>{action}</CardAction>}
        </CardHeader>
        {children && (
          <CardContent className="grid grid-cols-1 gap-4">
            {children}
          </CardContent>
        )}
      </Card>
    </section>
  );
}
