// 墓园、设置与启动页。

import { h, clear } from './dom';
import { PRESETS, chat, loadConfig, saveConfig, type ProviderConfig } from '../llm/provider';
import type { State } from '../app/state';
import type { Quality } from '../render/Stage';

export class Graveyard {
  readonly el: HTMLElement;
  private body: HTMLElement;

  constructor(private state: State, onClose: () => void) {
    this.body = h('div', { class: 'obody' });
    this.el = h('section', { class: 'overlay', hidden: true, 'aria-label': '文明墓园' },
      h('div', { class: 'oh' }, h('b', {}, '文明墓园'), h('span', { class: 'hint' }, '熄灭的文明化作暗色星球，环绕在实验大厅外圈。'), h('button', { class: 'x', type: 'button', 'aria-label': '关闭', onclick: onClose }, '×')),
      this.body,
    );
    state.ev.on('graves', () => !this.el.hidden && this.render());
  }

  setOpen(open: boolean): void {
    this.el.hidden = !open;
    if (open) this.render();
  }

  private render(): void {
    clear(this.body);
    const layerName = ['L0 物理常数', 'L1 天体', 'L2 行星化学', 'L3 生命', 'L4 文明'];
    const mine = this.state.graves.filter((g) => !g.preset).length;
    this.body.append(
      h('p', { class: 'hint' }, `共 ${this.state.graves.length} 个文明，其中 ${mine} 个来自你的实验，其余为预置的历史实验档案。墓志铭由程序从 AI 辅助撰写、团队审校的文本库中选取。`),
      h('div', { class: 'graves' }, ...this.state.graves.map((g) => h('article', { class: 'grave' },
        h('b', {}, g.name),
        h('div', { class: 'why' }, `${layerName[g.layer] ?? ''} · ${g.cause}`),
        h('div', { class: 'ep' }, `“${g.epitaph}”`),
        h('small', {}, `宇宙编号 ${g.seed} · ${g.date}`),
      ))),
      ...(mine ? [h('div', { class: 'btns' }, h('button', { type: 'button', class: 'btn danger', onclick: () => this.state.clearGraves() }, '清空我的实验记录'))] : []),
    );
  }
}

export interface SettingsHandlers {
  onQuality: (q: Quality | 'auto') => void;
  onTts: (on: boolean) => void;
}

export class Settings {
  readonly el: HTMLElement;

  constructor(onClose: () => void, private on: SettingsHandlers) {
    const cfg = loadConfig();
    const preset = h('select', { id: 'llm-preset' }, ...PRESETS.map((p) => h('option', { value: p.id }, p.name))) as HTMLSelectElement;
    const base = h('input', { id: 'llm-base', type: 'url', placeholder: 'https://…/v1', autocomplete: 'off' }) as HTMLInputElement;
    const model = h('input', { id: 'llm-model', type: 'text', placeholder: '模型名称', autocomplete: 'off' }) as HTMLInputElement;
    const key = h('input', { id: 'llm-key', type: 'password', placeholder: 'API Key（只保存在本机浏览器）', autocomplete: 'off' }) as HTMLInputElement;
    const remember = h('input', { id: 'llm-remember', type: 'checkbox' }) as HTMLInputElement;
    const status = h('div', { class: 'status-line', 'aria-live': 'polite' });
    const fill = (id: string) => {
      const p = PRESETS.find((x) => x.id === id)!;
      if (id !== 'custom') {
        base.value = p.baseURL;
        model.value = p.model;
      }
    };
    if (cfg) {
      preset.value = cfg.preset;
      base.value = cfg.baseURL;
      model.value = cfg.model;
      key.value = cfg.apiKey;
      remember.checked = cfg.remember;
    } else {
      preset.value = 'deepseek';
      fill('deepseek');
    }
    preset.addEventListener('change', () => fill(preset.value));
    const read = (): ProviderConfig => ({ preset: preset.value, baseURL: base.value.trim(), model: model.value.trim(), apiKey: key.value.trim(), remember: remember.checked });
    const quality = h('select', { id: 'quality' },
      h('option', { value: 'auto' }, '自动（按帧率升降）'), h('option', { value: 'high' }, '高'), h('option', { value: 'mid' }, '中'), h('option', { value: 'low' }, '低（关闭泛光）'),
    ) as HTMLSelectElement;
    quality.addEventListener('change', () => this.on.onQuality(quality.value as Quality | 'auto'));
    const tts = h('input', { id: 'tts', type: 'checkbox' }) as HTMLInputElement;
    tts.addEventListener('change', () => this.on.onTts(tts.checked));

    this.el = h('section', { class: 'overlay', hidden: true, 'aria-label': '设置' },
      h('div', { class: 'oh' }, h('b', {}, '设置'), h('button', { class: 'x', type: 'button', 'aria-label': '关闭', onclick: onClose }, '×')),
      h('div', { class: 'obody' },
        h('div', { class: 'form' },
          h('h3', { class: 'serif' }, '观测者·零号：接入大模型'),
          h('p', { class: 'hint' }, '不配置也能完整体验：离线模式会回答预置问题并执行常见的反事实调参。接入后可以自由提问。仅支持 OpenAI 兼容接口；服务地址与模型名称以服务商文档为准，浏览器直连是否被允许取决于服务商的跨域策略。API Key 不会写进作品，默认只保存在本次会话中。'),
          h('label', {}, '服务商', preset),
          h('label', {}, '接口地址', base),
          h('label', {}, '模型', model),
          h('label', {}, 'API Key', key),
          h('label', { class: 'check' }, remember, '记住在本机（否则关闭页面后清除）'),
          h('div', { class: 'row' },
            h('button', { type: 'button', class: 'btn primary', onclick: () => { saveConfig(read()); status.textContent = '已保存。'; } }, '保存'),
            h('button', { type: 'button', class: 'btn', onclick: async () => {
              status.textContent = '正在测试连接……';
              try {
                const r = await chat(read(), [{ role: 'user', content: '请只回复“连接正常”四个字。' }], { timeoutMs: 20000 });
                status.textContent = `连接成功：${r.slice(0, 40)}`;
              } catch (e) {
                status.textContent = `连接失败：${(e as Error).message}`;
              }
            } }, '测试连接'),
            h('button', { type: 'button', class: 'btn ghost', onclick: () => { saveConfig(null); key.value = ''; status.textContent = '已清除，回到离线模式。'; } }, '清除'),
          ),
          status,
          h('h3', { class: 'serif' }, '画面与声音'),
          h('label', {}, '画质', quality),
          h('label', { class: 'check' }, tts, '用浏览器语音朗读字幕（备用；演示视频的配音由团队录制）'),
          h('h3', { class: 'serif' }, '键盘'),
          h('p', { class: 'hint' }, '空格：导览暂停 / 继续 · → ：跳过本幕 · Q：观测者·零号 · A：观测档案 · Esc：关闭当前面板'),
        ),
      ),
    );
  }

  setOpen(open: boolean): void {
    this.el.hidden = !open;
  }
}

export class Boot {
  readonly el: HTMLElement;
  private loading: HTMLElement;
  private buttons: HTMLButtonElement[];

  constructor(onStart: (mode: 'guided' | 'free') => void) {
    this.loading = h('div', { class: 'loading' }, '正在校准实验室……');
    const guided = h('button', { type: 'button', class: 'btn primary', disabled: true, onclick: () => onStart('guided') }, '导览模式 · 约 5 分 35 秒') as HTMLButtonElement;
    const free = h('button', { type: 'button', class: 'btn', disabled: true, onclick: () => onStart('free') }, '自由探索') as HTMLButtonElement;
    this.buttons = [guided, free];
    this.el = h('div', { class: 'boot' },
      h('div', { class: 'in' },
        h('div', { class: 'eyebrow' }, '第十四届全国大学生数字媒体科技作品及创意竞赛 · 科幻+及元宇宙数字作品'),
        h('h1', {}, '创世纪元'),
        h('div', { class: 'sub' }, 'AI 文明诞生概率实验室'),
        h('p', { class: 'thesis' }, '你在 AI 运行的实验室里亲手孕育、见证、失去一个又一个文明。你对规律的认识，决定你能改变宇宙的哪一层；人类文明，是所有钥匙恰好都拧对的那一次。'),
        h('div', { class: 'choices' }, guided, free),
        this.loading,
        h('p', { class: 'fine' }, '建议佩戴耳机，使用桌面浏览器全屏体验。拖动画面可旋转视角，滚轮缩放。', h('br'), '作品中的 L4、L5 为示意性模型；大模型生成内容标注“AI 生成”。本作品由学生团队主导方向，开发过程使用了 AI 编程助手，详见作品说明。'),
      ),
    );
  }

  ready(): void {
    this.loading.textContent = '实验室已就绪';
    this.buttons.forEach((b) => (b.disabled = false));
    this.buttons[0].focus();
  }

  leave(): void {
    this.el.classList.add('leaving');
    setTimeout(() => this.el.remove(), 1100);
  }
}
