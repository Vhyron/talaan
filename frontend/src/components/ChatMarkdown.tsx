import type { ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** "[S3]" becomes a link to "#cite-3", so the `a` renderer below can swap it for a source chip. */
const CITE = '#cite-'
const withCiteLinks = (text: string) => text.replace(/\[S(\d+)\](?!\()/g, `[S$1](${CITE}$1)`)

/**
 * A chat answer rendered as Markdown (lists, bold, tables, code), with "[S1]" citations
 * turned into whatever `cite` returns. Images are dropped, so an answer can never make the
 * browser fetch a URL by itself, and raw HTML is never rendered.
 */
export default function ChatMarkdown({ text, cite, typing = false }: {
  text: string
  cite?: (n: number) => ReactNode
  /** still streaming: show a cursor after the last word */
  typing?: boolean
}) {
  const components: Components = {
    a: ({ href, children: label }) => {
      if (href?.startsWith(CITE)) {
        const chip = cite?.(Number(href.slice(CITE.length)))
        return <>{chip ?? <>[{label}]</>}</>
      }
      return <a href={href} target="_blank" rel="noreferrer noopener">{label}</a>
    },
  }
  return (
    <div className={`chat-md ${typing ? 'typing' : ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} disallowedElements={['img']} unwrapDisallowed>
        {withCiteLinks(text)}
      </ReactMarkdown>
    </div>
  )
}
