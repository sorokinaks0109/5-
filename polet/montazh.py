import subprocess
ass="""[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: T,Inter ExtraBold,46,&H00FFFFFF,&H00FFFFFF,&H00202020,&H64000000,0,0,0,0,100,100,0,0,1,4,3,8,40,40,150,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.10,0:00:08.40,T,,0,0,0,,{\\fad(200,250)}Куда летит Огонёк\\Nв новогоднюю ночь?
Dialogue: 0,0:00:10.40,0:00:14.00,T,,0,0,0,,{\\fad(250,0)}Напиши имя ребёнка\\Nв комментариях,\\N{\\c&H0033D7FF&}и Огонёк прилетит к нему
"""
open("tekst.ass","w",encoding="utf-8").write(ass)
K=["12","23","34","45"]
SEG=[(0.0,4.55),(0.35,4.55),(0.35,4.6),(0.3,5.0)]   # обрезаем торможение в конце и разгон в начале
SP=[1.5,1.5,1.5,1.0]; X=0.2
f=[]; ins=[]; L=[]
for i,k in enumerate(K):
    ins+=["-i",f"klipy/{k}.mp4"]
    a,b=SEG[i]; L.append((b-a)/SP[i])
    f.append(f"[{i}:v]trim={a}:{b},setpts=(PTS-STARTPTS)/{SP[i]},fps=30,scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,format=yuv420p[v{i}]")
cur="v0"; t=0
for i in range(1,4):
    t+=L[i-1]-X
    f.append(f"[{cur}][v{i}]xfade=transition=fade:duration={X}:offset={t:.3f}[x{i}]"); cur=f"x{i}"
tot=sum(L)-3*X; print("длина",round(tot,2),"финал с",round(t,2))
f.append(f"[{cur}]fade=t=in:st=0:d=0.2,ass=tekst.ass[v]")
subprocess.run(["ffmpeg","-v","error","-y"]+ins+["-filter_complex",";".join(f),"-map","[v]","-c:v","libx264","-profile:v","high",
  "-pix_fmt","yuv420p","-crf","19","-movflags","+faststart","rils_polet_ogonka.mp4"],check=True)
