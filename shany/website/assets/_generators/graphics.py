#!/usr/bin/env python3
from _gen import *

def fast_glow(w, h, cx, cy, radius, color, max_alpha, ds=4):
    gw, gh = w//ds, h//ds
    g = new(gw, gh, (0,0,0,0)); px = g.load()
    for y in range(gh):
        for x in range(gw):
            d = math.hypot(x-cx/ds, y-cy/ds)/(radius/ds)
            if d < 1:
                px[x,y] = (color[0],color[1],color[2], int(max_alpha*(1-d)**2))
    return g.resize((w,h), Image.BILINEAR)

def fast_vignette(w, h, strength=110, ds=4):
    gw, gh = w//ds, h//ds
    v = new(gw, gh, (0,0,0,0)); px = v.load()
    cx, cy = gw/2, gh/2; maxd = math.hypot(cx,cy)
    for y in range(gh):
        for x in range(gw):
            t = math.hypot(x-cx, y-cy)/maxd
            px[x,y] = (0,0,0, int(strength*max(0,(t-0.5)/0.5)**1.6))
    return v.resize((w,h), Image.BILINEAR)

def grain(w, h, alpha=8):
    n = Image.effect_noise((w,h), 28).convert("L")
    out = new(w, h, (0,0,0,0))
    out.putalpha(n.point(lambda v: int(abs(v-128)/128*alpha)))
    px = out.load()
    return Image.merge("RGBA", (Image.new("L",(w,h),255),)*3 + (out.getchannel("A"),))

def corner_accents(img, color=GOLD, inset=54, length=120, width=3, alpha=170):
    w, h = img.size
    layer = new(w, h, (0,0,0,0))
    d = ImageDraw.Draw(layer)
    c = color + (alpha,)
    for (cx, cy, dx, dy) in [(inset,inset,1,1),(w-inset,inset,-1,1),
                             (inset,h-inset,1,-1),(w-inset,h-inset,-1,-1)]:
        d.line([(cx,cy),(cx+dx*length,cy)], fill=c, width=width)
        d.line([(cx,cy),(cx,cy+dy*length)], fill=c, width=width)
    img.alpha_composite(layer)

def watermark_monogram(img, cx, cy, size, alpha=16):
    w, h = img.size
    mf = didot(size)
    layer = new(w, h, (0,0,0,0))
    d = ImageDraw.Draw(layer)
    bbox = d.textbbox((0,0), "SG", font=mf)
    mw, mh = bbox[2]-bbox[0], bbox[3]-bbox[1]
    d.text((cx-mw/2-bbox[0], cy-mh/2-bbox[1]), "SG", font=mf, fill=GOLD+(alpha,))
    img.alpha_composite(layer)

def navy_panel(w, h, glow_pos="upper-right", wm=True, vig=110):
    img = vgrad(w, h, NAVY, NAVY_DARK)
    if glow_pos == "upper-right":
        img.alpha_composite(fast_glow(w, h, w*0.80, h*0.22, w*0.62, GOLD_LIGHT, 60))
    elif glow_pos == "center":
        img.alpha_composite(fast_glow(w, h, w*0.5, h*0.42, w*0.55, GOLD_LIGHT, 48))
    elif glow_pos == "left":
        img.alpha_composite(fast_glow(w, h, w*0.18, h*0.3, w*0.55, GOLD_LIGHT, 50))
    if wm:
        watermark_monogram(img, w*0.84, h*0.74, int(h*0.9), alpha=14)
    img.alpha_composite(fast_vignette(w, h, vig))
    img.alpha_composite(grain(w, h, 7))
    corner_accents(img)
    return img

print("Hero + section graphics:")
# HERO 1920x1080
hero = navy_panel(1920, 1080, glow_pos="upper-right", wm=True, vig=120)
save(hero, "hero.jpg", jpg=True, bg=NAVY)

# SERVICES band
save(navy_panel(1920, 620, glow_pos="left", wm=True, vig=90), "section-services.jpg", jpg=True, bg=NAVY)
# CTA band
save(navy_panel(1920, 600, glow_pos="center", wm=False, vig=80), "section-cta.jpg", jpg=True, bg=NAVY)

# ABOUT portrait placeholder 900x1100 — dignified branded panel (real headshot to replace)
def about_panel(w=900, h=1100):
    img = vgrad(w, h, NAVY, NAVY_DARK)
    img.alpha_composite(fast_glow(w, h, w*0.5, h*0.32, w*0.85, GOLD_LIGHT, 46))
    # thin gold inner frame
    d = ImageDraw.Draw(img)
    m = 40
    d.rectangle([m, m, w-m-1, h-m-1], outline=GOLD+(120,), width=2)
    watermark_monogram(img, w*0.5, h*0.46, int(h*0.42), alpha=30)
    img.alpha_composite(fast_vignette(w, h, 120))
    img.alpha_composite(grain(w, h, 7))
    return img
save(about_panel(), "section-about.jpg", jpg=True, bg=NAVY)
print("done graphics")
