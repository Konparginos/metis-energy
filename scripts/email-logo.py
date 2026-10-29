# Renders public/email-logo.gif: the Logo.jsx mark with the curve drawing in, for email headers
# (mail clients drop SVG and CSS animation; GIF is what they play). Run: python scripts/email-logo.py
from PIL import Image, ImageDraw

S, OUT, SS = 64, 96, 8  # viewBox, output px, supersampling
K = OUT * SS / S

def cubic(p0, p1, p2, p3, n=150):
    return [tuple(((1 - t) ** 3) * a + 3 * ((1 - t) ** 2) * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d
                  for a, b, c, d in zip(p0, p1, p2, p3)) for t in (i / n for i in range(n + 1))]

# M 8.7 38 C 18 26, 26 26, 32 33 S 46 42, 53.8 22  (S reflects 26,26 about 32,33 -> 38,40)
curve = cubic((8.7, 38), (18, 26), (26, 26), (32, 33)) + cubic((32, 33), (38, 40), (46, 42), (53.8, 22))[1:]

def frame(progress, dot):
    im = Image.new('RGB', (OUT * SS,) * 2, 'white')
    d = ImageDraw.Draw(im)
    w = 4 * K
    d.ellipse([(32 - 24) * K, (32 - 24) * K, (32 + 24) * K, (32 + 24) * K], outline='#0B3D4C', width=round(w))
    pts = [(x * K, y * K) for x, y in curve[:max(1, round(progress * (len(curve) - 1))) + 1]]
    for x, y in pts:  # dense round dabs: smooth stroke with round caps, no joint artefacts
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill='#157A8C')
    if dot:
        r = 4.5 * dot * K
        d.ellipse([42 * K - r, 19 * K - r, 42 * K + r, 19 * K + r], fill='#E3A23B')
    return im.resize((OUT, OUT), Image.LANCZOS)

ease = lambda t: 1 - (1 - t) ** 3
draw = [frame(ease(i / 18), 0) for i in range(1, 19)]
pop = [frame(1, s) for s in (0.4, 0.8, 1.15, 1.0)]
# ponytail: frame 0 is the finished mark (20 ms) so Outlook desktop, which shows only the first frame, gets the full logo.
frames = [frame(1, 1), frame(0, 0)] + draw + pop
durations = [20, 200] + [40] * len(draw) + [50] * len(pop)
frames[-1].info['duration'] = 0
frames[0].save('public/email-logo.gif', save_all=True, append_images=frames[1:], duration=durations, optimize=True, disposal=1)
