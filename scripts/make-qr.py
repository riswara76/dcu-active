"""QR code and printable poster that open DCU Active.

Usage: python scripts/make-qr.py [URL] [label]
  default URL = staging (UAT). For go-live, run again with the production URL and label "".
Needs: pip install "qrcode[pil]"
Output: docs/qr/dcu-active-qr.png (QR only) and docs/qr/dcu-active-poster.png (A5 poster, 300 dpi)
"""
import sys
from pathlib import Path

import qrcode
from PIL import Image, ImageDraw, ImageFont
from qrcode.constants import ERROR_CORRECT_H

ROOT = Path(__file__).resolve().parent.parent
URL = sys.argv[1] if len(sys.argv) > 1 else 'https://dcu-active-staging.dcu-active.workers.dev'
LABEL = sys.argv[2] if len(sys.argv) > 2 else 'Versi uji (UAT)'
OUT = ROOT / 'docs' / 'qr'
OUT.mkdir(parents=True, exist_ok=True)

RED, INK, GREY, WHITE = (200, 16, 46), (31, 41, 55), (107, 114, 128), (255, 255, 255)
FONTS = Path('C:/Windows/Fonts')


def font(bold: bool, size: int) -> ImageFont.FreeTypeFont:
    for name in (['segoeuib.ttf', 'arialbd.ttf'] if bold else ['segoeui.ttf', 'arial.ttf']):
        if (FONTS / name).exists():
            return ImageFont.truetype(str(FONTS / name), size)
    return ImageFont.load_default(size)


# QR with high error correction, so the app icon in the middle does not affect scanning.
qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, box_size=24, border=4)
qr.add_data(URL)
qr.make(fit=True)
code = qr.make_image(fill_color=INK, back_color=WHITE).convert('RGB')
icon = Image.open(ROOT / 'public' / 'pwa-512x512.png').convert('RGBA')
side = code.size[0] // 5
icon = icon.resize((side, side), Image.LANCZOS)
pad = side // 8
plate = Image.new('RGB', (side + 2 * pad, side + 2 * pad), WHITE)
plate.paste(icon, (pad, pad), icon)
code.paste(plate, ((code.size[0] - plate.size[0]) // 2, (code.size[1] - plate.size[1]) // 2))
code.save(OUT / 'dcu-active-qr.png')

# A5 portrait poster at 300 dpi (1748 x 2480 px).
W, H = 1748, 2480
poster = Image.new('RGB', (W, H), WHITE)
d = ImageDraw.Draw(poster)
d.rectangle([0, 0, W, 420], fill=RED)


def center(y: int, text: str, f: ImageFont.FreeTypeFont, fill) -> None:
    w = d.textlength(text, font=f)
    d.text(((W - w) / 2, y), text, font=f, fill=fill)


center(110, 'DCU Active', font(True, 150), WHITE)
center(290, 'Booking fasilitas olahraga & kelas DCU', font(False, 62), WHITE)
center(520, 'Scan untuk membuka aplikasi', font(True, 80), INK)
qr_side = 1250
poster.paste(code.resize((qr_side, qr_side), Image.NEAREST), ((W - qr_side) // 2, 680))
center(1980, URL.replace('https://', ''), font(False, 52), GREY)
center(2090, 'Login dengan email kantor Anda', font(False, 56), INK)
if LABEL:
    d.rounded_rectangle([(W - 560) / 2, 2230, (W + 560) / 2, 2330], radius=40, fill=(253, 236, 238))
    center(2245, LABEL, font(True, 54), RED)
poster.save(OUT / 'dcu-active-poster.png', dpi=(300, 300))
print('QR for', URL, '->', OUT)
