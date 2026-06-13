# 새 브랜드 아이콘(Favicon/ 의 원본 PNG)으로 사이트 파비콘 세트를 일괄 생성한다.
# 사용: python scripts/gen-favicons.py
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]          # Frontend/
PROJECT = ROOT.parent                                # 당근대학생/
SRC = PROJECT / "Favicon" / "ChatGPT Image 2026년 6월 13일 오후 07_47_09.png"

if not SRC.exists():
    print(f"원본을 찾을 수 없음: {SRC}")
    sys.exit(1)

img = Image.open(SRC).convert("RGBA")
# 정사각형 보정(이미 1254x1254이지만 안전하게 중앙 크롭)
w, h = img.size
if w != h:
    s = min(w, h)
    img = img.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))

def resize(size):
    return img.resize((size, size), Image.LANCZOS)

png_targets = {
    "favicon-16x16.png": 16,
    "favicon-32x32.png": 32,
    "favicon-48x48.png": 48,
    "favicon-64x64.png": 64,
    "favicon-128x128.png": 128,
    "favicon-180x180.png": 180,
    "favicon-192x192.png": 192,
    "favicon-512x512.png": 512,
    "apple-touch-icon.png": 180,
    "android-chrome-192x192.png": 192,
    "android-chrome-512x512.png": 512,
    "favicon.png": 512,
}

for name, size in png_targets.items():
    out = ROOT / name
    im = resize(size)
    # apple-touch-icon은 투명 배경을 검게 깔므로 흰 배경으로 합성
    if name == "apple-touch-icon.png":
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        bg.alpha_composite(im)
        bg.convert("RGB").save(out, "PNG")
    else:
        im.save(out, "PNG")
    print(f"  {name:30s} {size}x{size}")

# 멀티 해상도 .ico (16/32/48)
ico_out = ROOT / "favicon.ico"
resize(48).save(ico_out, sizes=[(16, 16), (32, 32), (48, 48)])
print(f"  favicon.ico                    multi 16/32/48")

print("완료.")
