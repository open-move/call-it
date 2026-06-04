import type { ComponentProps } from "react"

import {
  DropdownMenu,
  DropdownMenuCheckboxItem as BaseDropdownMenuCheckboxItem,
  DropdownMenuContent as BaseDropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem as BaseDropdownMenuItem,
  DropdownMenuLabel as BaseDropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem as BaseDropdownMenuRadioItem,
  DropdownMenuSeparator as BaseDropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent as BaseDropdownMenuSubContent,
  DropdownMenuSubTrigger as BaseDropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { cn } from "~/lib/utils"

function AppDropdownMenuContent({
  className,
  ...props
}: ComponentProps<typeof BaseDropdownMenuContent>) {
  return (
    <BaseDropdownMenuContent
      className={cn(
        "rounded-md bg-[color-mix(in_oklch,var(--card)_92%,white)] p-1.5 text-card-foreground shadow-none ring-0",
        className
      )}
      {...props}
    />
  )
}

function AppDropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof BaseDropdownMenuLabel>) {
  return (
    <BaseDropdownMenuLabel
      className={cn(
        "px-2 py-1 font-mono text-[10px] font-normal tracking-wide text-muted-foreground uppercase",
        className
      )}
      {...props}
    />
  )
}

function AppDropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof BaseDropdownMenuItem>) {
  return (
    <BaseDropdownMenuItem
      className={cn(
        "cursor-pointer rounded-md px-2 py-1.5 text-xs focus:bg-muted focus:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function AppDropdownMenuCheckboxItem({
  className,
  ...props
}: ComponentProps<typeof BaseDropdownMenuCheckboxItem>) {
  return (
    <BaseDropdownMenuCheckboxItem
      className={cn(
        "cursor-pointer rounded-md py-1.5 pr-8 pl-2 text-xs focus:bg-muted focus:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function AppDropdownMenuRadioItem({
  className,
  ...props
}: ComponentProps<typeof BaseDropdownMenuRadioItem>) {
  return (
    <BaseDropdownMenuRadioItem
      className={cn(
        "cursor-pointer rounded-md py-1.5 pr-8 pl-2 text-xs focus:bg-muted focus:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function AppDropdownMenuSubTrigger({
  className,
  ...props
}: ComponentProps<typeof BaseDropdownMenuSubTrigger>) {
  return (
    <BaseDropdownMenuSubTrigger
      className={cn(
        "cursor-pointer rounded-md px-2 py-1.5 text-xs focus:bg-muted focus:text-foreground data-open:bg-muted data-open:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function AppDropdownMenuSubContent({
  className,
  ...props
}: ComponentProps<typeof BaseDropdownMenuSubContent>) {
  return (
    <BaseDropdownMenuSubContent
      className={cn(
        "rounded-md bg-[color-mix(in_oklch,var(--card)_92%,white)] p-1.5 text-card-foreground shadow-none ring-0",
        className
      )}
      {...props}
    />
  )
}

function AppDropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof BaseDropdownMenuSeparator>) {
  return (
    <BaseDropdownMenuSeparator
      className={cn("-mx-1.5 my-1 h-px bg-foreground/10", className)}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuTrigger,
  AppDropdownMenuCheckboxItem as DropdownMenuCheckboxItem,
  AppDropdownMenuContent as DropdownMenuContent,
  AppDropdownMenuItem as DropdownMenuItem,
  AppDropdownMenuLabel as DropdownMenuLabel,
  AppDropdownMenuRadioItem as DropdownMenuRadioItem,
  AppDropdownMenuSeparator as DropdownMenuSeparator,
  AppDropdownMenuSubContent as DropdownMenuSubContent,
  AppDropdownMenuSubTrigger as DropdownMenuSubTrigger,
}
