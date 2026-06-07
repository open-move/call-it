import { type ReactNode } from "react"

import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

export interface DetailTabItem {
  content: ReactNode
  label: string
  value: string
}

export interface DetailTabsProps {
  className?: string
  contentClassName?: string
  defaultValue: string
  tabs: DetailTabItem[]
}

export function DetailTabs({
  className,
  contentClassName,
  defaultValue,
  tabs,
}: DetailTabsProps) {
  return (
    <Card
      className={cn(
        "rounded-md border-0 bg-card py-0 shadow-none ring-0",
        className
      )}
    >
      <Tabs
        className="flex h-full min-h-0 flex-col gap-0"
        defaultValue={defaultValue}
      >
        <div className="flex h-11 shrink-0 items-center border-b border-border/45 px-3">
          <TabsList
            className="h-full w-full justify-start gap-6 overflow-x-auto rounded-none p-0"
            variant="line"
          >
            {tabs.map((tab) => (
              <TabsTrigger
                className="h-full flex-none rounded-none px-0 text-sm"
                key={tab.value}
                value={tab.value}
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {tabs.map((tab) => (
          <TabsContent
            className={cn(
              "mt-0 min-h-0 flex-1 overflow-auto px-4 py-4",
              contentClassName
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
