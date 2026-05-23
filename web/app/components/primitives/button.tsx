import type { ComponentProps } from "react"

import { Button as BaseButton } from "~/components/ui/button"

export interface ButtonProps extends ComponentProps<typeof BaseButton> {}

export function Button(props: ButtonProps) {
  return <BaseButton {...props} />
}
