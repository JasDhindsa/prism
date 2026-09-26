import {
  RiLightbulbLine, RiMarkPenLine, RiQuestionAnswerLine,
  RiTranslate2, RiVideoLine, RiVolumeUpLine,
} from "@remixicon/react"
import type { AnnotationKind } from "@/lib/mock-annotations"

const icons = {
  quiz: RiQuestionAnswerLine,
  adaptation: RiLightbulbLine,
  translation: RiTranslate2,
  pronunciation: RiVolumeUpLine,
  highlight: RiMarkPenLine,
  video: RiVideoLine,
} satisfies Record<AnnotationKind, typeof RiQuestionAnswerLine>

export function AnnotationTypeIcon({ kind, className }: { kind: AnnotationKind; className?: string }) {
  const Icon = icons[kind]
  return <Icon className={className} aria-hidden="true" />
}
