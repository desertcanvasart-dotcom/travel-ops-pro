// The full text of a Copilot Knowledge entry, rebuilt from its chunks.
//
// A long entry is stored as chunks (lib/embeddings chunkText): the parent row
// holds chunk 0, child rows (parent_id) hold the rest by chunk_index. The
// list returned only the parent, so the edit modal opened on chunk 0 and
// saving re-embedded just that — the rest of the entry was deleted.
//
// chunkText splits on paragraphs (joined back with a blank line) and
// hard-splits an over-long paragraph into windows that overlap by up to
// `overlap` characters. A chunk that starts with the previous chunk's tail is
// such a window: only its new part is appended. The rebuilt text is the
// original up to whitespace chunkText normalised away.
export function joinKnowledgeChunks(chunks: string[], overlap = 200): string {
  let text = ''
  for (const chunk of chunks) {
    if (!text) { text = chunk; continue }
    const head = chunk.slice(0, Math.min(overlap, chunk.length))
    text = head && text.endsWith(head) ? text + chunk.slice(head.length) : `${text}\n\n${chunk}`
  }
  return text
}

/** The parent's metadata after a re-embed: what it had, what the caller sent,
 *  the question (kept when the caller sends none) and the new chunk count. */
export function knowledgeMetadataOnEdit(
  existing: Record<string, unknown> | null | undefined,
  sent: Record<string, unknown> | undefined,
  question: string | null | undefined,
  totalChunks: number,
): Record<string, unknown> {
  const base = { ...(existing || {}), ...(sent || {}) }
  return {
    ...base,
    question: question !== undefined ? (question?.trim() || null) : (base.question ?? null),
    total_chunks: totalChunks,
  }
}
