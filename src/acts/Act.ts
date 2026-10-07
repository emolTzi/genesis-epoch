// 章节基类。每一幕负责自己的场景对象、仪器面板、自由模式交互与导览脚本。

import type { App, Fadeable } from '../app/App';
import type { Director } from '../app/Director';
import { ACTS, type ActId } from '../data/script';
import { h } from '../ui/dom';
import { button } from '../ui/panel';
import type { ParamValue } from '../sim/types';

export abstract class Act {
  abstract readonly id: ActId;
  /** 进入自由交互时的参数快照，用于“回溯到本幕开始”。 */
  protected snapshot: Record<string, ParamValue> = {};
  protected disposers: (() => void)[] = [];

  constructor(protected app: App, protected dir: Director) {}

  get meta() {
    return ACTS[this.id];
  }

  /** 进入本幕：布置场景、摄像机与面板。prev 为上一幕编号。 */
  abstract enter(prev: ActId | null): Promise<void>;

  /** 离开本幕：隐藏场景对象，释放每帧回调。 */
  async exit(): Promise<void> {
    this.disposers.forEach((d) => d());
    this.disposers = [];
    this.app.panel.close();
  }

  /** 导览脚本。 */
  abstract guided(): Promise<void>;

  /** 本幕在场景中显示的对象，供其他幕清场时淡出。 */
  fadeables(): Fadeable[] {
    return [];
  }

  /** 观测者在本宇宙中应用了改动后刷新本幕。 */
  refresh(): void {}

  protected takeSnapshot(): void {
    this.snapshot = { ...this.app.state.params };
  }

  protected restoreSnapshot(): void {
    this.app.state.setParams(this.snapshot);
  }

  /** 面板底部的“确认并进入下一幕”。 */
  protected nextButton(label: string, onClick: () => void): HTMLElement {
    return h('div', { class: 'next' }, button(label, onClick, 'primary'));
  }

  protected every(fn: (dt: number, t: number) => void): void {
    this.disposers.push(this.app.onUpdate(fn));
  }
}
