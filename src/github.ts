export interface PutFileParams {
  token: string
  repo: string
  branch: string
  path: string
  content: string
  commitMessage: string
}

export interface PutFileResult {
  path: string
  sha: string
  htmlUrl: string
}

export class PathConflictError extends Error {
  constructor(public readonly path: string) {
    super(`GitHub path conflict: ${path}`)
    this.name = 'PathConflictError'
  }
}

export async function putFile(
  params: PutFileParams,
  fetchImpl: typeof fetch = fetch,
): Promise<PutFileResult> {
  const url = `https://api.github.com/repos/${params.repo}/contents/${encodePath(params.path)}`
  const body = {
    message: params.commitMessage,
    content: utf8ToBase64(params.content),
    branch: params.branch,
  }

  const response = await fetchImpl(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${params.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'tolaria-tg-bot',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (response.status === 422) {
    throw new PathConflictError(params.path)
  }
  if (!response.ok) {
    const detail = await safeText(response)
    throw new Error(`GitHub PUT failed: HTTP ${response.status} ${detail}`)
  }

  const data = (await response.json()) as {
    content: { path: string; sha: string; html_url: string }
  }
  return {
    path: data.content.path,
    sha: data.content.sha,
    htmlUrl: data.content.html_url,
  }
}

export function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

export function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
  }
}
