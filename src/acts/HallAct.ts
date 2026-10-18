// 序章 · 参数空间：实验大厅，认知校准，生成宇宙编号。

import * as THREE from 'three';
import { Act } from './Act';
import { SCRIPT } from '../data/script';
import { RANKS, KEY_NAMES } from '../sim/types';
import { h } from '../ui/dom';
import { button, paramSlider, section, stateChip, folded } from '../ui/panel';
import { LOOK_EARTHLIKE } from '../render/Planet';
import { lookFromReport } from './ElementsAct';
import { liveLayers } from '../sim/live';
import { LAYER_NAMES, type Layer } from '../sim/types';
import { clear } from '../ui/dom';

export class HallAct extends Act {
  readonly id = 'hall' as const;

  async enter(): Promise<void> {
    const app = this.app;
    app.sky.setMood(0x2a1b5c, 0x0b2a4a, 1);
    app.audio.setMood('hall');
    app.hud.setScale(2);
    app.planetRoot.position.set(0, 0, 0);
    app.planetRoot.scale.setScalar(1);
    app.planet.setLook({ ...LOOK_EARTHLIKE, life: 0.98, city: 0.25, cloud: 0.4, hazard: 0, scar: 0, ...lookFromReport(app.state.report), earth: 1 });
    app.planet.spinRate = 0.05;
    // 从其他幕回到大厅时，淡出那一幕留在场景中的对象（沙盘、万宇宙等）
    void this.dir.clearStage([app.hallFade, app.planetFade], 900);
    app.hallRoot.visible = true;
    app.planetRoot.visible = true;
    void app.fade(app.hallFade, app.hallRoot.visible ? 1 : 0, 1, 1200);
    void app.fade(app.planetFade, app.planet.group.visible ? 1 : 0, 1, 1200);
    app.rig.minDist = 4;
    app.rig.maxDist = 22;
    await app.rig.to(app.tw, { target: new THREE.Vector3(0, 0, 0), dist: 9.8, el: 0.16, az: 0.4 }, 1600);
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
    // 宇宙仪表：任何参量变化，六层判定与行星外观立刻更新
    const gauge = h('ul', { class: 'gauge' });
    const renderGauge = () => {
      clear(gauge);
      liveLayers(s.params, s.report).forEach((l, i) => gauge.append(h('li', { title: l.detail }, h('span', {}, LAYER_NAMES[i as Layer]), stateChip(l.status, l.title))));
    };
    renderGauge();
    const quick = [
      paramSlider('orbit_a', Number(s.params.orbit_a), (v) => s.setParams({ orbit_a: v }), { locked: !s.has('star') }),
      paramSlider('coop', Number(s.params.coop), (v) => s.setParams({ coop: v }), { locked: !s.has('civ'), fmt: (v) => v.toFixed(2) }),
    ];
    this.disposers.push(s.ev.on('report', (r) => {
      app.planet.setLook({ ...lookFromReport(r), earth: 1 });
      renderGauge();
    }));
    this.disposers.push(s.ev.on('params', () => {
      renderGauge();
      quick[0].set(Number(s.params.orbit_a));
      quick[1].set(Number(s.params.coop));
    }));
    const seedIn = h('input', { type: 'number', id: 'seed-in', min: 1, max: 99999, value: s.seed, style: 'width:110px;padding:6px 8px;border-radius:8px;border:1px solid var(--rule-strong);background:var(--deck-solid)' }) as HTMLInputElement;
    app.panel.open(
      this.meta,
      h('p', {}, '这里是创世纪元实验室：一颗行星、一套实时推演的宇宙引擎，以及六层判定。你理解了哪一层规律，就能改变哪一层参量。'),
      h('p', {}, '在已知的宇宙里，我们只确认过一次文明。外圈的暗色星球，是在这里熄灭过的文明。'),
      section('宇宙仪表 · 实时', gauge, ...quick.map((q) => q.el),
        h('p', { class: 'hint' }, '试着把轨道拖到 2.4 AU：行星冰封，链条在 L1 断裂。全部参量在参数台中（快捷键 P）。带虚线下划线的专业名词，双击即可查看注释。'),
        h('div', { class: 'btns' }, button('打开参数台', () => app.toggleDrawer('console', true)), button('恢复我们的宇宙', () => {
          s.setParams({ orbit_a: 1, coop: 0.6 });
        }))),
      folded('认知校准', keys, h('div', { class: 'btns' }, button('重新校准', async () => {
        const r = await app.modals.calibration(s.rank);
        s.setRank(r);
      }))),
      folded('宇宙编号', h('p', { class: 'hint' }, '编号即随机种子：同一编号得到同一部编年史与同一个结局，评委可以复现。'),
        h('div', { class: 'btns' }, seedIn, button('换成这个编号', () => {
          const v = Math.max(1, Math.min(99999, Math.round(Number(seedIn.value)) || 1));
          s.newUniverse(v);
          app.toasts.show(`宇宙编号 ${v}，文明“${s.civName}”`);
        }))),
      this.nextButton('开始实验：精细调节', () => void this.dir.next()),
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
    await app.say(SCRIPT.prologueCalibrated(RANKS[r].name, `${list.join('、')}`));
    await app.say(SCRIPT.prologueStart(app.state.seed));
  }
}

/** 隐藏大厅（供其他幕调用）。 */
export async function hideHall(app: import('../app/App').App, ms = 1200): Promise<void> {
  if (!app.hallRoot.visible) return;
  await app.fade(app.hallFade, 1, 0, ms);
}
