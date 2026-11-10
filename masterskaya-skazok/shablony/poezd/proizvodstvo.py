#!/usr/bin/env python3
"""Производство шаблона «Волшебный новогодний поезд»: дизайн → размеры → кадры → клипы.

    python3 proizvodstvo.py dizayn            паровозик и лисёнок-машинист (один раз)
    python3 proizvodstvo.py razmery           лист размеров: ребёнок, лисёнок, дракончик, паровозик
    python3 proizvodstvo.py kadry  [номера…]  кадры сцен (GPT Image 2.6)
    python3 proizvodstvo.py klipy  [номера…]  оживление (Kling 4.0, 720p, 5 с)

Готовые файлы пропускаются; чтобы переделать — удалите файл и запустите снова.
"""
import concurrent.futures as cf
import os
import sys
import time
import urllib.request
from pathlib import Path

import fal_client

os.environ.setdefault("FAL_KEY", "proxy-injected")
PAPKA = Path(__file__).resolve().parent
SH = PAPKA.parent
GEROI = PAPKA / "personazhi"
REB = SH.parent / "zakazy" / "maksim-fal" / "personazh.jpg"
REB_FOTO = SH.parent / "zakazy" / "maksim-fal" / "foto_tort.jpg"   # настоящее фото: только для сходства лица
LISENOK = SH / "chasy-deda-moroza" / "kadry" / "03_original_lisenok.jpg"
DRAKON = SH / "drakonchik" / "personazhi" / "drakonchik_list.png"
STIL = SH / "drakonchik" / "kadry" / "01.png"
POEZD = GEROI / "poezd_dizayn.png"
RAZMERY = GEROI / "razmery.png"

M_KADR = "openai/gpt-image-2.6/flare/edit"
M_KLIP = "kling/v4/image-to-video"

OBSHCHEE = ("Vertical 9:16 frame from a high-quality 3D animated feature film, exactly the same render style and world as "
            "the style reference: magical snowy winter forest at night, aurora in the sky, soft cinematic light. "
            "The fox cub looks exactly like the fox cub reference (orange fluffy fox cub, big eyes) and wears a small "
            "navy-blue train driver cap. The little steam train looks exactly like the train design reference: a small "
            "deep emerald-green-and-gold toy-like steam locomotive with a round boiler, tall chimney and a brass bell, pulling two little "
            "open wagons full of wrapped gifts. No text, no letters.")
FURAZHKA = ("IMPORTANT: on his head the boy wears a navy-blue train driver cap with a golden badge (the same cap the "
            "fox cub wears) INSTEAD of the knitted hat; no knitted hat, no pompom. ")
REB_OPIS = ("The boy must look exactly like the boy on the character reference: 3-year-old, very short light-brown hair, "
            "dark brown eyes, white puffer jacket with fur hood, light-blue knitted hat with white pompom, light-blue "
            "snowflake scarf, light-blue jeans, white winter boots.")
PROPORTSII = ("STRICT CONSISTENT PROPORTIONS exactly as on the size reference sheet: the boy is a small 3-year-old child "
              "(big head, short legs, head about 1/4 of his height); the fox cub sitting reaches the boy's waist; the "
              "locomotive cab is just big enough for the boy to stand inside, the cab roof is a little above his hat. "
              "Keep these relative sizes in every frame.")

# Правила целостности для оживления: ничего не меняется по сравнению с первым кадром
TSELOSTNOST = ("CONTINUITY RULES — keep everything exactly as in the start image: every character keeps the same face, "
               "clothes, colors and size from start to end; scarves stay wrapped around the neck and hang down in front, "
               "they do not fly or flutter behind; caps and hats stay on the heads and do not change shape or color; "
               "the star on top of the tree always has exactly five points; the locomotive stays emerald-green and gold "
               "with exactly two gift wagons; no new characters, objects or text appear; no extra fingers, paws or limbs; "
               "no morphing, no flicker. Calm, gentle, natural motion.")

# Состояние мира между сценами: паровоз «потух» в 02 и оживает только в 05
POTUH = ("TRAIN STATE (very important): the locomotive is STUCK deep in a huge snowdrift on the rails, snow up to "
         "its wheels and piled on the front, the chimney is plugged with snow, NO smoke and NO steam at all, the "
         "headlamp and all lamps are OFF and completely dark, the train is cold and still. ")

SCENY = [
    {"id": "01", "reb": False, "drakon": False,
     "kadr": "Wide shot: NO children anywhere, the fox cub is the only character and the only driver. The little steam train with the fox cub driver alone in the cab rides along snowy rails through the "
             "night forest, golden sparks fly from the chimney, wagons full of gifts.",
     "dvizh": "The little train chugs along the snowy rails through the forest, golden sparks puff from the chimney, the "
              "fox cub driver waves happily from the cab, gentle snowfall, the camera tracks alongside."},
    {"id": "02", "reb": False, "drakon": False, "sost": POTUH, "konec_kak_nachalo": True,
     "kadr": "The little train is stuck in a huge snowdrift on the rails, its chimney is covered with snow, the lamps on "
             "the locomotive are dark; the fox cub in the cab grabs its head with its paws in dismay.",
     "dvizh": "The train is already stuck and does not move. The snow on the chimney and on the locomotive stays in place "
              "the whole time, nothing falls off, no lamps light up, no smoke. Only the fox cub moves: it looks at the "
              "snowdrift, gasps, clutches its head with its paws in dismay and shakes its head. Gentle snowflakes fall "
              "from the sky. The camera slowly pushes in."},
    {"id": "03", "reb": False, "drakon": False, "sost": POTUH,
     "kadr": "Inside the cab of the stuck dark train the fox cub is UPSET and about to cry: NO smile, mouth turned down in a frown, teary eyes, worried eyebrows, ears flattened down; pulls a big "
             "brass lever with all its strength but it does not move; a falling star streaks across the night sky.",
     "dvizh": "The sad fox cub pulls the big lever with all its strength but it does not move; the fox sighs, ears droop, "
              "then looks up at the falling star with hope, still sad and worried, presses its paws together and makes a "
              "wish with a hopeful but anxious face. The train stays dark, no smoke, no light, stuck in snow."},
    {"id": "04", "reb": True, "drakon": False,
     "sost": POTUH,
     "kadr": "Next to the stuck dark train in the snow a swirl of golden starlight; the boy steps out of it smiling with "
             "wonder; the happy fox cub holds out a small navy-blue train driver cap to him.",
     "dvizh": "The falling star turns into a swirl of golden light and the boy steps out of it onto the snow, the fox cub "
              "jumps with joy and puts the train driver cap on the boy's head, the boy laughs. The train behind them stays dark, no smoke, no light."},
    {"id": "05", "reb": True, "furazhka": True, "drakon": False,
     "kadr": "Inside the cozy cab of the little train: the boy in the navy train driver cap pulls the big brass lever with both "
             "hands, the fox cub beside him cheers; through the window the snowy forest.",
     "dvizh": "The boy pulls the big brass lever with both hands, steam whistles, the lamps of the locomotive light up, "
              "golden sparks burst from the chimney, the fox cub cheers and claps its paws."},
    {"id": "06", "reb": True, "furazhka": True, "drakon": False,
     "kadr": "The little train bursts through the snowdrift, snow flies around like fireworks; the boy in the navy driver cap "
             "leans out of the cab window laughing, the fox cub beside him; dynamic three-quarter view.",
     "dvizh": "The train speeds up and bursts through the snowdrift, snow explodes around it like fireworks, the boy leans "
              "out of the cab laughing, the camera follows the train."},
    {"id": "07", "reb": True, "furazhka": True, "drakon": False,
     "kadr": "The little train crosses a small wooden bridge above a sleeping snowy village at night; the boy in the cab "
             "pulls the whistle cord; the windows of the little houses below are still dark.",
     "dvizh": "The train rolls across the bridge, the boy pulls the whistle cord, a cloud of golden steam rises, and one by "
              "one the windows and garlands of the houses in the village below light up with warm New Year lights."},
    {"id": "08", "reb": True, "furazhka": True, "drakon": True,
     "kadr": "The little train arrives at a station next to a giant glowing New Year tree; the boy in the navy driver cap stands "
             "next to the locomotive, the fox cub and the little red baby dragon (from the dragon reference) hug him "
             "happily; the gift wagons are open; fireworks in the sky.",
     "dvizh": "The train stops by the giant glowing tree, the fox cub and the little red dragon run to the boy and hug him, "
              "gifts sparkle in the wagons, colorful fireworks burst in the sky, everyone cheers."},
]


def log(*a):
    print(*a, flush=True)


def skachat(url, kuda):
    kuda.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(url, kuda)
    return kuda


def s_povtorom(model, args, imya):
    for popytka in range(3):
        try:
            return fal_client.subscribe(model, arguments=args)
        except Exception as e:  # noqa: BLE001
            if "Exhausted balance" in str(e) and popytka < 2:
                log(f"  … {imya}: жду минуту (баланс занят)")
                time.sleep(60)
                continue
            raise


def risovat(prompt, urls, kuda, razmer="portrait_16_9"):
    r = s_povtorom(M_KADR, {"prompt": prompt, "image_urls": urls, "quality": "medium", "image_size": razmer,
                            "num_images": 1, "output_format": "png"}, kuda.name)
    return skachat(r["images"][0]["url"], kuda)


def dizayn():
    if POEZD.exists():
        return log("Дизайн уже есть")
    up = fal_client.upload_file
    p = ("Character and prop design sheet in the same 3D animated cartoon style as the references: (1) a small magical "
         "deep emerald-green-and-gold toy-like steam locomotive with a round boiler, tall chimney with golden sparks, a brass bell, warm "
         "round headlamp and a cozy open cab, pulling two little open wagons full of wrapped gifts — three-quarter view; "
         "(2) the fox cub from image 1 wearing a small navy-blue train driver cap, sitting in the cab, waving. "
         "Plain soft light-blue background, no text.")
    risovat(p, [up(LISENOK), up(STIL)], POEZD, "landscape_16_9")
    log("Дизайн готов")


def razmery():
    if RAZMERY.exists():
        return log("Лист размеров уже есть")
    up = fal_client.upload_file
    p = ("Size reference lineup sheet in the same 3D animated cartoon style, plain light background, full body, same scale, "
         "side by side: (1) the boy from image 1, a small 3-year-old child with toddler proportions (big head, short legs); "
         "(2) the fox cub from image 2 in a train driver cap, sitting, its head at the boy's waist; (3) the little red baby "
         "dragon from image 3 standing, reaching the boy's shoulders; (4) the little steam locomotive from image 4, its cab "
         "door just a bit taller than the boy. A thin horizontal line at the boy's head height. No text.")
    risovat(p, [up(REB), up(LISENOK), up(DRAKON), up(POEZD)], RAZMERY, "landscape_16_9")
    log("Лист размеров готов")


def kadry(nomera):
    up = fal_client.upload_file
    u = {"stil": up(STIL), "lis": up(LISENOK), "poezd": up(POEZD), "razm": up(RAZMERY), "reb": up(REB), "drakon": up(DRAKON),
         "foto": up(REB_FOTO) if REB_FOTO.exists() else None}

    def odin(s):
        put = PAPKA / "kadry" / f"{s['id']}.png"
        if put.exists():
            return f"{s['id']}: уже есть"
        urls = [u["stil"], u["lis"], u["poezd"], u["razm"]]
        sp = "image 1 = style, image 2 = fox cub, image 3 = train design, image 4 = size reference sheet"
        if s["reb"]:
            urls.append(u["reb"]); sp += f", image {len(urls)} = boy character reference"
        if s["reb"] and u["foto"]:
            urls.append(u["foto"]); sp += (f", image {len(urls)} = real photo of the same boy, use it ONLY for his face: "
                                           f"keep his exact face shape, round cheeks, ears, nose, dark brown eyes and smile, "
                                           f"the face must be clearly recognizable and look the same as in the character reference")
        if s["drakon"]:
            urls.append(u["drakon"]); sp += f", image {len(urls)} = red baby dragon reference"
        p = (s.get("sost", "") + f"{s['kadr']} {OBSHCHEE} " + (f"{REB_OPIS} " if s["reb"] else "")
             + (FURAZHKA if s.get("furazhka") else "") + f"{PROPORTSII} References: {sp}.")
        risovat(p, urls, put)
        return f"{s['id']}: готов"

    sceny = [s for s in SCENY if not nomera or s["id"] in nomera]
    with cf.ThreadPoolExecutor(3) as ex:
        for f in cf.as_completed([ex.submit(odin, s) for s in sceny]):
            try:
                log(f.result())
            except Exception as e:  # noqa: BLE001
                log("ОШИБКА:", e)


def klipy(nomera):
    def odin(s):
        put = PAPKA / "klipy" / f"{s['id']}.mp4"
        if put.exists():
            return f"{s['id']}: уже есть"
        url_k = fal_client.upload_file(PAPKA / "kadry" / f"{s['id']}.png")
        p = s.get("sost", "") + s["dvizh"] + " Smooth, high-quality 3D animated cartoon motion. " + TSELOSTNOST
        args = {"prompt": p, "start_image_url": url_k, "duration": 5, "resolution": "720p"}
        if s.get("konec_kak_nachalo"):
            # последний кадр = первый: сцена не может «уйти» в другое состояние (снег, свет, предметы)
            args["end_image_url"] = url_k
        r = s_povtorom(M_KLIP, args, s["id"])
        skachat(r["video"]["url"], put)
        return f"{s['id']}: готов"

    sceny = [s for s in SCENY if not nomera or s["id"] in nomera]
    with cf.ThreadPoolExecutor(2) as ex:
        for f in cf.as_completed([ex.submit(odin, s) for s in sceny]):
            try:
                log(f.result())
            except Exception as e:  # noqa: BLE001
                log("ОШИБКА:", e)


if __name__ == "__main__":
    k = sys.argv[1] if len(sys.argv) > 1 else ""
    if k == "dizayn":
        dizayn()
    elif k == "razmery":
        razmery()
    elif k in ("kadry", "klipy"):
        {"kadry": kadry, "klipy": klipy}[k](set(sys.argv[2:]))
    else:
        raise SystemExit(__doc__)
