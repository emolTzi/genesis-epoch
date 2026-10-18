# 预览帧拼成联系表：每张 4×3，便于快速检查画面。
import pathlib, sys
from PIL import Image, ImageDraw
here = pathlib.Path(__file__).parent
files = sorted((here / 'out' / 'preview').glob('f_*.jpg'))
step = int(sys.argv[1]) if len(sys.argv) > 1 else 2
start = float(sys.argv[2]) if len(sys.argv) > 2 else 0
end = float(sys.argv[3]) if len(sys.argv) > 3 else 1e9
def t_of(p):
    s = p.stem[2:]
    m, rest = s.split('m')
    return int(m) * 60 + float(rest[:-1])
files = [f for f in files if start <= t_of(f) <= end][::step]
out = here / 'out' / 'sheets'
out.mkdir(exist_ok=True)
for old in out.glob('*.jpg'):
    old.unlink()
W, H = 640, 360
for k in range(0, len(files), 12):
    sheet = Image.new('RGB', (W * 4, H * 3), 'black')
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(files[k:k + 12]):
        im = Image.open(f).resize((W, H))
        x, y = (i % 4) * W, (i // 4) * H
        sheet.paste(im, (x, y))
        d.rectangle([x, y, x + 120, y + 26], fill='black')
        d.text((x + 6, y + 6), f'{t_of(f):.0f}s', fill='yellow')
    sheet.save(out / f'sheet_{k // 12:02d}.jpg', quality=82)
print(len(files), 'frames ->', (len(files) + 11) // 12, 'sheets')
