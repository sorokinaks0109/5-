#!/usr/bin/env python3
"""Производство шаблона «Дракончик и новогодний огонёк»: кадры → клипы.

    python3 proizvodstvo.py kadry   [номера…]   нарисовать кадры (GPT Image 2.6), уже готовые пропускаются
    python3 proizvodstvo.py klipy   [номера…]   оживить кадры (Kling 4.0, 720p, 5 с)

Чтобы переделать сцену, удалите её kadry/NN.png или klipy/NN.mp4 и запустите снова.
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
GEROI = PAPKA / "personazhi"
REB = GEROI / "yaseniya_v1.png"
DRAKON = GEROI / "drakonchik_list.png"
STIL = PAPKA.parent / "chasy-deda-moroza" / "kadry" / "01_original_ded_moroz.png"

M_KADR = "openai/gpt-image-2.6/flare/edit"
M_KLIP = "kling/v4/image-to-video"

OBSHCHEE = ("Vertical 9:16 frame from a high-quality 3D animated feature film, exactly the same render style and world "
            "as the style reference image: magical snowy winter forest at night, aurora in the sky, soft cinematic light. "
            "The baby dragon must look exactly like the red dragon on the dragon reference sheet: red scaly body, "
            "golden-cream belly, small cream horns, red-orange wings, big brown eyes, small golden flame on the tail tip, "
            "cute, chubby and a bit clumsy, about the size of a 5-year-old child. No text, no letters.")
REB_OPIS = ("The girl must look exactly like the girl on the character reference: wavy ginger-blond hair, grey-green eyes, "
            "white puffer jacket with fur hood, light-blue knitted hat with white pompom, light-blue snowflake scarf, "
            "light-blue jeans, white winter boots.")

SCENY = [
    {"id": "01", "reb": False,
     "kadr": "Wide shot: a giant dark unlit New Year fir tree in a snowy forest clearing, an unlit golden star on its very top. "
             "The little red baby dragon stands in the snow at the foot of the tree, looking up at the star, puffing up its chest, "
             "taking a big determined breath.",
     "dvizh": "The little dragon takes a deep breath, puffs up its cheeks and chest, wings flutter, looks up at the star on top of "
              "the dark tree. Gentle snowfall, slow camera push-in."},
    {"id": "02", "reb": False,
     "kadr": "The giant fir tree is completely DARK: no lights, no garlands, no ornaments, no presents, only snow on its branches. The little red baby dragon in the snow under the tree, face scrunched up, just about to sneeze, eyes squeezed shut, "
             "nose wrinkled; high above, the golden star on the tree top is wobbling in a gust of snowy wind.",
     "dvizh": "The dragon sneezes comically with a big puff of sparkly snow, the small flame on its tail goes out with a wisp of smoke. "
              "A gust of snowy wind blows the golden star off the top of the tree and it flies away into the dark forest leaving a "
              "sparkly trail. The dragon looks up, shocked."},
    {"id": "03", "reb": False,
     "kadr": "The sad little red baby dragon sits in the snow under the dark tree whose top is now empty, its tail flame is out, "
             "head down, a tiny tear. Far away between the fir trees a soft magical golden-blue glow begins to shine.",
     "dvizh": "The sad dragon sighs and lowers its head, then notices the magical glow between the trees, lifts its head with hope "
              "and its eyes light up. The glow grows brighter. Gentle snowfall."},
    {"id": "04", "reb": True,
     "kadr": "A glowing round magical portal of swirling golden and blue light in the snowy forest; the girl steps out of it smiling "
             "with wonder; the little red dragon runs toward her happily with open little arms.",
     "dvizh": "The girl steps out of the swirling magic portal onto the snow and smiles, the little dragon runs to her joyfully, "
              "jumping and flapping its tiny wings, sparkles fly around. The portal fades behind her."},
    {"id": "05", "reb": True,
     "kadr": "The girl and the little red dragon run side by side through the snowy forest at night, following a trail of floating "
             "golden sparkles in the air; a faint golden glow between the trees ahead. Dynamic, joyful, three-quarter view.",
     "dvizh": "The girl and the little dragon run together through the snowy forest following the floating golden sparkles, "
              "the camera tracks alongside them, snow puffs under their feet, the dragon waddles clumsily and flaps its wings."},
    {"id": "06", "reb": True,
     "kadr": "Between fir trees the girl kneels in a snowdrift and carefully pulls out a frosty golden star covered in ice crystals "
             "with both hands; the little red dragon beside her tries to breathe fire but only a tiny spark comes out, puzzled face.",
     "dvizh": "The girl carefully lifts the frozen golden star out of the snowdrift and brushes off the snow. The dragon puffs "
              "and tries to breathe fire, but only a tiny spark pops out; it looks puzzled and the girl smiles at it."},
    {"id": "07", "reb": True,
     "kadr": "Close shot: the girl holds the golden star close in her palms, warming it; the little red dragon breathes a gentle "
             "stream of golden flame onto it; the star begins to glow warmly, lighting up their happy faces.",
     "dvizh": "The girl warms the star in her palms, the dragon breathes a gentle golden flame on it, the ice melts and the star "
              "bursts into bright warm golden light; the flame on the dragon's tail lights up again. Both are amazed and happy."},
    {"id": "08", "reb": True,
     "kadr": "The girl rides on the back of the little red dragon flying up beside the top of the giant New Year tree and places "
             "the shining golden star on the top herself; the tree starts to light up with colorful garlands; fireworks in the sky.",
     "dvizh": "The dragon flies up with the girl on its back, she places the shining star on the very top of the tree, the whole "
              "tree lights up with colorful garlands from top to bottom, fireworks burst in the night sky, both cheer happily."},
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
                log(f"  … {imya}: fal занял баланс под другие задания, жду минуту")
                time.sleep(60)
                continue
            raise


def kadry(nomera):
    up = fal_client.upload_file
    url_reb, url_drakon, url_stil = up(REB), up(DRAKON), up(STIL)

    def odin(s):
        put = PAPKA / "kadry" / f"{s['id']}.png"
        if put.exists():
            return f"{s['id']}: уже есть"
        if s["reb"]:
            urls = [url_stil, url_drakon, url_reb]
            p = (f"{s['kadr']} {OBSHCHEE} {REB_OPIS} References: image 1 = style and world, image 2 = dragon reference "
                 f"sheet, image 3 = girl character reference.")
        else:
            urls = [url_stil, url_drakon]
            p = f"{s['kadr']} {OBSHCHEE} References: image 1 = style and world, image 2 = dragon reference sheet."
        r = s_povtorom(M_KADR, {"prompt": p, "image_urls": urls, "quality": "medium",
                                "image_size": "portrait_16_9", "num_images": 1, "output_format": "png"}, s["id"])
        skachat(r["images"][0]["url"], put)
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
        p = s["dvizh"] + " Smooth, high-quality 3D animated cartoon motion, consistent characters."
        r = s_povtorom(M_KLIP, {"prompt": p, "start_image_url": url_k, "duration": 5, "resolution": "720p"}, s["id"])
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
    if len(sys.argv) < 2 or sys.argv[1] not in ("kadry", "klipy"):
        raise SystemExit(__doc__)
    {"kadry": kadry, "klipy": klipy}[sys.argv[1]](set(sys.argv[2:]))
