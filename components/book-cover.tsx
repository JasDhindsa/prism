import type { LibraryPdf } from "@/lib/library"

const covers = [
  { background: "#b7b6a8", ink: "#242923", accent: "#67745b" },
  { background: "#b87662", ink: "#29201e", accent: "#70453e" },
  { background: "#768a91", ink: "#17272b", accent: "#b7c5bd" },
  { background: "#e2c586", ink: "#30291d", accent: "#a77b49" },
  { background: "#797685", ink: "#f3e9db", accent: "#c4a7a0" },
  { background: "#c2a39a", ink: "#2f2826", accent: "#837071" },
]

function coverIndex(id: string) {
  let hash = 0
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) | 0
  return Math.abs(hash) % covers.length
}

export function BookCover({ pdf }: { pdf: LibraryPdf }) {
  const variant = coverIndex(pdf.id)
  const palette = covers[variant]
  return (
    <div
      className="relative isolate aspect-[0.77] w-full overflow-hidden rounded-xl shadow-[inset_4px_0_0_rgba(0,0,0,.12),0_16px_30px_rgba(0,0,0,.22)] ring-1 ring-black/10 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-[inset_4px_0_0_rgba(0,0,0,.12),0_24px_38px_rgba(0,0,0,.3)] group-focus-visible:-translate-y-1"
      style={{ backgroundColor: palette.background, color: palette.ink }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(130deg,rgba(255,255,255,.25),transparent_36%,rgba(0,0,0,.12))]" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 opacity-70" aria-hidden="true">
        {variant === 0 && <>
          <span className="absolute left-[9%] top-[24%] aspect-square w-[84%] rounded-full border-[18px]" style={{ borderColor: palette.accent }} />
          <span className="absolute left-[22%] top-[34%] aspect-square w-[58%] rounded-full border border-current" />
          <span className="absolute left-[-10%] top-[68%] h-px w-[120%] -rotate-[28deg] bg-current" />
        </>}
        {variant === 1 && <>
          <span className="absolute left-[-20%] top-[24%] h-[55%] w-[145%] -rotate-[26deg] border border-current" />
          <span className="absolute left-[-20%] top-[33%] h-[55%] w-[145%] -rotate-[26deg] border border-current" />
          <span className="absolute left-[-20%] top-[42%] h-[55%] w-[145%] -rotate-[26deg] border border-current" />
        </>}
        {variant === 2 && <>
          <span className="absolute left-[13%] top-[25%] h-[67%] w-[74%] rounded-t-full border border-current" />
          <span className="absolute left-[25%] top-[35%] h-[57%] w-[50%] rounded-t-full border border-current" />
          <span className="absolute left-[37%] top-[45%] h-[47%] w-[26%] rounded-t-full border border-current" />
        </>}
        {variant === 3 && <>
          <span className="absolute left-[8%] top-[29%] aspect-square w-[84%] rounded-full" style={{ backgroundColor: palette.accent }} />
          <span className="absolute left-[8%] top-[64%] h-px w-[84%] bg-current" />
          <span className="absolute left-[8%] top-[70%] h-px w-[84%] bg-current" />
        </>}
        {variant === 4 && <>
          <span className="absolute left-[13%] top-[32%] aspect-square w-[74%] rotate-45 border border-current" />
          <span className="absolute left-[24%] top-[39%] aspect-square w-[52%] rotate-45 border border-current" />
          <span className="absolute left-[35%] top-[46%] aspect-square w-[30%] rotate-45 border border-current" />
        </>}
        {variant === 5 && <>
          <span className="absolute left-[-5%] top-[28%] aspect-square w-[110%] rounded-full" style={{ backgroundColor: palette.accent }} />
          <span className="absolute left-[10%] top-[40%] aspect-square w-[80%] rounded-full border border-current" />
          <span className="absolute left-1/2 top-[29%] h-[63%] w-px bg-current" />
        </>}
      </div>
      <div className="relative z-10 flex h-full flex-col justify-between px-[10%] pb-[9%] pt-[10%]">
        <span className="text-[clamp(7px,.7vw,10px)] font-bold uppercase tracking-[.18em]">PRISM <span className="mx-1">/</span> PDF</span>
        <span className="line-clamp-4 break-words font-serif text-[clamp(1.1rem,2vw,2rem)] font-semibold leading-[1.06] tracking-[-.045em]">{pdf.title}</span>
        <span className="flex items-center justify-between border-t border-current/50 pt-2 text-[clamp(7px,.65vw,10px)] font-semibold tracking-[.16em]"><span>DOCUMENT</span><span className="text-base leading-none">✳</span></span>
      </div>
    </div>
  )
}
