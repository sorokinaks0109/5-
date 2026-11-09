-- ============================================================
--  SKATE RUSH — все настройки игры в одном месте.
--  Меняй цифры здесь, и игра поменяется сама: цены, зоны,
--  доски, трюки, награды. Код трогать не нужно.
-- ============================================================

local Config = {}

Config.GameName = "Skate Rush"
Config.Version = "v6" -- видно в углу экрана: так легко проверить, что открыта новая версия

-- ------------------------------------------------------------
--  ДОНАТ (робуксы)
--  ID создаются на сайте create.roblox.com (см. README).
--  Пока ID = 0, в Roblox Studio покупка срабатывает бесплатно,
--  чтобы можно было всё проверить. В опубликованной игре
--  товар с ID = 0 просто не продаётся.
--  price — только подпись на кнопке. Настоящую цену ставишь
--  на сайте, и она должна совпадать с этой.
-- ------------------------------------------------------------
Config.GamePasses = {
	Coins2x = { id = 2076184679, price = 199, icon = "💰", name = "x2 Монеты навсегда", desc = "Все монеты удваиваются. Навсегда." },
	Coins3x = { id = 2074084703, price = 449, icon = "🤑", name = "x3 Монеты навсегда", desc = "Все монеты утраиваются. Вместе с x2 не складывается." },
	GoldBoard = { id = 2074486703, price = 299, icon = "👑", name = "Золотая доска", desc = "Быстрая доска с золотым следом и +25% к монетам." },
}
Config.GamePassOrder = { "Coins2x", "Coins3x", "GoldBoard" }

Config.Products = {
	SaveCombo = { id = 0, price = 5, icon = "🛟", name = "Спасти комбо", desc = "Упал? Получи монеты за потерянное комбо." },
	SkipZone = { id = 0, price = 25, icon = "🚪", name = "Открыть следующую зону", desc = "Сразу открывает следующую зону без уровня и монет." },
	Boost2x = { id = 0, price = 15, icon = "⚡", name = "Буст x2 на 15 минут", desc = "Двойные монеты на 15 минут. Складывается с геймпассами.", minutes = 15 },
	CoinsSmall = { id = 0, price = 19, icon = "👜", name = "Мешок монет", desc = "Монеты. Чем дальше зона, тем больше." },
	CoinsBig = { id = 0, price = 79, icon = "🧰", name = "Сундук монет", desc = "Много монет. Чем дальше зона, тем больше." },
	LevelUp = { id = 0, price = 19, icon = "⭐", name = "+1 уровень", desc = "Сразу поднимает уровень на 1." },
	StarterPack = { id = 0, price = 5, icon = "🎁", name = "Стартовый набор", desc = "Монеты, буст x2 на 15 минут и радужный след. Только для новичков!" },
}
Config.ProductOrder = { "Boost2x", "LevelUp", "SkipZone", "CoinsSmall", "CoinsBig" }

-- Стартовый набор показывается новичкам первые столько минут (по-честному: потом пропадает)
Config.StarterOfferMinutes = 20
Config.StarterCoins = 5000

-- Сколько монет дают мешок и сундук (умножается на множитель лучшей открытой зоны)
Config.CoinPackBase = { CoinsSmall = 1500, CoinsBig = 9000 }

-- ------------------------------------------------------------
--  ТРЮКИ
--  points   — очки за трюк
--  duration — сколько секунд длится трюк в воздухе.
--             Не успел докрутить до приземления — падение!
--  multiplier — растит ли трюк множитель комбо
-- ------------------------------------------------------------
Config.Tricks = {
	Kickflip = { display = "Кикфлип", points = 25, duration = 0.42, multiplier = true },
	Spin = { display = "Спин 360", points = 40, duration = 0.6, multiplier = true },
	Grab = { display = "Грэб", points = 30, duration = 0.5, multiplier = true },
	Backflip = { display = "Бэкфлип", points = 90, duration = 0.85, multiplier = true },
	Rail = { display = "Рейл", points = 20, duration = 0.2, multiplier = true },
	Grind = { display = "Грайнд", points = 6, duration = 0.2, multiplier = false },
	Air = { display = "Полёт", points = 10, duration = 0.3, multiplier = false },
}

-- Кнопки трюков: клавиша на компьютере и подпись на телефоне
Config.TrickButtons = {
	{ trick = "Kickflip", key = Enum.KeyCode.E, label = "E", mobile = "ФЛИП", color = Color3.fromRGB(255, 196, 0) },
	{ trick = "Spin", key = Enum.KeyCode.Q, label = "Q", mobile = "СПИН", color = Color3.fromRGB(0, 200, 255) },
	{ trick = "Grab", key = Enum.KeyCode.R, label = "R", mobile = "ГРЭБ", color = Color3.fromRGB(120, 230, 90) },
	{ trick = "Backflip", key = Enum.KeyCode.F, label = "F", mobile = "БЭК", color = Color3.fromRGB(255, 70, 140) },
}

Config.Combo = {
	BankDelay = 1.3, -- сколько секунд надо проехать по земле, чтобы комбо засчиталось
	MultStep = 0.5, -- каждый новый трюк в комбо добавляет +0.5 к множителю
	MaxMult = 12,
	RepeatPenalty = 0.5, -- повтор того же трюка в комбо даёт вдвое меньше очков
	MaxEntries = 120,
	SaveOfferMin = 40, -- кнопку «спасти комбо» показываем, если комбо дороже стольких монет
}

-- ------------------------------------------------------------
--  ЗОНЫ (этапы). Идут друг за другом.
--  level — нужный уровень, cost — цена в монетах,
--  mult — во сколько раз больше монет за трюки в этой зоне.
-- ------------------------------------------------------------
Config.ZoneLength = 420
Config.ZoneWidth = 170

Config.Zones = {
	{
		name = "Сакура-парк",
		theme = "sakura",
		level = 1,
		cost = 0,
		mult = 1,
		floor = Color3.fromRGB(196, 214, 120),
		floor2 = Color3.fromRGB(255, 225, 238),
		cliff = Color3.fromRGB(120, 200, 110),
		cliff2 = Color3.fromRGB(255, 170, 200),
		accent = Color3.fromRGB(255, 105, 180),
		light = { clock = 14.5, brightness = 1.8, fog = Color3.fromRGB(255, 225, 240), fogEnd = 1400, ambient = Color3.fromRGB(150, 130, 150), haze = 0.3, tint = Color3.fromRGB(255, 245, 250) },
		gravity = 196.2,
	},
	{
		name = "Конфетная страна",
		theme = "candy",
		level = 4,
		cost = 600,
		mult = 2,
		floor = Color3.fromRGB(230, 130, 180),
		floor2 = Color3.fromRGB(255, 225, 120),
		cliff = Color3.fromRGB(190, 120, 255),
		cliff2 = Color3.fromRGB(255, 200, 230),
		accent = Color3.fromRGB(170, 80, 255),
		light = { clock = 14.5, brightness = 1.8, fog = Color3.fromRGB(255, 210, 240), fogEnd = 1300, ambient = Color3.fromRGB(160, 120, 170), haze = 0.4, tint = Color3.fromRGB(255, 240, 255) },
		gravity = 196.2,
	},
	{
		name = "Солнечный пляж",
		theme = "beach",
		level = 9,
		cost = 5000,
		mult = 3.5,
		floor = Color3.fromRGB(235, 200, 135),
		floor2 = Color3.fromRGB(255, 240, 200),
		cliff = Color3.fromRGB(240, 200, 130),
		cliff2 = Color3.fromRGB(110, 200, 120),
		accent = Color3.fromRGB(0, 200, 230),
		light = { clock = 15.5, brightness = 2, fog = Color3.fromRGB(200, 235, 255), fogEnd = 1500, ambient = Color3.fromRGB(150, 140, 120), haze = 0.3, tint = Color3.fromRGB(255, 250, 235) },
		gravity = 196.2,
	},
	{
		name = "Неоновый город",
		theme = "city",
		level = 15,
		cost = 30000,
		mult = 6,
		floor = Color3.fromRGB(40, 35, 70),
		floor2 = Color3.fromRGB(60, 50, 100),
		cliff = Color3.fromRGB(30, 25, 55),
		cliff2 = Color3.fromRGB(50, 40, 90),
		accent = Color3.fromRGB(255, 0, 200),
		light = { clock = 20.8, brightness = 1.5, fog = Color3.fromRGB(70, 30, 110), fogEnd = 900, ambient = Color3.fromRGB(140, 100, 190), haze = 1, tint = Color3.fromRGB(235, 220, 255) },
		gravity = 196.2,
	},
	{
		name = "Ледяной каньон",
		theme = "ice",
		level = 23,
		cost = 200000,
		mult = 10,
		floor = Color3.fromRGB(165, 205, 235),
		floor2 = Color3.fromRGB(240, 250, 255),
		cliff = Color3.fromRGB(170, 215, 245),
		cliff2 = Color3.fromRGB(255, 255, 255),
		accent = Color3.fromRGB(60, 190, 255),
		light = { clock = 10, brightness = 2, fog = Color3.fromRGB(225, 245, 255), fogEnd = 900, ambient = Color3.fromRGB(150, 170, 200), haze = 0.8, tint = Color3.fromRGB(235, 245, 255) },
		gravity = 196.2,
	},
	{
		name = "Вулкан",
		theme = "volcano",
		level = 32,
		cost = 1500000,
		mult = 16,
		floor = Color3.fromRGB(70, 50, 55),
		floor2 = Color3.fromRGB(95, 65, 65),
		cliff = Color3.fromRGB(60, 40, 40),
		cliff2 = Color3.fromRGB(100, 55, 45),
		accent = Color3.fromRGB(255, 90, 0),
		light = { clock = 18.2, brightness = 1.8, fog = Color3.fromRGB(150, 50, 20), fogEnd = 700, ambient = Color3.fromRGB(170, 90, 70), haze = 1.5, tint = Color3.fromRGB(255, 225, 205) },
		gravity = 196.2,
	},
	{
		name = "Космос",
		theme = "space",
		level = 45,
		cost = 12000000,
		mult = 28,
		floor = Color3.fromRGB(35, 25, 70),
		floor2 = Color3.fromRGB(55, 40, 110),
		cliff = Color3.fromRGB(25, 20, 50),
		cliff2 = Color3.fromRGB(80, 50, 150),
		accent = Color3.fromRGB(150, 100, 255),
		light = { clock = 0, brightness = 1.2, fog = Color3.fromRGB(20, 10, 50), fogEnd = 1200, ambient = Color3.fromRGB(130, 110, 200), haze = 0.5, tint = Color3.fromRGB(230, 220, 255) },
		gravity = 70, -- низкая гравитация: прыжки выше, полёт дольше
	},
}

-- ------------------------------------------------------------
--  ДОСКИ
--  speed — множитель скорости, jump — добавка к прыжку
-- ------------------------------------------------------------
-- ability — особая способность доски:
--   doubleJump — второй прыжок в воздухе (ещё раз пробел)
--   glide      — держи пробел в воздухе, чтобы парить
--   magnet     — звёзды сами летят к тебе (радиус magnet)
--   boostMaster — ускорители действуют вдвое дольше
-- effect — красивый эффект: fire, sparkle, hearts, snow, stars
Config.Boards = {
	{ id = "basic", name = "Классика", price = 0, speed = 1.0, jump = 0, deck = Color3.fromRGB(225, 140, 80), stripe = Color3.fromRGB(60, 60, 70), wheel = Color3.fromRGB(250, 245, 230), trail = Color3.fromRGB(255, 255, 255), desc = "Обычная доска для старта" },
	{ id = "sakura", name = "Сакура", price = 1500, speed = 1.04, jump = 16, deck = Color3.fromRGB(255, 170, 205), stripe = Color3.fromRGB(255, 255, 255), wheel = Color3.fromRGB(255, 220, 235), trail = Color3.fromRGB(255, 170, 210), effect = "hearts", desc = "🦘 Высокий прыжок + сердечки" },
	{ id = "lemon", name = "Лимонад", price = 6000, speed = 1.3, jump = 2, deck = Color3.fromRGB(255, 225, 70), stripe = Color3.fromRGB(80, 210, 120), wheel = Color3.fromRGB(120, 230, 150), trail = Color3.fromRGB(255, 240, 120), desc = "🚀 Очень быстрая" },
	{ id = "mint", name = "Мята", price = 25000, speed = 1.18, jump = 8, ability = "magnet", magnet = 26, deck = Color3.fromRGB(120, 235, 200), stripe = Color3.fromRGB(255, 255, 255), wheel = Color3.fromRGB(200, 255, 240), trail = Color3.fromRGB(110, 255, 210), desc = "🧲 Магнит для звёзд" },
	{ id = "neon", name = "Неон", price = 90000, speed = 1.25, jump = 12, ability = "doubleJump", deck = Color3.fromRGB(25, 20, 45), stripe = Color3.fromRGB(0, 255, 210), wheel = Color3.fromRGB(0, 255, 210), trail = Color3.fromRGB(0, 255, 210), neon = true, effect = "sparkle", desc = "⏫ Двойной прыжок" },
	{ id = "fire", name = "Огонь", price = 350000, speed = 1.38, jump = 12, ability = "boostMaster", deck = Color3.fromRGB(150, 30, 10), stripe = Color3.fromRGB(255, 160, 0), wheel = Color3.fromRGB(255, 120, 0), trail = Color3.fromRGB(255, 90, 0), neon = true, effect = "fire", desc = "🔥 Огонь + ускорители вдвое дольше" },
	{ id = "ice", name = "Лёд", price = 1500000, speed = 1.4, jump = 18, ability = "glide", deck = Color3.fromRGB(170, 225, 255), stripe = Color3.fromRGB(255, 255, 255), wheel = Color3.fromRGB(220, 245, 255), trail = Color3.fromRGB(160, 230, 255), neon = true, effect = "snow", desc = "🪂 Парение (держи пробел) + снежинки" },
	{ id = "galaxy", name = "Галактика", price = 8000000, speed = 1.55, jump = 24, ability = "doubleJump", magnet = 30, deck = Color3.fromRGB(55, 10, 110), stripe = Color3.fromRGB(255, 80, 230), wheel = Color3.fromRGB(180, 120, 255), trail = Color3.fromRGB(180, 100, 255), neon = true, effect = "stars", desc = "🌌 Двойной прыжок + магнит + звёзды" },
	{ id = "gold", name = "Золотая", pass = "GoldBoard", speed = 1.45, jump = 20, ability = "glide", coinBonus = 0.25, deck = Color3.fromRGB(255, 200, 40), stripe = Color3.fromRGB(255, 255, 210), wheel = Color3.fromRGB(255, 240, 180), trail = Color3.fromRGB(255, 215, 0), neon = true, effect = "sparkle", desc = "👑 +25% монет + парение" },
}

function Config.getBoard(id)
	for _, b in ipairs(Config.Boards) do
		if b.id == id then
			return b
		end
	end
	return Config.Boards[1]
end

-- ------------------------------------------------------------
--  ПРОКАЧКА СКОРОСТИ
-- ------------------------------------------------------------
Config.Speed = {
	Base = 32,
	PerLevel = 2.4,
	MaxLevel = 50,
	CostBase = 30,
	CostGrowth = 1.27,
	MaxWalkSpeed = 175,
	StartFraction = 0.7, -- с какой доли скорости начинаешь разгон
	Accel = 0.9, -- как быстро разгоняешься (доля макс. скорости в секунду)
}
Config.BaseJump = 60

function Config.speedCost(speedLevel)
	return math.floor(Config.Speed.CostBase * Config.Speed.CostGrowth ^ speedLevel)
end

function Config.maxSpeed(speedLevel, boardId)
	local b = Config.getBoard(boardId)
	local s = (Config.Speed.Base + Config.Speed.PerLevel * speedLevel) * b.speed
	return math.min(s, Config.Speed.MaxWalkSpeed)
end

function Config.jumpPower(boardId)
	return Config.BaseJump + Config.getBoard(boardId).jump
end

-- ------------------------------------------------------------
--  УРОВНИ
-- ------------------------------------------------------------
function Config.xpForLevel(level)
	return math.floor(60 * level ^ 1.6)
end

-- ------------------------------------------------------------
--  СЛЕДЫ за доской (меню «Следы»). Только красота, на скорость не влияют.
-- ------------------------------------------------------------
Config.Trails = {
	{ id = "board", name = "Цвет доски", price = 0, colors = nil },
	{ id = "cloud", name = "Облачко", price = 1500, colors = { Color3.fromRGB(255, 255, 255), Color3.fromRGB(200, 230, 255) } },
	{ id = "sakura", name = "Сакура", price = 6000, colors = { Color3.fromRGB(255, 150, 200), Color3.fromRGB(255, 230, 240) } },
	{ id = "mint", name = "Мятный", price = 20000, colors = { Color3.fromRGB(80, 255, 190), Color3.fromRGB(0, 170, 255) } },
	{ id = "sunset", name = "Закат", price = 75000, colors = { Color3.fromRGB(255, 200, 0), Color3.fromRGB(255, 40, 120) } },
	{ id = "toxic", name = "Токсичный", price = 300000, colors = { Color3.fromRGB(180, 255, 0), Color3.fromRGB(0, 120, 40) } },
	{ id = "galaxy", name = "Галактика", price = 1500000, colors = { Color3.fromRGB(120, 0, 255), Color3.fromRGB(255, 0, 200) } },
	{ id = "rainbow", name = "Радуга", starter = true, colors = { Color3.fromRGB(255, 0, 0), Color3.fromRGB(255, 220, 0), Color3.fromRGB(0, 220, 80), Color3.fromRGB(0, 140, 255), Color3.fromRGB(200, 0, 255) } },
}

function Config.getTrail(id)
	for _, t in ipairs(Config.Trails) do
		if t.id == id then
			return t
		end
	end
	return Config.Trails[1]
end

-- ------------------------------------------------------------
--  ПОДАРКИ ЗА ВРЕМЯ В ИГРЕ (каждый заход заново)
--  minutes — через сколько минут игры, coins — сколько монет
--  (умножается на множитель лучшей открытой зоны)
-- ------------------------------------------------------------
Config.Gifts = {
	{ minutes = 1, coins = 150 },
	{ minutes = 3, coins = 300 },
	{ minutes = 6, coins = 600 },
	{ minutes = 10, coins = 1000 },
	{ minutes = 15, coins = 1600 },
	{ minutes = 25, coins = 2500 },
	{ minutes = 40, coins = 4000 },
	{ minutes = 60, coins = 8000 },
}

-- ------------------------------------------------------------
--  ЗВУКИ. Можно заменить на любые из Toolbox → Audio:
--  вставь "rbxassetid://НОМЕР". Пустая строка = без звука.
--  Music — музыка (по одной на зону, по порядку). Пока пусто.
-- ------------------------------------------------------------
Config.Sounds = {
	Jump = "rbxasset://sounds/action_jump.mp3",
	Land = "rbxasset://sounds/action_jump_land.mp3",
	Bail = "rbxasset://sounds/action_falling.mp3",
	Coin = "rbxasset://sounds/electronicpingshort.wav",
	Trick = "rbxasset://sounds/swoosh.wav",
	Click = "rbxasset://sounds/button.wav",
	LevelUp = "rbxasset://sounds/electronicpingshort.wav",
	Roll = "", -- звук колёс (зацикленный). Найди в Toolbox «skateboard» и вставь сюда
	Music = { "", "", "", "", "", "", "" },
}

-- ------------------------------------------------------------
--  ЗАДАНИЯ для новичков (видны внизу экрана, идут по порядку)
--  kind — что нужно сделать, reward — монеты за выполнение
-- ------------------------------------------------------------
Config.Quests = {
	{ kind = "kick", text = "Разгонись и прыгни с трамплина со стрелками", reward = 100 },
	{ kind = "trick", text = "В прыжке сделай трюк (E, Q, R или F)", reward = 150 },
	{ kind = "rail", text = "Запрыгни на перила и проедь по ним", reward = 200 },
	{ kind = "combo2", text = "Сделай комбо x2: два трюка подряд", reward = 300 },
	{ kind = "speed", text = "Прокачай скорость (кнопка ⚡ слева)", reward = 300 },
	{ kind = "mega", text = "Прыгни с МЕГА-ТРАМПЛИНА в середине зоны", reward = 500 },
	{ kind = "level4", text = "Дойди до 4 уровня", reward = 500 },
	{ kind = "zone2", text = "Открой Конфетную страну (ворота в конце зоны)", reward = 800 },
	{ kind = "board", text = "Купи новую доску (в лобби или меню 🛹)", reward = 1000 },
	{ kind = "combo5", text = "Сделай комбо x5", reward = 2000 },
	{ kind = "zone3", text = "Открой Солнечный пляж", reward = 5000 },
}

-- ------------------------------------------------------------
--  БЕГОВЫЕ ДОРОЖКИ в лобби: встань и стой — монеты капают сами
--  coins — монет каждые 2 секунды (умножается на множитель лучшей зоны)
-- ------------------------------------------------------------
Config.Treadmills = {
	{ name = "Дорожка новичка", level = 1, coins = 4, color = Color3.fromRGB(150, 220, 255) },
	{ name = "Дорожка профи", level = 8, coins = 12, color = Color3.fromRGB(255, 170, 210) },
	{ name = "Дорожка чемпиона", level = 18, coins = 30, color = Color3.fromRGB(255, 215, 90) },
}

-- ОББИ в лобби: награда за прохождение и перерыв между наградами
Config.Obby = { Reward = 400, Cooldown = 300 }

-- ------------------------------------------------------------
--  КАРТИНКИ для кнопок меню (аниме-иконки из папки icons/).
--  Загрузи PNG в Studio (Asset Manager → Import) и вставь
--  "rbxassetid://НОМЕР". Пусто = вместо картинки эмодзи.
-- ------------------------------------------------------------
Config.Icons = {
	Boards = "",
	Speed = "",
	Zones = "",
	Shop = "",
	Daily = "",
	Gifts = "",
	Trails = "",
	Codes = "",
	Rebirth = "",
	Settings = "",
	Starter = "",
}

-- Надписи после комбо (по множителю)
Config.ComboWords = {
	{ mult = 9, text = "ЛЕГЕНДА!" },
	{ mult = 6, text = "НЕВЕРОЯТНО!" },
	{ mult = 3.5, text = "БЕЗУМНО!" },
	{ mult = 2, text = "КРУТО!" },
	{ mult = 1.5, text = "НЕПЛОХО!" },
}

-- ------------------------------------------------------------
--  ПЕРЕРОЖДЕНИЕ: сбрасывает монеты и скорость,
--  но навсегда даёт +50% к монетам
-- ------------------------------------------------------------
Config.Rebirth = { CostBase = 150000, CostGrowth = 4, Bonus = 0.5 }

function Config.rebirthCost(rebirths)
	return math.floor(Config.Rebirth.CostBase * Config.Rebirth.CostGrowth ^ rebirths)
end

-- ------------------------------------------------------------
--  ЕЖЕДНЕВНАЯ НАГРАДА (дни подряд). Умножается на множитель зоны.
-- ------------------------------------------------------------
Config.Daily = { 200, 400, 700, 1000, 1500, 2200, 5000 }

-- ------------------------------------------------------------
--  КОДЫ (вводятся в меню «Коды»). Каждый код — один раз.
--  Публикуй их в соцсетях, чтобы приводить игроков!
-- ------------------------------------------------------------
Config.Codes = {
	SKATE = 500,
	KICKFLIP = 1000,
	RUSH2026 = 2500,
}

-- ------------------------------------------------------------
--  ТРЮК-БИТВА: каждые несколько минут — соревнование на сервере
-- ------------------------------------------------------------
Config.Event = {
	Interval = 240, -- секунд между битвами
	Duration = 75, -- сколько длится битва
	Rewards = { 1.0, 0.5, 0.25 }, -- 1-е место получает ещё 100% своих очков монетами, 2-е 50%, 3-е 25%
}

-- ------------------------------------------------------------
--  Звёзды на карте
-- ------------------------------------------------------------
Config.Star = { Value = 25, Respawn = 45 }

-- ------------------------------------------------------------
--  Подсчёт комбо (одинаковый на сервере и у игрока)
-- ------------------------------------------------------------
function Config.comboScore(entries)
	local base = 0
	local count = 0
	local seen = {}
	for _, name in ipairs(entries) do
		local t = Config.Tricks[name]
		if t then
			local pts = t.points
			if t.multiplier then
				local n = seen[name] or 0
				pts = pts * Config.Combo.RepeatPenalty ^ n
				seen[name] = n + 1
				count += 1
			end
			base += pts
		end
	end
	local mult = math.min(Config.Combo.MaxMult, 1 + Config.Combo.MultStep * math.max(0, count - 1))
	return base, mult
end

-- Красивые числа: 1 250 / 12.5K / 3.4M
function Config.formatNumber(n)
	n = math.floor(n or 0)
	local abs = math.abs(n)
	if abs >= 1e12 then
		return string.format("%.1fT", n / 1e12)
	elseif abs >= 1e9 then
		return string.format("%.1fB", n / 1e9)
	elseif abs >= 1e6 then
		return string.format("%.1fM", n / 1e6)
	elseif abs >= 1e4 then
		return string.format("%.1fK", n / 1e3)
	end
	local s = tostring(n)
	local formatted = s:reverse():gsub("(%d%d%d)", "%1 "):reverse()
	return (formatted:gsub("^%s+", ""))
end

return Config
