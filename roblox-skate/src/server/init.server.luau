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
local BoardBuilder = require(Shared:WaitForChild("BoardBuilder"))

print("[SkateRush] Сервер запущен, версия", Config.Version)
local okWorld, worldErr = pcall(World.build)
if not okWorld then
	warn("[SkateRush] Ошибка при постройке карты:", worldErr)
end

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
local AnimState = newEvent("AnimState") -- клиент → сервер: поза на доске (чтобы её видели другие)
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
local joinTime = {} -- [player] = os.time() захода
local giftsClaimed = {} -- [player] = { [index] = true } (на один заход)

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
		trails = data.trails,
		trail = data.trail,
		settings = data.settings,
		played = os.time() - (joinTime[player] or os.time()),
		gifts = (function()
			-- сплошной список true/false: так он без потерь проходит через сеть
			local list = {}
			local claimed = giftsClaimed[player] or {}
			for i = 1, #Config.Gifts do
				list[i] = claimed[i] == true
			end
			return list
		end)(),
		quest = data.quest,
		starterLeft = data.starterBought and 0 or math.max(0, data.firstJoin + Config.StarterOfferMinutes * 60 - os.time()),
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
		hum.HipHeight += BoardBuilder.WheelDrop + BoardBuilder.TopOffset
	end
	local baseHip = char:GetAttribute("BaseHip")
	local legs = hum.RigType == Enum.HumanoidRigType.R15 and baseHip or 2
	-- центр деки чуть ниже ступней: ноги стоят на шкурке
	local offset = legs + rootPart.Size.Y / 2 + BoardBuilder.TopOffset

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

	local deck
	-- Красивая модель доски из Toolbox: ReplicatedStorage → SkateAssets → Board_<id> или Board
	local assets = ReplicatedStorage:FindFirstChild("SkateAssets")
	local custom = assets and (assets:FindFirstChild("Board_" .. cfg.id) or assets:FindFirstChild("Board"))
	if custom and custom:IsA("Model") then
		local clone = custom:Clone()
		deck = clone.PrimaryPart or clone:FindFirstChildWhichIsA("BasePart", true)
		if deck then
			for _, d in ipairs(clone:GetDescendants()) do
				if d:IsA("BasePart") then
					d.Anchored = false
					d.CanCollide = false
					d.CanQuery = false
					d.CanTouch = false
					d.Massless = true
					if d ~= deck then
						local w = Instance.new("Weld")
						w.Part0 = deck
						w.Part1 = d
						w.C0 = deck.CFrame:Inverse() * d.CFrame
						w.Parent = d
					end
				end
			end
			deck.Name = "Deck"
			for _, ch in ipairs(clone:GetChildren()) do
				ch.Parent = model
			end
			clone:Destroy()
			model.PrimaryPart = deck
		end
	end
	if not deck then
		-- детальная доска: дека с носом и хвостом, подвески, колёса
		local built = BoardBuilder.build(cfg)
		deck = built.PrimaryPart
		for _, ch in ipairs(built:GetChildren()) do
			ch.Parent = model
		end
		built:Destroy()
		model.PrimaryPart = deck
	end

	-- след за доской
	local a0 = Instance.new("Attachment")
	a0.Name = "TrailA"
	a0.Position = Vector3.new(-0.7, 0, 2.3)
	a0.Parent = deck
	local a1 = Instance.new("Attachment")
	a1.Name = "TrailB"
	a1.Position = Vector3.new(0.7, 0, 2.3)
	a1.Parent = deck
	local trail = Instance.new("Trail")
	trail.Name = "BoardTrail"
	trail.Attachment0 = a0
	trail.Attachment1 = a1
	local trailCfg = Config.getTrail(data.trail)
	if trailCfg.colors then
		local keys = {}
		for k, c in ipairs(trailCfg.colors) do
			table.insert(keys, ColorSequenceKeypoint.new((k - 1) / math.max(1, #trailCfg.colors - 1), c))
		end
		trail.Color = ColorSequence.new(keys)
	else
		trail.Color = ColorSequence.new(cfg.trail)
	end
	trail.Transparency = NumberSequence.new(0.2, 1)
	trail.Lifetime = 0.5
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

	-- красивый эффект доски
	local effectA = Instance.new("Attachment")
	effectA.Name = "EffectA"
	effectA.Position = Vector3.new(0, -0.2, 1.6)
	effectA.Parent = deck
	local fx = cfg.effect
	if fx == "fire" then
		local fire = Instance.new("Fire")
		fire.Size = 3
		fire.Heat = 4
		fire.Color = Color3.fromRGB(255, 120, 0)
		fire.SecondaryColor = Color3.fromRGB(255, 220, 0)
		fire.Parent = deck
	elseif fx then
		local e = Instance.new("ParticleEmitter")
		e.Name = "BoardEffect"
		e.LightEmission = 0.7
		e.Lifetime = NumberRange.new(0.6, 1.2)
		e.Speed = NumberRange.new(1, 3)
		e.SpreadAngle = Vector2.new(60, 60)
		e.Rate = 10
		e.Rotation = NumberRange.new(0, 360)
		e.RotSpeed = NumberRange.new(-60, 60)
		if fx == "hearts" then
			e.Color = ColorSequence.new(Color3.fromRGB(255, 120, 170), Color3.fromRGB(255, 200, 220))
			e.Size = NumberSequence.new(0.4, 0)
			e.Acceleration = Vector3.new(0, 3, 0)
		elseif fx == "snow" then
			e.Color = ColorSequence.new(Color3.new(1, 1, 1))
			e.Size = NumberSequence.new(0.3, 0)
			e.Acceleration = Vector3.new(0, -2, 0)
		elseif fx == "stars" then
			e.Color = ColorSequence.new(Color3.fromRGB(255, 120, 255), Color3.fromRGB(120, 220, 255))
			e.Size = NumberSequence.new(0.5, 0)
			e.Rate = 16
		else -- sparkle
			e.Color = ColorSequence.new(cfg.trail)
			e.Size = NumberSequence.new(0.35, 0)
		end
		e.Parent = effectA
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
	if data.firstJoin == 0 then
		data.firstJoin = os.time()
	end
	joinTime[player] = os.time()
	giftsClaimed[player] = {}
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
	joinTime[player] = nil
	giftsClaimed[player] = nil
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
	local _, mult = Config.comboScore(clean)
	ComboResult:FireClient(player, coins, xp, record, mult)
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
local function awardStar(player, starPart)
	local cd = starCooldown[player]
	local now = os.clock()
	if not cd or (cd[starPart] and cd[starPart] > now) then
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
end

local function hookStar(starPart)
	starPart.Touched:Connect(function(hit)
		local char = hit.Parent
		local player = char and Players:GetPlayerFromCharacter(char)
		if player and profiles[player] then
			awardStar(player, starPart)
		end
	end)
end
local allStars = CollectionService:GetTagged("Pickup")
for _, s in ipairs(allStars) do
	hookStar(s)
end

-- Магнит: доски с magnet сами собирают звёзды вокруг
task.spawn(function()
	while true do
		task.wait(0.3)
		for player, data in pairs(profiles) do
			local board = Config.getBoard(data.equipped)
			local radius = board.magnet
			local char = player.Character
			local rootPart = char and char:FindFirstChild("HumanoidRootPart")
			if radius and rootPart then
				for _, starPart in ipairs(allStars) do
					if (starPart.Position - rootPart.Position).Magnitude <= radius then
						awardStar(player, starPart)
					end
				end
			end
		end
	end
end)

-- ---------- беговые дорожки: стоишь — копишь монеты ----------
local AfkCoins = Instance.new("RemoteEvent")
AfkCoins.Name = "AfkCoins"
AfkCoins.Parent = remotes
local treadmillZones = CollectionService:GetTagged("Treadmill")
local afkTimer = {}
local afkWarned = {}
local function treadmillAt(position)
	for _, zonePart in ipairs(treadmillZones) do
		local rel = zonePart.CFrame:PointToObjectSpace(position)
		local half = zonePart.Size / 2
		if math.abs(rel.X) <= half.X and math.abs(rel.Y) <= half.Y and math.abs(rel.Z) <= half.Z then
			return zonePart:GetAttribute("Index")
		end
	end
	return nil
end
task.spawn(function()
	while true do
		local dt = task.wait(0.25)
		for player, data in pairs(profiles) do
			local char = player.Character
			local rootPart = char and char:FindFirstChild("HumanoidRootPart")
			local idx = rootPart and treadmillAt(rootPart.Position)
			local t = idx and Config.Treadmills[idx]
			if t and data.level < t.level then
				if not afkWarned[player] then
					afkWarned[player] = true
					notify(player, "Эта дорожка открывается с " .. t.level .. " уровня", "warn")
				end
				t = nil
			elseif not t then
				afkWarned[player] = nil
			end
			if char then
				char:SetAttribute("OnTreadmill", t ~= nil)
			end
			if t then
				afkTimer[player] = (afkTimer[player] or 0) + dt
				if afkTimer[player] >= 2 then
					afkTimer[player] -= 2
					local c = math.floor(t.coins * coinMultiplier(player, data.maxZone))
					addCoins(player, c)
					AfkCoins:FireClient(player, c)
					push(player)
				end
			else
				afkTimer[player] = 0
			end
		end
	end
end)
Players.PlayerRemoving:Connect(function(player)
	afkTimer[player] = nil
	afkWarned[player] = nil
end)

-- ---------- обби: финиш ----------
local obbyLast = {}
for _, finish in ipairs(CollectionService:GetTagged("ObbyFinish")) do
	finish.Touched:Connect(function(hit)
		local char = hit.Parent
		local player = char and Players:GetPlayerFromCharacter(char)
		local data = player and profiles[player]
		if not data then
			return
		end
		local now = os.time()
		if obbyLast[player] and now - obbyLast[player] < 3 then
			return
		end
		obbyLast[player] = now
		local wait = (data.obbyTime or 0) + Config.Obby.Cooldown - now
		if wait > 0 then
			notify(player, "Обби пройдено! Награду можно снова получить через " .. math.ceil(wait / 60) .. " мин.", "info")
		else
			data.obbyTime = now
			local c = math.floor(Config.Obby.Reward * zoneMult(data.maxZone))
			addCoins(player, c)
			notify(player, "🏆 Обби пройдено! +" .. Config.formatNumber(c) .. " 💰", "good")
			push(player)
		end
		task.delay(1.5, function()
			if char.Parent then
				char:PivotTo(World.lobbySpawn())
			end
		end)
	end)
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
	elseif key == "LevelUp" then
		addXp(player, Config.xpForLevel(data.level) - data.xp)
	elseif key == "StarterPack" then
		local c = Config.StarterCoins * zoneMult(data.maxZone)
		addCoins(player, c)
		data.boostUntil = math.max(data.boostUntil, os.time()) + 15 * 60
		data.trails.rainbow = true
		data.trail = "rainbow"
		data.starterBought = true
		attachBoard(player)
		notify(player, "🎁 Стартовый набор: +" .. Config.formatNumber(c) .. " 💰, буст x2 и радужный след!", "good")
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
	if type(index) ~= "number" or index < 0 or index > data.maxZone then
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

function handlers.BuyTrail(player, data, id)
	local t = Config.getTrail(id)
	if t.id ~= id then
		return false, "Нет такого следа"
	end
	if not data.trails[id] then
		if t.starter then
			return false, "Этот след есть только в стартовом наборе"
		end
		if data.coins < t.price then
			return false, "Не хватает монет"
		end
		data.coins -= t.price
		data.trails[id] = true
	end
	data.trail = id
	attachBoard(player)
	return true, "След «" .. t.name .. "» надет!"
end

function handlers.ClaimGift(player, data, index)
	local g = type(index) == "number" and Config.Gifts[index]
	if not g then
		return false, "Нет такого подарка"
	end
	local claimed = giftsClaimed[player]
	if claimed[index] then
		return false, "Уже забрано"
	end
	if os.time() - joinTime[player] < g.minutes * 60 then
		return false, "Ещё рано!"
	end
	claimed[index] = true
	local c = g.coins * zoneMult(data.maxZone)
	addCoins(player, c)
	return true, "🎁 +" .. Config.formatNumber(c) .. " 💰"
end

-- Задания: те, что можно проверить по данным, сервер проверяет сам
local QUEST_CHECK = {
	speed = function(data)
		return data.speedLevel >= 1
	end,
	level4 = function(data)
		return data.level >= 4
	end,
	zone2 = function(data)
		return data.maxZone >= 2
	end,
	zone3 = function(data)
		return data.maxZone >= 3
	end,
	board = function(data)
		local n = 0
		for _ in pairs(data.boards) do
			n += 1
		end
		return n >= 2 or data.equipped == "gold"
	end,
}

function handlers.QuestDone(player, data, index)
	local q = Config.Quests[data.quest]
	if type(index) ~= "number" or index ~= data.quest or not q then
		return false
	end
	local check = QUEST_CHECK[q.kind]
	if check and not check(data) then
		return false
	end
	data.quest += 1
	addCoins(player, q.reward)
	return true, "✅ Задание выполнено! +" .. Config.formatNumber(q.reward) .. " 💰"
end

function handlers.SaveSettings(player, data, settings)
	if type(settings) ~= "table" then
		return false
	end
	data.settings.music = settings.music == true
	data.settings.sfx = settings.sfx == true
	local lim = tonumber(settings.speedLimit) or 100
	data.settings.speedLimit = math.clamp(math.floor(lim), 30, 100)
	return true
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

-- ---------- поза на доске для других игроков ----------
local ANIM_STATES = { ride = true, air = true, grind = true, bail = true, Kickflip = true, Spin = true, Grab = true, Backflip = true, mount = true, ollie = true, land = true }
local animStamp = {}
AnimState.OnServerEvent:Connect(function(player, state)
	if type(state) ~= "string" or not ANIM_STATES[state] then
		return
	end
	local now = os.clock()
	if animStamp[player] and now - animStamp[player] < 0.05 then
		return
	end
	animStamp[player] = now
	local char = player.Character
	if char then
		char:SetAttribute("SkateAnim", state)
	end
end)
Players.PlayerRemoving:Connect(function(player)
	animStamp[player] = nil
end)

-- ---------- витрина досок в лобби ----------
local function hookStand(stand)
	local prompt = stand:FindFirstChildOfClass("ProximityPrompt")
	local id = stand:GetAttribute("BoardId")
	if not prompt or not id then
		return
	end
	prompt.Triggered:Connect(function(player)
		local data = profiles[player]
		if not data then
			return
		end
		local b = Config.getBoard(id)
		if b.pass and not (passes[player] and passes[player][b.pass]) then
			notify(player, "Золотая доска продаётся в магазине за робуксы 💎", "warn")
			return
		end
		local ok, msg = handlers.BuyBoard(player, data, id)
		if msg then
			notify(player, msg, ok and "good" or "warn")
		elseif ok then
			notify(player, "Доска «" .. b.name .. "» надета!", "good")
		end
		push(player)
	end)
end
for _, stand in ipairs(CollectionService:GetTagged("BoardStand")) do
	hookStand(stand)
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
