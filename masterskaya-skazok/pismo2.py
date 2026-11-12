#!/usr/bin/env python3
"""Письмо от дракончика: дракончик держит большое письмо, на нём текст с именем.

    python3 pismo2.py "Маша" d        (d — девочка, m — мальчик)
    → pisma/Masha_pismo.mp4
"""
import subprocess, sys, tempfile, math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

K = Path(__file__).resolve().parent
P = K / "shablony" / "pismo"
VIDEO = P / "derzhit.mp4"
SCRIPT = str(P / "shrifty" / "marck.ttf")
W, H, FPS = 720, 1280, 24
INK = (92, 46, 18)
TR = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
    "a b v g d e e zh z i y k l m n o p r s t u f h ts ch sh sch _ y _ e yu ya".split()))

def tekst(name, pol):
    d = pol.startswith("d")
    return [("Привет,", 1.25),
            (name + "!", 1.6),
            ("Ты весь год " + ("была" if d else "был"), 1.05),
            ("настоящ" + ("ей умницей!" if d else "им молодцом!"), 1.05),
            ("", 0.15),
            ("С наступающим", 1.05),
            ("Новым годом!", 1.05),
            ("", 0.2),
            ("Твой дракончик Огонёк", 0.9)]

def ramka(arr):
    r, g, b = arr[..., 0].astype(int), arr[..., 1].astype(int), arr[..., 2].astype(int)
    m = (r > 200) & (g > 175) & (b > 120) & (r - b > 20) & (r - b < 110) & (abs(r - g) < 60)
    sub = m[550:1150, 150:620]
    rows = np.where(sub.sum(1) > 200)[0] + 550; cols = np.where(sub.sum(0) > 250)[0] + 150
    return [cols.min(), rows.min(), cols.max(), rows.max()]

def sloy_teksta(name, pol, w, h):
    """Текст на листе размера w×h; возвращает список (картинка строки, y) для эффекта письма."""
    lines = tekst(name, pol); base = h / 9.8
    out = []; y = h * 0.05
    for t, k in lines:
        size = int(base * k)
        if t:
            f = ImageFont.truetype(SCRIPT, size)
            while f.getlength(t) > w * 0.86 and size > 10:
                size -= 2; f = ImageFont.truetype(SCRIPT, size)
            L = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
            x = w / 2
            d.text((x, y + size * 0.55), t, font=f, fill=INK + (245,), anchor="mm")
            out.append((L, x, f.getlength(t), True))
        y += size * 1.12
    return out

def sdelat(name, pol="d", out=None):
    name = name.strip().capitalize()
    slug = "".join(TR.get(c, c) for c in name.lower()).replace("_", "").capitalize()
    out = Path(out or K / "pisma" / f"{slug}_pismo.mp4"); out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(VIDEO), "-vf", f"fps={FPS},scale={W}:{H}",
                        "-compression_level", "1", f"{tmp}/%04d.png"], check=True)
        frames = sorted(Path(tmp).glob("*.png"))
        boxes = np.array([ramka(np.asarray(Image.open(f).convert("RGB"))) for f in frames], float)
        k = 7; pad = np.pad(boxes, ((k, k), (0, 0)), mode="edge")
        boxes = np.array([pad[i:i + 2 * k + 1].mean(0) for i in range(len(boxes))])
        x0, y0, x1, y1 = boxes[0]; bw, bh = int(x1 - x0), int(y1 - y0)
        inner = (int(bw * 0.84), int(bh * 0.86))
        lines = sloy_teksta(name, pol, *inner)
        n = len(lines); t0, t1 = 0.8, 5.8
        for i, fp in enumerate(frames):
            t = i / FPS; im = Image.open(fp).convert("RGBA")
            sheet = Image.new("RGBA", inner, (0, 0, 0, 0))
            for j, (L, x, lw, centered) in enumerate(lines):
                s = t0 + (t1 - t0) * j / n; e = t0 + (t1 - t0) * (j + 1) / n
                p = 0 if t <= s else 1 if t >= e else (t - s) / (e - s)
                if p <= 0: continue
                if p < 1:  # «пишется» слева направо
                    left = (x - lw / 2) if centered else (x - lw)
                    cut = int(left + lw * p)
                    mask = Image.new("L", inner, 0); ImageDraw.Draw(mask).rectangle((0, 0, cut, inner[1]), fill=255)
                    L2 = L.copy(); L2.putalpha(Image.fromarray(np.minimum(np.asarray(L.getchannel("A")), np.asarray(mask))))
                    sheet.alpha_composite(L2)
                else:
                    sheet.alpha_composite(L)
            bx0, by0, bx1, by1 = boxes[i]
            sw, sh = int((bx1 - bx0) * 0.84), int((by1 - by0) * 0.86)
            sh_img = sheet.resize((sw, sh), Image.LANCZOS)
            im.alpha_composite(sh_img, (int(bx0 + (bx1 - bx0 - sw) / 2), int(by0 + (by1 - by0 - sh) / 2)))
            im.convert("RGB").save(fp, compress_level=1)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(FPS), "-i", f"{tmp}/%04d.png",
                        "-i", str(P / "muzyka" / "kolokolchiki_norm.wav"), "-shortest",
                        "-c:v", "libx264", "-preset", "fast", "-profile:v", "high", "-pix_fmt", "yuv420p", "-crf", "21",
                        "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(out)], check=True)
    print("Готово:", out); return out

if __name__ == "__main__":
    if len(sys.argv) < 2: raise SystemExit(__doc__)
    sdelat(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "d")
