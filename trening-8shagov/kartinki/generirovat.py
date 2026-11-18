"""Генерирует картинки для тренинга «8 шагов» через fal.ai по spisok.json.

Запуск в облачной сессии с окружением «5- (fal.ai)»: ключ подставляет прокси.
    pip install fal_client pillow
    python3 generirovat.py            # все, кроме уже готовых
    python3 generirovat.py ryba a3    # только указанные
Готовые картинки: <имя>.jpg, ширина 1280, JPEG ~80 (лёгкие, чтобы вшить в один HTML).
"""
import io, json, os, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
os.environ.setdefault("FAL_KEY", "proxy-injected")
import fal_client
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, "spisok.json"), encoding="utf-8"))
MODELS = ["openai/gpt-image-2.6/flare", "fal-ai/flux-pro/v1.1", "fal-ai/flux/dev"]

def one(name):
    out = os.path.join(HERE, name + ".jpg")
    if os.path.exists(out) and len(sys.argv) == 1:
        return name, "уже есть"
    prompt = CFG["kartinki"][name] + " " + CFG["stil"]
    last = None
    for m in MODELS:
        try:
            args = {"prompt": prompt, "num_images": 1}
            if m.startswith("openai/"):
                args.update(image_size="landscape_16_9", quality="medium", output_format="png")
            else:
                args.update(image_size="landscape_16_9")
            r = fal_client.subscribe(m, arguments=args)
            url = r["images"][0]["url"]
            raw = urllib.request.urlopen(url).read()
            im = Image.open(io.BytesIO(raw)).convert("RGB")
            if im.width > 1280:
                im = im.resize((1280, round(im.height * 1280 / im.width)), Image.LANCZOS)
            im.save(out, "JPEG", quality=80, optimize=True, progressive=True)
            return name, f"ok ({m}, {os.path.getsize(out)//1024} КБ)"
        except Exception as e:
            last = f"{m}: {e}"
    return name, "ОШИБКА " + str(last)

names = sys.argv[1:] or list(CFG["kartinki"])
with ThreadPoolExecutor(4) as ex:
    for n, s in ex.map(one, names):
        print(n, s, flush=True)
