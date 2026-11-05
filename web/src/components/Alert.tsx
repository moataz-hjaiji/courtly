export type Notice = { kind: 'error' | 'success'; text: string } | null

/** Success or error message. Errors use role="alert" so screen readers announce them. */
export function Alert({ notice }: { notice: Notice }) {
  if (!notice) return null
  return <p className={`alert alert-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</p>
}
