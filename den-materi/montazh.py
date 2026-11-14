import subprocess
D=[3.6,3.6,4.0,4.2,6.0]; X=0.5   # длительность кусков и наплыв
S=[0.3,0.2,0.3,0.4,0.0]          # с какой секунды клипа брать
tot=sum(D)-X*(len(D)-1)
ins=[]; f=[]
for i,(d,s) in enumerate(zip(D,S)):
    ins+=["-i",f"klipy/0{i+1}.mp4"]
    f.append(f"[{i}:v]trim={s}:{s+d},setpts=PTS-STARTPTS,fps=30,scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,format=yuv420p[v{i}]")
cur="v0"; t=0
for i in range(1,len(D)):
    t+=D[i-1]-X
    f.append(f"[{cur}][v{i}]xfade=transition=fade:duration={X}:offset={t:.2f}[x{i}]"); cur=f"x{i}"
st=[0]
for d in D[:-1]: st.append(st[-1]+d-X)
def ts(x): return f"0:{int(x//60):02d}:{x%60:05.2f}"
ev=[(st[0]+0.3,st[1]+0.1,"Она не спала ночами,\\Nкогда ты плакал"),
    (st[1]+0.4,st[2]+0.1,"Плакала от счастья\\Nв твой первый школьный день"),
    (st[2]+0.4,st[3]+0.1,"И до сих пор\\Nждёт твоего звонка"),
    (st[3]+0.4,st[4]+0.1,"Теперь твоя очередь\\Nрассказать ей сказку"),
    (st[4]+1.2,tot,"{\\fs40}Мультфильм о маме\\Nко Дню матери\\N{\\fs30\\c&H00A8E6FF&}Заказы до 22 ноября · ссылка в профиле")]
ass=f"""[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: T,Playfair Display Black,46,&H00FFFFFF,&H00FFFFFF,&H64200C00,&H96000000,0,0,0,0,100,100,0,0,1,3,2,2,40,40,250,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""+"\n".join(f"Dialogue: 0,{ts(a)},{ts(b)},T,,0,0,0,,{{\\fad(350,300)}}{x}" for a,b,x in ev)+"\n"
open("tekst.ass","w",encoding="utf-8").write(ass)
fc=";".join(f)+f";[{cur}]fade=t=in:st=0:d=0.4,fade=t=out:st={tot-0.6:.2f}:d=0.6,ass=tekst.ass[v]"
subprocess.run(["ffmpeg","-v","error","-y"]+ins+["-f","lavfi","-t",f"{tot:.2f}","-i","anullsrc=r=48000:cl=stereo",
  "-filter_complex",fc,"-map","[v]","-map",f"{len(D)}:a","-c:v","libx264","-profile:v","high","-pix_fmt","yuv420p","-crf","19",
  "-c:a","aac","-shortest","-movflags","+faststart","rils_den_materi.mp4"],check=True)
print(round(tot,2), [round(x,1) for x in st])
