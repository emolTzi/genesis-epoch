// 入口：启动页 → 实验大厅 → 导览模式或自由探索。

import './ui/styles.css';
import { App } from './app/App';
import { Director } from './app/Director';
import { Boot } from './ui/drawers';
import { h } from './ui/dom';

function fatal(message: string): void {
  document.body.append(
    h('div', { class: 'boot' }, h('div', { class: 'in' },
      h('h1', {}, '创世纪元'),
      h('p', { class: 'thesis' }, message),
      h('p', { class: 'fine' }, '请使用新版 Chrome、Edge、Firefox 或 Safari，并确认浏览器已开启硬件加速。也可以观看随作品提交的演示视频。'),
    )),
  );
}

function main(): void {
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  let app: App;
  let director: Director | null = null;
  try {
    app = new App(canvas, ui, {
      onAct: (id) => void director?.goTo(id),
      onMode: () => director?.toggleMode(),
      onSkip: () => director?.skipAct(),
      onExitGuide: () => director?.exitGuided(),
    });
  } catch (e) {
    console.error(e);
    fatal('当前浏览器无法创建 WebGL 画面，作品无法运行。');
    return;
  }
  director = new Director(app);
  app.start();
  void director.goTo('hall');

  ui.classList.add('booting');
  const boot = new Boot(async (mode) => {
    app.audio.start();
    boot.leave();
    ui.classList.remove('booting');
    if (mode === 'guided') {
      await director!.startGuided();
    } else {
      app.state.mode = 'free';
      app.hud.setMode('free');
      const r = await app.modals.calibration(app.state.rank);
      app.state.setRank(r);
      app.narrate({ text: '认知校准完成。拖动画面环顾实验大厅，准备好后点击右侧的“开始实验”。', ms: 5000 });
    }
  });
  document.body.append(boot.el);

  // 参数空间存活比例需要上万次抽样，放到首帧之后计算
  setTimeout(() => {
    const ladder = app.state.computeLadder();
    app.hud.setLadder(ladder.fractions);
    boot.ready();
  }, 60);

  // 便于评委与测试脚本检查运行状态
  (window as unknown as { __genesis: unknown }).__genesis = { app, director };
}

main();
