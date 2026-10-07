// 本机存储：隐私窗口或禁用存储时静默降级，作品照常运行。

export function load<T>(key: string, fallback: T, session = false): T {
  try {
    const raw = (session ? sessionStorage : localStorage).getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown, session = false): void {
  try {
    (session ? sessionStorage : localStorage).setItem(key, JSON.stringify(value));
  } catch {
    /* 存储不可用时忽略 */
  }
}

export function remove(key: string, session = false): void {
  try {
    (session ? sessionStorage : localStorage).removeItem(key);
  } catch {
    /* 忽略 */
  }
}
