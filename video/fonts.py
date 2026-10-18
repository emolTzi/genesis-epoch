# 为演示视频生成思源宋体子集：只保留 overlay.js 与 config.json 中实际出现的字符。
import json, pathlib
from fontTools import subset
from fontTools.ttLib import TTFont

here = pathlib.Path(__file__).parent
text = (here / 'overlay.js').read_text(encoding='utf-8')
cfg = json.loads((here / 'config.json').read_text(encoding='utf-8'))
text += ''.join(str(v) for v in cfg.values())
chars = sorted(set(ch for ch in text if ord(ch) > 32))
src = here.parent / 'assets-src' / 'NotoSerifSC-Black.otf'
out = here / 'fonts' / 'film-serif.woff2'
out.parent.mkdir(exist_ok=True)
font = TTFont(src)
opts = subset.Options()
opts.flavor = 'woff2'
opts.layout_features = ['*']
sub = subset.Subsetter(opts)
sub.populate(text=''.join(chars))
sub.subset(font)
font.flavor = 'woff2'
font.save(out)
print(out, out.stat().st_size // 1024, 'KB', len(chars), 'chars')
