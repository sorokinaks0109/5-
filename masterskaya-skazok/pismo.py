#!/usr/bin/env python3
"""Видеописьмо от дракончика с именем ребёнка.

    python3 pismo.py "Маша"            → pisma/Masha.mp4
    python3 pismo.py "Маша" out.mp4
"""
import math, os, subprocess, sys, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

K = Path(__file__).resolve().parent
P = K / "shablony" / "pismo"
VIDEO = P / "drakon.mp4"
SCRIPT = P / "shrifty" / "marck.ttf"
INTER = "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf"
INTER_S = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"
W, H, FPS = 720, 1280, 24
TRANSLIT = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
    "a b v g d e e zh z i y k l m n o p r s t u f h ts ch sh sch _ y _ e yu ya".split()))

def fit(text, path, max_w, size):
    while size > 20:
        f = ImageFont.truetype(path, size)
        if f.getlength(text) <= max_w: return f
        size -= 4
    return ImageFont.truetype(path, size)

def ease(x): return 0 if x <= 0 else 1 if x >= 1 else 1 - (1 - x) ** 3

def text_layer(name):
    """Слои текста: (картинка RGBA, время появления, длительность появления)."""
    layers = []
    def make(draw_fn):
        L = Image.new("RGBA", (W, H), (0, 0, 0, 0)); draw_fn(L); return L
    def glow_text(L, xy, t, f, fill, glow):
        g = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ImageDraw.Draw(g).text(xy, t, font=f, fill=glow, anchor="mm")
        L.alpha_composite(g.filter(ImageFilter.GaussianBlur(12)))
        d = ImageDraw.Draw(L); d.text((xy[0] + 2, xy[1] + 4), t, font=f, fill=(0, 0, 0, 150), anchor="mm")
        d.text(xy, t, font=f, fill=fill, anchor="mm")
    f1 = ImageFont.truetype(INTER_S, 34)
    layers.append((make(lambda L: glow_text(L, (W / 2, 120), "Письмо от дракончика", f1, (255, 255, 255, 255), (120, 170, 255, 160))), 0.6, 0.5))
    fn = fit(name + "!", str(SCRIPT), W - 80, 150)
    layers.append((make(lambda L: glow_text(L, (W / 2, 245), name + "!", fn, (255, 214, 102, 255), (255, 160, 40, 230))), 1.4, 0.7))
    f3 = ImageFont.truetype(INTER, 52)
    layers.append((make(lambda L: glow_text(L, (W / 2, 370), "С Новым годом!", f3, (255, 255, 255, 255), (255, 200, 120, 120))), 3.0, 0.5))
    f4 = ImageFont.truetype(INTER_S, 36)
    layers.append((make(lambda L: glow_text(L, (W / 2, 438), "Пусть сбудутся все желания", f4, (255, 236, 190, 255), (255, 200, 120, 90))), 4.0, 0.5))
    def pill(L):
        d = ImageDraw.Draw(L); f = ImageFont.truetype(INTER, 24)
        d.rounded_rectangle((W / 2 - 175, H - 92, W / 2 + 175, H - 46), radius=23, fill=(232, 111, 81, 230))
        d.text((W / 2, H - 69), "МАСТЕРСКАЯ СКАЗОК", font=f, fill="white", anchor="mm")
    layers.append((make(pill), 7.5, 0.6))
    return layers

def sparkles(t, seed=3):
    """Золотые искры, слетающие на имя при появлении."""
    import random
    L = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L); rnd = random.Random(seed)
    for _ in range(40):
        x0, y0 = rnd.uniform(60, W - 60), rnd.uniform(160, 330); ph = rnd.uniform(0, 6.28); sp = rnd.uniform(0.6, 1.4)
        life = (t - 1.2) * sp
        if 0 < life < 2.2:
            a = int(255 * math.sin(math.pi * life / 2.2)); r = 2 + 3 * abs(math.sin(ph + t * 5))
            y = y0 + life * 25; d.ellipse((x0 - r, y - r, x0 + r, y + r), fill=(255, 220, 130, a))
    return L.filter(ImageFilter.GaussianBlur(0.8))

def sdelat(name, out=None):
    name = name.strip().capitalize()
    slug = "".join(TRANSLIT.get(c, c) for c in name.lower()).replace("_", "").replace(" ", "")
    out = Path(out or (K / "pisma" / f"{slug.capitalize()}.mp4")); out.parent.mkdir(parents=True, exist_ok=True)
    layers = text_layer(name)
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(VIDEO), "-vf", f"fps={FPS},scale={W}:{H}", "-compression_level", "1", f"{tmp}/%04d.png"], check=True)
        frames = sorted(Path(tmp).glob("*.png"))
        for i, fp in enumerate(frames):
            t = i / FPS; im = Image.open(fp).convert("RGBA")
            for L, start, dur in layers:
                a = ease((t - start) / dur)
                if a > 0:
                    if a < 1:
                        L2 = L.copy(); L2.putalpha(L.getchannel("A").point(lambda v, a=a: int(v * a))); im.alpha_composite(L2)
                    else: im.alpha_composite(L)
            im.alpha_composite(sparkles(t))
            im.convert("RGB").save(fp, compress_level=1)
        dur = len(frames) / FPS
        # колокольчики: отдельный звуковой файл точной длины
        bells = [(1568, 1.4, .12), (2093, 1.55, .10), (2637, 1.7, .08), (3136, 1.85, .06), (1319, 3.0, .10), (1760, 3.15, .08), (2093, 7.5, .07)]
        import numpy as np, wave
        sr = 48000; tt = np.arange(int(dur * sr)) / sr; snd = np.zeros_like(tt)
        for f, st, v in bells:
            x = np.clip(tt - st, 0, None); on = tt >= st
            snd += on * v * np.exp(-2.2 * x) * (np.sin(2*np.pi*f*x) + 0.45*np.sin(2*np.pi*f*2.76*x) + 0.25*np.sin(2*np.pi*f*5.4*x))
        fade = np.clip((dur - tt) / 1.0, 0, 1); snd = np.clip(snd * fade, -1, 1)
        wav = f"{tmp}/zvuk.wav"
        with wave.open(wav, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((snd * 32000).astype(np.int16).tobytes())
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(FPS), "-i", f"{tmp}/%04d.png", "-i", wav,
                        "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "fast", "-profile:v", "high", "-pix_fmt", "yuv420p",
                        "-crf", "23", "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-movflags", "+faststart", str(out)], check=True)
    print("Готово:", out)
    return out

if __name__ == "__main__":
    if len(sys.argv) < 2: raise SystemExit(__doc__)
    sdelat(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
