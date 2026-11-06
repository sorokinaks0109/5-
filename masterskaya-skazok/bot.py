#!/usr/bin/env python3
"""Бот-помощник мастерской: ведёт заказ по шагам и собирает ролик.

Настройки — в файле .env рядом с ботом (см. .env.example):
    BOT_TOKEN=...          токен от @BotFather
    RAZRESHENO=123,456     ID пользователей Telegram, которым можно работать с ботом
    SHABLON=shablony/chasy-deda-moroza
    ZAKAZY=zakazy

Запуск:  python3 bot.py
"""
import asyncio
import html
import json
import logging
import os
import time
from pathlib import Path

from telegram import InlineKeyboardButton as Knopka
from telegram import InlineKeyboardMarkup, Update
from telegram.constants import ParseMode
from telegram.ext import (Application, CallbackQueryHandler, CommandHandler,
                          ContextTypes, MessageHandler, filters)

import promty
import sobrat
from zakaz import AUDIO, KARTINKI, VIDEO, Zakaz

KOREN = Path(__file__).resolve().parent
LIMIT_SKACHIVANIYA = 20 * 1024 * 1024  # больше бот скачать не может

log = logging.getLogger("masterskaya")


def zagruzit_env():
    f = KOREN / ".env"
    if f.exists():
        for line in f.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


zagruzit_env()
SHABLON = KOREN / os.environ.get("SHABLON", "shablony/chasy-deda-moroza")
ZAKAZY = KOREN / os.environ.get("ZAKAZY", "zakazy")
RAZRESHENO = {int(x) for x in os.environ.get("RAZRESHENO", "").replace(" ", "").split(",") if x}
AKTIVNYE = ZAKAZY / "_aktivnye.json"


# ---------- служебное ----------
def aktivnye():
    try:
        return json.loads(AKTIVNYE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def sdelat_aktivnym(chat_id, papka):
    d = aktivnye()
    d[str(chat_id)] = Path(papka).name
    ZAKAZY.mkdir(parents=True, exist_ok=True)
    AKTIVNYE.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")


def tekushchiy(chat_id):
    imya = aktivnye().get(str(chat_id))
    if imya and (ZAKAZY / imya / "zakaz.json").exists():
        return Zakaz(ZAKAZY / imya, SHABLON)
    return None


def pre(text):
    return f"<pre>{html.escape(text)}</pre>"


def b(text):
    return f"<b>{html.escape(text)}</b>"


async def otvetit(update, context, text, knopki=None):
    await context.bot.send_message(
        update.effective_chat.id, text, parse_mode=ParseMode.HTML,
        reply_markup=InlineKeyboardMarkup(knopki) if knopki else None)


async def razreshen(update, context):
    uid = update.effective_user.id
    if uid in RAZRESHENO:
        return True
    await context.bot.send_message(
        update.effective_chat.id,
        f"Этот бот закрытый. Ваш ID: {uid}. Чтобы получить доступ, его нужно "
        f"добавить в настройку RAZRESHENO.")
    return False


# ---------- задания по этапам ----------
async def pokazat_zadanie(update, context, z: Zakaz):
    e = z.tekushchiy_etap()
    chat = update.effective_chat.id
    bot = context.bot
    imya = z.d.get("imya", "")

    if e["id"] == "anketa":
        key, vopros = z.sleduyushchiy_vopros()
        knopki = None
        if key == "pol":
            knopki = [[Knopka("👦 Мальчик", callback_data="ank:pol:malchik"),
                       Knopka("👧 Девочка", callback_data="ank:pol:devochka")]]
        elif key == "vozrast":
            knopki = [[Knopka(str(i), callback_data=f"ank:vozrast:{i}") for i in range(2, 7)],
                      [Knopka(str(i), callback_data=f"ank:vozrast:{i}") for i in range(7, 12)]]
        elif key == "glaza":
            knopki = [[Knopka(c, callback_data=f"ank:glaza:{c}") for c in ("голубые", "серые", "зелёные")],
                      [Knopka(c, callback_data=f"ank:glaza:{c}") for c in ("карие", "тёмно-карие")]]
        elif key == "ochki":
            knopki = [[Knopka("Без очков", callback_data="ank:ochki:нет")]]
        await otvetit(update, context, vopros, knopki)
        return

    if e["id"] == "foto":
        await otvetit(update, context,
                      f"📷 Пришли {b('одно фото')} {html.escape(imya)}: лицо крупно, анфас, "
                      f"хороший свет. Можно отправить как файл, чтобы не терялось качество.\n\n"
                      f"Фото без одежды не подойдут — генераторы их блокируют.")
        return

    if e["id"] == "personazh":
        slot = e["sloty"][0]
        foto = z.nayti_fayl("foto/1")
        await bot.send_document(chat, Path(foto), caption="1️⃣ Фото ребёнка")
        await bot.send_document(chat, Path(SHABLON / slot["obrazec"]),
                                caption="2️⃣ Образец одежды и стиля")
        await otvetit(update, context,
                      f"🎨 {b('Шаг: персонаж.')} Перешли в Syntx (генератор картинок) оба файла "
                      f"выше и этот промпт:\n{pre(promty.personazh(z.sh, z.d))}\n"
                      f"Готового персонажа пришли мне.")
        return

    if e["id"] == "soglasovano":
        await bot.send_document(chat, Path(z.nayti_fayl("personazh")),
                                caption="Персонаж — можно переслать родителю")
        await otvetit(update, context,
                      "👀 Покажи персонажа родителю. Когда он одобрит — жми кнопку.",
                      [[Knopka("✅ Родитель согласовал", callback_data="soglasovano")],
                       [Knopka("🔁 Переделать персонажа", callback_data="peredelat:personazh")]])
        return

    if e["id"] == "kadry":
        pustye = z.pustye_sloty(e)
        if len(pustye) == len(e["sloty"]):
            await bot.send_document(chat, Path(z.nayti_fayl("personazh")),
                                    caption="Персонаж — второй картинкой к каждому кадру")
        for s in pustye:
            await bot.send_document(chat, Path(SHABLON / s["obrazec"]),
                                    caption=f"Кадр {s['nazvanie']}")
        await otvetit(update, context,
                      f"🖼 {b('Шаг: кадры сцен.')} Для каждого кадра выше: загрузи в Syntx "
                      f"кадр + персонажа и этот промпт (он одинаковый для всех):\n"
                      f"{pre(promty.zamena(z.sh, z.d))}\n"
                      f"Готовые кадры присылай по порядку. Если присылаешь не по порядку — "
                      f"подпиши номер сцены, например «06» или «08 конец».\n\n"
                      f"Осталось: {len(pustye)} из {len(e['sloty'])}")
        return

    if e["id"] == "klipy" and z.pravka:
        pustye = z.pustye_sloty(e)
        if len(pustye) == len(e["sloty"]):
            await bot.send_document(chat, Path(z.nayti_fayl("personazh")),
                                    caption="Персонаж — картинкой-образцом к каждому клипу")
        for s in pustye:
            await bot.send_document(
                chat, SHABLON / s["obrazec"], parse_mode=ParseMode.HTML,
                caption=f"🎬 Клип {html.escape(s['nazvanie'])}\n{pre(promty.pravka(z.sh, z.d))}"[:1024])
        await otvetit(update, context,
                      f"✨ {b('Шаг: правка клипов.')} Syntx → Kling → Omni → Kling 4.0, 9:16. "
                      f"Для каждого клипа выше: клип как Ref1, персонаж как Ref2, промпт из подписи. "
                      f"Можно запускать все сразу. Готовые клипы присылай по порядку или с подписью "
                      f"номера сцены.\n\nОсталось: {len(pustye)} из {len(e['sloty'])}")
        return

    if e["id"] == "klipy":
        pustye = z.pustye_sloty(e)
        for s in pustye:
            sc = next(x for x in z.lichnye() if x["id"] == s["scena"])
            kadr = z.nayti_fayl(f"kadry/{sc['id']}")
            podpis = f"🎬 Сцена {s['nazvanie']}\n{pre(promty.dvizhenie(sc, z.d))}"
            podpis += f"\nНужно минимум {sc['s'] + sc['dlit']:.0f} с."
            await bot.send_document(chat, Path(kadr), caption=podpis[:1024],
                                    parse_mode=ParseMode.HTML)
            konec = z.nayti_fayl(f"kadry/{sc['id']}_konec")
            if konec:
                await bot.send_document(
                    chat, Path(konec),
                    caption=f"Последний кадр для сцены {sc['id']}: в Seedance режим "
                            f"«первый и последний кадр» — так стрелки встанут ровно на 12.")
        await otvetit(update, context,
                      f"✨ {b('Шаг: оживление.')} Каждый кадр выше — в Seedance вместе с его "
                      f"промптом. Можно запускать все сразу. Готовые клипы присылай по порядку "
                      f"или с подписью номера сцены.\n\nОсталось: {len(pustye)} из {len(e['sloty'])}")
        return

    if e["id"] == "ozvuchka":
        await otvetit(update, context,
                      f"🎙 {b('Шаг: озвучка.')} В Syntx → клонирование голоса, тот же голос. "
                      f"Текст:\n{pre(promty.tekst_ozvuchki(z.sh, z.d))}\nГотовый файл пришли мне.")
        return

    if e["id"] == "sborka":
        gotovyy = z.papka / "gotovyy_multfilm.mp4"
        if gotovyy.exists() and not z.est_novee(gotovyy):
            await bot.send_video(chat, gotovyy, supports_streaming=True,
                                 caption=f"Готовый мультфильм для {imya}")
            await otvetit(update, context, "Ролик уже собран.", knopki_posle_sborki())
            return
        await otvetit(update, context, "Всё на месте. Собираю ролик…")
        await sobrat_rolik(update, context, z)


async def sobrat_rolik(update, context, z: Zakaz):
    chat = update.effective_chat.id
    try:
        put = await asyncio.to_thread(sobrat.sobrat, SHABLON, z.papka)
    except SystemExit as e:  # sobrat сообщает о нехватке клипов через SystemExit
        await otvetit(update, context, html.escape(str(e)))
        return
    except Exception as e:  # noqa: BLE001
        log.exception("сборка")
        await otvetit(update, context, f"Не получилось собрать: {html.escape(str(e))}")
        return
    await context.bot.send_video(chat, Path(put), supports_streaming=True,
                                 caption=f"Готово: мультфильм для {z.d.get('imya')}")
    await otvetit(update, context,
                  "Проверь ролик. Если что-то не так — замени нужный клип и собери заново.",
                  knopki_posle_sborki())


def knopki_posle_sborki():
    return [[Knopka("🔁 Заменить клип", callback_data="menu:klipy"),
             Knopka("🎙 Заменить озвучку", callback_data="peredelat:ozvuchka")],
            [Knopka("🔄 Собрать заново", callback_data="sobrat"),
             Knopka("➕ Новый заказ", callback_data="novyy")]]


# ---------- команды ----------
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await razreshen(update, context):
        return
    await otvetit(update, context,
                  "Привет! Я веду заказ мультфильма по шагам.\n\n"
                  "/new — новый заказ\n/zakazy — список заказов\n"
                  "/gde — где мы сейчас и что дальше\n/sobrat — собрать ролик\n"
                  "/muzyka — загрузить общую музыку для сказки")


async def novyy(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await razreshen(update, context):
        return
    context.user_data["zhdu_imya"] = True
    await otvetit(update, context, "Новый заказ. " + "Как зовут ребёнка?")


async def gde(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await razreshen(update, context):
        return
    z = tekushchiy(update.effective_chat.id)
    if not z:
        await otvetit(update, context, "Активного заказа нет. /new — начать.")
        return
    await otvetit(update, context, f"Заказ {b(z.d.get('imya', ''))}\n{z.progress()}")
    await pokazat_zadanie(update, context, z)


async def spisok(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await razreshen(update, context):
        return
    papki = sorted([p for p in ZAKAZY.glob("*/zakaz.json")], key=lambda p: p.stat().st_mtime,
                   reverse=True)[:10]
    if not papki:
        await otvetit(update, context, "Заказов пока нет. /new — начать.")
        return
    knopki = []
    for p in papki:
        z = Zakaz(p.parent, SHABLON)
        znak = "✅" if (p.parent / "gotovyy_multfilm.mp4").exists() else "⏳"
        knopki.append([Knopka(f"{znak} {z.d.get('imya', p.parent.name)} · {z.d.get('sozdan', '')}",
                              callback_data=f"otkryt:{p.parent.name}")])
    await otvetit(update, context, "Последние заказы:", knopki)


async def sobrat_komanda(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await razreshen(update, context):
        return
    z = tekushchiy(update.effective_chat.id)
    if z:
        await otvetit(update, context, "Собираю…")
        await sobrat_rolik(update, context, z)


async def muzyka(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await razreshen(update, context):
        return
    context.user_data["zhdu_muzyku"] = True
    await otvetit(update, context, "Пришли файл музыки — он будет звучать под голосом во всех роликах этой сказки.")


# ---------- кнопки ----------
async def knopka(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    await q.answer()
    if not await razreshen(update, context):
        return
    data = q.data
    chat = update.effective_chat.id

    if data == "novyy":
        await novyy(update, context)
        return
    if data.startswith("otkryt:"):
        sdelat_aktivnym(chat, ZAKAZY / data.split(":", 1)[1])
        await gde(update, context)
        return

    z = tekushchiy(chat)
    if not z:
        await otvetit(update, context, "Активного заказа нет. /new — начать.")
        return

    if data.startswith("ank:"):
        _, key, val = data.split(":", 2)
        z.otvet(key, val)
    elif data == "soglasovano":
        z.d["soglasovano"] = True
        z.sohranit()
    elif data.startswith("peredelat:"):
        yach = data.split(":", 1)[1]
        z.ochistit(yach)
        if yach == "personazh":
            z.d.pop("soglasovano", None)
            z.sohranit()
    elif data.startswith("perenesti:"):
        # перенести последний присланный файл в другую ячейку
        _, otkuda, kuda = data.split(":", 2)
        f = z.nayti_fayl(otkuda)
        slot = z.slot_po_yacheyke(kuda)
        if f and slot:
            novyy_put = z.put_dlya(slot, f.suffix)
            f.rename(novyy_put)
            await otvetit(update, context, f"Перенёс в «{html.escape(slot['nazvanie'])}» ✅")
    elif data.startswith("kuda:"):
        otkuda = data.split(":", 1)[1]
        slot = z.slot_po_yacheyke(otkuda)
        etap = next((e for e in z.etapy() if slot in e["sloty"]), None)
        knopki = [[Knopka(s["nazvanie"][:40], callback_data=f"perenesti:{otkuda}:{s['yacheyka']}")]
                  for s in (etap["sloty"] if etap else []) if s["yacheyka"] != otkuda]
        await otvetit(update, context, "Куда перенести этот файл?", knopki)
        return
    elif data == "menu:klipy":
        knopki = [[Knopka(s["nazvanie"], callback_data=f"peredelat:{s['yacheyka']}")]
                  for e in z.etapy() if e["id"] == "klipy" for s in e["sloty"]]
        await otvetit(update, context, "Какой клип заменить?", knopki)
        return
    elif data == "sobrat":
        await otvetit(update, context, "Собираю…")
        await sobrat_rolik(update, context, z)
        return
    await pokazat_zadanie(update, context, z)


# ---------- текст и файлы ----------
async def tekst(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await razreshen(update, context):
        return
    chat = update.effective_chat.id
    t = update.message.text or ""
    if context.user_data.pop("zhdu_imya", False):
        z = Zakaz.novyy(ZAKAZY, SHABLON, t)
        sdelat_aktivnym(chat, z.papka)
        await pokazat_zadanie(update, context, z)
        return
    z = tekushchiy(chat)
    if z and not z.anketa_gotova:
        key, _ = z.sleduyushchiy_vopros()
        try:
            z.otvet(key, t)
        except ValueError as e:
            await otvetit(update, context, html.escape(str(e)))
            return
        await pokazat_zadanie(update, context, z)
        return
    await otvetit(update, context, "Не понял. /gde — что сейчас нужно сделать, /new — новый заказ.")


def opisanie_fayla(msg):
    """(объект файла, вид, расширение, размер) из сообщения."""
    if msg.photo:
        f = msg.photo[-1]
        return f, "kartinka", ".jpg", f.file_size
    if msg.video:
        return msg.video, "video", ".mp4", msg.video.file_size
    if msg.animation:
        return msg.animation, "video", ".mp4", msg.animation.file_size
    if msg.audio:
        ext = Path(msg.audio.file_name or "a.mp3").suffix or ".mp3"
        return msg.audio, "audio", ext, msg.audio.file_size
    if msg.voice:
        return msg.voice, "audio", ".ogg", msg.voice.file_size
    if msg.document:
        ext = Path(msg.document.file_name or "").suffix.lower()
        vid = ("kartinka" if ext in KARTINKI else "video" if ext in VIDEO
               else "audio" if ext in AUDIO else None)
        return msg.document, vid, ext, msg.document.file_size
    return None, None, None, None


async def fayl(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await razreshen(update, context):
        return
    msg = update.message
    chat = update.effective_chat.id
    obj, vid, ext, razmer = opisanie_fayla(msg)
    if not obj or not vid:
        await otvetit(update, context, "Такой файл я не понимаю. Нужны картинка, видео или аудио.")
        return
    if razmer and razmer > LIMIT_SKACHIVANIYA:
        await otvetit(update, context, "Файл больше 20 МБ — Telegram не даёт ботам скачивать такие. "
                                       "Пришли покороче или сожми.")
        return

    if context.user_data.get("zhdu_muzyku") and vid == "audio":
        context.user_data.pop("zhdu_muzyku")
        for old in SHABLON.glob("muzyka.*"):
            old.unlink()
        tf = await context.bot.get_file(obj.file_id)
        await tf.download_to_drive(SHABLON / f"muzyka{ext}")
        await otvetit(update, context, "Музыка сохранена для всех роликов этой сказки ✅")
        return

    z = tekushchiy(chat)
    if not z:
        await otvetit(update, context, "Сначала начни заказ: /new")
        return
    e = z.tekushchiy_etap()
    slot = z.vybrat_slot(vid, msg.caption or "")
    if (e["id"] == "personazh" and msg.photo
            and time.time() - z.d.get("foto_vremya", 0) < 30):
        slot = {"yacheyka": "foto/2", "nazvanie": "Ещё одно фото ребёнка", "vid": "kartinka"}
    if not slot:
        ozhidayu = {"foto": "фото ребёнка", "personazh": "картинку персонажа",
                    "kadry": "картинки кадров", "klipy": "видео-клипы",
                    "ozvuchka": "аудио с озвучкой"}.get(e["id"], "другое")
        await otvetit(update, context, f"Сейчас я жду {ozhidayu}. /gde — подробнее.")
        return

    tf = await context.bot.get_file(obj.file_id)
    put = z.put_dlya(slot, ext)
    await tf.download_to_drive(put)
    if slot["yacheyka"] == "foto/1":
        z.d["foto_vremya"] = time.time()
        z.sohranit()

    # кнопки на случай, если файл лёг не туда
    drugie = [s for s in e["sloty"] if s["vid"] == vid and s["yacheyka"] != slot["yacheyka"]]
    knopki = [[Knopka("📍 Это другая сцена", callback_data=f"kuda:{slot['yacheyka']}")]] if drugie else None
    await otvetit(update, context, f"Принял: {b(slot['nazvanie'])} ✅", knopki)

    novyy_etap = z.tekushchiy_etap()
    if novyy_etap["id"] != e["id"]:
        await pokazat_zadanie(update, context, z)
    else:
        ostalos = len(z.pustye_sloty(novyy_etap))
        if ostalos:
            await otvetit(update, context, f"Осталось на этом шаге: {ostalos}")


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    token = os.environ.get("BOT_TOKEN")
    if not token:
        raise SystemExit("Не задан BOT_TOKEN в файле .env")
    if not RAZRESHENO:
        log.warning("RAZRESHENO пуст — бот никого не пустит, но покажет ID при /start")
    app = Application.builder().token(token).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("new", novyy))
    app.add_handler(CommandHandler("gde", gde))
    app.add_handler(CommandHandler("zakazy", spisok))
    app.add_handler(CommandHandler("sobrat", sobrat_komanda))
    app.add_handler(CommandHandler("muzyka", muzyka))
    app.add_handler(CallbackQueryHandler(knopka))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, tekst))
    app.add_handler(MessageHandler(
        filters.PHOTO | filters.VIDEO | filters.ANIMATION | filters.AUDIO | filters.VOICE
        | filters.Document.ALL, fayl))
    app.run_polling()


if __name__ == "__main__":
    main()
