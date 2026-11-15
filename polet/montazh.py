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
Dialogue: 0,0:00:00.10,0:00:09.60,T,,0,0,0,,{\\fad(200,250)}Куда летит Огонёк\\Nв новогоднюю ночь?
Dialogue: 0,0:00:14.80,0:00:19.80,N,,0,0,0,,{\\fad(250,0)}Напиши имя ребёнка\\Nв комментариях,\\N{\\c&H0033D7FF&}и Огонёк прилетит к нему
"""
open("tekst.ass","w",encoding="utf-8").write(ass)
K=["12","23","34","45","5w"]
SEG=[(0.0,5.0),(0.05,5.0),(0.04,5.0),(0.04,5.0),(0.04,5.0)]
SP=[1.5,1.5,1.5,1.0,1.0]
f=[]; ins=[]; L=[]
for i,k in enumerate(K):
    ins+=["-i",f"klipy/{k}.mp4"]
    a,b=SEG[i]; L.append((b-a)/SP[i])
    f.append(f"[{i}:v]trim={a}:{b},setpts=(PTS-STARTPTS)/{SP[i]},fps=30,scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,format=yuv420p[v{i}]")
print("длина",round(sum(L),2),"финал с",round(sum(L[:3]),2))
f.append("[v0][v1][v2][v3][v4]concat=n=5:v=1:a=0,fade=t=in:st=0:d=0.2,fade=t=out:st=19.3:d=0.5,ass=tekst.ass[v]")
subprocess.run(["ffmpeg","-v","error","-y"]+ins+["-filter_complex",";".join(f),"-map","[v]","-c:v","libx264","-profile:v","high",
  "-pix_fmt","yuv420p","-crf","19","-movflags","+faststart","rils_polet_ogonka.mp4"],check=True)
