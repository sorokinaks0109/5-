#!/usr/bin/env python3
"""Карточка заказа: готовые промпты под конкретного ребёнка.

Папка заказа должна содержать zakaz.json, например:
    {"imya": "Ника", "pol": "devochka", "vozrast": 6,
     "volosy": "светлые волнистые до плеч", "glaza": "голубые",
     "ochki": "розовые круглые очки"}

pol: "devochka" или "malchik". ochki: "" если очков нет.

Запуск:
    python3 kartochka.py shablony/chasy-deda-moroza zakazy/test-nika
Результат: zakazy/test-nika/kartochka.md
"""
import json
import sys
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


def podstavit(text, f, imya=""):
    for k in ("Ego", "ego_m", "poyavilsya", "kosnulsya", "spas"):
        text = text.replace("{" + k + "}", f[k])
    return (text.replace("{imya}", imya).replace("{Geroy}", f["geroy"].capitalize())
                .replace("{geroya}", f["geroya"])
                .replace("{geroy}", f["geroy"])
                .replace("{a}", f["a"]))


def kartochka(shablon_dir, zakaz_dir):
    shablon_dir, zakaz_dir = Path(shablon_dir), Path(zakaz_dir)
    sh = json.loads((shablon_dir / "shablon.json").read_text(encoding="utf-8"))
    z = json.loads((zakaz_dir / "zakaz.json").read_text(encoding="utf-8"))
    f = FORMY[z["pol"]]

    vneshnost = (f"{f['geroy']} {z['vozrast']} лет, волосы: {z['volosy']}, "
                 f"глаза: {z['glaza']}")
    vneshnost += f", {z['ochki']}" if z.get("ochki") else ", без очков"

    L = [f"# Заказ: {z['imya']} — «{sh['nazvanie']}»", ""]
    L += ["## Шаг 1. Персонаж (генератор картинок)", "",
          "Загрузить: **фото ребёнка** + кадр `kadry/04_original.jpg` (образец стиля и одежды).", "",
          "```",
          f"Создай 3D-персонажа в стиле анимационного мультфильма по фото ребёнка: "
          f"{vneshnost}. Точно сохрани черты лица, форму лица, нос, улыбку, цвет и "
          f"длину волос, цвет глаз. Одежда строго как на втором изображении: "
          f"{sh['odezhda']}. Персонаж в полный рост, вид спереди, "
          f"рядом крупный портрет лица. Светлый нейтральный фон. Стиль: качественный "
          f"3D-анимационный мультфильм, мягкий объёмный свет, выразительные глаза.",
          "```", "",
          "⏸ Отправить персонажа родителю на согласование. Дальше только после «Да».", ""]

    L += ["## Шаг 2. Кадры сцен (генератор картинок)", "",
          "Для каждой сцены загрузить: **кадр сцены** + **утверждённого персонажа**. "
          "Промпт одинаковый для всех сцен:", "",
          "```",
          f"Замени ребёнка на первом изображении на персонажа со второго изображения "
          f"({vneshnost}). Всё остальное оставь без изменений: позу, жест, выражение "
          f"лица, композицию, свет, фон, Деда Мороза, лисёнка, часы и положение "
          f"стрелок, надписи. Одежда как на первом изображении. Формат 9:16. {STIL}",
          "```", ""]
    lichnye = [s for s in sh["sceny"] if s["tip"] == "lichnaya"]
    for s in lichnye:
        dop = f" (вариант: `{s['dop_kadr']}`)" if s.get("dop_kadr") else ""
        L.append(f"- **{s['id']}. {s['nazvanie']}** — кадр `{s['kadr']}`{dop}")
    L.append("")

    L += ["## Шаг 3. Оживление (Seedance, из картинки в видео, 9:16)", "",
          "Загрузить новый кадр сцены, вставить промпт. "
          "Готовый клип сохранить как `klipy/<номер>.mp4`.", ""]
    for s in lichnye:
        L.append(f"### {s['id']}. {s['nazvanie']} → `klipy/{s['id']}.mp4`")
        if s.get("posledniy_kadr"):
            L.append(f"Режим «первый и последний кадр»: последний кадр — "
                     f"`{s['posledniy_kadr']}` с заменённым ребёнком "
                     f"(так стрелки встанут точно на 12).")
        L += ["", "```", podstavit(s["dvizhenie"], f), "```",
              f"Нужно минимум {s['s'] + s['dlit']:.1f} с клипа.", ""]

    if sh.get("ozvuchka", {}).get("tekst"):
        L += ["## Шаг 4. Озвучка (Syntx → клонирование голоса, тот же голос)", "",
              "```", podstavit(sh["ozvuchka"]["tekst"], f, z["imya"]), "```", "",
              "Сохранить как `ozvuchka.mp3` в папку заказа. Музыку, если она отдельно, — "
              "как `muzyka.mp3`: программа подложит её тише голоса.", ""]

    L += ["## Шаг 5. Сборка", "",
          "Запустить:", "",
          "```",
          f"python3 sobrat.py {shablon_dir} {zakaz_dir}",
          "```", "",
          f"⏸ Посмотреть `gotovyy_multfilm.mp4` и отправить клиенту.", ""]

    out = zakaz_dir / "kartochka.md"
    out.write_text("\n".join(L), encoding="utf-8")
    print(f"Карточка: {out}")
    return out


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    kartochka(sys.argv[1], sys.argv[2])
