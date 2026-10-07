// 极简事件总线。

type Handler<T> = (payload: T) => void;

export class Emitter<Events extends Record<string, unknown>> {
  private handlers: { [K in keyof Events]?: Handler<Events[K]>[] } = {};

  on<K extends keyof Events>(type: K, fn: Handler<Events[K]>): () => void {
    (this.handlers[type] ??= []).push(fn);
    return () => this.off(type, fn);
  }

  off<K extends keyof Events>(type: K, fn: Handler<Events[K]>): void {
    const list = this.handlers[type];
    if (list) this.handlers[type] = list.filter((h) => h !== fn);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    for (const fn of this.handlers[type] ?? []) fn(payload);
  }
}
