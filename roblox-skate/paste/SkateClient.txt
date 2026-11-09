-- ============================================================
--  SKATE RUSH — управление скейтом (работает у каждого игрока)
--  Разгон, трюки в воздухе, комбо, падения, трамплины, перила.
-- ============================================================

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local CollectionService = game:GetService("CollectionService")
local Lighting = game:GetService("Lighting")
local TweenService = game:GetService("TweenService")
local MarketplaceService = game:GetService("MarketplaceService")

local player = Players.LocalPlayer
local Config = require(ReplicatedStorage:WaitForChild("SkateShared"):WaitForChild("Config"))
local remotes = ReplicatedStorage:WaitForChild("Remotes")
local UI = require(script:WaitForChild("UI"))
local Rider = require(script:WaitForChild("Rider"))
local Sounds = require(script:WaitForChild("Sounds"))

local TWO_PI = math.pi * 2
print("[SkateRush] Клиент запущен, версия", Config.Version)

local char, hum, root
local state = {
	data = nil,
	combo = {},
	trick = nil,
	queued = nil,
	inAir = false,
	airTime = 0,
	groundTime = 0,
	grinding = false,
	grindTick = 0,
	bailing = false,
	speed = 0,
	lastKick = 0,
	zone = 0,
	gateCooldown = 0,
	boostUntil = 0,
	anim = "ride",
	ollieT = 0,
	usedDouble = false,
	lean = 0,
}

-- ---------- запросы к серверу ----------
local function request(action, ...)
	local ok, msg = remotes.Request:InvokeServer(action, ...)
	if msg then
		UI.toast(msg, ok and "good" or "warn")
	end
	return ok
end

local function buy(kind, key)
	local cfg = kind == "pass" and Config.GamePasses[key] or Config.Products[key]
	if not cfg then
		return
	end
	if cfg.id == 0 then
		request("StudioPurchase", kind, key)
	elseif kind == "pass" then
		MarketplaceService:PromptGamePassPurchase(player, cfg.id)
	else
		MarketplaceService:PromptProductPurchase(player, cfg.id)
	end
end

-- ---------- доска ----------
local function getWeld()
	return root and root:FindFirstChild("BoardWeld")
end

local function boardBase()
	local weld = getWeld()
	local off = weld and weld:GetAttribute("BaseOffset") or 3
	return CFrame.new(0, -off, 0), off
end

local function boardPart(name)
	local model = char and char:FindFirstChild("Skateboard")
	local deck = model and model:FindFirstChild("Deck")
	if not deck then
		return nil
	end
	if name == "Deck" then
		return deck
	end
	return deck:FindFirstChild(name, true)
end

local function yawOnly(cf)
	local look = cf.LookVector * Vector3.new(1, 0, 1)
	if look.Magnitude < 0.01 then
		return CFrame.new()
	end
	return CFrame.lookAt(Vector3.zero, look.Unit)
end

-- ---------- задания ----------
local questBusy = false
local function questEvent(kind)
	local data = state.data
	if not data or questBusy then
		return
	end
	local q = Config.Quests[data.quest or 1]
	if not q or q.kind ~= kind then
		return
	end
	questBusy = true
	task.spawn(function()
		local ok = request("QuestDone", data.quest)
		if ok then
			Sounds.play("LevelUp", 1.1)
		end
		questBusy = false
	end)
end

local function questFromData()
	local data = state.data
	if not data then
		return
	end
	local q = Config.Quests[data.quest or 1]
	if not q then
		return
	end
	local n = 0
	for _ in pairs(data.boards) do
		n += 1
	end
	local done = (q.kind == "speed" and data.speedLevel >= 1)
		or (q.kind == "level4" and data.level >= 4)
		or (q.kind == "zone2" and data.maxZone >= 2)
		or (q.kind == "zone3" and data.maxZone >= 3)
		or (q.kind == "board" and (n >= 2 or data.equipped == "gold"))
	if done then
		questEvent(q.kind)
	end
end

-- ---------- комбо ----------
local function estimate(entries)
	local base, mult = Config.comboScore(entries)
	local cm = state.data and state.data.coinMult or 1
	return math.floor(base * mult * cm), base, mult
end

local function addEntry(name)
	table.insert(state.combo, name)
	state.groundTime = 0
	local coins, base, mult = estimate(state.combo)
	UI.comboUpdate(state.combo, base, mult, coins)
end

local function bank()
	if #state.combo == 0 then
		return
	end
	local entries = state.combo
	state.combo = {}
	remotes.ComboBanked:FireServer(entries)
	UI.comboEnd(true)
end

-- слишком длинное комбо засчитываем сразу (сервер не примет больше MaxEntries)
local function addEntryChecked(name)
	addEntry(name)
	if #state.combo >= Config.Combo.MaxEntries - 2 then
		bank()
	end
end

local function resetTrickVisuals()
	local weld = getWeld()
	if weld then
		weld.C0 = boardBase()
	end
	if hum then
		hum.AutoRotate = true
	end
end

local function bail(reason)
	if state.bailing or not hum or not root then
		return
	end
	state.bailing = true
	local tr = state.trick
	state.trick = nil
	state.queued = nil
	resetTrickVisuals()

	local lost = state.combo
	state.combo = {}
	if #lost > 0 then
		remotes.ComboBailed:FireServer(lost)
	end
	local lostCoins = #lost > 0 and estimate(lost) or 0
	UI.comboEnd(false)
	UI.bail(lostCoins, reason)
	Sounds.play("Bail")

	local yaw = tr and tr.yaw or yawOnly(root.CFrame)
	hum.PlatformStand = true
	root.AssemblyAngularVelocity = Vector3.new(math.random(-8, 8), math.random(-3, 3), math.random(-8, 8))
	state.speed = 0
	local myHum, myRoot = hum, root
	task.delay(1.1, function()
		if myHum.Parent and myRoot.Parent and myHum.Health > 0 then
			myHum.PlatformStand = false
			myRoot.AssemblyAngularVelocity = Vector3.zero
			myRoot.CFrame = CFrame.new(myRoot.Position + Vector3.new(0, 2.5, 0)) * yaw
			myHum:ChangeState(Enum.HumanoidStateType.GettingUp)
		end
		state.bailing = false
	end)
end

-- ---------- трюки ----------
local function startTrick(name)
	if state.bailing or not hum or not root or hum.Health <= 0 then
		return
	end
	if state.trick then
		return
	end
	local cfg = Config.Tricks[name]
	if not cfg then
		return
	end
	if not state.inAir then
		-- на земле: прыгаем и делаем трюк сразу после отрыва
		state.queued = { name = name, time = os.clock() }
		hum.Jump = true
		return
	end
	state.trick = { name = name, t = 0, dur = cfg.duration, yaw = yawOnly(root.CFrame) }
	if name == "Spin" or name == "Backflip" then
		hum.AutoRotate = false
	end
	UI.trickPop(cfg.display)
	Sounds.play("Trick", 0.9 + math.random() * 0.3, 0.5)
end

local function completeTrick()
	local tr = state.trick
	state.trick = nil
	resetTrickVisuals()
	if tr.name == "Spin" or tr.name == "Backflip" then
		root.CFrame = CFrame.new(root.Position) * tr.yaw
	end
	addEntryChecked(tr.name)
	questEvent("trick")
end

local function updateTrick(dt)
	local tr = state.trick
	if not tr then
		return
	end
	tr.t += dt
	local p = math.min(tr.t / tr.dur, 1)
	local weld = getWeld()
	local base = boardBase()
	if tr.name == "Kickflip" and weld then
		weld.C0 = base * CFrame.Angles(0, 0, p * TWO_PI)
	elseif tr.name == "Grab" and weld then
		local lift = math.sin(p * math.pi)
		weld.C0 = base * CFrame.new(0, lift * 1.3, 0) * CFrame.Angles(lift * 0.6, 0, lift * 0.4)
	elseif tr.name == "Spin" then
		root.CFrame = CFrame.new(root.Position) * tr.yaw * CFrame.Angles(0, p * TWO_PI, 0)
	elseif tr.name == "Backflip" then
		root.CFrame = CFrame.new(root.Position) * tr.yaw * CFrame.Angles(p * TWO_PI, 0, 0)
		if weld then
			weld.C0 = base * CFrame.Angles(0, p * TWO_PI, 0)
		end
	end
	if p >= 1 then
		completeTrick()
	end
end

local function board()
	return Config.getBoard(state.data and state.data.equipped or "basic")
end

local function playShot(name)
	Rider.play(name)
	state.anim = name
	remotes.AnimState:FireServer(name)
end

local function onLand()
	local tr = state.trick
	if tr then
		if tr.t / tr.dur >= 0.8 then
			completeTrick() -- почти докрутил — засчитываем
		else
			bail("Не докрутил трюк!")
			return
		end
	end
	state.usedDouble = false
	if state.airTime > 0.3 then
		Sounds.play("Land", 1, math.clamp(state.airTime, 0.3, 0.8))
		if not state.bailing and not Rider.busy() then
			playShot("land")
		end
	end
	if state.airTime > 0.5 then
		local deck = boardPart("Deck")
		if deck then
			UI.landBurst(deck.Position)
		end
	end
end

-- ---------- трамплины ----------
local function launch(kick)
	if not root or not hum or state.bailing then
		return
	end
	if os.clock() - state.lastKick < 0.8 then
		return
	end
	state.lastKick = os.clock()
	local power = kick:GetAttribute("Power") or 80
	local v = root.AssemblyLinearVelocity
	local horiz = Vector3.new(v.X, 0, v.Z)
	if horiz.Magnitude < 25 then
		local look = kick.CFrame.LookVector * Vector3.new(1, 0, 1)
		if look.Magnitude > 0.01 then
			horiz = look.Unit * math.max(state.speed, 30)
		end
	end
	hum:ChangeState(Enum.HumanoidStateType.Freefall)
	root.AssemblyLinearVelocity = horiz + Vector3.new(0, power, 0)
	Sounds.play("Jump", 0.8)
	addEntryChecked("Air")
	questEvent("kick")
	if kick:GetAttribute("Mega") then
		questEvent("mega")
		UI.floatText("МЕГА-ПРЫЖОК!", Color3.fromRGB(255, 80, 200))
	end
end

local function hookKicker(kick)
	kick.Touched:Connect(function(hit)
		if char and hit:IsDescendantOf(char) then
			launch(kick)
		end
	end)
end
for _, k in ipairs(CollectionService:GetTagged("Kicker")) do
	hookKicker(k)
end
CollectionService:GetInstanceAddedSignal("Kicker"):Connect(hookKicker)

-- ---------- лава ----------
local function hookLava(lava)
	lava.Touched:Connect(function(hit)
		if char and hit:IsDescendantOf(char) and not state.bailing then
			bail("Горячо! Лава!")
			local zoneIndex = math.max(1, state.zone)
			task.delay(1.2, function()
				if root and root.Parent then
					root.CFrame = CFrame.new(0, 5, -(zoneIndex - 1) * Config.ZoneLength - 18)
					root.AssemblyLinearVelocity = Vector3.zero
				end
			end)
		end
	end)
end
for _, l in ipairs(CollectionService:GetTagged("Lava")) do
	hookLava(l)
end
CollectionService:GetInstanceAddedSignal("Lava"):Connect(hookLava)

-- ---------- ускорители ----------
local function hookBoost(pad)
	pad.Touched:Connect(function(hit)
		if char and hit:IsDescendantOf(char) and not state.bailing then
			if os.clock() > state.boostUntil - 1.5 then
				UI.floatText("УСКОРЕНИЕ!", Color3.fromRGB(0, 230, 255), 0.9)
				Sounds.play("Jump", 1.4, 0.4)
			end
			state.boostUntil = os.clock() + 2.5 * (board().ability == "boostMaster" and 2 or 1)
			local maxSpeed = player:GetAttribute("MaxSpeed") or Config.Speed.Base
			state.speed = math.max(state.speed, maxSpeed)
		end
	end)
end
for _, p in ipairs(CollectionService:GetTagged("Boost")) do
	hookBoost(p)
end
CollectionService:GetInstanceAddedSignal("Boost"):Connect(hookBoost)

-- ---------- витрина досок в лобби ----------
local lastBlink = 0
local beltStripes = {}
for i, st in ipairs(CollectionService:GetTagged("BeltStripe")) do
	st:SetAttribute("Phase", (i % 6) * 2.2)
	beltStripes[st] = st:GetAttribute("BeltZ") or st.Position.Z
end

local showDecks = {}
local function addShowDeck(d)
	showDecks[d] = d:IsA("Model") and d:GetPivot() or d.CFrame
end
for _, d in ipairs(CollectionService:GetTagged("ShowDeck")) do
	addShowDeck(d)
end
CollectionService:GetInstanceAddedSignal("ShowDeck"):Connect(addShowDeck)

local function refreshStands()
	local data = state.data
	if not data then
		return
	end
	for _, stand in ipairs(CollectionService:GetTagged("BoardStand")) do
		local id = stand:GetAttribute("BoardId")
		local b = Config.getBoard(id)
		local owned = (b.pass and data.passes[b.pass]) or data.boards[id]
		local status
		if data.equipped == id then
			status = "✅ НАДЕТА"
		elseif owned then
			status = "Нажми E — надеть"
		elseif b.pass then
			status = "👑 за робуксы"
		else
			status = Config.formatNumber(b.price) .. " 💰"
		end
		local info = stand:FindFirstChild("Info")
		local label = info and info:FindFirstChild("Text")
		if label then
			label.Text = string.format("%s\n⚡x%.2f  •  %s", b.name, b.speed, status)
		end
		local prompt = stand:FindFirstChildOfClass("ProximityPrompt")
		if prompt then
			prompt.ActionText = owned and "Надеть" or (b.pass and "Подробнее" or "Купить")
		end
	end
end

-- ---------- ворота зон ----------
local function zoneReady(idx)
	local data = state.data
	local z = Config.Zones[idx]
	return data and z and idx == data.maxZone + 1 and data.level >= z.level and data.coins >= z.cost
end

local function refreshGates()
	local maxZone = state.data and state.data.maxZone or 1
	for _, gate in ipairs(CollectionService:GetTagged("Gate")) do
		local idx = gate:GetAttribute("ZoneIndex") or 99
		local open = idx <= maxZone
		local ready = zoneReady(idx)
		gate.CanCollide = not open
		gate.Transparency = open and 1 or 0.2
		gate.Color = ready and Color3.fromRGB(80, 230, 120) or (Config.Zones[idx] and Config.Zones[idx].accent or gate.Color)
		for _, g in ipairs(gate:GetChildren()) do
			if g:IsA("SurfaceGui") then
				g.Enabled = not open
				local t = g:FindFirstChildOfClass("TextLabel")
				local z = Config.Zones[idx]
				if t and z then
					if ready then
						t.Text = string.format("✅ %s\nВсё готово! Въезжай в ворота — откроются за %s 💰", z.name, Config.formatNumber(z.cost))
					else
						t.Text = string.format("🔒 %s\nУровень %d  •  %s 💰  •  монеты x%s", z.name, z.level, Config.formatNumber(z.cost), tostring(z.mult))
					end
				end
			end
		end
	end
end

local function hookGate(gate)
	gate.Touched:Connect(function(hit)
		if not char or not hit:IsDescendantOf(char) then
			return
		end
		local idx = gate:GetAttribute("ZoneIndex")
		local maxZone = state.data and state.data.maxZone or 1
		if idx and idx > maxZone and os.clock() > state.gateCooldown then
			state.gateCooldown = os.clock() + 3
			if zoneReady(idx) then
				-- всё выполнено: открываем сразу
				task.spawn(function()
					if request("UnlockZone", idx) then
						Sounds.play("LevelUp", 1)
						UI.floatText("ВОРОТА ОТКРЫТЫ!", Color3.fromRGB(80, 230, 120), 1.3)
					end
				end)
			else
				UI.openZones()
			end
		end
	end)
end
for _, g in ipairs(CollectionService:GetTagged("Gate")) do
	hookGate(g)
end
CollectionService:GetInstanceAddedSignal("Gate"):Connect(function(g)
	hookGate(g)
	refreshGates()
end)

-- ---------- звёзды ----------
local stars = {}
local function addStar(s)
	stars[s] = { base = s.CFrame, phase = math.random() * TWO_PI, hiddenUntil = 0 }
end
for _, s in ipairs(CollectionService:GetTagged("Pickup")) do
	addStar(s)
end
CollectionService:GetInstanceAddedSignal("Pickup"):Connect(addStar)

remotes.PickupTaken.OnClientEvent:Connect(function(s, cooldown, coins)
	local info = stars[s]
	if info then
		info.hiddenUntil = os.clock() + cooldown
		s.Transparency = 1
		for _, ch in ipairs(s:GetChildren()) do
			if ch:IsA("PointLight") or ch:IsA("ParticleEmitter") or ch:IsA("SurfaceGui") then
				ch.Enabled = false
			end
		end
	end
	UI.floatText("+" .. Config.formatNumber(coins) .. " 💰", Color3.fromRGB(255, 220, 60))
	Sounds.play("Coin", 1.2, 0.4)
end)

-- ---------- зоны: свет и гравитация ----------
local function enterZone(i)
	state.zone = i
	local zone = Config.Zones[i]
	local l = zone.light
	TweenService:Create(Lighting, TweenInfo.new(1.5), {
		ClockTime = l.clock,
		Brightness = l.brightness,
		FogColor = l.fog,
		FogEnd = l.fogEnd,
		Ambient = l.ambient,
		OutdoorAmbient = l.ambient,
	}):Play()
	workspace.Gravity = zone.gravity
	local atm = Lighting:FindFirstChild("SkateAtmosphere")
	if atm then
		TweenService:Create(atm, TweenInfo.new(1.5), { Haze = l.haze or 1, Color = l.fog }):Play()
	end
	local cc = Lighting:FindFirstChild("SkateColor")
	if cc then
		TweenService:Create(cc, TweenInfo.new(1.5), { TintColor = l.tint or Color3.new(1, 1, 1) }):Play()
	end
	Sounds.setZoneMusic(i)
	UI.zoneBanner(i)
end

-- ---------- персонаж ----------
local function onCharacter(c)
	char = c
	hum = c:WaitForChild("Humanoid")
	root = c:WaitForChild("HumanoidRootPart")
	hum.UseJumpPower = true
	state.combo = {}
	state.trick = nil
	state.queued = nil
	state.bailing = false
	state.grinding = false
	state.inAir = false
	state.speed = 0
	UI.comboEnd(nil)
	-- выключаем стандартную анимацию бега: на доске её заменяет поза скейтера
	task.spawn(function()
		local animate = c:WaitForChild("Animate", 10)
		if animate and animate:IsA("LocalScript") then
			animate.Enabled = false
		end
	end)
	-- выключаем стандартный звук шагов: мы же на доске
	task.spawn(function()
		local running = root:WaitForChild("Running", 10)
		if running and running:IsA("Sound") then
			running.Volume = 0
			running:GetPropertyChangedSignal("Volume"):Connect(function()
				if running.Volume ~= 0 then
					running.Volume = 0
				end
			end)
		end
	end)
	-- встаёт на доску, как только она появилась
	c.ChildAdded:Connect(function(ch)
		if ch.Name == "Skateboard" then
			task.wait(0.05)
			playShot("mount")
		end
	end)
	if c:FindFirstChild("Skateboard") then
		playShot("mount")
	end
	-- олли при прыжке
	hum.StateChanged:Connect(function(_, new)
		if new == Enum.HumanoidStateType.Jumping and not state.bailing then
			state.ollieT = os.clock()
			if not state.trick then
				playShot("ollie")
			end
			Sounds.play("Jump", 1.1, 0.5)
		end
	end)
	hum.Died:Connect(function()
		if #state.combo > 0 then
			remotes.ComboBailed:FireServer(state.combo)
		end
		state.combo = {}
		UI.comboEnd(false)
	end)
end
if player.Character then
	task.spawn(onCharacter, player.Character)
end
player.CharacterAdded:Connect(onCharacter)

-- ---------- ввод ----------
-- двойной прыжок
UserInputService.JumpRequest:Connect(function()
	if not hum or not root or state.bailing or not state.inAir or state.usedDouble then
		return
	end
	if state.airTime < 0.2 or board().ability ~= "doubleJump" then
		return
	end
	state.usedDouble = true
	local vel = root.AssemblyLinearVelocity
	local jp = player:GetAttribute("JumpPower") or Config.BaseJump
	root.AssemblyLinearVelocity = Vector3.new(vel.X, jp * 0.9, vel.Z)
	state.ollieT = os.clock()
	playShot("ollie")
	UI.floatText("ДВОЙНОЙ ПРЫЖОК!", Color3.fromRGB(0, 255, 210), 0.8)
	Sounds.play("Jump", 1.4, 0.5)
end)

-- монеты с беговой дорожки
remotes:WaitForChild("AfkCoins").OnClientEvent:Connect(function(coins)
	UI.floatText("+" .. Config.formatNumber(coins) .. " 💰", Color3.fromRGB(255, 220, 60), 0.7)
end)

UserInputService.InputBegan:Connect(function(input, processed)
	if processed then
		return
	end
	for _, b in ipairs(Config.TrickButtons) do
		if input.KeyCode == b.key then
			startTrick(b.trick)
			return
		end
	end
end)

-- ---------- главный цикл ----------
local rayParams = RaycastParams.new()
rayParams.FilterType = Enum.RaycastFilterType.Exclude

local camera = workspace.CurrentCamera
local zoneCheck = 0

RunService.Heartbeat:Connect(function(dt)
	local t = os.clock()

	-- звёзды покачиваются
	for s, info in pairs(stars) do
		if s.Parent then
			if info.hiddenUntil > 0 and t > info.hiddenUntil then
				info.hiddenUntil = 0
				s.Transparency = 0
				for _, ch in ipairs(s:GetChildren()) do
					if ch:IsA("PointLight") or ch:IsA("ParticleEmitter") or ch:IsA("SurfaceGui") then
						ch.Enabled = true
					end
				end
			end
			-- монета крутится и покачивается
			s.CFrame = CFrame.new(info.base.Position + Vector3.new(0, math.sin(t * 2.5 + info.phase) * 0.6, 0)) * CFrame.Angles(0, t * 2.2 + info.phase, 0) * info.base.Rotation
		else
			stars[s] = nil
		end
	end

	for d, base in pairs(showDecks) do
		if d.Parent then
			local cf = CFrame.new(base.Position + Vector3.new(0, math.sin(t * 2) * 0.5, 0)) * CFrame.Angles(0, t * 1.2, 0) * base.Rotation
			if d:IsA("Model") then
				d:PivotTo(cf)
			else
				d.CFrame = cf
			end
		else
			showDecks[d] = nil
		end
	end
	-- фонарики на мега-трамплинах мигают
	if math.floor(t * 2) ~= lastBlink then
		lastBlink = math.floor(t * 2)
		for _, bulb in ipairs(CollectionService:GetTagged("BlinkBulb")) do
			bulb.Transparency = ((bulb:GetAttribute("Blink") or 0) + lastBlink) % 2 == 0 and 0 or 0.6
		end
	end
	-- лента беговых дорожек едет
	for stripe, z in pairs(beltStripes) do
		if stripe.Parent then
			local offset = ((t * 6 + stripe:GetAttribute("Phase")) % 13) - 6.5
			stripe.CFrame = CFrame.new(stripe.Position.X, stripe.Position.Y, z + offset)
		else
			beltStripes[stripe] = nil
		end
	end

	if not hum or not root or hum.Health <= 0 or not root.Parent then
		return
	end

	-- в каком мы состоянии
	local nowAir = hum.FloorMaterial == Enum.Material.Air
	if nowAir then
		if not state.inAir then
			state.inAir = true
			state.airTime = 0
			if state.queued and t - state.queued.time < 0.5 then
				local name = state.queued.name
				state.queued = nil
				startTrick(name)
			end
		end
		state.airTime += dt
	elseif state.inAir then
		state.inAir = false
		if not state.bailing then
			onLand()
		end
	end
	if state.queued and t - state.queued.time > 0.5 then
		state.queued = nil
	end

	if not state.bailing then
		updateTrick(dt)
	end

	local v = root.AssemblyLinearVelocity
	local flat = Vector3.new(v.X, 0, v.Z).Magnitude

	-- перила (стоя на месте грайнд не считается)
	local _, offset = boardBase()
	rayParams.FilterDescendantsInstances = { char }
	local hit = not state.bailing and workspace:Raycast(root.Position, Vector3.new(0, -(offset + 1.4), 0), rayParams)
	local onRail = hit and hit.Instance:GetAttribute("Rail") == true and flat > 8
	local sparks = boardPart("Sparks")
	if onRail then
		if not state.grinding then
			state.grinding = true
			state.grindTick = 0
			addEntryChecked("Rail")
			questEvent("rail")
		end
		state.grindTick += dt
		if state.grindTick >= 0.25 then
			state.grindTick -= 0.25
			addEntryChecked("Grind")
		end
		-- магнит: держим игрока по центру перил
		local railCF = hit.Instance.CFrame
		local lp = railCF:PointToObjectSpace(root.Position)
		local target = railCF:PointToWorldSpace(Vector3.new(lp.X * 0.75, lp.Y, lp.Z))
		root.CFrame = root.CFrame.Rotation + target
		state.groundTime = 0
	elseif state.grinding then
		state.grinding = false
	end
	if sparks then
		sparks.Enabled = state.grinding
	end

	-- засчитываем комбо, если долго едем по земле
	if #state.combo > 0 and not state.inAir and not state.grinding and not state.trick and not state.bailing then
		state.groundTime += dt
		UI.comboTimer(1 - state.groundTime / Config.Combo.BankDelay)
		if state.groundTime >= Config.Combo.BankDelay then
			bank()
		end
	elseif #state.combo > 0 then
		UI.comboTimer(1)
	end

	-- разгон как на скейте
	local maxSpeed = player:GetAttribute("MaxSpeed") or Config.Speed.Base
	local jump = player:GetAttribute("JumpPower") or Config.BaseJump
	if hum.JumpPower ~= jump then
		hum.JumpPower = jump
	end
	-- ограничение скорости из настроек (если слишком быстро)
	local limit = (state.data and state.data.settings and state.data.settings.speedLimit or 100) / 100
	maxSpeed *= limit
	local boosted = t < state.boostUntil
	local cap = maxSpeed * (state.grinding and 1.2 or 1) * (boosted and 1.45 or 1)
	local startSpeed = maxSpeed * Config.Speed.StartFraction
	if state.bailing then
		state.speed = startSpeed * 0.5
	elseif hum.MoveDirection.Magnitude > 0.1 then
		state.speed = math.max(state.speed, startSpeed)
		if state.speed < cap then
			state.speed = math.min(cap, state.speed + maxSpeed * Config.Speed.Accel * dt)
		else
			state.speed = math.max(cap, state.speed - maxSpeed * 0.8 * dt)
		end
	else
		state.speed = math.max(startSpeed, state.speed - maxSpeed * 1.2 * dt)
	end
	hum.WalkSpeed = state.speed

	-- наклон в поворотах (доска и тело)
	local yawRate = root.AssemblyAngularVelocity.Y
	local targetLean = state.inAir and 0 or math.clamp(yawRate * 0.06, -0.35, 0.35)
	state.lean += (targetLean - state.lean) * math.min(1, dt * 8)
	if not state.trick and not state.bailing then
		local weld = getWeld()
		if weld then
			-- олли: нос доски подпрыгивает вверх
			local pop = 0
			local since = t - state.ollieT
			if since < 0.3 then
				pop = math.sin(since / 0.3 * math.pi) * 0.45
			end
			weld.C0 = boardBase() * CFrame.Angles(pop, 0, -state.lean * 0.6)
		end
	end

	-- парение: держи прыжок в воздухе
	if state.inAir and board().ability == "glide" and hum.Jump and state.airTime > 0.25 then
		local vel = root.AssemblyLinearVelocity
		if vel.Y < -14 then
			root.AssemblyLinearVelocity = Vector3.new(vel.X, -14, vel.Z)
		end
	end

	-- поза скейтера для анимации
	local anim
	if state.bailing then
		anim = "bail"
	elseif state.trick then
		anim = state.trick.name
	elseif state.grinding then
		anim = "grind"
	elseif state.inAir then
		anim = "air"
	else
		anim = "ride"
	end
	Rider.setLocal(anim, state.lean)
	if anim ~= state.anim and not Rider.busy() then
		state.anim = anim
		remotes.AnimState:FireServer(anim)
	end
	Sounds.setRoll(flat, not state.inAir and not state.bailing)

	-- камера и след
	local targetFov = 70 + math.clamp((flat - 25) / 120, 0, 1) * 25 + (boosted and 8 or 0)
	camera.FieldOfView += (targetFov - camera.FieldOfView) * math.min(1, dt * 4)
	local trail = boardPart("BoardTrail")
	if trail then
		trail.Enabled = flat > 25 or state.inAir
	end
	UI.setSpeed(flat)

	-- зона
	zoneCheck -= dt
	if zoneCheck <= 0 then
		zoneCheck = 0.4
		local i = math.clamp(math.floor(-root.Position.Z / Config.ZoneLength) + 1, 1, #Config.Zones)
		if i ~= state.zone then
			enterZone(i)
		end
	end
end)

-- ---------- данные с сервера ----------
remotes.DataChanged.OnClientEvent:Connect(function(snap)
	local first = state.data == nil
	local prevLevel = state.data and state.data.level
	state.data = snap
	UI.setData(snap)
	refreshGates()
	refreshStands()
	task.defer(questFromData)
	if snap.settings then
		Sounds.setEnabled(snap.settings.sfx ~= false, snap.settings.music ~= false)
	end
	if prevLevel and snap.level > prevLevel then
		Sounds.play("LevelUp", 1.3)
	end
	if first and snap.level <= 1 and snap.coins == 0 then
		UI.tutorial()
	end
end)

remotes.ComboResult.OnClientEvent:Connect(function(coins, xp, record, mult)
	UI.comboResult(coins, xp, record, mult)
	if mult and mult >= 2 then
		questEvent("combo2")
	end
	if mult and mult >= 5 then
		questEvent("combo5")
	end
	Sounds.play("Coin", 1 + math.clamp((mult or 1) / 20, 0, 0.5))
end)

remotes.Notify.OnClientEvent:Connect(function(text, kind)
	UI.toast(text, kind)
end)

UI.init({
	Config = Config,
	request = request,
	buy = buy,
	onTrick = startTrick,
	sounds = Sounds,
	getData = function()
		return state.data
	end,
})
