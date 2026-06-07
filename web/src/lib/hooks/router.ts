import { useLocation, useRouter } from "@tanstack/react-router"
import { useCallback, useMemo } from "react"

type SearchParamSetter = (searchParams: URLSearchParams) => void

function getSearchParamsRecord(searchParams: URLSearchParams) {
  const search: Record<string, string> = {}

  searchParams.forEach((value, key) => {
    search[key] = value
  })

  return search
}

export function useAppSearchParams(): [URLSearchParams, SearchParamSetter] {
  const router = useRouter()
  const searchStr = useLocation({ select: (location) => location.searchStr })
  const searchParams = useMemo(() => new URLSearchParams(searchStr), [searchStr])

  const setSearchParams = useCallback(
    (nextSearchParams: URLSearchParams) => {
      const search = nextSearchParams.toString()
      const nextHref = `${router.state.location.pathname}${search ? `?${search}` : ""}${router.state.location.hash ? `#${router.state.location.hash}` : ""}`

      router.history.push(nextHref)
    },
    [router]
  )

  return [searchParams, setSearchParams]
}

export function useAppRouteRefresh() {
  const router = useRouter()

  return useCallback(() => {
    void router.invalidate()
  }, [router])
}
