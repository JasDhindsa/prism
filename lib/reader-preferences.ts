export const proficiencyLevels = [
  { value: "beginner", label: "Simple", description: "Short sentences, everyday vocabulary, and clear definitions." },
  { value: "intermediate", label: "Balanced", description: "Natural language with explanations of unfamiliar terms." },
  { value: "advanced", label: "In depth", description: "Precise language, specialist vocabulary, and nuanced reasoning." },
] as const
export type ReadingProficiency = typeof proficiencyLevels[number]["value"]
export function isReadingProficiency(value: unknown): value is ReadingProficiency {
  return proficiencyLevels.some((level) => level.value === value)
}
