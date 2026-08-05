import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "../lib/utils.ts"

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "relative inline-flex h-9 items-center gap-4 border-b border-border",
        className
      )}
      {...props}
    />
  )
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(
        "relative inline-flex h-9 items-center justify-center rounded-t-md border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground whitespace-nowrap transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[selected]:border-foreground data-[selected]:bg-accent data-[selected]:text-foreground aria-[current=page]:border-foreground aria-[current=page]:bg-accent aria-[current=page]:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-panel"
      className={cn("outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTab, TabsPanel }
