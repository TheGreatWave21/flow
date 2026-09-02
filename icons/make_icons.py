"""Generate PNG app icons from a simple vector drawing (no external assets)."""
from PIL import Image, ImageDraw
import math, os

HERE = os.path.dirname(__file__)


def rounded_rect_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def draw_icon(size, maskable=False):
    scale = 4
    S = size * scale
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # background
    d.rectangle([0, 0, S, S], fill=(15, 18, 32, 255))

    # safe area smaller for maskable
    cx, cy = S / 2, S * 0.53
    r = S * (0.24 if maskable else 0.27)
    width = int(S * 0.055)

    # track ring
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(44, 83, 100, 255), width=width)

    # progress arc
    d.arc([cx - r, cy - r, cx + r, cy + r], start=-90, end=170,
          fill=(138, 180, 255, 255), width=width)

    # timer stem / knob
    knob_w = S * 0.08
    d.rounded_rectangle([cx - knob_w / 2, S * 0.18, cx + knob_w / 2, S * 0.24],
                        radius=knob_w * 0.3, fill=(138, 180, 255, 255))
    hand_w = S * 0.03
    d.rounded_rectangle([cx - hand_w / 2, cy - r * 0.75, cx + hand_w / 2, cy],
                        radius=hand_w, fill=(244, 245, 251, 255))
    d.ellipse([cx - hand_w, cy - hand_w, cx + hand_w, cy + hand_w], fill=(244, 245, 251, 255))

    img = img.resize((size, size), Image.LANCZOS)

    if not maskable:
        mask = rounded_rect_mask(size, int(size * 0.22))
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.paste(img, (0, 0), mask)
        return out
    return img


for name, size, maskable in [
    ("icon-192.png", 192, False),
    ("icon-512.png", 512, False),
    ("icon-maskable-512.png", 512, True),
    ("apple-touch-icon.png", 180, True),
]:
    draw_icon(size, maskable).save(os.path.join(HERE, name))
    print("wrote", name)
