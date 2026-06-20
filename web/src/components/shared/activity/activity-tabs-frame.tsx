import type { ReactNode } from "react"

import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

export interface ActivityTabItem<TValue extends string> {
  content: ReactNode
  contentClassName?: string
  count?: number
  label: string
  value: TValue
}

export interface ActivityTabsFrameProps<TValue extends string> {
  cardClassName?: string
  defaultValue?: TValue
  headerClassName?: string
  headerContent?: ReactNode
  listClassName?: string
  onValueChange?: (value: TValue) => void
  tabs: ActivityTabItem<TValue>[]
  tabsClassName?: string
  value?: TValue
}

export function ActivityTabsFrame<TValue extends string>({
  cardClassName,
  defaultValue,
  headerClassName,
  headerContent,
  listClassName,
  onValueChange,
  tabs,
  tabsClassName,
  value,
}: ActivityTabsFrameProps<TValue>) {
  const firstTab = tabs.at(0)?.value
  const resolvedDefaultValue = defaultValue ?? firstTab

  return (
    <Card
      className={cn(
        "h-96 min-w-0 overflow-hidden rounded-md border-0 bg-card py-0 shadow-none ring-0",
        cardClassName
      )}
    >
      <Tabs
        className={cn("flex h-full min-h-0 flex-col gap-0", tabsClassName)}
        defaultValue={value === undefined ? resolvedDefaultValue : undefined}
        value={value}
        onValueChange={(nextValue) => onValueChange?.(nextValue as TValue)}
      >
        <div
          className={cn(
            "flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/45 px-3",
            headerClassName
          )}
        >
          <TabsList
            className={cn(
              "h-full w-full justify-start gap-5 overflow-x-auto rounded-none p-0",
              listClassName
            )}
            variant="line"
          >
            {tabs.map((tab) => (
              <ActivityTabTrigger key={tab.value} tab={tab} />
            ))}
          </TabsList>
          {headerContent}
        </div>

        {tabs.map((tab) => (
          <TabsContent
            className={cn(
              "min-h-0 flex-1 overflow-hidden",
              tab.contentClassName
            )}
            key={tab.value}
            value={tab.value}
          >
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  )
}

function ActivityTabTrigger<TValue extends string>({
  tab,
}: {
  tab: ActivityTabItem<TValue>
}) {
  return (
    <TabsTrigger
      className="flex-none rounded-none px-0 text-xs font-medium tracking-[-0.01em] text-muted-foreground transition-[color] duration-150 after:bg-primary hover:text-foreground data-active:text-foreground"
      value={tab.value}
    >
      <span>{tab.label}</span>
      {tab.count === undefined ? null : (
        <span className="rounded-sm bg-muted/45 px-1.5 py-0.5 font-mono text-[10px] leading-none text-current tabular-nums opacity-80">
          {tab.count}
        </span>
      )}
    </TabsTrigger>
  )
}
