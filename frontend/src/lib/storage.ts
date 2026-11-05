/** localStorage that never throws (private mode, blocked storage, quota). */
export const safeStorage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = window.localStorage.getItem(key)
      return raw === null ? fallback : (JSON.parse(raw) as T)
    } catch {
      return fallback
    }
  },
  set(key: string, value: unknown): void {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Storage is a convenience only.
    }
  },
}
