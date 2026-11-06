#!/usr/bin/env python3
"""Сборка готового мультфильма по шаблону.

Берёт общие сцены из шаблона и личные клипы из папки заказа,
обрезает их по разметке шаблона, склеивает, накладывает озвучку
и выравнивает громкость под соцсети (-14 LUFS).

Папка заказа:
    klipy/04.mp4 ... klipy/09.mp4   личные сцены из Seedance (номер = id сцены)
    ozvuchka.m4a | .mp3 | .wav      озвучка (необязательно)
    muzyka.m4a | .mp3 | .wav        музыка, подкладывается тише голоса (необязательно;
                                    если нет — берётся muzyka.* из папки шаблона)

Запуск:
    python3 sobrat.py shablony/chasy-deda-moroza zakazy/test-nika
"""
import json
import subprocess
import sys
from pathlib import Path

AUDIO_EXT = (".m4a", ".mp3", ".wav", ".aac")


def dlitelnost(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True).stdout.strip()
    return float(out)


def sobrat(shablon_dir, zakaz_dir, out_path=None):
    shablon_dir, zakaz_dir = Path(shablon_dir), Path(zakaz_dir)
    sh = json.loads((shablon_dir / "shablon.json").read_text(encoding="utf-8"))
    w, h = sh["razmer"]
    fps = sh["fps"]

    vhody, oshibki = [], []
    for sc in sh["sceny"]:
        if sc["tip"] == "obshchaya":
            src = shablon_dir / sc["fayl"]
        else:
            src = next(iter(sorted((zakaz_dir / "klipy").glob(f"{sc['id']}.*"))),
                       zakaz_dir / "klipy" / f"{sc['id']}.mp4")
        if not src.exists():
            oshibki.append(f"нет клипа для сцены {sc['id']} «{sc['nazvanie']}»: {src}")
            continue
        est = dlitelnost(src)
        sc = dict(sc)
        if sc["tip"] == "lichnaya" and est + 0.05 < sc["s"] + sc["dlit"]:
            sc["s"] = 0.0  # прислан уже обрезанный кусок (правка по нарезанному исходнику)
        nehvatka = sc["s"] + sc["dlit"] - est
        if nehvatka > 0.5:
            oshibki.append(
                f"сцена {sc['id']} «{sc['nazvanie']}»: клип {est:.2f} с, "
                f"а нужно минимум {sc['dlit']:.2f} с")
        sc["dotyanut"] = max(0.0, nehvatka)
        vhody.append((src, sc))
    if oshibki:
        raise SystemExit("Не могу собрать ролик:\n  " + "\n  ".join(oshibki))

    args = ["ffmpeg", "-v", "error", "-y"]
    filtry = []
    for i, (src, sc) in enumerate(vhody):
        args += ["-i", str(src)]
        filtry.append(
            f"[{i}:v]tpad=stop_mode=clone:stop_duration={sc['dotyanut'] + 0.1:.3f},"
            f"trim=start={sc['s']}:duration={sc['dlit']},setpts=PTS-STARTPTS,"
            f"fps={fps},scale={w}:{h}:force_original_aspect_ratio=increase,"
            f"crop={w}:{h},setsar=1,format=yuv420p[v{i}]")
    n = len(vhody)
    filtry.append("".join(f"[v{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=0[v]")
    obshchaya_dlit = sum(sc["dlit"] for _, sc in vhody)

    def nayti(prefix, *papki):
        for papka in papki:
            for p in sorted(papka.glob(prefix + "*")):
                if p.suffix.lower() in AUDIO_EXT:
                    return p
        return None

    # музыка заказа важнее общей музыки шаблона
    audio = nayti("ozvuchka", zakaz_dir)
    muzyka = nayti("muzyka", zakaz_dir, shablon_dir)
    if audio and muzyka:
        args += ["-i", str(audio), "-i", str(muzyka)]
        filtry.append(f"[{n}:a]aresample=48000,apad,atrim=duration={obshchaya_dlit}[g]")
        filtry.append(
            f"[{n + 1}:a]aresample=48000,apad,atrim=duration={obshchaya_dlit},"
            f"volume=0.25,afade=t=out:st={obshchaya_dlit - 1.5}:d=1.5[m]")
        filtry.append("[g][m]amix=inputs=2:normalize=0,"
                      "loudnorm=I=-14:TP=-1.5:LRA=11[a]")
    elif audio:
        args += ["-i", str(audio)]
        filtry.append(
            f"[{n}:a]aresample=48000,apad,atrim=duration={obshchaya_dlit},"
            "loudnorm=I=-14:TP=-1.5:LRA=11[a]")
    else:
        args += ["-f", "lavfi", "-t", str(obshchaya_dlit),
                 "-i", "anullsrc=r=48000:cl=stereo"]
        filtry.append(f"[{n}:a]anull[a]")

    out_path = Path(out_path or zakaz_dir / "gotovyy_multfilm.mp4")
    args += ["-filter_complex", ";".join(filtry), "-map", "[v]", "-map", "[a]",
             "-c:v", "libx264", "-preset", "medium", "-crf", "21",
             "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
             "-movflags", "+faststart", "-t", f"{obshchaya_dlit:.3f}", str(out_path)]
    subprocess.run(args, check=True)
    print(f"Готово: {out_path} ({obshchaya_dlit:.1f} с, озвучка: "
          f"{audio.name if audio else 'нет'}, музыка: {muzyka.name if muzyka else 'нет'})")
    return out_path


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    sobrat(*sys.argv[1:4])
