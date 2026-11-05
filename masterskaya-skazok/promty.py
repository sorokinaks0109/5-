"""Промпты под конкретного ребёнка. Общие для карточки и бота."""
import json
from pathlib import Path

FORMY = {
    "devochka": {"geroy": "девочка", "geroya": "девочку", "a": "а", "Ego": "Её",
                 "ego_m": "её", "poyavilsya": "появилась", "kosnulsya": "коснулась",
                 "spas": "спасла"},
    "malchik": {"geroy": "мальчик", "geroya": "мальчика", "a": "", "Ego": "Его",
                "ego_m": "его", "poyavilsya": "появился", "kosnulsya": "коснулся",
                "spas": "спас"},
}

STIL = ("Стиль: качественный 3D-анимационный мультфильм, мягкий объёмный свет, "
        "выразительные глаза, детализированная фактура меха и ткани, "
        "волшебная зимняя ночь с северным сиянием.")

NE_FOTO = ("Лицо ребёнка нарисовано в том же 3D-мультяшном стиле, что и вся картинка, "
           "это не фотография и не вклейка.")


def zagruzit_shablon(shablon_dir):
    return json.loads((Path(shablon_dir) / "shablon.json").read_text(encoding="utf-8"))


def podstavit(text, z):
    f = FORMY[z["pol"]]
    for k in ("Ego", "ego_m", "poyavilsya", "kosnulsya", "spas"):
        text = text.replace("{" + k + "}", f[k])
    return (text.replace("{imya}", z.get("imya", ""))
                .replace("{Geroy}", f["geroy"].capitalize())
                .replace("{geroya}", f["geroya"])
                .replace("{geroy}", f["geroy"])
                .replace("{a}", f["a"]))


def vneshnost(z):
    f = FORMY[z["pol"]]
    t = (f"{f['geroy']} {z['vozrast']} лет, волосы: {z['volosy']}, "
         f"глаза: {z['glaza']}")
    return t + (f", {z['ochki']}" if z.get("ochki") else ", без очков")


def personazh(sh, z):
    return (f"Создай 3D-персонажа в стиле анимационного мультфильма по фото ребёнка: "
            f"{vneshnost(z)}. Точно сохрани черты лица, форму лица, нос, улыбку, цвет и "
            f"длину волос, цвет глаз. Одежда строго как на втором изображении: "
            f"{sh['odezhda']}. Персонаж в полный рост, вид спереди, рядом крупный "
            f"портрет лица. Светлый нейтральный фон. Стиль: качественный "
            f"3D-анимационный мультфильм, мягкий объёмный свет, выразительные глаза.")


def zamena(sh, z):
    return (f"Замени ребёнка на первом изображении на персонажа со второго изображения "
            f"({vneshnost(z)}). Всё остальное оставь без изменений: позу, жест, "
            f"выражение лица, композицию, свет, фон, Деда Мороза, лисёнка, часы и "
            f"положение стрелок, надписи. Одежда как на первом изображении. "
            f"{NE_FOTO} Формат 9:16. {STIL}")


def dvizhenie(scena, z):
    return podstavit(scena["dvizhenie"], z)


def tekst_ozvuchki(sh, z):
    t = sh.get("ozvuchka", {}).get("tekst", "")
    return podstavit(t, z) if t else ""
