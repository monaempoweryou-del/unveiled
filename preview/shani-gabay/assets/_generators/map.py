#!/usr/bin/env python3
"""Stylized service-area map — Encino / Ventura Blvd, San Fernando Valley."""
from _gen import *

SS = 2
W, H = 1600, 1000
S = (W*SS, H*SS)
img = Image.new("RGBA", S, WARM_WHITE + (255,))
d = ImageDraw.Draw(img)
GRID = (214, 210, 202, 255)
ROAD = (198, 194, 185, 255)

def L(*a): return tuple(int(v*SS) for v in a)

# minor street grid
step = 88
for x in range(0, W+step, step):
    d.line([L(x,0), L(x,H)], fill=GRID, width=SS)
for y in range(0, H+step, step):
    d.line([L(0,y), L(W,y)], fill=GRID, width=SS)
# a few secondary roads (slightly thicker)
for x in (360, 760, 1180):
    d.line([L(x,0), L(x,H)], fill=ROAD, width=2*SS)
for y in (300, 700):
    d.line([L(0,y), L(W,y)], fill=ROAD, width=2*SS)

# 101 freeway — diagonal band across the top-right
fw = [L(1600,120), L(1600,210), L(980,560), L(900,500)]
d.polygon(fw, fill=(225,221,213,255))
d.line([L(1600,150),L(940,530)], fill=(206,202,193,255), width=2*SS)

# Ventura Blvd — the gold spine, just below center
vby = 540
d.line([L(0,vby), L(W,vby)], fill=GOLD+(255,), width=11*SS)

# concentric service rings around the pin
pin = (W//2, vby)
for rr, al in [(150, 60), (300, 42), (460, 26)]:
    d.ellipse([L(pin[0]-rr, pin[1]-rr), L(pin[0]+rr, pin[1]+rr)],
              outline=NAVY+(al,), width=2*SS)

# location pin (navy teardrop + gold dot)
px, py = L(*pin)
pr = 46*SS
d.ellipse([px-pr, py-int(pr*2.4), px+pr, py-int(pr*0.4)], fill=NAVY+(255,))
d.polygon([(px-int(pr*0.62), py-int(pr*0.95)), (px+int(pr*0.62), py-int(pr*0.95)),
           (px, py+int(pr*0.55))], fill=NAVY+(255,))
dr = int(pr*0.42)
d.ellipse([px-dr, py-int(pr*1.45)-dr, px+dr, py-int(pr*1.45)+dr], fill=GOLD+(255,))

# labels
def label(text, x, y, size, color, track, font_idx=2):
    f = avenir(size*SS, idx=font_idx)
    w = tracked_width(d, text, f, track*SS)
    draw_tracked(d, (x*SS - w/2, y*SS), text, f, color+(255,), track*SS)

label("VENTURA BLVD", W//2-300, vby-46, 22, NAVY, 8)
label("ENCINO", W//2, vby-150, 30, NAVY, 6)
label("TARZANA", 300, 470, 22, (120,124,130), 5)
label("SHERMAN OAKS", 1230, 470, 22, (120,124,130), 5)
label("SAN FERNANDO VALLEY", W//2, 120, 26, (170,174,180), 10)
label("LOS ANGELES, CALIFORNIA", W//2, 905, 18, (170,174,180), 8)

img = img.resize((W, H), Image.LANCZOS)
save(img, "section-map.jpg", jpg=True, bg=WARM_WHITE)
print("done map")
