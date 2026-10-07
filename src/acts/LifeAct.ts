// 第④幕 · 鳞潜羽翔（L3 生命）：生命史、K-Pg 撞击点轮盘、劳动与人类起源。

import * as THREE from 'three';
import { Act } from './Act';
import type { Fadeable } from '../app/App';
import type { ActId } from '../data/script';
import { SCRIPT } from '../data/script';
import { Impactor } from '../render/Impactor';
import { hazardSite, isHazard, randomSafeSite, latLon, type Vec3 } from '../sim/kpg';
import { h } from '../ui/dom';
import { button, section, stateChip, verdictBox } from '../ui/panel';
import { ease } from '../core/tween';
import { lookFromClimate } from './ElementsAct';
import { THEORY } from '../data/theory';

interface Milestone {
  when: string;
  text: string;
  conf: 'shi' | 'gu' | 'zheng';
}

const HISTORY: Milestone[] = [
  { when: '约 38 亿年前', text: '海洋中出现最早的生命（更早的证据仍有争议）', conf: 'zheng' },
  { when: '约 24 亿年前', text: '大氧化事件：光合作用释放氧气，臭氧层开始形成', conf: 'gu' },
  { when: '约 20 亿年前', text: '真核细胞出现：一次罕见的内共生', conf: 'gu' },
  { when: '约 5.39 亿年前', text: '寒武纪生命大爆发', conf: 'shi' },
  { when: '约 2.52 亿年前', text: '二叠纪末大灭绝：约九成海洋物种消失', conf: 'gu' },
  { when: '约 6600 万年前', text: '一颗直径约 10 公里的小行星飞向地球', conf: 'shi' },
];

export class LifeAct extends Act {
  readonly id = 'life' as const;
  private impactor: Impactor | null = null;
  private impFade!: Fadeable;
  private verdict = verdictBox();
  private histEl = h('ol', { class: 'hist' });
  private choosing = false;
  private striking = false;
  private down = { x: 0, y: 0, t: 0 };
  private resultEl = h('div', {});
  /** 观众是否已经亲手决定了撞击点。 */
  private decided = false;

  fadeables(): Fadeable[] {
    return this.impactor ? [this.impFade] : [];
  }

  async enter(prev: ActId | null): Promise<void> {
    const app = this.app;
    if (!this.impactor) {
      this.impactor = new Impactor();
      app.stage.scene.add(this.impactor.group);
      this.impFade = { group: this.impactor.group };
    }
    app.sky.setMood(0x10203a, 0x0a2f2a, 0.8);
    app.audio.setMood('life');
    app.planet.setLook({ ...lookFromClimate(app.state.report.L2), life: 0, city: 0, dead: 0, earth: 0, hazard: 0, scar: 0 }, prev !== 'elements');
    app.planet.spinRate = 0.06;
    if (prev !== 'elements') {
      void this.dir.clearStage([app.planetFade], 900);
      await app.fade(app.planetFade, app.planetRoot.visible ? 1 : 0, 1, 900);
    }
    app.hud.setScale(7);
    app.rig.minDist = 1.6;
    app.rig.maxDist = 12;
    void app.rig.to(app.tw, { target: new THREE.Vector3(0, 0, 0), dist: 4.2, el: 0.3 }, 2000);
    this.bindPicking();
    this.decided = false;
    this.buildPanel();
    this.takeSnapshot();
    if (app.state.mode === 'free') void this.grow(7000);
  }

  async exit(): Promise<void> {
    this.choosing = false;
    this.app.planet.setLook({ hazard: 0 });
    await super.exit();
  }

  /** 生命史：大陆逐渐转绿，里程碑依次点亮。 */
  async grow(ms: number): Promise<void> {
    const app = this.app;
    this.renderHistory(-1);
    await app.tw.run(ms, (k) => {
      app.planet.setLook({ life: 0.85 * ease.inOutSine(Math.min(1, k * 1.2)) });
      this.renderHistory(Math.floor(k * HISTORY.length - 0.001));
    }, ease.linear);
    this.renderHistory(HISTORY.length - 1);
    for (const m of HISTORY.slice(1, 4)) app.state.addChronicle({ when: m.when, text: m.text, layer: 3, kind: 'fact' });
  }

  private renderHistory(upTo: number): void {
    this.histEl.replaceChildren(...HISTORY.map((m, i) => h('li', { class: i <= upTo ? 'on' : '' }, h('b', {}, m.when), h('span', {}, m.text))));
  }

  private bindPicking(): void {
    const canvas = this.app.stage.renderer.domElement;
    const onDown = (e: PointerEvent) => (this.down = { x: e.clientX, y: e.clientY, t: performance.now() });
    const onUp = (e: PointerEvent) => {
      if (!this.choosing || this.striking) return;
      if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 6 || performance.now() - this.down.t > 500) return;
      const r = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, this.app.stage.camera);
      const hit = ray.intersectObject(this.app.planet.surface, false)[0];
      if (hit) void this.strike(this.app.planet.localDir(hit.point), true);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    this.disposers.push(() => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
    });
  }

  private buildPanel(): void {
    const app = this.app;
    const has = app.state.has('life');
    this.verdict.set(null);
    this.choosing = has && app.state.mode === 'free';
    app.planet.setLook({ hazard: has ? 1 : 0 });
    this.resultEl.replaceChildren(has
      ? h('p', { class: 'hint' }, '橙色斜纹区域是富含碳氢化合物与硫的沉积区，约占地表 13%。点击行星表面，决定小行星落在哪里。')
      : h('p', { class: 'hint' }, '生命之钥未解锁：先观看一次默认推演。'));
    app.panel.open(
      this.meta,
      h('p', {}, '三十多亿年里，生命从海洋走上陆地。六千六百万年前，一颗小行星飞向地球，它落在哪里，决定了人类能否登场。'),
      section('生命史（真实地球）', this.histEl),
      section('K-Pg 撞击点轮盘', this.resultEl,
        h('div', { class: 'btns' },
          has ? button('落在真实的历史位置', () => void this.strike(hazardSite(0), true)) : null,
          has ? button('随机落点', () => void this.strike(this.randomDir(), true)) : null,
          button(has ? '看一次默认推演' : '观看默认推演', () => void this.demo()),
        ),
        h('p', { class: 'hint' }, '依据：Kaiho & Oshima 2017, Sci. Rep. 7:14855（约 13% 的地表）；Schulte et al. 2010, Science 327:1214。沉积区的分布为示意，比例来自文献。'),
      ),
      section('推演结论', this.verdict.el),
      this.nextButton('确认这一层，进入下一幕', () => void this.commit()),
    );
    this.renderHistory(app.planet.look.life > 0.6 ? HISTORY.length - 1 : -1);
  }

  private randomDir(): Vec3 {
    const u = Math.random() * 2 - 1;
    const t = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    return [s * Math.cos(t), u, s * Math.sin(t)];
  }

  /** 撞击动画与结果。commit=true 时结果写入本宇宙。 */
  async strike(dir: Vec3, commit: boolean): Promise<boolean> {
    if (this.striking) return false;
    this.striking = true;
    const app = this.app;
    const planet = app.planet;
    const spin = planet.spinRate;
    planet.spinRate = 0;
    // 先把撞击点转到朝向摄像机的一侧
    const cam = app.stage.camera.position.clone().sub(planet.group.getWorldPosition(new THREE.Vector3()));
    const want = Math.atan2(cam.x, cam.z) - Math.atan2(dir[0], dir[2]);
    const from = planet.spin.rotation.y;
    let delta = (((want - from) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    if (Math.abs(delta) < 0.02) delta = 0;
    await app.tw.run(1200, (k) => (planet.spin.rotation.y = from + delta * k), ease.inOutCubic);
    const world = new THREE.Vector3(...dir).multiplyScalar(1.0);
    planet.surface.localToWorld(world);
    const center = new THREE.Vector3();
    planet.surface.getWorldPosition(center);
    const ll = latLon(dir);
    this.resultEl.replaceChildren(h('p', { class: 'hint' }, `撞击点：纬度 ${ll.lat.toFixed(0)}°，经度 ${ll.lon.toFixed(0)}°……`));
    await this.impactor!.strike(app.tw, world, center, 2200);
    app.audio.impact();
    const hazard = isHazard(dir);
    planet.setImpact(dir, 1);
    void app.tw.run(1800, (k) => planet.setImpact(dir, 1 - k), ease.outCubic);
    if (hazard) {
      planet.setLook({ dead: 0.7, scar: 1, cloud: 0.9 });
      await app.wait(1600);
      planet.setLook({ dead: 0, cloud: 0.5 });
      planet.setLook({ scar: 0.4 });
    } else {
      planet.setLook({ scar: 0.6 });
      await app.wait(900);
    }
    planet.spinRate = spin;
    this.striking = false;
    const site = hazard ? 'hazard' : 'safe';
    this.resultEl.replaceChildren(
      h('p', {}, stateChip(hazard ? 'ok' : 'fail', hazard ? '落在沉积区' : '落在其他地区'), ' ',
        hazard ? '烟尘与硫酸盐气溶胶遮蔽阳光，全球降温，光合作用停滞。非鸟恐龙灭绝，哺乳动物获得了生态位。' : '没有引发全球性灭绝。非鸟恐龙继续统治陆地，人类这一具体结果不会出现。'),
    );
    if (commit) {
      this.decided = true;
      app.state.setParams({ kpg_site: site });
      this.verdict.set(app.state.report.L3.verdict);
      if (hazard) {
        app.state.addChronicle({ when: '约 6600 万年前', text: '撞击点富含碳氢化合物与硫，非鸟恐龙灭绝，哺乳动物开始辐射演化。', layer: 3, kind: 'fact' });
      }
    }
    return hazard;
  }

  /** 默认推演：撞在约 87% 的“普通”地表上。 */
  async demo(): Promise<void> {
    const app = this.app;
    this.choosing = false;
    await this.strike(randomSafeSite(app.state.seed), false);
    this.verdict.set({ status: 'fail', title: '默认推演：恐龙延续，人类未必登场', detail: '撞击点落在约 87% 的其他地区。' });
    await app.wait(1200);
    await app.epiphany('life');
    this.buildPanel();
  }

  /** 劳动与人类起源：经典论述与现代证据分开呈现。 */
  async laborCard(): Promise<void> {
    const app = this.app;
    const labor = THEORY.find((t) => t.id === 'labor')!;
    if (app.state.mode === 'guided') app.modals.auto = { value: 'ok', ms: app.autoMs(5000) };
    await app.modals.info('第④幕 → 第⑤幕 · 劳动与人类起源', '人类登场', [
      h('p', {}, h('b', {}, '经典论述：'), `“${labor.quote}”——恩格斯《劳动在从猿到人转变过程中的作用》（1876）`),
      h('p', {}, h('b', {}, '现代证据：'), '肯尼亚洛迈奎 3 号遗址出土约 330 万年前的石器（Harmand et al. 2015, Nature 521:310）；摩洛哥杰贝尔依罗出土约 30 万年前的早期智人化石（Hublin et al. 2017, Nature 546:289）。工具制作与脑容量增长在人属演化中相互促进。'),
      h('p', { class: 'src' }, '两者分开标注：前者是马克思主义经典论述，后者是现代古人类学证据。'),
    ], '进入文明');
    app.modals.auto = null;
    app.state.addChronicle({ when: '约 30 万年前', text: '智人出现。劳动与工具让手变得灵巧，语言与协作随之发展。', layer: 3, kind: 'fact' });
  }

  private async commit(): Promise<void> {
    const app = this.app;
    app.state.evaluate();
    const r = app.state.report.L3;
    if (r.verdict.status === 'fail') {
      const choice = await app.fate(3, r.verdict.title, r.verdict.detail);
      if (choice === 'new') return this.dir.newUniverse();
      this.restoreSnapshot();
      this.decided = false;
      app.planet.setLook({ scar: 0 });
      this.buildPanel();
      app.state.setLayer(3, 'pending');
      return;
    }
    if (app.state.report.firstFail !== null && app.state.report.firstFail < 3) {
      app.toasts.show('更早的层级已经失败，请回到对应的实验舱。', 'bad');
      return;
    }
    if (!this.decided) {
      app.toasts.show(app.state.has('life') ? '先决定小行星落在哪里：点击行星表面，或使用面板中的按钮。' : '先观看一次默认推演。');
      return;
    }
    app.state.setLayer(3, r.verdict.status);
    await this.laborCard();
    await this.dir.next();
  }

  refresh(): void {
    this.buildPanel();
  }

  async guided(): Promise<void> {
    const app = this.app;
    app.sayBg(SCRIPT.life[0]);
    await this.grow(6000);
    await app.say(SCRIPT.life[1]);
    app.sayBg(SCRIPT.lifeDefault);
    await this.strike(randomSafeSite(app.state.seed), false);
    await app.say(SCRIPT.lifeSafe);
    app.planet.setLook({ hazard: 1, scar: 0 });
    await app.say(SCRIPT.lifeHazard);
    app.sayBg(SCRIPT.lifeChoose);
    await this.strike(hazardSite(0), true);
    await app.say(SCRIPT.lifeExtinction);
    app.planet.setLook({ hazard: 0 });
    app.sayBg(SCRIPT.lifeLabor);
    await this.laborCard();
    app.state.setLayer(3, app.state.report.L3.verdict.status);
  }
}
