-- ============================================================
--  SKATE RUSH — все настройки игры в одном месте.
--  Меняй цифры здесь, и игра поменяется сама: цены, зоны,
--  доски, трюки, награды. Код трогать не нужно.
-- ============================================================

local Config = {}

Config.GameName = "Skate Rush"

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
	Coins2x = { id = 0, price = 199, icon = "💰", name = "x2 Монеты навсегда", desc = "Все монеты удваиваются. Навсегда." },
	Coins3x = { id = 0, price = 449, icon = "🤑", name = "x3 Монеты навсегда", desc = "Все монеты утраиваются. Вместе с x2 не складывается." },
	GoldBoard = { id = 0, price = 299, icon = "👑", name = "Золотая доска", desc = "Быстрая доска с золотым следом и +25% к монетам." },
}
Config.GamePassOrder = { "Coins2x", "Coins3x", "GoldBoard" }

Config.Products = {
	SaveCombo = { id = 0, price = 5, icon = "🛟", name = "Спасти комбо", desc = "Упал? Получи монеты за потерянное комбо." },
	SkipZone = { id = 0, price = 25, icon = "🚪", name = "Открыть следующую зону", desc = "Сразу открывает следующую зону без уровня и монет." },
	Boost2x = { id = 0, price = 15, icon = "⚡", name = "Буст x2 на 15 минут", desc = "Двойные монеты на 15 минут. Складывается с геймпассами.", minutes = 15 },
	CoinsSmall = { id = 0, price = 19, icon = "👜", name = "Мешок монет", desc = "Монеты. Чем дальше зона, тем больше." },
	CoinsBig = { id = 0, price = 79, icon = "🧰", name = "Сундук монет", desc = "Много монет. Чем дальше зона, тем больше." },
}
Config.ProductOrder = { "Boost2x", "SkipZone", "CoinsSmall", "CoinsBig" }

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
		name = "Двор",
		theme = "park",
		level = 1,
		cost = 0,
		mult = 1,
		floor = Color3.fromRGB(150, 150, 155),
		floorMaterial = Enum.Material.Concrete,
		accent = Color3.fromRGB(255, 170, 0),
		light = { clock = 14, brightness = 2.5, fog = Color3.fromRGB(190, 220, 255), fogEnd = 1100, ambient = Color3.fromRGB(110, 110, 120) },
		gravity = 196.2,
	},
	{
		name = "Неоновый город",
		theme = "city",
		level = 5,
		cost = 750,
		mult = 2,
		floor = Color3.fromRGB(45, 45, 55),
		floorMaterial = Enum.Material.Asphalt,
		accent = Color3.fromRGB(255, 0, 200),
		light = { clock = 20.5, brightness = 1.2, fog = Color3.fromRGB(60, 20, 90), fogEnd = 700, ambient = Color3.fromRGB(120, 80, 150) },
		gravity = 196.2,
	},
	{
		name = "Пляж",
		theme = "beach",
		level = 12,
		cost = 8000,
		mult = 3.5,
		floor = Color3.fromRGB(240, 215, 150),
		floorMaterial = Enum.Material.Sand,
		accent = Color3.fromRGB(0, 210, 230),
		light = { clock = 16.5, brightness = 3, fog = Color3.fromRGB(255, 220, 180), fogEnd = 1200, ambient = Color3.fromRGB(140, 120, 100) },
		gravity = 196.2,
	},
	{
		name = "Ледяной каньон",
		theme = "ice",
		level = 20,
		cost = 60000,
		mult = 6,
		floor = Color3.fromRGB(200, 235, 255),
		floorMaterial = Enum.Material.Ice,
		accent = Color3.fromRGB(80, 200, 255),
		light = { clock = 10, brightness = 2.2, fog = Color3.fromRGB(220, 240, 255), fogEnd = 600, ambient = Color3.fromRGB(130, 150, 180) },
		gravity = 196.2,
	},
	{
		name = "Вулкан",
		theme = "volcano",
		level = 30,
		cost = 400000,
		mult = 10,
		floor = Color3.fromRGB(50, 40, 40),
		floorMaterial = Enum.Material.Basalt,
		accent = Color3.fromRGB(255, 80, 0),
		light = { clock = 18.3, brightness = 1.5, fog = Color3.fromRGB(120, 30, 10), fogEnd = 500, ambient = Color3.fromRGB(150, 70, 50) },
		gravity = 196.2,
	},
	{
		name = "Космос",
		theme = "space",
		level = 42,
		cost = 3000000,
		mult = 16,
		floor = Color3.fromRGB(25, 20, 45),
		floorMaterial = Enum.Material.SmoothPlastic,
		accent = Color3.fromRGB(150, 90, 255),
		light = { clock = 0, brightness = 1, fog = Color3.fromRGB(10, 5, 30), fogEnd = 900, ambient = Color3.fromRGB(110, 90, 170) },
		gravity = 70, -- низкая гравитация: прыжки выше, полёт дольше
	},
}

-- ------------------------------------------------------------
--  ДОСКИ
--  speed — множитель скорости, jump — добавка к прыжку
-- ------------------------------------------------------------
Config.Boards = {
	{ id = "basic", name = "Классика", price = 0, speed = 1.0, jump = 0, deck = Color3.fromRGB(200, 120, 60), stripe = Color3.fromRGB(40, 40, 40), trail = Color3.fromRGB(255, 255, 255) },
	{ id = "street", name = "Уличная", price = 2500, speed = 1.08, jump = 4, deck = Color3.fromRGB(30, 30, 30), stripe = Color3.fromRGB(255, 60, 60), trail = Color3.fromRGB(255, 80, 80) },
	{ id = "neon", name = "Неон", price = 15000, speed = 1.15, jump = 8, deck = Color3.fromRGB(20, 20, 40), stripe = Color3.fromRGB(0, 255, 200), trail = Color3.fromRGB(0, 255, 200), neon = true },
	{ id = "fire", name = "Огонь", price = 90000, speed = 1.22, jump = 12, deck = Color3.fromRGB(120, 20, 0), stripe = Color3.fromRGB(255, 140, 0), trail = Color3.fromRGB(255, 90, 0), neon = true, fire = true },
	{ id = "ice", name = "Лёд", price = 450000, speed = 1.3, jump = 16, deck = Color3.fromRGB(170, 230, 255), stripe = Color3.fromRGB(255, 255, 255), trail = Color3.fromRGB(150, 230, 255), neon = true },
	{ id = "galaxy", name = "Галактика", price = 2500000, speed = 1.4, jump = 22, deck = Color3.fromRGB(60, 0, 120), stripe = Color3.fromRGB(255, 0, 255), trail = Color3.fromRGB(180, 100, 255), neon = true, sparkle = true },
	{ id = "gold", name = "Золотая", pass = "GoldBoard", speed = 1.35, jump = 20, coinBonus = 0.25, deck = Color3.fromRGB(255, 200, 40), stripe = Color3.fromRGB(255, 255, 200), trail = Color3.fromRGB(255, 215, 0), neon = true, sparkle = true },
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
	Base = 20,
	PerLevel = 1.6,
	MaxLevel = 50,
	CostBase = 30,
	CostGrowth = 1.27,
	MaxWalkSpeed = 140,
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
--  ПЕРЕРОЖДЕНИЕ: сбрасывает монеты и скорость,
--  но навсегда даёт +50% к монетам
-- ------------------------------------------------------------
Config.Rebirth = { CostBase = 250000, CostGrowth = 4, Bonus = 0.5 }

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
