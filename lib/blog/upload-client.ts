// Browser side of the blog image upload (app/api/platform/blog/upload).

/** Uploads an image and resolves to its public URL (throws with a message on failure). */
export async function uploadBlogImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/platform/blog/upload', { method: 'POST', body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.success) throw new Error(data.error || 'Upload failed')
  return data.url as string
}
