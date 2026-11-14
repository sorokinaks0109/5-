import subprocess
K=["01","a_privivka","b_luzhi","c_risuem","02","03","04","05"]
D=[3.0,3.0,3.0,3.0,3.0,3.2,3.4,5.5]; X=0.35
S=[0.6,1.0,0.8,1.0,0.6,0.8,1.0,0.0]
tot=sum(D)-X*(len(D)-1)
ins=[]; f=[]
for i,(d,s) in enumerate(zip(D,S)):
    ins+=["-i",f"klipy/{K[i]}.mp4"]
    f.append(f"[{i}:v]trim={s}:{s+d},setpts=PTS-STARTPTS,fps=30,scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,format=yuv420p[v{i}]")
cur="v0"; t=0
for i in range(1,len(D)):
    t+=D[i-1]-X
    f.append(f"[{cur}][v{i}]xfade=transition=fade:duration={X}:offset={t:.2f}[x{i}]"); cur=f"x{i}"
st=[0]
for d in D[:-1]: st.append(st[-1]+d-X)
def ts(x): return f"0:{int(x//60):02d}:{x%60:05.2f}"
T=["Она не спала ночами,\\Nкогда ты плакал","Держала за руку,\\Nкогда было страшно","Прыгала с тобой\\Nпо лужам","Хранит все\\Nтвои рисунки",
   "Плакала от счастья\\Nв твой первый\\Nшкольный день","И до сих пор\\Nждёт твоего звонка","Теперь твоя очередь\\Nрассказать ей сказку"]
ev=[(st[i]+(0.15 if i==0 else 0.3),st[i+1]+0.1,T[i]) for i in range(7)]
ev.append((st[7]+0.8,tot,"{\\fs50}Мультфильм о маме\\Nко Дню матери\\N{\\fs38\\c&H00A8E6FF&}Заказы до 22 ноября\\Nссылка в профиле"))
ass=f"""[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: T,Playfair Display Black,54,&H00FFFFFF,&H00FFFFFF,&H20140A28,&H80000000,0,0,0,0,100,100,1,0,1,5,4,2,30,30,250,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""+"\n".join(f"Dialogue: 0,{ts(a)},{ts(b)},T,,0,0,0,,{{\\fad(350,300)}}{x}" for a,b,x in ev)+"\n"
open("tekst.ass","w",encoding="utf-8").write(ass)
fc=";".join(f)+f";[{cur}]fade=t=in:st=0:d=0.4,fade=t=out:st={tot-0.6:.2f}:d=0.6,ass=tekst.ass[v]"
subprocess.run(["ffmpeg","-v","error","-y"]+ins+["-f","lavfi","-t",f"{tot:.2f}","-i","anullsrc=r=48000:cl=stereo",
  "-filter_complex",fc,"-map","[v]","-map",f"{len(D)}:a","-c:v","libx264","-profile:v","high","-pix_fmt","yuv420p","-crf","19",
  "-c:a","aac","-shortest","-movflags","+faststart","rils_den_materi.mp4"],check=True)
print(round(tot,2), [round(x,1) for x in st])
