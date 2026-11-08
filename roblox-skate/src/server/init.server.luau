-- ============================================================
--  SKATE RUSH — сервер
--  Хранит монеты и уровни, проверяет трюки, продаёт товары,
--  проводит трюк-битвы. Игрок не может сам себе начислить монеты:
--  сервер сам пересчитывает каждое комбо.
-- ============================================================

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local MarketplaceService = game:GetService("MarketplaceService")
local CollectionService = game:GetService("CollectionService")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("SkateShared")
local Config = require(Shared:WaitForChild("Config"))
local Data = require(script:WaitForChild("Data"))
local World = require(script:WaitForChild("World"))

World.build()

-- ---------- remotes ----------
local remotes = Instance.new("Folder")
remotes.Name = "Remotes"

local function newEvent(name)
	local e = Instance.new("RemoteEvent")
	e.Name = name
	e.Parent = remotes
	return e
end
local function newFunction(name)
	local f = Instance.new("RemoteFunction")
	f.Name = name
	f.Parent = remotes
	return f
end

local ComboBanked = newEvent("ComboBanked") -- клиент → сервер: комбо засчитано
local ComboBailed = newEvent("ComboBailed") -- клиент → сервер: упал
local ComboResult = newEvent("ComboResult") -- сервер → клиент: сколько начислено
local DataChanged = newEvent("DataChanged") -- сервер → клиент: новые данные
local Notify = newEvent("Notify") -- сервер → клиент: сообщение
local PickupTaken = newEvent("PickupTaken") -- сервер → клиент: звезда собрана
local Request = newFunction("Request") -- все покупки и кнопки меню
remotes.Parent = ReplicatedStorage

-- ---------- состояние ----------
local profiles = {} -- [player] = data
local canSave = {} -- [player] = bool
local passes = {} -- [player] = { Coins2x = true, ... }
local budget = {} -- [player] = { allowance, last } — защита от накрутки
local pendingLost = {} -- [player] = { coins, xp, expires }
local starCooldown = {} -- [player] = { [part] = time }
local eventScores = {} -- [player] = score

local productByKey = {}
local productKeyById = {}
for key, p in pairs(Config.Products) do
	productByKey[key] = p
	if p.id ~= 0 then
		productKeyById[p.id] = key
	end
end
local passKeyById = {}
for key, p in pairs(Config.GamePasses) do
	if p.id ~= 0 then
		passKeyById[p.id] = key
	end
end

-- ---------- расчёты ----------
local function zoneMult(i)
	return Config.Zones[math.clamp(i, 1, #Config.Zones)].mult
end

local function currentZone(player)
	local data = profiles[player]
	local char = player.Character
	local rootPart = char and char:FindFirstChild("HumanoidRootPart")
	if not data or not rootPart then
		return 1
	end
	return math.min(World.zoneAt(rootPart.Position), data.maxZone)
end

local function coinMultiplier(player, zoneIndex)
	local data = profiles[player]
	local p = passes[player] or {}
	local m = zoneMult(zoneIndex)
	if p.Coins3x then
		m *= 3
	elseif p.Coins2x then
		m *= 2
	end
	if data.boostUntil > os.time() then
		m *= 2
	end
	m *= 1 + Config.Rebirth.Bonus * data.rebirths
	local board = Config.getBoard(data.equipped)
	if board.coinBonus then
		m *= 1 + board.coinBonus
	end
	return m
end

local function snapshot(player)
	local data = profiles[player]
	local today = math.floor(os.time() / 86400)
	return {
		coins = data.coins,
		xp = data.xp,
		level = data.level,
		speedLevel = data.speedLevel,
		boards = data.boards,
		equipped = data.equipped,
		maxZone = data.maxZone,
		rebirths = data.rebirths,
		dailyStreak = data.dailyStreak,
		dailyReady = data.lastDailyDay ~= today,
		dailyNext = (data.lastDailyDay == today - 1) and (data.dailyStreak % #Config.Daily + 1) or 1,
		boostLeft = math.max(0, data.boostUntil - os.time()),
		bestCombo = data.bestCombo,
		passes = passes[player] or {},
		coinMult = coinMultiplier(player, currentZone(player)),
		saving = canSave[player] == true,
	}
end

local function applyStats(player)
	local data = profiles[player]
	if not data then
		return
	end
	local speed = Config.maxSpeed(data.speedLevel, data.equipped)
	local jump = Config.jumpPower(data.equipped)
	player:SetAttribute("MaxSpeed", speed)
	player:SetAttribute("JumpPower", jump)
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	if hum then
		hum.UseJumpPower = true
		hum.JumpPower = jump
	end
	local ls = player:FindFirstChild("leaderstats")
	if ls then
		ls["Монеты"].Value = math.floor(data.coins)
		ls["Уровень"].Value = data.level
		ls["Перерожд."].Value = data.rebirths
	end
end

local function push(player)
	if profiles[player] then
		applyStats(player)
		DataChanged:FireClient(player, snapshot(player))
	end
end

local function notify(player, text, kind)
	Notify:FireClient(player, text, kind or "info")
end

local function addCoins(player, amount)
	local data = profiles[player]
	data.coins += math.floor(amount)
end

local function addXp(player, amount)
	local data = profiles[player]
	data.xp += math.floor(amount)
	local leveled = false
	while data.xp >= Config.xpForLevel(data.level) do
		data.xp -= Config.xpForLevel(data.level)
		data.level += 1
		leveled = true
	end
	if leveled then
		notify(player, "НОВЫЙ УРОВЕНЬ " .. data.level .. "!", "level")
		local nextZone = Config.Zones[data.maxZone + 1]
		if nextZone and data.level == nextZone.level then
			notify(player, "Теперь можно открыть зону «" .. nextZone.name .. "»!", "good")
		end
	end
end

-- ---------- данные: вход и выход ----------
local function setupLeaderstats(player)
	local ls = Instance.new("Folder")
	ls.Name = "leaderstats"
	for _, name in ipairs({ "Уровень", "Монеты", "Перерожд." }) do
		local v = Instance.new("IntValue")
		v.Name = name
		v.Parent = ls
	end
	ls.Parent = player
end

local function checkPasses(player)
	local owned = {}
	for key, p in pairs(Config.GamePasses) do
		if p.id ~= 0 then
			local ok, has = pcall(function()
				return MarketplaceService:UserOwnsGamePassAsync(player.UserId, p.id)
			end)
			if ok and has then
				owned[key] = true
			end
		end
	end
	passes[player] = owned
end

-- ---------- доска на персонаже ----------
local function attachBoard(player)
	local data = profiles[player]
	local char = player.Character
	if not data or not char then
		return
	end
	local hum = char:FindFirstChildOfClass("Humanoid")
	local rootPart = char:FindFirstChild("HumanoidRootPart")
	if not hum or not rootPart then
		return
	end
	local old = char:FindFirstChild("Skateboard")
	if old then
		old:Destroy()
	end
	local oldWeld = rootPart:FindFirstChild("BoardWeld")
	if oldWeld then
		oldWeld:Destroy()
	end

	-- поднимаем персонажа, чтобы он стоял НА доске
	if char:GetAttribute("BaseHip") == nil then
		char:SetAttribute("BaseHip", hum.HipHeight)
		hum.HipHeight += 0.6
	end
	local baseHip = char:GetAttribute("BaseHip")
	local legs = hum.RigType == Enum.HumanoidRigType.R15 and baseHip or 2
	local offset = legs + rootPart.Size.Y / 2 + 0.1

	local cfg = Config.getBoard(data.equipped)
	local model = Instance.new("Model")
	model.Name = "Skateboard"

	local function bpart(name, size, color, material, shape)
		local p = Instance.new("Part")
		p.Name = name
		p.Size = size
		p.Color = color
		p.Material = material
		if shape then
			p.Shape = shape
		end
		p.CanCollide = false
		p.CanQuery = false
		p.CanTouch = false
		p.Massless = true
		p.TopSurface = Enum.SurfaceType.Smooth
		p.BottomSurface = Enum.SurfaceType.Smooth
		p.Parent = model
		return p
	end

	local deck = bpart("Deck", Vector3.new(1.7, 0.2, 4.4), cfg.deck, Enum.Material.SmoothPlastic)
	model.PrimaryPart = deck
	local stripe = bpart("Stripe", Vector3.new(0.5, 0.22, 4.2), cfg.stripe, cfg.neon and Enum.Material.Neon or Enum.Material.SmoothPlastic)
	stripe.CFrame = deck.CFrame
	local nose = bpart("Nose", Vector3.new(1.7, 0.2, 0.7), cfg.deck, Enum.Material.SmoothPlastic)
	nose.CFrame = deck.CFrame * CFrame.new(0, 0.12, -2.45) * CFrame.Angles(math.rad(20), 0, 0)
	local tail = bpart("Tail", Vector3.new(1.7, 0.2, 0.7), cfg.deck, Enum.Material.SmoothPlastic)
	tail.CFrame = deck.CFrame * CFrame.new(0, 0.12, 2.45) * CFrame.Angles(math.rad(-20), 0, 0)
	for _, pos in ipairs({ Vector3.new(-0.65, -0.3, -1.5), Vector3.new(0.65, -0.3, -1.5), Vector3.new(-0.65, -0.3, 1.5), Vector3.new(0.65, -0.3, 1.5) }) do
		local w = bpart("Wheel", Vector3.new(0.3, 0.42, 0.42), cfg.stripe, Enum.Material.SmoothPlastic, Enum.PartType.Cylinder)
		w.CFrame = deck.CFrame * CFrame.new(pos)
	end
	for _, p in ipairs(model:GetChildren()) do
		if p ~= deck and p:IsA("BasePart") then
			local w = Instance.new("Weld")
			w.Part0 = deck
			w.Part1 = p
			w.C0 = deck.CFrame:Inverse() * p.CFrame
			w.Parent = p
		end
	end

	-- след за доской
	local a0 = Instance.new("Attachment")
	a0.Name = "TrailA"
	a0.Position = Vector3.new(-0.7, 0, 2.2)
	a0.Parent = deck
	local a1 = Instance.new("Attachment")
	a1.Name = "TrailB"
	a1.Position = Vector3.new(0.7, 0, 2.2)
	a1.Parent = deck
	local trail = Instance.new("Trail")
	trail.Name = "BoardTrail"
	trail.Attachment0 = a0
	trail.Attachment1 = a1
	trail.Color = ColorSequence.new(cfg.trail)
	trail.Transparency = NumberSequence.new(0.2, 1)
	trail.Lifetime = 0.35
	trail.LightEmission = cfg.neon and 1 or 0
	trail.FaceCamera = true
	trail.Enabled = false
	trail.Parent = deck

	-- искры для грайнда (включает клиент)
	local sparkA = Instance.new("Attachment")
	sparkA.Name = "SparkA"
	sparkA.Position = Vector3.new(0, -0.4, 0)
	sparkA.Parent = deck
	local sparks = Instance.new("ParticleEmitter")
	sparks.Name = "Sparks"
	sparks.Color = ColorSequence.new(Color3.fromRGB(255, 230, 120), Color3.fromRGB(255, 120, 0))
	sparks.LightEmission = 1
	sparks.Size = NumberSequence.new(0.35, 0)
	sparks.Lifetime = NumberRange.new(0.2, 0.4)
	sparks.Speed = NumberRange.new(10, 18)
	sparks.SpreadAngle = Vector2.new(60, 60)
	sparks.Rate = 80
	sparks.Enabled = false
	sparks.Parent = sparkA

	if cfg.fire then
		local fire = Instance.new("Fire")
		fire.Size = 3
		fire.Heat = 4
		fire.Color = Color3.fromRGB(255, 120, 0)
		fire.SecondaryColor = Color3.fromRGB(255, 220, 0)
		fire.Parent = deck
	end
	if cfg.sparkle then
		local s = Instance.new("Sparkles")
		s.SparkleColor = cfg.trail
		s.Parent = deck
	end

	deck.CFrame = rootPart.CFrame * CFrame.new(0, -offset, 0)
	model.Parent = char

	local weld = Instance.new("Weld")
	weld.Name = "BoardWeld"
	weld.Part0 = rootPart
	weld.Part1 = deck
	weld.C0 = CFrame.new(0, -offset, 0)
	weld:SetAttribute("BaseOffset", offset)
	weld.Parent = rootPart
end

local function onCharacter(player, char)
	local hum = char:WaitForChild("Humanoid", 10)
	local rootPart = char:WaitForChild("HumanoidRootPart", 10)
	if not hum or not rootPart then
		return
	end
	-- ждём, пока загрузятся данные
	local t = 0
	while not profiles[player] and t < 15 do
		t += task.wait(0.2)
	end
	local data = profiles[player]
	if not data then
		return
	end
	attachBoard(player)
	applyStats(player)
	-- появляемся в последней зоне
	local zoneIndex = math.clamp(data.lastZone, 1, data.maxZone)
	if zoneIndex > 1 then
		task.wait(0.1)
		char:PivotTo(World.zoneSpawn(zoneIndex))
	end
end

local function onPlayerAdded(player)
	setupLeaderstats(player)
	checkPasses(player)
	local data, ok = Data.load(player)
	if not player.Parent then
		return
	end
	profiles[player] = data
	canSave[player] = ok
	budget[player] = { allowance = 5, last = os.clock() }
	starCooldown[player] = {}
	push(player)
	if not ok then
		if RunService:IsStudio() then
			notify(player, "Studio: сохранение выключено (включи API Services в Game Settings → Security)", "warn")
		else
			notify(player, "Не удалось загрузить прогресс. Перезайди, чтобы он сохранялся.", "warn")
		end
	end
	if data.lastDailyDay ~= math.floor(os.time() / 86400) then
		task.delay(3, function()
			if player.Parent then
				notify(player, "🎁 Ежедневная награда ждёт тебя!", "good")
			end
		end)
	end

	player.CharacterAdded:Connect(function(char)
		onCharacter(player, char)
	end)
	if player.Character then
		task.spawn(onCharacter, player, player.Character)
	end
end

local function saveAndForget(player)
	local data = profiles[player]
	if data then
		data.lastZone = currentZone(player)
		if canSave[player] then
			Data.save(player, data)
		end
	end
	profiles[player] = nil
	canSave[player] = nil
	passes[player] = nil
	budget[player] = nil
	pendingLost[player] = nil
	starCooldown[player] = nil
	eventScores[player] = nil
end

Players.PlayerAdded:Connect(onPlayerAdded)
for _, p in ipairs(Players:GetPlayers()) do
	task.spawn(onPlayerAdded, p)
end
Players.PlayerRemoving:Connect(saveAndForget)

game:BindToClose(function()
	local threads = {}
	for _, player in ipairs(Players:GetPlayers()) do
		table.insert(threads, task.spawn(function()
			local data = profiles[player]
			if data and canSave[player] then
				data.lastZone = currentZone(player)
				Data.save(player, data)
			end
		end))
	end
	task.wait(RunService:IsStudio() and 1 or 5)
end)

-- автосохранение
task.spawn(function()
	while true do
		task.wait(90)
		for player, data in pairs(profiles) do
			if canSave[player] then
				data.lastZone = currentZone(player)
				task.spawn(Data.save, player, data)
			end
		end
	end
end)

-- ---------- проверка комбо ----------
-- Каждый трюк «стоит» времени. Время копится в реальном темпе.
-- Если игрок присылает трюков больше, чем физически успел бы сделать, — комбо не засчитывается.
local function validateEntries(player, entries)
	if type(entries) ~= "table" then
		return nil
	end
	local count = #entries
	if count == 0 or count > Config.Combo.MaxEntries then
		return nil
	end
	local clean = {}
	local cost = 0
	for i = 1, count do
		local name = entries[i]
		if type(name) ~= "string" then
			return nil
		end
		local t = Config.Tricks[name]
		if not t then
			return nil
		end
		cost += t.duration * 0.7
		clean[i] = name
	end
	local b = budget[player]
	local now = os.clock()
	b.allowance = math.min(b.allowance + (now - b.last), 40)
	b.last = now
	if cost > b.allowance then
		return nil
	end
	b.allowance -= cost
	return clean
end

local function comboReward(player, entries)
	local data = profiles[player]
	local zone = currentZone(player)
	local base, mult = Config.comboScore(entries)
	local score = base * mult
	local coins = math.floor(score * coinMultiplier(player, zone))
	local xp = math.floor(score * (1 + (zoneMult(zone) - 1) * 0.5))
	return coins, xp, score
end

local eventActive = false

ComboBanked.OnServerEvent:Connect(function(player, entries)
	local data = profiles[player]
	if not data then
		return
	end
	local clean = validateEntries(player, entries)
	if not clean then
		return
	end
	local coins, xp, score = comboReward(player, clean)
	addCoins(player, coins)
	addXp(player, xp)
	data.totalTricks += #clean
	local record = false
	if coins > data.bestCombo then
		data.bestCombo = coins
		record = #clean >= 3
	end
	if eventActive then
		eventScores[player] = (eventScores[player] or 0) + math.floor(score)
		player:SetAttribute("EventScore", eventScores[player])
	end
	ComboResult:FireClient(player, coins, xp, record)
	push(player)
end)

ComboBailed.OnServerEvent:Connect(function(player, entries)
	if not profiles[player] then
		return
	end
	local clean = validateEntries(player, entries)
	if not clean then
		return
	end
	local coins, xp = comboReward(player, clean)
	pendingLost[player] = { coins = coins, xp = xp, expires = os.clock() + 25 }
end)

-- ---------- звёзды ----------
local function hookStar(starPart)
	starPart.Touched:Connect(function(hit)
		local char = hit.Parent
		local player = char and Players:GetPlayerFromCharacter(char)
		if not player or not profiles[player] then
			return
		end
		local cd = starCooldown[player]
		local now = os.clock()
		if cd[starPart] and cd[starPart] > now then
			return
		end
		cd[starPart] = now + Config.Star.Respawn
		local value = starPart:GetAttribute("Value") or Config.Star.Value
		local zone = World.zoneAt(starPart.Position)
		local coins = math.floor(value * coinMultiplier(player, math.min(zone, profiles[player].maxZone)))
		addCoins(player, coins)
		addXp(player, value)
		PickupTaken:FireClient(player, starPart, Config.Star.Respawn, coins)
		push(player)
	end)
end
for _, s in ipairs(CollectionService:GetTagged("Pickup")) do
	hookStar(s)
end

-- ---------- покупки за робуксы ----------
local function grantProduct(player, key)
	local data = profiles[player]
	if not data then
		return false
	end
	if key == "SaveCombo" then
		local lost = pendingLost[player]
		if lost and lost.expires > os.clock() then
			addCoins(player, lost.coins)
			addXp(player, lost.xp)
			notify(player, "Комбо спасено! +" .. Config.formatNumber(lost.coins) .. " 💰", "good")
		else
			local c = 100 * data.level
			addCoins(player, c)
			notify(player, "+" .. Config.formatNumber(c) .. " 💰", "good")
		end
		pendingLost[player] = nil
	elseif key == "SkipZone" then
		if data.maxZone < #Config.Zones then
			data.maxZone += 1
			notify(player, "Открыта зона «" .. Config.Zones[data.maxZone].name .. "»!", "good")
		else
			local c = Config.CoinPackBase.CoinsBig * zoneMult(data.maxZone)
			addCoins(player, c)
			notify(player, "Все зоны уже открыты, держи монеты: +" .. Config.formatNumber(c) .. " 💰", "good")
		end
	elseif key == "Boost2x" then
		local minutes = Config.Products.Boost2x.minutes
		data.boostUntil = math.max(data.boostUntil, os.time()) + minutes * 60
		notify(player, "⚡ Буст x2 включён на " .. minutes .. " минут!", "good")
	elseif key == "CoinsSmall" or key == "CoinsBig" then
		local c = Config.CoinPackBase[key] * zoneMult(data.maxZone)
		addCoins(player, c)
		notify(player, "+" .. Config.formatNumber(c) .. " 💰", "good")
	else
		return false
	end
	push(player)
	return true
end

MarketplaceService.ProcessReceipt = function(info)
	local player = Players:GetPlayerByUserId(info.PlayerId)
	local data = player and profiles[player]
	if not data then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	if table.find(data.receipts, info.PurchaseId) then
		return Enum.ProductPurchaseDecision.PurchaseGranted
	end
	local key = productKeyById[info.ProductId]
	if not key or not grantProduct(player, key) then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	table.insert(data.receipts, info.PurchaseId)
	while #data.receipts > 50 do
		table.remove(data.receipts, 1)
	end
	if canSave[player] then
		Data.save(player, data)
	end
	return Enum.ProductPurchaseDecision.PurchaseGranted
end

local function grantPass(player, key)
	passes[player] = passes[player] or {}
	passes[player][key] = true
	local cfg = Config.GamePasses[key]
	notify(player, "Спасибо! " .. cfg.name .. " — твой!", "good")
	if key == "GoldBoard" and profiles[player] then
		profiles[player].equipped = "gold"
		attachBoard(player)
	end
	push(player)
end

MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, passId, purchased)
	local key = passKeyById[passId]
	if purchased and key then
		grantPass(player, key)
	end
end)

-- ---------- кнопки меню ----------
local handlers = {}

function handlers.BuySpeed(player, data)
	if data.speedLevel >= Config.Speed.MaxLevel then
		return false, "Скорость уже максимальная!"
	end
	local cost = Config.speedCost(data.speedLevel)
	if data.coins < cost then
		return false, "Не хватает монет"
	end
	data.coins -= cost
	data.speedLevel += 1
	return true
end

function handlers.BuySpeedMax(player, data)
	local bought = 0
	while data.speedLevel < Config.Speed.MaxLevel and data.coins >= Config.speedCost(data.speedLevel) do
		data.coins -= Config.speedCost(data.speedLevel)
		data.speedLevel += 1
		bought += 1
	end
	if bought == 0 then
		return false, "Не хватает монет"
	end
	return true, "+" .. bought .. " к скорости!"
end

function handlers.BuyBoard(player, data, id)
	local b = Config.getBoard(id)
	if b.id ~= id then
		return false, "Нет такой доски"
	end
	if b.pass then
		local owned = passes[player] and passes[player][b.pass]
		if not owned then
			return false, "Эта доска продаётся за робуксы"
		end
		data.equipped = id
		attachBoard(player)
		return true
	end
	if data.boards[id] then
		data.equipped = id
		attachBoard(player)
		return true
	end
	if data.coins < b.price then
		return false, "Не хватает монет"
	end
	data.coins -= b.price
	data.boards[id] = true
	data.equipped = id
	attachBoard(player)
	return true, "Новая доска: " .. b.name .. "!"
end

function handlers.UnlockZone(player, data, index)
	if type(index) ~= "number" or index ~= data.maxZone + 1 then
		return false, "Сначала открой предыдущие зоны"
	end
	local z = Config.Zones[index]
	if not z then
		return false, "Это последняя зона"
	end
	if data.level < z.level then
		return false, "Нужен уровень " .. z.level
	end
	if data.coins < z.cost then
		return false, "Не хватает монет"
	end
	data.coins -= z.cost
	data.maxZone = index
	return true, "Открыта зона «" .. z.name .. "»!"
end

function handlers.Teleport(player, data, index)
	if type(index) ~= "number" or index < 1 or index > data.maxZone then
		return false, "Зона закрыта"
	end
	local char = player.Character
	if char then
		char:PivotTo(World.zoneSpawn(index))
	end
	return true
end

function handlers.Rebirth(player, data)
	local cost = Config.rebirthCost(data.rebirths)
	if data.coins < cost then
		return false, "Нужно " .. Config.formatNumber(cost) .. " 💰"
	end
	data.coins = 0
	data.speedLevel = 0
	data.rebirths += 1
	return true, "ПЕРЕРОЖДЕНИЕ! Теперь монет +" .. math.floor(Config.Rebirth.Bonus * data.rebirths * 100) .. "% навсегда"
end

function handlers.ClaimDaily(player, data)
	local today = math.floor(os.time() / 86400)
	if data.lastDailyDay == today then
		return false, "Уже забрано. Приходи завтра!"
	end
	if data.lastDailyDay == today - 1 then
		data.dailyStreak = data.dailyStreak % #Config.Daily + 1
	else
		data.dailyStreak = 1
	end
	data.lastDailyDay = today
	local c = Config.Daily[data.dailyStreak] * zoneMult(data.maxZone)
	addCoins(player, c)
	return true, "День " .. data.dailyStreak .. ": +" .. Config.formatNumber(c) .. " 💰"
end

function handlers.RedeemCode(player, data, code)
	if type(code) ~= "string" then
		return false, "Введи код"
	end
	code = code:upper():gsub("%s", "")
	local reward = Config.Codes[code]
	if not reward then
		return false, "Неверный код"
	end
	if data.codes[code] then
		return false, "Этот код уже использован"
	end
	data.codes[code] = true
	addCoins(player, reward)
	return true, "Код принят: +" .. Config.formatNumber(reward) .. " 💰"
end

-- В Studio товары с ID = 0 выдаются бесплатно, чтобы всё можно было проверить
function handlers.StudioPurchase(player, data, kind, key)
	if not RunService:IsStudio() then
		return false, "Товар ещё не настроен"
	end
	if kind == "product" and productByKey[key] then
		grantProduct(player, key)
		return true, "(Studio) бесплатная проверка покупки"
	elseif kind == "pass" and Config.GamePasses[key] then
		grantPass(player, key)
		return true, "(Studio) бесплатная проверка геймпасса"
	end
	return false, "Нет такого товара"
end

Request.OnServerInvoke = function(player, action, ...)
	local data = profiles[player]
	if not data or type(action) ~= "string" then
		return false, "Подожди, данные загружаются"
	end
	local h = handlers[action]
	if not h then
		return false, "?"
	end
	local ok, msg = h(player, data, ...)
	push(player)
	return ok, msg
end

-- ---------- трюк-битва ----------
task.spawn(function()
	while true do
		task.wait(Config.Event.Interval)
		eventScores = {}
		for _, p in ipairs(Players:GetPlayers()) do
			p:SetAttribute("EventScore", 0)
		end
		eventActive = true
		ReplicatedStorage:SetAttribute("EventEnds", workspace:GetServerTimeNow() + Config.Event.Duration)
		ReplicatedStorage:SetAttribute("EventActive", true)
		for _, p in ipairs(Players:GetPlayers()) do
			notify(p, "🏆 ТРЮК-БИТВА началась! Набери больше всех очков!", "event")
		end
		task.wait(Config.Event.Duration)
		eventActive = false
		ReplicatedStorage:SetAttribute("EventActive", false)

		local ranking = {}
		for p, score in pairs(eventScores) do
			if p.Parent and score > 0 then
				table.insert(ranking, { player = p, score = score })
			end
		end
		table.sort(ranking, function(a, b)
			return a.score > b.score
		end)
		local summary = {}
		for place, entry in ipairs(ranking) do
			local factor = Config.Event.Rewards[place]
			if not factor then
				break
			end
			local data = profiles[entry.player]
			if data then
				local coins = math.floor(entry.score * factor * coinMultiplier(entry.player, data.maxZone))
				addCoins(entry.player, coins)
				notify(entry.player, place .. " место в битве! +" .. Config.formatNumber(coins) .. " 💰", "good")
				push(entry.player)
			end
			table.insert(summary, place .. ". " .. entry.player.DisplayName)
		end
		if #summary > 0 then
			for _, p in ipairs(Players:GetPlayers()) do
				notify(p, "🏆 Итоги битвы: " .. table.concat(summary, "   "), "event")
			end
		end
	end
end)

-- раз в 10 секунд обновляем таймер буста и множитель зоны
task.spawn(function()
	while true do
		task.wait(10)
		for player in pairs(profiles) do
			push(player)
		end
	end
end)
