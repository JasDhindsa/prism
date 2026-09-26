export const proficiencyLevels = [
  { value: "beginner", label: "Basic", description: "Short sentences, everyday vocabulary, and clear definitions." },
  { value: "intermediate", label: "Intermediate", description: "Natural language with explanations of unfamiliar terms." },
  { value: "advanced", label: "Advanced", description: "Precise language, specialist vocabulary, and nuanced reasoning." },
] as const
export type ReadingProficiency = typeof proficiencyLevels[number]["value"]
export function isReadingProficiency(value: unknown): value is ReadingProficiency {
  return proficiencyLevels.some((level) => level.value === value)
}
