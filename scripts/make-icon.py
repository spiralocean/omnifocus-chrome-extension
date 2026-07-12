#!/usr/bin/env python3
"""Generate the original 'Clip' extension icon.

An ocean-teal squircle tile with a white paperclip mark — the 'clip' metaphor,
deliberately distinct from OmniFocus's purple sphere. Rendered supersampled and
downscaled for clean antialiasing. No third-party artwork is used.
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "icons"
SIZES = [16, 32, 48, 128]

SAFARI_APP = ROOT / "safari" / "Clip to OmniFocus" / "Shared (App)"
APPICON = SAFARI_APP / "Assets.xcassets" / "AppIcon.appiconset"
LARGEICON = SAFARI_APP / "Assets.xcassets" / "LargeIcon.imageset" / "icon128.png"
APP_ICON_PNG = SAFARI_APP / "Resources" / "Icon.png"

# macOS app-icon filenames -> pixel size (rounded, with transparent corners).
MAC_ICONS = {
    "mac-icon-16@1x.png": 16, "mac-icon-16@2x.png": 32,
    "mac-icon-32@1x.png": 32, "mac-icon-32@2x.png": 64,
    "mac-icon-128@1x.png": 128, "mac-icon-128@2x.png": 256,
    "mac-icon-256@1x.png": 256, "mac-icon-256@2x.png": 512,
    "mac-icon-512@1x.png": 512, "mac-icon-512@2x.png": 1024,
}

S = 1024  # supersample master size
SS = 4    # extra oversampling for the mark

# Ocean gradient (top -> bottom). Distinct from OmniFocus violet.
TOP = (20, 184, 166)     # teal
BOTTOM = (12, 110, 143)  # deep ocean blue
WHITE = (255, 255, 255, 255)


def squircle_tile(size: int, rounded: bool = True) -> Image.Image:
    """Ocean-gradient tile. Rounded squircle (macOS/extension) or full square (iOS)."""
    grad = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / (size - 1)
        grad.putpixel(
            (0, y),
            tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3)),
        )
    grad = grad.resize((size, size))

    if not rounded:
        return grad.convert("RGBA")

    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    r = round(size * 0.2237)  # Apple-style corner radius
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)

    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    tile.paste(grad, (0, 0), mask)
    return tile


def stroke_path(draw: ImageDraw.ImageDraw, pts, width: int, fill=WHITE) -> None:
    draw.line(pts, fill=fill, width=width, joint="curve")
    r = width / 2
    for x, y in (pts[0], pts[-1]):  # round caps
        draw.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def arc_pts(cx, cy, r, a0, a1, n=64):
    """Sample an arc; angles in degrees, screen coords (y down)."""
    return [
        (cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)))
        for a in (a0 + (a1 - a0) * i / n for i in range(n + 1))
    ]


def inner_tongue_points():
    """Open 'U' nested inside the outer loop: down, round the bottom, back up."""
    XLi, XRi = 466, 558
    r = (XRi - XLi) / 2
    cx = (XLi + XRi) / 2
    y_top = 430          # free ends sit inside, below the outer top
    y_bot = 654          # bottom arc center
    pts = [(XLi, y_top), (XLi, y_bot)]
    pts += arc_pts(cx, y_bot, r, 180, 360)   # left -> bottom -> right
    pts += [(XRi, y_bot), (XRi, y_top)]
    return pts


def render_master(rounded: bool = True) -> Image.Image:
    big = S * SS
    tile = squircle_tile(big, rounded=rounded)

    clip = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(clip)
    scale = big / S
    stroke = round(70 * scale)

    # Outer loop: a closed stadium (rounded rectangle with fully rounded ends).
    ox0, oy0, ox1, oy1 = 388, 250, 636, 806
    d.rounded_rectangle(
        [ox0 * scale, oy0 * scale, ox1 * scale, oy1 * scale],
        radius=((ox1 - ox0) / 2) * scale,
        outline=WHITE,
        width=stroke,
    )

    # Inner tongue nested inside.
    pts = [(x * scale, y * scale) for x, y in inner_tongue_points()]
    stroke_path(d, pts, width=stroke)

    # rotate for a livelier posture
    clip = clip.rotate(18, resample=Image.BICUBIC, center=(big / 2, big / 2))

    # soft drop shadow for depth
    shadow = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    from PIL import ImageFilter
    sh = clip.split()[3].point(lambda a: int(a * 0.35))
    shadow.paste((0, 40, 55, 255), (0, round(6 * scale)), sh)
    shadow = shadow.filter(ImageFilter.GaussianBlur(round(6 * scale)))

    out = Image.alpha_composite(tile, shadow)
    out = Image.alpha_composite(out, clip)
    return out.resize((S, S), Image.LANCZOS)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "source").mkdir(exist_ok=True)

    master = render_master(rounded=True)
    master.save(OUT_DIR / "source" / "clip-master.png")
    master.resize((256, 256), Image.LANCZOS).save(OUT_DIR / "source" / "preview-256.png")

    # Browser extension icons (Chrome/Brave + Safari copy is synced separately).
    for s in SIZES:
        master.resize((s, s), Image.LANCZOS).save(OUT_DIR / f"icon{s}.png")

    # macOS app-icon set: rounded squircle with transparent corners.
    if APPICON.exists():
        for name, px in MAC_ICONS.items():
            master.resize((px, px), Image.LANCZOS).save(APPICON / name)
        # iOS universal icon must be opaque (no alpha) and unrounded — the OS masks it.
        ios = render_master(rounded=False).convert("RGB")
        ios.resize((1024, 1024), Image.LANCZOS).save(APPICON / "universal-icon-1024@1x.png")

    # Container-app UI artwork.
    if LARGEICON.parent.exists():
        master.resize((256, 256), Image.LANCZOS).save(LARGEICON)
    if APP_ICON_PNG.parent.exists():
        master.resize((512, 512), Image.LANCZOS).save(APP_ICON_PNG)

    print("wrote extension icons + macOS/iOS app icon set")


if __name__ == "__main__":
    main()
