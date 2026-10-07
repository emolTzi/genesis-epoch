// 序章 · 宇宙洪荒：浑天仪实验大厅，认知校准，生成宇宙编号。

import * as THREE from 'three';
import { Act } from './Act';
import { SCRIPT } from '../data/script';
import { RANKS, KEY_NAMES } from '../sim/types';
import { h } from '../ui/dom';
import { button, section } from '../ui/panel';
import { LOOK_EARTHLIKE } from '../render/Planet';

export class HallAct extends Act {
  readonly id = 'hall' as const;

  async enter(): Promise<void> {
    const app = this.app;
    app.sky.setMood(0x2a1b5c, 0x0b2a4a, 1);
    app.audio.setMood('hall');
    app.hud.setScale(2);
    app.planetRoot.position.set(0, 0, 0);
    app.planetRoot.scale.setScalar(1);
    app.planet.setLook({ ...LOOK_EARTHLIKE, city: 0.25 });
    app.planet.spinRate = 0.05;
    app.armillary.setLabels(1);
    app.hallRoot.visible = true;
    app.planetRoot.visible = true;
    void app.fade(app.hallFade, app.hallRoot.visible && app.armillary.group.visible ? 1 : 0, 1, 1200);
    void app.fade(app.planetFade, app.planet.group.visible ? 1 : 0, 1, 1200);
    app.rig.minDist = 4;
    app.rig.maxDist = 22;
    await app.rig.to(app.tw, { target: new THREE.Vector3(0, 0, 0), dist: 11, el: 0.14, az: 0.4 }, 1600);
    this.buildPanel();
  }

  async exit(): Promise<void> {
    await super.exit();
  }

  private buildPanel(): void {
    const app = this.app;
    const s = app.state;
    const keys = h('p', {});
    const renderKeys = () => {
      keys.textContent = `当前称号：${RANKS[s.rank].name}（${RANKS[s.rank].stage}）。已点亮：${[...s.keys].map((k) => KEY_NAMES[k]).join('、') || '无'}。`;
    };
    renderKeys();
    this.disposers.push(s.ev.on('keys', renderKeys));
    const seedIn = h('input', { type: 'number', id: 'seed-in', min: 1, max: 99999, value: s.seed, style: 'width:110px;padding:6px 8px;border-radius:8px;border:1px solid var(--rule-strong);background:var(--deck-solid)' }) as HTMLInputElement;
    app.panel.open(
      this.meta,
      h('p', {}, '这里是创世纪元实验室。环绕中央行星的五重环，由外向内依次是文明、生命、元素、星辰、本源。你理解了哪一层规律，就能改变哪一层参量。'),
      h('p', {}, '在已知的宇宙里，我们只确认过一次文明。外圈的暗色星球，是在这里熄灭过的文明。'),
      section('认知校准', keys, h('div', { class: 'btns' }, button('重新校准', async () => {
        const r = await app.modals.calibration(s.rank);
        s.setRank(r);
      }))),
      section('宇宙编号', h('p', { class: 'hint' }, '编号即随机种子：同一编号得到同一部编年史与同一个结局，评委可以复现。'),
        h('div', { class: 'btns' }, seedIn, button('换成这个编号', () => {
          const v = Math.max(1, Math.min(99999, Math.round(Number(seedIn.value)) || 1));
          s.newUniverse(v);
          app.toasts.show(`宇宙编号 ${v}，文明“${s.civName}”`);
        }))),
      this.nextButton('开始实验：天地玄黄', () => void this.dir.next()),
    );
  }

  async guided(): Promise<void> {
    const app = this.app;
    for (const line of SCRIPT.prologue) await app.say(line);
    app.modals.auto = { value: 'ok', ms: app.autoMs(2600) };
    const r = await app.modals.calibration(2);
    app.modals.auto = null;
    app.state.setRank(r);
    const list = RANKS[r].keys.map((k) => KEY_NAMES[k].replace('之钥', ''));
    const cn = ['一', '二', '三', '四', '五'][list.length - 1];
    await app.say(SCRIPT.prologueCalibrated(RANKS[r].name, `${list.join('、')}${list.length > 1 ? cn : ''}环`));
    await app.say(SCRIPT.prologueStart(app.state.seed));
  }
}

/** 隐藏大厅（供其他幕调用）。 */
export async function hideHall(app: import('../app/App').App, ms = 1200): Promise<void> {
  if (!app.hallRoot.visible) return;
  await app.fade(app.hallFade, 1, 0, ms);
}
