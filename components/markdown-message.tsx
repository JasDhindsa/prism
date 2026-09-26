"use client"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import "katex/dist/katex.min.css"

export function MarkdownMessage({ text }: { text: string }) {
  return <div className="reader-markdown" dir="auto"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]} skipHtml components={{
    a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
    // Source-generated images are shown as links rather than loading remote trackers.
    img: ({ alt, src }) => typeof src === "string" ? <a href={src} target="_blank" rel="noopener noreferrer">{alt || "Image"}</a> : null,
    table: ({ children }) => <div className="reader-markdown-table"><table>{children}</table></div>,
  }}>{text}</ReactMarkdown></div>
}
