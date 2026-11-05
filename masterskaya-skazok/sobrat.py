#!/usr/bin/env python3
"""Сборка готового мультфильма по шаблону.

Берёт общие сцены из шаблона и личные клипы из папки заказа,
обрезает их по разметке шаблона, склеивает, накладывает озвучку
и выравнивает громкость под соцсети (-14 LUFS).

Папка заказа:
    klipy/04.mp4 ... klipy/09.mp4   личные сцены из Seedance (номер = id сцены)
    ozvuchka.m4a | .mp3 | .wav      готовая озвучка с музыкой (необязательно)

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
            src = zakaz_dir / "klipy" / f"{sc['id']}.mp4"
        if not src.exists():
            oshibki.append(f"нет клипа для сцены {sc['id']} «{sc['nazvanie']}»: {src}")
            continue
        nado = sc["s"] + sc["dlit"]
        est = dlitelnost(src)
        if est + 0.05 < nado:
            oshibki.append(
                f"сцена {sc['id']} «{sc['nazvanie']}»: клип {est:.2f} с, "
                f"а нужно минимум {nado:.2f} с")
        vhody.append((src, sc))
    if oshibki:
        raise SystemExit("Не могу собрать ролик:\n  " + "\n  ".join(oshibki))

    args = ["ffmpeg", "-v", "error", "-y"]
    filtry = []
    for i, (src, sc) in enumerate(vhody):
        args += ["-i", str(src)]
        filtry.append(
            f"[{i}:v]trim=start={sc['s']}:duration={sc['dlit']},setpts=PTS-STARTPTS,"
            f"fps={fps},scale={w}:{h}:force_original_aspect_ratio=increase,"
            f"crop={w}:{h},setsar=1,format=yuv420p[v{i}]")
    n = len(vhody)
    filtry.append("".join(f"[v{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=0[v]")
    obshchaya_dlit = sum(sc["dlit"] for _, sc in vhody)

    audio = next((p for p in sorted(zakaz_dir.glob("ozvuchka*"))
                  if p.suffix.lower() in AUDIO_EXT), None)
    if audio:
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
             "-c:v", "libx264", "-preset", "medium", "-crf", "18",
             "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
             "-movflags", "+faststart", "-t", f"{obshchaya_dlit:.3f}", str(out_path)]
    subprocess.run(args, check=True)
    print(f"Готово: {out_path} ({obshchaya_dlit:.1f} с, озвучка: "
          f"{audio.name if audio else 'нет'})")
    return out_path


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    sobrat(*sys.argv[1:4])
