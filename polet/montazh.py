import subprocess
ass="""[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: T,Inter ExtraBold,46,&H00FFFFFF,&H00FFFFFF,&H00202020,&H64000000,0,0,0,0,100,100,0,0,1,4,3,8,40,40,150,1
Style: N,Inter ExtraBold,46,&H00FFFFFF,&H00FFFFFF,&H00202020,&H64000000,0,0,0,0,100,100,0,0,1,4,3,2,40,40,260,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.10,0:00:09.30,T,,0,0,0,,{\\fad(200,250)}Куда летит Огонёк\\Nв новогоднюю ночь?
Dialogue: 0,0:00:13.90,0:00:18.60,N,,0,0,0,,{\\fad(250,0)}Напиши имя ребёнка\\Nв комментариях,\\N{\\c&H0033D7FF&}и Огонёк прилетит к нему
"""
open("tekst.ass","w",encoding="utf-8").write(ass)
PL=[("12",0.0,4.14,1.5),("12",4.14,5.0,3.0),("23",0.04,0.5,3.0),("23",0.5,5.0,1.5),("34",0.04,5.0,1.5),
    ("45",0.04,1.75,1.0),("45",2.55,5.0,1.0),("5w",0.04,5.0,1.0)]
files=[]; f=[]; t=0; mark={}
for i,(k,a,b,sp) in enumerate(PL):
    if k not in files: files.append(k)
    mark.setdefault(k,t); t+=(b-a)/sp
    blur=",tmix=frames=2" if sp>2 else ""
    f.append(f"[{files.index(k)}:v]trim={a}:{b},setpts=(PTS-STARTPTS)/{sp}{blur},fps=30,scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,format=yuv420p[v{i}]")
ins=[]
for k in files: ins+=["-i",f"klipy/{k}.mp4"]
print("длина",round(t,2),"метки",{k:round(v,2) for k,v in mark.items()})
LA=sum((b-a)/sp for k,a,b,sp in PL[:2]); X=0.1
f.append("[v0][v1]concat=n=2:v=1:a=0[A]")
f.append("".join(f"[v{i}]" for i in range(2,len(PL)))+f"concat=n={len(PL)-2}:v=1:a=0[B]")
f.append(f"[A][B]xfade=transition=fade:duration={X}:offset={LA-X:.3f},fade=t=in:st=0:d=0.2,fade=t=out:st={t-X-0.5:.2f}:d=0.5,ass=tekst.ass[v]")
subprocess.run(["ffmpeg","-v","error","-y"]+ins+["-filter_complex",";".join(f),"-map","[v]","-c:v","libx264","-profile:v","high",
  "-pix_fmt","yuv420p","-crf","19","-movflags","+faststart","rils_polet_ogonka.mp4"],check=True)
