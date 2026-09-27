"use client"

import { useEffect, useRef, type RefObject } from "react"
import Lenis from "lenis"

export function useReaderSmoothScroll(wrapper: RefObject<HTMLDivElement | null>, content: RefObject<HTMLDivElement | null>, enabled: boolean) {
  const instance = useRef<Lenis | null>(null)
  useEffect(() => {
    const viewport = wrapper.current
    const pages = content.current
    if (!enabled || !viewport || !pages) return
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    function configure() {
      instance.current?.destroy()
      instance.current = null
      if (reducedMotion.matches || !viewport || !pages) return
      instance.current = new Lenis({
        wrapper: viewport,
        content: pages,
        autoRaf: true,
        autoResize: true,
        lerp: 0.12,
        smoothWheel: true,
        syncTouch: false,
        allowNestedScroll: true,
        prevent: (node) => !!node.closest("[data-lenis-prevent], textarea, [data-slot='popover-content']"),
      })
    }
    configure()
    reducedMotion.addEventListener("change", configure)
    return () => {
      reducedMotion.removeEventListener("change", configure)
      instance.current?.destroy()
      instance.current = null
    }
  }, [wrapper, content, enabled])
  return instance
}
