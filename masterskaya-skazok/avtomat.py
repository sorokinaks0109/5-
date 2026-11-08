#!/usr/bin/env python3
"""Автоматический заказ через fal.ai: фото ребёнка → готовый мультфильм.

Шаги (запускаются по отдельности, чтобы между ними можно было согласовать персонажа):
    python3 avtomat.py personazh zakazy/<имя>    персонаж по фото (GPT Image 2.6)
    python3 avtomat.py klipy     zakazy/<имя>    6 клипов: Kling 4.0 меняет ребёнка в клипах шаблона
    python3 avtomat.py ozvuchka  zakazy/<имя>    озвучка с именем клонированным голосом (MiniMax)
    python3 avtomat.py sobrat    zakazy/<имя>    склейка готового ролика
    python3 avtomat.py vse       zakazy/<имя>    klipy + ozvuchka + sobrat подряд

    python3 avtomat.py golos <аудио 10+ с>        один раз: клонировать голос рассказчика

В папке заказа нужны: foto.* (фото ребёнка) и zakaz.json
    {"imya": "Максим", "pol": "malchik", "vozrast": 3, "volosy": "...", "glaza": "...", "ochki": ""}

Ключ fal.ai берётся из FAL_KEY. В облачной сессии ключ подставляет прокси,
поэтому достаточно FAL_KEY=proxy-injected.
"""
import concurrent.futures as cf
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

import fal_client

import promty
import sobrat as sborka

KOREN = Path(__file__).resolve().parent
SHABLON = KOREN / "shablony" / "chasy-deda-moroza"
NASTROYKI = KOREN / "fal_nastroyki.json"   # id клонированного голоса и т. п.

M_PERSONAZH = "openai/gpt-image-2.6/flare/edit"
M_KLIP = "kling/v4/video-to-video/edit"
M_GOLOS_KLON = "fal-ai/minimax/voice-clone"
M_RECH = "fal-ai/minimax/speech-2.8-hd"

OBRAZEC_ODEZHDY = "kadry/06_start.png"  # кадр, где ребёнок в полный рост в нужной одежде

os.environ.setdefault("FAL_KEY", "proxy-injected")


def log(*a):
    print(*a, flush=True)


def nastroyki():
    return json.loads(NASTROYKI.read_text(encoding="utf-8")) if NASTROYKI.exists() else {}


def sohranit_nastroyki(d):
    NASTROYKI.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")


def skachat(url, kuda):
    kuda = Path(kuda)
    kuda.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=300) as r, open(kuda, "wb") as f:
        f.write(r.read())
    return kuda


def zagruzit(put):
    return fal_client.upload_file(str(put))


def zakaz(papka):
    papka = Path(papka)
    z = json.loads((papka / "zakaz.json").read_text(encoding="utf-8"))
    return papka, z


def nayti(papka, imya):
    for p in sorted(Path(papka).glob(imya + ".*")):
        return p
    return None


# ---------- шаги ----------
def shag_personazh(papka):
    papka, z = zakaz(papka)
    sh = promty.zagruzit_shablon(SHABLON)
    foto = nayti(papka, "foto")
    if not foto:
        raise SystemExit("Нет фото ребёнка (foto.jpg) в папке заказа")
    log("Загружаю фото и образец одежды…")
    urls = [zagruzit(foto), zagruzit(SHABLON / OBRAZEC_ODEZHDY)]
    prompt = (promty.personazh(sh, z).replace("на втором изображении", "как у ребёнка на втором изображении")
              + " Используй первое изображение только как образец лица ребёнка.")
    log("Рисую персонажа (GPT Image 2.6)…")
    r = fal_client.subscribe(M_PERSONAZH, arguments={
        "prompt": prompt, "image_urls": urls, "quality": "medium",
        "image_size": "portrait_4_3", "num_images": 1, "output_format": "png"})
    put = skachat(r["images"][0]["url"], papka / "personazh.png")
    log(f"Персонаж: {put}")
    return put


def prompt_klipa(z):
    pol = "boy" if z["pol"] == "malchik" else "girl"
    ochki = (f"wearing glasses ({z['ochki']})" if z.get("ochki")
             else "WITHOUT glasses (remove the glasses completely)")
    return (f"Replace the little girl in @Video1 with the {pol} from @Image1: use exactly the face, "
            f"facial features, eyes and hair of the {pol} from @Image1, {ochki}. "
            f"Keep the same clothes: white puffer jacket, light-blue knitted hat with a pompom, "
            f"light-blue scarf with snowflakes. Keep everything else exactly as in @Video1: the motion "
            f"and timing, Grandfather Frost, the fox cub, the clock and the position of its hands, "
            f"lighting, background, snow, text. 3D animated cartoon style.")


def shag_klipy(papka, model=M_KLIP):
    papka, z = zakaz(papka)
    sh = promty.zagruzit_shablon(SHABLON)
    personazh = nayti(papka, "personazh")
    if not personazh:
        raise SystemExit("Сначала персонаж: python3 avtomat.py personazh …")
    url_p = zagruzit(personazh)
    prompt = prompt_klipa(z)
    sceny = [s for s in sh["sceny"] if s["tip"] == "lichnaya"
             and not (papka / "klipy" / f"{s['id']}.mp4").exists()]
    if not sceny:
        log("Все клипы уже есть.")
        return

    def odin(s):
        url_v = zagruzit(SHABLON / s["ishodnik"])
        log(f"  → {s['id']} {s['nazvanie']}: отправлен в Kling")
        r = fal_client.subscribe(model, arguments={
            "prompt": prompt, "video_url": url_v, "image_urls": [url_p], "resolution": "720p"})
        put = skachat(r["video"]["url"], papka / "klipy" / f"{s['id']}.mp4")
        log(f"  ✓ {s['id']} готов")
        return put

    log(f"Kling: {len(sceny)} клипов параллельно, это 5–15 минут…")
    oshibki = []
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        bud = {ex.submit(odin, s): s for s in sceny}
        for f in cf.as_completed(bud):
            try:
                f.result()
            except Exception as e:  # noqa: BLE001
                oshibki.append(f"{bud[f]['id']}: {e}")
    if oshibki:
        raise SystemExit("Не получились клипы:\n  " + "\n  ".join(oshibki))


def shag_golos(audio):
    log("Клонирую голос рассказчика (один раз, $1,5)…")
    r = fal_client.subscribe(M_GOLOS_KLON, arguments={
        "audio_url": zagruzit(audio), "noise_reduction": True, "need_volume_normalization": True})
    d = nastroyki()
    d["voice_id"] = r["custom_voice_id"]
    sohranit_nastroyki(d)
    log(f"Голос сохранён: {d['voice_id']}. Его нужно использовать в течение 7 дней, иначе fal его удалит.")


def dlitelnost(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                 "-of", "csv=p=0", str(p)], capture_output=True, text=True).stdout)


def shag_ozvuchka(papka):
    papka, z = zakaz(papka)
    sh = promty.zagruzit_shablon(SHABLON)
    voice = nastroyki().get("voice_id")
    if not voice:
        raise SystemExit("Нет голоса. Один раз: python3 avtomat.py golos <аудио>")
    tekst = promty.tekst_ozvuchki(sh, z).replace("\n\n", " <#0.6#> ").replace("…", "… <#0.3#>")
    dlit_rolika = sum(s["dlit"] for s in sh["sceny"]) - 0.8
    speed = 0.95
    for _ in range(3):
        r = fal_client.subscribe(M_RECH, arguments={
            "prompt": tekst, "language_boost": "Russian", "output_format": "url",
            "voice_setting": {"voice_id": voice, "speed": speed}})
        put = skachat(r["audio"]["url"], papka / "ozvuchka.mp3")
        d = dlitelnost(put)
        log(f"Озвучка: {d:.1f} с при скорости {speed}")
        if d <= dlit_rolika:
            return put
        speed = round(min(1.3, speed * d / dlit_rolika + 0.02), 2)
    log("Озвучка чуть длиннее ролика — конец может обрезаться.")
    return put


def shag_sobrat(papka):
    return sborka.sobrat(SHABLON, Path(papka))


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    komanda, arg = sys.argv[1], sys.argv[2]
    if komanda == "personazh":
        shag_personazh(arg)
    elif komanda == "klipy":
        shag_klipy(arg)
    elif komanda == "golos":
        shag_golos(arg)
    elif komanda == "ozvuchka":
        shag_ozvuchka(arg)
    elif komanda == "sobrat":
        shag_sobrat(arg)
    elif komanda == "vse":
        shag_klipy(arg)
        shag_ozvuchka(arg)
        shag_sobrat(arg)
    else:
        raise SystemExit(__doc__)
