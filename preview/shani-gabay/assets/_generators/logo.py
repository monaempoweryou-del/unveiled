#!/usr/bin/env python3
from _gen import *

SS = 3  # supersample

def build_wordmark(text_color, rule_color=GOLD, sub_color=None):
    sub_color = sub_color or text_color
    # work canvas, generous; trim later
    W, H = 1600*SS, 520*SS
    img = new(W, H, (0,0,0,0))
    d = ImageDraw.Draw(img)

    name_font = didot(150*SS)
    sub_font  = gill(40*SS, idx=4)   # semibold
    cx = W//2

    # --- firm name ---
    name = "Shani Gabay"
    nbbox = d.textbbox((0,0), name, font=name_font)
    nw = nbbox[2]-nbbox[0]
    ny = 60*SS
    d.text((cx - nw//2 - nbbox[0], ny), name, font=name_font, fill=text_color)
    name_bottom = ny + (nbbox[3]-nbbox[1]) + nbbox[1]

    # --- gold rule with center diamond ---
    rule_y = name_bottom + 60*SS
    rule_half = int(nw*0.46)
    gap = 26*SS
    d.line([(cx-rule_half, rule_y), (cx-gap, rule_y)], fill=rule_color, width=3*SS)
    d.line([(cx+gap, rule_y), (cx+rule_half, rule_y)], fill=rule_color, width=3*SS)
    ds = 9*SS
    d.polygon([(cx, rule_y-ds),(cx+ds, rule_y),(cx, rule_y+ds),(cx-ds, rule_y)], fill=rule_color)

    # --- LAW OFFICES tracked ---
    sub = "LAW OFFICES"
    track = 14*SS
    sw = tracked_width(d, sub, sub_font, track)
    sub_y = rule_y + 34*SS
    draw_tracked(d, (cx - sw/2, sub_y), sub, sub_font, sub_color, track)

    # trim to content with padding
    bbox = img.getbbox()
    pad = 40*SS
    crop = (max(0,bbox[0]-pad), max(0,bbox[1]-pad), min(W,bbox[2]+pad), min(H,bbox[3]+pad))
    img = img.crop(crop)
    # downsample
    w, h = img.size
    return img.resize((w//SS, h//SS), Image.LANCZOS)

def build_monogram(fg, bg=None, ss=SS, size=240):
    S = size*ss
    img = new(S, S, (0,0,0,0))
    d = ImageDraw.Draw(img)
    if bg:
        r = int(S*0.18)
        d.rounded_rectangle([0,0,S-1,S-1], radius=r, fill=bg)
        # thin gold inner frame
        inset = int(S*0.07)
        d.rounded_rectangle([inset,inset,S-1-inset,S-1-inset], radius=int(r*0.7),
                            outline=GOLD, width=max(2,int(S*0.012)))
    mf = didot(int(S*0.52))
    mono = "SG"
    bbox = d.textbbox((0,0), mono, font=mf)
    mw, mh = bbox[2]-bbox[0], bbox[3]-bbox[1]
    d.text((S/2 - mw/2 - bbox[0], S/2 - mh/2 - bbox[1]), mono, font=mf, fill=fg)
    return img.resize((size, size), Image.LANCZOS)

print("Logo / favicon:")
# Primary logo: navy text on transparent (for light backgrounds)
build_wordmark(NAVY, GOLD).save(os.path.join(HERE,"logo.png"))
print("  saved logo.png")
# White logo for navy backgrounds
build_wordmark(ON_NAVY, GOLD).save(os.path.join(HERE,"logo-white.png"))
print("  saved logo-white.png")
# Favicon: navy rounded tile, gold SG
fav = build_monogram(GOLD, bg=NAVY, size=128)
fav.resize((64,64), Image.LANCZOS).save(os.path.join(HERE,"favicon.png"))
print("  saved favicon.png 64")
# Bonus: transparent gold monogram mark for reuse
build_monogram(GOLD, bg=None, size=240).save(os.path.join(HERE,"monogram.png"))
print("  saved monogram.png")
