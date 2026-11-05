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

import promty


def kartochka(shablon_dir, zakaz_dir):
    shablon_dir, zakaz_dir = Path(shablon_dir), Path(zakaz_dir)
    sh = promty.zagruzit_shablon(shablon_dir)
    z = json.loads((zakaz_dir / "zakaz.json").read_text(encoding="utf-8"))

    L = [f"# Заказ: {z['imya']} — «{sh['nazvanie']}»", ""]
    L += ["## Шаг 1. Персонаж (генератор картинок)", "",
          "Загрузить: **фото ребёнка** + кадр `kadry/04_original.jpg` (образец стиля и одежды).", "",
          "```",
          promty.personazh(sh, z),
          "```", "",
          "⏸ Отправить персонажа родителю на согласование. Дальше только после «Да».", ""]

    L += ["## Шаг 2. Кадры сцен (генератор картинок)", "",
          "Для каждой сцены загрузить: **кадр сцены** + **утверждённого персонажа**. "
          "Промпт одинаковый для всех сцен:", "",
          "```",
          promty.zamena(sh, z),
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
        L += ["", "```", promty.dvizhenie(s, z), "```",
              f"Нужно минимум {s['s'] + s['dlit']:.1f} с клипа.", ""]

    if sh.get("ozvuchka", {}).get("tekst"):
        L += ["## Шаг 4. Озвучка (Syntx → клонирование голоса, тот же голос)", "",
              "```", promty.tekst_ozvuchki(sh, z), "```", "",
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
