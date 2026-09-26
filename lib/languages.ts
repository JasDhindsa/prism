export const languages = [
  { name: "English", code: "en", ocr: "eng" },
  { name: "Spanish", code: "es", ocr: "spa" },
  { name: "French", code: "fr", ocr: "fra" },
  { name: "German", code: "de", ocr: "deu" },
  { name: "Italian", code: "it", ocr: "ita" },
  { name: "Portuguese", code: "pt", ocr: "por" },
  { name: "Hindi", code: "hi", ocr: "hin" },
  { name: "Punjabi", code: "pa", ocr: "pan" },
  { name: "Arabic", code: "ar", ocr: "ara" },
  { name: "Chinese", code: "zh", ocr: "chi_sim" },
  { name: "Japanese", code: "ja", ocr: "jpn" },
  { name: "Korean", code: "ko", ocr: "kor" },
  { name: "Russian", code: "ru", ocr: "rus" },
  { name: "Turkish", code: "tr", ocr: "tur" },
  { name: "Dutch", code: "nl", ocr: "nld" },
  { name: "Polish", code: "pl", ocr: "pol" },
  { name: "Swedish", code: "sv", ocr: "swe" },
  { name: "Indonesian", code: "id", ocr: "ind" },
] as const

export function speechLanguageCode(value?: string): string | undefined {
  if (!value || value === "auto") return undefined
  const aliases: Record<string, string> = { eng: "en", spa: "es", fra: "fr", fre: "fr", deu: "de", ger: "de", ita: "it", por: "pt", hin: "hi", pan: "pa", ara: "ar", zho: "zh", chi: "zh", jpn: "ja", kor: "ko", rus: "ru", tur: "tr", nld: "nl", dut: "nl", pol: "pl", swe: "sv", ind: "id" }
  const normalized = value.toLowerCase()
  return languages.find((item) => item.name.toLowerCase() === normalized)?.code || aliases[normalized] || (/^[a-z]{2}$/.test(normalized) ? normalized : undefined)
}
