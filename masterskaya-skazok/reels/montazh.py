#!/usr/bin/env python3
"""Монтаж рилса «Мастерская сказок»: говорящая голова + вставки + запись экрана + субтитры."""
import json, subprocess, sys
from pathlib import Path

R = Path(sys.argv[1])            # папка с v1..v4.mp4, ekran.mp4, tr1..4.json
OUT = Path(sys.argv[2])
SH = Path("/home/user/5-/masterskaya-skazok/shablony")
KS = Path("/home/user/5-/kartinki-dlya-sayta")
TMP = R / "seg"; TMP.mkdir(exist_ok=True)
W, H, FPS = 720, 1280, 30

def run(a): subprocess.run(["ffmpeg", "-v", "error", "-y"] + a, check=True)

LOOK = "eq=contrast=1.05:saturation=1.08:gamma=1.02,colorbalance=rs=0.03:gs=0.01:bs=-0.03,vignette=PI/5"
FIT = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1,fps={FPS},format=yuv420p"

def me(n, v, a, b, zoom=1.0):
    z = f"scale={int(W*zoom)}:{int(H*zoom)},crop={W}:{H}," if zoom != 1 else ""
    run(["-ss", f"{a}", "-t", f"{b-a}", "-i", str(R/f"v{v}.mp4"), "-map", "0:v:0", "-an",
         "-vf", f"{FIT},{z}{LOOK},format=yuv420p", "-c:v", "libx264", "-crf", "18", "-preset", "fast", str(TMP/f"{n}.mp4")])

def klip(n, src, a, d, flash=True):
    fl = ",fade=t=in:st=0:d=0.18:color=white" if flash else ""
    run(["-ss", f"{a}", "-t", f"{d}", "-i", str(src), "-an", "-vf", f"{FIT}{fl}",
         "-c:v", "libx264", "-crf", "18", "-preset", "fast", str(TMP/f"{n}.mp4")])

def foto(n, src, d, flash=True, fit=False):
    fr = int(d*FPS)
    fl = ",fade=t=in:st=0:d=0.18:color=white" if flash else ""
    if fit:  # вся картинка целиком на размытом фоне
        f = (f"[0]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=30,eq=brightness=-0.1[bg];"
             f"[0]scale={W-40}:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2-60,"
             f"zoompan=z='1+0.05*on/{fr}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s={W}x{H}:fps={FPS},setsar=1,format=yuv420p{fl}[v]")
    else:
        f = (f"[0]scale={W*2}:{H*2}:force_original_aspect_ratio=increase,crop={W*2}:{H*2},"
             f"zoompan=z='1+0.07*on/{fr}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d={fr}:s={W}x{H}:fps={FPS},setsar=1,format=yuv420p{fl}[v]")
    run(["-loop", "1", "-framerate", str(FPS), "-i", str(src), "-t", f"{d}", "-filter_complex", f,
         "-map", "[v]", "-frames:v", str(fr), "-c:v", "libx264", "-crf", "18", "-preset", "fast", str(TMP/f"{n}.mp4")])

def ekran(n, a, b, d, flash=False):
    sp = (b-a)/d
    fl = ",fade=t=in:st=0:d=0.18:color=white" if flash else ""
    run(["-ss", f"{a}", "-t", f"{b-a}", "-i", str(R/"ekran.mp4"), "-an", "-filter_complex",
         f"[0]setpts=PTS/{sp:.4f},fps={FPS},split[a][b];"
         f"[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=25,eq=brightness=-0.15[bg];"
         f"[b]scale=-2:1160[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p{fl}[v]",
         "-map", "[v]", "-t", f"{d}", "-c:v", "libx264", "-crf", "18", "-preset", "fast", str(TMP/f"{n}.mp4")])

DR = SH/"drakonchik/klipy"; PZ = SH/"poezd/klipy"
# ---------- звук: куски речи ----------
REC = [("v4", 0.30, 5.30), ("v1", 0.15, 10.85), ("v2", 0.10, 7.30), ("v3", 0.00, 9.90), ("v4", 6.05, 10.55)]
TAIL = 1.6
offs = []; t = 0
for v, a, b in REC: offs.append(t); t += b-a
TOTAL = t + TAIL

# ---------- видео ----------
seq = []
def add(fn, n, *a, **k): fn(n, *a, **k); seq.append(n)
# 1. Крючок (5.0)
add(me, "01", 4, 0.30, 1.90)
add(klip, "02", DR/"08.mp4", 1.0, 3.4)
# 2. Знакомство (10.7)
add(me, "03", 1, 0.15, 5.05)
add(me, "04", 1, 5.05, 8.75, zoom=1.12)
add(foto, "05", KS/"bylo_stalo_yaseniya.jpg", 2.1, fit=True)
# 3. Максим (7.2)
add(foto, "06", KS/"foto_maksim_obrabotannoe.jpg", 1.35)
add(me, "07", 2, 1.45, 2.95, zoom=1.12)
add(klip, "08", PZ/"05.mp4", 0.5, 2.0)
add(klip, "09", PZ/"06.mp4", 0.6, 1.15, flash=False)
add(klip, "10", PZ/"08.mp4", 0.8, 1.20, flash=False)
# 4. Как заказать (9.9)
add(me, "11", 3, 0.00, 1.35)
add(ekran, "12", 11.6, 31.5, 5.3, flash=True)
add(ekran, "13", 39.0, 44.0, 3.25)
# 5. Призыв (4.5) + концовка
add(me, "14", 4, 6.05, 10.55, zoom=1.08)
add(klip, "15", DR/"08.mp4", 2.5, TAIL)

lst = TMP/"list.txt"; lst.write_text("".join(f"file '{TMP/(n+'.mp4')}'\n" for n in seq))
run(["-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(TMP/"video.mp4")])

# ---------- звук ----------
ins = []; flt = []
for i, (v, a, b) in enumerate(REC):
    ins += ["-ss", f"{a}", "-t", f"{b-a}", "-i", str(R/f"{v}.mp4")]
    flt.append(f"[{i}:a:0]aresample=48000,afade=t=in:d=0.03,afade=t=out:st={b-a-0.04:.3f}:d=0.04[a{i}]")
flt.append("".join(f"[a{i}]" for i in range(len(REC))) + f"concat=n={len(REC)}:v=0:a=1,highpass=f=80,"
           f"acompressor=threshold=-20dB:ratio=3:attack=5:release=80,apad,atrim=duration={TOTAL:.3f},"
           f"loudnorm=I=-14:TP=-1.5:LRA=9[a]")
run(ins + ["-filter_complex", ";".join(flt), "-map", "[a]", "-c:a", "pcm_s16le", str(TMP/"audio.wav")])

# ---------- субтитры (ASS, подсветка текущего слова) ----------
def ts(x):
    h = int(x//3600); m = int(x%3600//60); s = x%60
    return f"{h}:{m:02d}:{s:05.2f}"
words = []
for i, (v, a, b) in enumerate(REC):
    for c in json.load(open(R/f"tr{v[1]}.json"))["chunks"]:
        s0, s1 = c["timestamp"]
        if s0 >= a-0.05 and s1 <= b+0.05:
            words.append([c["text"].strip().replace("ребенка", "ребёнка").replace("все остальное", "всё остальное"),
                          offs[i]+s0-a, offs[i]+s1-a])
for w in words:
    if w[0] == "все": w[0] = "всё"
groups = []; cur = []
for w in words:
    cur.append(w)
    if len(cur) == 3 or w[0][-1] in ".,?!" or sum(len(x[0]) for x in cur) > 15:
        groups.append(cur); cur = []
if cur: groups.append(cur)
ev = []
for gi, g in enumerate(groups):
    nxt = groups[gi+1][0][1] if gi+1 < len(groups) else 1e9
    for j, w in enumerate(g):
        end = g[j+1][1] if j+1 < len(g) else min(w[2]+0.12, nxt - 0.01)
        txt = " ".join((r"{\c&H0033D7FF&}" + x[0] + r"{\c&H00FFFFFF&}") if k == j else x[0] for k, x in enumerate(g))
        ev.append(f"Dialogue: 0,{ts(w[1])},{ts(end)},Sub,,0,0,0,,{txt}")
ev.append(f"Dialogue: 1,{ts(0.0)},{ts(5.0)},Top,,0,0,0,,НОВОГОДНЯЯ СКАЗКА\\NПРО ВАШЕГО РЕБЁНКА")
ev.append(f"Dialogue: 1,{ts(TOTAL-TAIL)},{ts(TOTAL)},End,,0,0,0,,{{\\fad(250,0)}}Ссылка в шапке профиля ↑")
ass = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Inter Black,52,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,5,2,2,55,55,330,204
Style: Top,Inter Black,40,&H00FFFFFF,&H00FFFFFF,&H00532B1A,&H64000000,0,0,0,0,100,100,1,0,3,14,0,8,60,60,110,204
Style: End,Inter Black,56,&H0033D7FF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,5,3,5,40,40,0,204

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
""" + "\n".join(ev) + "\n"
(TMP/"sub.ass").write_text(ass, encoding="utf-8")

run(["-i", str(TMP/"video.mp4"), "-i", str(TMP/"audio.wav"), "-vf", f"ass={TMP/'sub.ass'}",
     "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-profile:v", "high", "-level", "4.0",
     "-pix_fmt", "yuv420p", "-crf", "19", "-preset", "medium", "-r", str(FPS),
     "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-map_metadata", "-1", "-movflags", "+faststart", "-t", f"{TOTAL:.3f}", str(OUT)])
print("Готово", OUT, round(TOTAL, 2), "с")
