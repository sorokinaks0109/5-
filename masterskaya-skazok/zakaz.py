"""Заказ: анкета, этапы и ячейки для файлов.

Состояние заказа почти целиком определяется файлами в его папке:
этап считается пройденным, когда во всех его ячейках лежат файлы.
Поэтому заказ можно продолжить после перезапуска бота.
"""
import json
import re
import time
from pathlib import Path

import promty

ANKETA = [
    ("imya", "Как зовут ребёнка? (как будет звучать в озвучке, например «Максим»)"),
    ("pol", "Мальчик или девочка?"),
    ("vozrast", "Сколько лет?"),
    ("volosy", "Какие волосы? Например: «светлые волнистые до плеч» или «короткая стрижка, русые»"),
    ("glaza", "Какого цвета глаза?"),
    ("ochki", "Есть очки? Если да — опиши, например «розовые круглые очки»"),
]

TRANSLIT = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
                    ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m",
                     "n", "o", "p", "r", "s", "t", "u", "f", "h", "ts", "ch", "sh", "sch",
                     "", "y", "", "e", "yu", "ya"]))

KARTINKI = (".jpg", ".jpeg", ".png", ".webp")
VIDEO = (".mp4", ".mov", ".webm")
AUDIO = (".mp3", ".m4a", ".wav", ".ogg", ".oga", ".aac")


def slug(imya):
    t = "".join(TRANSLIT.get(c, c) for c in imya.lower())
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-") or "rebenok"
    return f"{t}-{time.strftime('%m%d-%H%M')}"


class Zakaz:
    def __init__(self, papka, shablon_dir):
        self.papka = Path(papka)
        self.shablon_dir = Path(shablon_dir)
        self.sh = promty.zagruzit_shablon(shablon_dir)
        self.fayl = self.papka / "zakaz.json"
        self.d = json.loads(self.fayl.read_text(encoding="utf-8")) if self.fayl.exists() else {}

    # ---------- создание и анкета ----------
    @classmethod
    def novyy(cls, koren, shablon_dir, imya):
        papka = Path(koren) / slug(imya)
        papka.mkdir(parents=True, exist_ok=True)
        z = cls(papka, shablon_dir)
        z.d = {"imya": imya.strip(), "shablon": Path(shablon_dir).name,
               "sozdan": time.strftime("%Y-%m-%d %H:%M")}
        z.sohranit()
        return z

    def sohranit(self):
        self.fayl.write_text(json.dumps(self.d, ensure_ascii=False, indent=2), encoding="utf-8")

    def sleduyushchiy_vopros(self):
        for key, vopros in ANKETA:
            if key not in self.d:
                return key, vopros
        return None, None

    def otvet(self, key, znachenie):
        z = znachenie.strip()
        if key == "pol":
            z = "devochka" if z.lower().startswith(("д", "dev")) else "malchik"
        if key == "vozrast":
            m = re.search(r"\d+", z)
            if not m:
                raise ValueError("Напиши возраст цифрой, например 5")
            z = int(m.group())
        if key == "ochki" and z.lower() in ("нет", "без очков", "no", "-"):
            z = ""
        self.d[key] = z
        self.sohranit()

    @property
    def anketa_gotova(self):
        return self.sleduyushchiy_vopros()[0] is None

    # ---------- этапы и ячейки ----------
    def lichnye(self):
        return [s for s in self.sh["sceny"] if s["tip"] == "lichnaya"]

    def etapy(self):
        """Список этапов. Каждый этап — список ячеек (имя файла без расширения + подпись)."""
        kadry, klipy = [], []
        for s in self.lichnye():
            kadry.append({"yacheyka": f"kadry/{s['id']}", "nazvanie": f"{s['id']}. {s['nazvanie']}",
                          "obrazec": s["kadr"], "scena": s["id"], "vid": "kartinka"})
            if s.get("posledniy_kadr"):
                kadry.append({"yacheyka": f"kadry/{s['id']}_konec",
                              "nazvanie": f"{s['id']}. {s['nazvanie']} — последний кадр",
                              "obrazec": s["posledniy_kadr"], "scena": s["id"], "vid": "kartinka"})
            klipy.append({"yacheyka": f"klipy/{s['id']}", "nazvanie": f"{s['id']}. {s['nazvanie']}",
                          "scena": s["id"], "vid": "video"})
        return [
            {"id": "foto", "nazvanie": "Фото ребёнка", "sloty": [
                {"yacheyka": "foto/1", "nazvanie": "Фото ребёнка", "vid": "kartinka"}]},
            {"id": "personazh", "nazvanie": "Персонаж", "sloty": [
                {"yacheyka": "personazh", "nazvanie": "Персонаж", "vid": "kartinka",
                 "obrazec": self.lichnye()[0]["kadr"]}]},
            {"id": "soglasovano", "nazvanie": "Согласование с родителем", "sloty": []},
            {"id": "kadry", "nazvanie": "Кадры сцен", "sloty": kadry},
            {"id": "klipy", "nazvanie": "Оживление", "sloty": klipy},
            {"id": "ozvuchka", "nazvanie": "Озвучка", "sloty": [
                {"yacheyka": "ozvuchka", "nazvanie": "Озвучка", "vid": "audio"}]},
            {"id": "sborka", "nazvanie": "Сборка", "sloty": []},
        ]

    def nayti_fayl(self, yacheyka):
        p = self.papka / yacheyka
        for f in sorted(p.parent.glob(p.name + ".*")) if p.parent.exists() else []:
            return f
        return None

    def zapolneno(self, slot):
        return self.nayti_fayl(slot["yacheyka"]) is not None

    def tekushchiy_etap(self):
        if not self.anketa_gotova:
            return {"id": "anketa", "nazvanie": "Анкета", "sloty": []}
        for e in self.etapy():
            if e["id"] == "soglasovano":
                if not self.d.get("soglasovano"):
                    return e
                continue
            if e["id"] == "sborka":
                return e
            if not all(self.zapolneno(s) for s in e["sloty"]):
                return e
        return {"id": "sborka", "nazvanie": "Сборка", "sloty": []}

    def pustye_sloty(self, etap=None):
        e = etap or self.tekushchiy_etap()
        return [s for s in e["sloty"] if not self.zapolneno(s)]

    def slot_po_yacheyke(self, yacheyka):
        for e in self.etapy():
            for s in e["sloty"]:
                if s["yacheyka"] == yacheyka:
                    return s
        return None

    def vybrat_slot(self, vid, podpis=""):
        """Куда положить присланный файл: по номеру сцены в подписи или в первую пустую ячейку."""
        e = self.tekushchiy_etap()
        podhodyashchie = [s for s in e["sloty"] if s["vid"] == vid]
        if not podhodyashchie:
            return None
        m = re.search(r"\b0?([1-9])\b(\s*(кон|послед|last))?", (podpis or "").lower())
        if m:
            nomer = f"0{m.group(1)}"
            konec = bool(m.group(2))
            for s in podhodyashchie:
                if s.get("scena") == nomer and s["yacheyka"].endswith("_konec") == konec:
                    return s
        pustye = [s for s in podhodyashchie if not self.zapolneno(s)]
        return pustye[0] if pustye else None

    def put_dlya(self, slot, rasshirenie):
        """Путь для нового файла ячейки; старый файл ячейки удаляется."""
        staryy = self.nayti_fayl(slot["yacheyka"])
        if staryy:
            staryy.unlink()
        p = self.papka / (slot["yacheyka"] + rasshirenie.lower())
        p.parent.mkdir(parents=True, exist_ok=True)
        return p

    def ochistit(self, yacheyka):
        f = self.nayti_fayl(yacheyka)
        if f:
            f.unlink()

    def est_novee(self, fayl):
        """Есть ли исходники заказа новее указанного файла (значит, ролик надо пересобрать)."""
        t = Path(fayl).stat().st_mtime
        for p in self.papka.rglob("*"):
            if p.is_file() and p.name != Path(fayl).name and p.suffix.lower() in VIDEO + AUDIO \
                    and p.stat().st_mtime > t:
                return True
        return False

    def progress(self):
        stroki = []
        for e in self.etapy():
            if e["id"] in ("soglasovano", "sborka"):
                gotovo = bool(self.d.get("soglasovano")) if e["id"] == "soglasovano" \
                    else (self.papka / "gotovyy_multfilm.mp4").exists()
                stroki.append(f"{'✅' if gotovo else '⬜'} {e['nazvanie']}")
                continue
            n = sum(self.zapolneno(s) for s in e["sloty"])
            znak = "✅" if n == len(e["sloty"]) else ("🟡" if n else "⬜")
            stroki.append(f"{znak} {e['nazvanie']}: {n}/{len(e['sloty'])}")
        return "\n".join(stroki)
