#!/usr/bin/env python3
"""Practice-area line icons — gold stroke on transparent."""
from _gen import *

SS = 4
SIZE = 256
S = SIZE*SS
LW = 6*SS            # stroke weight
COL = GOLD + (255,)

def canvas():
    img = new(S, S, (0,0,0,0))
    return img, ImageDraw.Draw(img)

def finish(img, name):
    img.resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(HERE, name))
    print("  saved", name)

cx = cy = S//2

def immigration():
    img, d = canvas()
    r = int(S*0.30)
    # globe
    d.ellipse([cx-r, cy-r, cx+r, cy+r], outline=COL, width=LW)
    # central meridian
    d.ellipse([cx-int(r*0.45), cy-r, cx+int(r*0.45), cy+r], outline=COL, width=int(LW*0.8))
    # latitudes (chords)
    for fy in (-0.45, 0, 0.45):
        yy = cy + int(r*fy)
        dx = int(math.sqrt(max(0, r*r - (r*fy)**2)))
        d.line([(cx-dx, yy),(cx+dx, yy)], fill=COL, width=int(LW*0.8))
    # journey arc + arrow (upper right)
    ax0, ay0 = cx+int(r*0.2), cy-int(r*1.15)
    ax1, ay1 = cx+int(r*1.15), cy-int(r*0.2)
    box = [cx-int(r*0.2), cy-int(r*1.6), cx+int(r*1.7), cy+int(r*0.2)]
    d.arc(box, start=130, end=210, fill=COL, width=LW)
    # arrowhead at arc end (upper area)
    d.line([(ax0, ay0),(ax0-int(r*0.22), ay0+int(r*0.05))], fill=COL, width=LW)
    d.line([(ax0, ay0),(ax0+int(r*0.04), ay0+int(r*0.24))], fill=COL, width=LW)
    finish(img, "icon-immigration.png")

def citizenship():
    img, d = canvas()
    R = int(S*0.30)
    # outer circle (seal)
    d.ellipse([cx-R, cy-R, cx+R, cy+R], outline=COL, width=LW)
    # 5-point star
    pts = []
    sr, ir = int(R*0.62), int(R*0.26)
    for i in range(10):
        ang = -math.pi/2 + i*math.pi/5
        rad = sr if i%2==0 else ir
        pts.append((cx+rad*math.cos(ang), cy+rad*math.sin(ang)))
    d.line(pts+[pts[0]], fill=COL, width=int(LW*0.9), joint="curve")
    # ribbon tails
    d.line([(cx-int(R*0.4), cy+R-LW),(cx-int(R*0.4), cy+int(R*1.5))], fill=COL, width=LW)
    d.line([(cx+int(R*0.4), cy+R-LW),(cx+int(R*0.4), cy+int(R*1.5))], fill=COL, width=LW)
    d.line([(cx-int(R*0.4), cy+int(R*1.5)),(cx, cy+int(R*1.25))], fill=COL, width=LW)
    d.line([(cx+int(R*0.4), cy+int(R*1.5)),(cx, cy+int(R*1.25))], fill=COL, width=LW)
    finish(img, "icon-citizenship.png")

def injury():
    img, d = canvas()
    w = int(S*0.30)
    top = cy-int(S*0.30); bot = cy+int(S*0.34)
    # shield outline
    pts = [(cx-w, top), (cx+w, top), (cx+w, cy+int(S*0.02)),
           (cx, bot), (cx-w, cy+int(S*0.02))]
    d.line(pts+[pts[0]], fill=COL, width=LW, joint="curve")
    # medical plus
    pl = int(w*0.55); pt = int(w*0.20)
    d.line([(cx, cy-pl),(cx, cy+pl)], fill=COL, width=int(LW*1.4))
    d.line([(cx-pl, cy),(cx+pl, cy)], fill=COL, width=int(LW*1.4))
    finish(img, "icon-injury.png")

def family():
    img, d = canvas()
    def figure(fx, fy, scale):
        hr = int(S*0.06*scale)
        d.ellipse([fx-hr, fy-hr, fx+hr, fy+hr], outline=COL, width=LW)
        # shoulders arc
        bw = int(S*0.10*scale); bh = int(S*0.13*scale)
        d.arc([fx-bw, fy+hr, fx+bw, fy+hr+bh*2], start=180, end=360, fill=COL, width=LW)
    figure(cx-int(S*0.16), cy-int(S*0.06), 1.15)   # adult
    figure(cx+int(S*0.16), cy-int(S*0.06), 1.15)   # adult
    figure(cx, cy+int(S*0.10), 0.8)                # child
    finish(img, "icon-family.png")

def realestate():
    img, d = canvas()
    w = int(S*0.30); roof = cy-int(S*0.30)
    eave = cy-int(S*0.04); base = cy+int(S*0.30)
    # roof
    d.line([(cx-w-int(S*0.04), eave),(cx, roof),(cx+w+int(S*0.04), eave)], fill=COL, width=LW, joint="curve")
    # walls
    d.line([(cx-w, eave),(cx-w, base)], fill=COL, width=LW)
    d.line([(cx+w, eave),(cx+w, base)], fill=COL, width=LW)
    d.line([(cx-w, base),(cx+w, base)], fill=COL, width=LW)
    # door
    dw = int(w*0.34); dt = cy+int(S*0.04)
    d.line([(cx-dw, base),(cx-dw, dt),(cx+dw, dt),(cx+dw, base)], fill=COL, width=int(LW*0.85), joint="curve")
    # key (handle dot on door)
    d.ellipse([cx+int(dw*0.2), cy+int(S*0.15), cx+int(dw*0.5), cy+int(S*0.18)], outline=COL, width=int(LW*0.7))
    finish(img, "icon-realestate.png")

print("Practice-area icons:")
immigration(); citizenship(); injury(); family(); realestate()
print("done icons")
