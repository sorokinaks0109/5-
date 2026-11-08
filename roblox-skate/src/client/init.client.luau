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

local TWO_PI = math.pi * 2

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
end

local function completeTrick()
	local tr = state.trick
	state.trick = nil
	resetTrickVisuals()
	if tr.name == "Spin" or tr.name == "Backflip" then
		root.CFrame = CFrame.new(root.Position) * tr.yaw
	end
	addEntryChecked(tr.name)
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
	addEntryChecked("Air")
	if kick:GetAttribute("Mega") then
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
			local zoneIndex = state.zone
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

-- ---------- ворота зон ----------
local function refreshGates()
	local maxZone = state.data and state.data.maxZone or 1
	for _, gate in ipairs(CollectionService:GetTagged("Gate")) do
		local idx = gate:GetAttribute("ZoneIndex") or 99
		local open = idx <= maxZone
		gate.CanCollide = not open
		gate.Transparency = open and 0.92 or 0.2
		for _, g in ipairs(gate:GetChildren()) do
			if g:IsA("SurfaceGui") then
				g.Enabled = not open
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
			UI.openZones()
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
		local light = s:FindFirstChildOfClass("PointLight")
		if light then
			light.Enabled = false
		end
	end
	UI.floatText("+" .. Config.formatNumber(coins) .. " 💰", Color3.fromRGB(255, 220, 60))
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
				local light = s:FindFirstChildOfClass("PointLight")
				if light then
					light.Enabled = true
				end
			end
			s.CFrame = info.base + Vector3.new(0, math.sin(t * 2.5 + info.phase) * 0.7, 0)
		else
			stars[s] = nil
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
	local cap = maxSpeed * (state.grinding and 1.2 or 1)
	if state.bailing then
		state.speed = maxSpeed * 0.4
	elseif hum.MoveDirection.Magnitude > 0.1 then
		state.speed = math.min(cap, math.max(state.speed, maxSpeed * 0.45) + maxSpeed * 0.7 * dt)
	else
		state.speed = math.max(maxSpeed * 0.45, state.speed - maxSpeed * 1.5 * dt)
	end
	hum.WalkSpeed = state.speed

	-- камера и след
	local targetFov = 70 + math.clamp((flat - 20) / 100, 0, 1) * 22
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
	state.data = snap
	UI.setData(snap)
	refreshGates()
	if first and snap.level <= 1 and snap.coins == 0 then
		UI.tutorial()
	end
end)

remotes.ComboResult.OnClientEvent:Connect(function(coins, xp, record)
	UI.comboResult(coins, xp, record)
end)

remotes.Notify.OnClientEvent:Connect(function(text, kind)
	UI.toast(text, kind)
end)

UI.init({
	Config = Config,
	request = request,
	buy = buy,
	onTrick = startTrick,
	getData = function()
		return state.data
	end,
})
