#!/usr/bin/env python3
"""UNVEILED asset generator — Law Offices of Shani Gabay.
Builds logo, favicon, hero + section graphics, and practice-area icons
using Pillow with supersampling for crisp, professional output.
"""
import os, math, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

random.seed(42)
HERE = os.path.dirname(os.path.abspath(__file__))

# ---- Brand palette (from phase-2 strategy) ----
NAVY        = (15, 39, 66)      # #0F2742
NAVY_DARK   = (9, 22, 40)       # #091628
GOLD        = (201, 162, 75)    # #C9A24B
GOLD_LIGHT  = (217, 186, 114)   # #D9BA72
WARM_WHITE  = (247, 245, 241)   # #F7F5F1
WARM_GRAY   = (232, 230, 225)   # #E8E6E1
CHARCOAL    = (26, 31, 38)      # #1A1F26
ON_NAVY     = (250, 249, 247)   # #FAF9F7

# ---- Fonts ----
DIDOT      = "/System/Library/Fonts/Supplemental/Didot.ttc"
GILL       = "/System/Library/Fonts/Supplemental/GillSans.ttc"
AVENIR     = "/System/Library/Fonts/Avenir Next.ttc"
def didot(sz, bold=False):  return ImageFont.truetype(DIDOT, sz, index=2 if bold else 0)
def gill(sz, idx=0):        return ImageFont.truetype(GILL, sz, index=idx)   # 0 reg,4 semibold,7 light
def avenir(sz, idx=5):      return ImageFont.truetype(AVENIR, sz, index=idx) # 5 medium,2 demibold,7 reg

# ---- helpers ----
def new(w, h, color=(0,0,0,0)):
    return Image.new("RGBA", (w, h), color)

def vgrad(w, h, top, bottom):
    base = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        base.putpixel((0, y), tuple(int(top[i] + (bottom[i]-top[i])*t) for i in range(3)))
    return base.resize((w, h)).convert("RGBA")

def radial_glow(w, h, cx, cy, radius, color, max_alpha):
    g = new(w, h, (0,0,0,0))
    px = g.load()
    for y in range(h):
        for x in range(w):
            d = math.hypot(x-cx, y-cy) / radius
            if d < 1:
                a = int(max_alpha * (1-d)**2)
                px[x, y] = (color[0], color[1], color[2], a)
    return g

def vignette(w, h, strength=90):
    v = new(w, h, (0,0,0,0))
    px = v.load()
    cx, cy = w/2, h/2
    maxd = math.hypot(cx, cy)
    for y in range(h):
        for x in range(w):
            d = math.hypot(x-cx, y-cy)/maxd
            a = int(strength * max(0, d-0.45)/0.55)
            px[x, y] = (0,0,0, min(strength, max(0, a)))
    return v

def noise_layer(w, h, alpha=10):
    n = new(w, h, (0,0,0,0))
    px = n.load()
    for y in range(h):
        for x in range(w):
            v = random.randint(0, 255)
            px[x, y] = (v, v, v, alpha)
    return n

def draw_tracked(draw, xy, text, font, fill, tracking):
    """Draw letter-spaced text; return total width. xy is left baseline-top."""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        w = draw.textlength(ch, font=font)
        x += w + tracking
    return x - xy[0] - tracking

def tracked_width(draw, text, font, tracking):
    return sum(draw.textlength(ch, font=font) + tracking for ch in text) - tracking

def save(img, name, jpg=False, bg=None):
    path = os.path.join(HERE, name)
    if jpg:
        flat = Image.new("RGB", img.size, bg or (255,255,255))
        flat.paste(img, (0,0), img if img.mode=="RGBA" else None)
        flat.save(path, "JPEG", quality=88, optimize=True)
    else:
        img.save(path, "PNG", optimize=True)
    print("  saved", name, img.size)
