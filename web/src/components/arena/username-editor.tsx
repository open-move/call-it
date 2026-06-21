import { CheckIcon, PencilIcon } from "lucide-react"
import { useEffect, useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useSession } from "@/lib/auth/session"
import { cn } from "@/lib/utils"
import { BackendError } from "@/services/backend-client"

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/
const USERNAME_HINT = "3-20 chars: lowercase letters, numbers, and underscores."

function getValidationHint(value: string) {
  if (value.length === 0 || USERNAME_PATTERN.test(value)) {
    return undefined
  }

  return USERNAME_HINT
}

export function UsernameEditor() {
  const { status, updateProfile, user } = useSession()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>()

  useEffect(() => {
    setValue(user?.username ?? "")
  }, [user?.username])

  // Username editing requires a backend session; hidden otherwise.
  if (status !== "authenticated") {
    return null
  }

  const validationHint = getValidationHint(value)
  const isUnchanged = value === (user?.username ?? "")
  const canSave = !isSaving && USERNAME_PATTERN.test(value) && !isUnchanged
  const triggerLabel = user?.username ? `@${user.username}` : "Set username"

  async function handleSave() {
    if (!USERNAME_PATTERN.test(value)) {
      setErrorMessage(USERNAME_HINT)
      return
    }

    setIsSaving(true)
    setErrorMessage(undefined)

    try {
      await updateProfile({ username: value })
      setOpen(false)
    } catch (error) {
      if (error instanceof BackendError && error.status === 409) {
        setErrorMessage("That username is taken.")
        return
      }

      setErrorMessage(
        error instanceof Error ? error.message : "Could not update username."
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)

        if (nextOpen) {
          setErrorMessage(undefined)
          setValue(user?.username ?? "")
        }
      }}
      open={open}
    >
      <DialogTrigger
        render={
          <Button
            className={cn(
              "shadow-none",
              user?.username ? "text-foreground" : "text-primary"
            )}
            size="sm"
            type="button"
            variant="outline"
          />
        }
      >
        <PencilIcon className="size-3.5" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="gap-5 rounded-md border-0 bg-card p-5 shadow-none ring-0 sm:max-w-md">
        <DialogHeader className="gap-1">
          <DialogTitle className="text-sm leading-none font-medium tracking-[-0.01em]">
            {user?.username ? "Edit username" : "Set username"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Shown on your calls in the Arena.
          </p>
        </DialogHeader>

        <div className="space-y-2">
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
              @
            </span>
            <Input
              autoComplete="off"
              className="border-border/35 bg-muted/25 pl-7 font-mono text-sm shadow-none ring-0 transition-[background-color,border-color,color] duration-150 hover:bg-muted/30 focus-visible:border-primary/35 focus-visible:bg-card focus-visible:ring-1"
              maxLength={20}
              onChange={(event) =>
                setValue(event.target.value.toLowerCase().trim())
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" && canSave) {
                  void handleSave()
                }
              }}
              placeholder="username"
              value={value}
            />
          </div>

          {(validationHint || errorMessage) && (
            <p
              className={cn(
                "text-[11px]",
                errorMessage ? "text-outcome-down" : "text-muted-foreground"
              )}
            >
              {errorMessage ?? validationHint}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            className="w-full active:scale-[0.98]"
            disabled={!canSave}
            onClick={handleSave}
            size="lg"
            type="button"
          >
            <CheckIcon className="size-3.5" />
            {isSaving ? "Saving" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
