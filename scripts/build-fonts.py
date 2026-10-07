"""按作品实际用到的字符子集化字体，嵌入单文件构建。

- 标题字体：思源宋体 Heavy（Noto Serif SC Black，SIL OFL 1.1）
- 数据字体：JetBrains Mono（SIL OFL 1.1）
需要 fonttools 与 brotli：python -m pip install fonttools brotli
源字体放在 assets-src/（不随仓库分发），输出到 src/assets/fonts/。
"""
import glob
import os
import zipfile

from fontTools import subset

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets-src')
OUT = os.path.join(ROOT, 'src', 'assets', 'fonts')


def used_chars():
    chars = set()
    files = glob.glob(os.path.join(ROOT, 'src', '**', '*.*'), recursive=True) + [os.path.join(ROOT, 'index.html')]
    for f in files:
        if not f.endswith(('.ts', '.css', '.html')):
            continue
        with open(f, encoding='utf-8') as fh:
            chars.update(fh.read())
    return chars


def run(font_path, out_path, text):
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    font = subset.load_font(font_path, opts)
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    subset.save_font(font, out_path, opts)
    print(out_path, os.path.getsize(out_path) // 1024, 'KB')


def main():
    os.makedirs(OUT, exist_ok=True)
    chars = used_chars()
    ascii_set = ''.join(chr(c) for c in range(0x20, 0x7F))
    cjk = ''.join(sorted(c for c in chars if ord(c) > 0x7F)) + ascii_set
    run(os.path.join(SRC, 'NotoSerifSC-Black.otf'), os.path.join(OUT, 'ge-serif.woff2'), cjk)
    mono_src = os.path.join(SRC, 'JetBrainsMono-Regular.ttf')
    if not os.path.exists(mono_src):
        with zipfile.ZipFile(os.path.join(SRC, 'JetBrainsMono.zip')) as z:
            with open(mono_src, 'wb') as fh:
                fh.write(z.read('fonts/ttf/JetBrainsMono-Regular.ttf'))
    symbols = ''.join(c for c in chars if 0x7F < ord(c) < 0x3000)
    run(mono_src, os.path.join(OUT, 'ge-mono.woff2'), ascii_set + symbols)


if __name__ == '__main__':
    main()
