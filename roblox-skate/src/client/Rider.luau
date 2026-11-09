-- ============================================================
--  Анимация скейтера кодом (без загрузки файлов анимаций).
--  Каждый кадр ставим суставы персонажа в нужную позу:
--  стойка боком, полуприсед, толчок ногой, наклон в поворотах,
--  отдельные позы для трюков и падения.
--  Работает для всех игроков на сервере, у кого есть доска.
--  Только для персонажей R15 (стандарт Roblox).
-- ============================================================

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local Rider = {}

local rad = math.rad
local A = CFrame.Angles

local JOINTS = {
	Root = "LowerTorso",
	Waist = "UpperTorso",
	Neck = "Head",
	LeftHip = "LeftUpperLeg",
	LeftKnee = "LeftLowerLeg",
	LeftAnkle = "LeftFoot",
	RightHip = "RightUpperLeg",
	RightKnee = "RightLowerLeg",
	RightAnkle = "RightFoot",
	LeftShoulder = "LeftUpperArm",
	LeftElbow = "LeftLowerArm",
	LeftWrist = "LeftHand",
	RightShoulder = "RightUpperArm",
	RightElbow = "RightLowerArm",
	RightWrist = "RightHand",
}

-- Поза собирается из «присед», «разворот корпуса», рук и ног.
-- crouch — насколько присели (0..1), spread — ширина стойки,
-- armsUp/armsOut — руки, tuck — колени к груди.
local function buildPose(p)
	local crouch = p.crouch or 0.3
	local th = rad(10 + 45 * crouch) -- угол бедра
	local drop = 1.9 * (1 - math.cos(th)) -- опускаем таз ровно настолько, чтобы ступни остались на доске
	local spread = rad(p.spread or 14)
	local tuck = rad(p.tuck or 0)
	local yaw = rad(p.yaw or 80) -- стойка боком
	local lean = p.lean or 0
	local armsOut = rad(p.armsOut or 35)
	local armsFwd = rad(p.armsFwd or 0)
	local pose = {
		Root = CFrame.new(0, -drop, 0) * A(0, yaw, 0) * A(rad(p.bend or 8), 0, lean),
		Waist = A(rad(p.chest or 10), rad(p.twist or -35), 0),
		Neck = A(rad(p.look or -5), rad(p.head or -40), 0),
		LeftHip = A(th + tuck, 0, -spread),
		LeftKnee = A(-2 * th - tuck * 1.4, 0, 0),
		LeftAnkle = A(th * 0.9, 0, spread),
		RightHip = A(th + tuck, 0, spread),
		RightKnee = A(-2 * th - tuck * 1.4, 0, 0),
		RightAnkle = A(th * 0.9, 0, -spread),
		LeftShoulder = A(armsFwd, 0, -armsOut),
		LeftElbow = A(rad(p.elbow or 15), 0, 0),
		LeftWrist = CFrame.new(),
		RightShoulder = A(armsFwd, 0, armsOut),
		RightElbow = A(rad(p.elbow or 15), 0, 0),
		RightWrist = CFrame.new(),
	}
	if p.override then
		for k, v in pairs(p.override) do
			pose[k] = v
		end
	end
	return pose
end

local POSES = {
	ride = { crouch = 0.3 },
	air = { crouch = 0.55, armsOut = 60, tuck = 15 },
	grind = { crouch = 0.45, armsOut = 75, spread = 16 },
	Kickflip = { crouch = 0.6, tuck = 45, armsOut = 80, armsFwd = 20 },
	Spin = { crouch = 0.4, armsOut = 95, tuck = 10 },
	Grab = {
		crouch = 0.75,
		tuck = 50,
		armsOut = 30,
		override = { RightShoulder = A(rad(-30), 0, rad(15)), RightElbow = A(rad(5), 0, 0) },
	},
	Backflip = { crouch = 0.8, tuck = 70, armsFwd = 70, armsOut = 10, elbow = 70, chest = 25 },
	bail = { crouch = 0.1, armsOut = 140, spread = 30, chest = -25, look = -30, bend = -10 },
}

local built = {}
for name, p in pairs(POSES) do
	built[name] = buildPose(p)
end

-- ---------- позы для коротких анимаций ----------
-- стоит прямо, лицом вперёд (до того как встать на доску)
local STAND = buildPose({ crouch = 0, yaw = 0, spread = 5, armsOut = 8, twist = 0, head = 0, bend = 0, chest = 0, look = 0, elbow = 8 })
-- заносит ногу на доску
local STEP = buildPose({ crouch = 0.1, yaw = 30, spread = 6, armsOut = 30, twist = -10, head = -20, bend = 4 })
STEP.RightHip = A(rad(55), 0, rad(8))
STEP.RightKnee = A(rad(-70), 0, 0)
STEP.RightAnkle = A(rad(15), 0, 0)
-- олли: глубокий присед и толчок вверх
local OLLIE_DOWN = buildPose({ crouch = 0.85, armsOut = 25, armsFwd = 25, chest = 22 })
local OLLIE_UP = buildPose({ crouch = 0.25, tuck = 40, armsOut = 70, armsFwd = -10, chest = 0, look = -15 })
-- приземление: пружиним
local LAND = buildPose({ crouch = 0.9, armsOut = 45, chest = 25 })

local function lerpPose(a, b, t)
	local out = {}
	for joint, cf in pairs(a) do
		out[joint] = cf:Lerp(b[joint] or cf, t)
	end
	return out
end

local function smooth(t)
	return t * t * (3 - 2 * t)
end

local ONE_SHOT = { mount = 0.9, ollie = 0.38, land = 0.25 }

local function oneShotPose(name, p)
	if name == "mount" then
		if p < 0.3 then
			return STAND
		elseif p < 0.65 then
			return lerpPose(STAND, STEP, smooth((p - 0.3) / 0.35))
		end
		return lerpPose(STEP, built.ride, smooth((p - 0.65) / 0.35))
	elseif name == "ollie" then
		if p < 0.35 then
			return lerpPose(built.ride, OLLIE_DOWN, smooth(p / 0.35))
		elseif p < 0.7 then
			return lerpPose(OLLIE_DOWN, OLLIE_UP, smooth((p - 0.35) / 0.35))
		end
		return lerpPose(OLLIE_UP, built.air, smooth((p - 0.7) / 0.3))
	elseif name == "land" then
		if p < 0.4 then
			return lerpPose(built.ride, LAND, smooth(p / 0.4))
		end
		return lerpPose(LAND, built.ride, smooth((p - 0.4) / 0.6))
	end
	return built.ride
end

-- бег на беговой дорожке (без доски)
local function runPose(phase)
	local s = math.sin(phase)
	local pose = buildPose({ crouch = 0.05, yaw = 0, spread = 3, twist = 0, head = 0, bend = 6, chest = 6, look = 0 })
	pose.Root = CFrame.new(0, -0.05 + math.abs(math.cos(phase)) * 0.15, 0) * A(rad(6), 0, 0)
	pose.LeftHip = A(rad(40 * s), 0, 0)
	pose.RightHip = A(rad(-40 * s), 0, 0)
	pose.LeftKnee = A(rad(-10 - 45 * math.max(0, -s)), 0, 0)
	pose.RightKnee = A(rad(-10 - 45 * math.max(0, s)), 0, 0)
	pose.LeftAnkle = CFrame.new()
	pose.RightAnkle = CFrame.new()
	pose.LeftShoulder = A(rad(-45 * s), 0, rad(-8))
	pose.RightShoulder = A(rad(45 * s), 0, rad(8))
	pose.LeftElbow = A(rad(60), 0, 0)
	pose.RightElbow = A(rad(60), 0, 0)
	return pose
end

local localShot = nil -- { name, start, dur } для своего персонажа
function Rider.play(name)
	local dur = ONE_SHOT[name]
	if dur then
		localShot = { name = name, start = os.clock(), dur = dur }
	end
end

function Rider.busy()
	return localShot ~= nil and os.clock() - localShot.start < localShot.dur
end

-- Толчок ногой: задняя нога опускается к земле и уходит назад
local function pushPose(phase)
	local base = buildPose({ crouch = 0.4 })
	local s = math.sin(phase)
	local down = math.max(0, s)
	base.RightHip = A(rad(10 - 45 * s), 0, rad(14))
	base.RightKnee = A(rad(-20 - 25 * (1 - down)), 0, 0)
	base.RightAnkle = A(rad(20), 0, 0)
	base.LeftHip = A(rad(45), 0, rad(-12))
	base.LeftKnee = A(rad(-80), 0, 0)
	base.LeftAnkle = A(rad(35), 0, 0)
	base.LeftShoulder = A(rad(25 * s), 0, rad(-25))
	base.RightShoulder = A(rad(-25 * s), 0, rad(25))
	base.Waist = A(rad(18), rad(-60), 0)
	base.Root = CFrame.new(0, -0.55, 0) * A(0, rad(70), 0) * A(rad(12), 0, 0)
	return base
end

-- Суставы старых аватаров R6 (у них нет коленей и локтей)
local JOINTS_R6 = {
	Root = { "HumanoidRootPart", "RootJoint" },
	Neck = { "Torso", "Neck" },
	LeftHip = { "Torso", "Left Hip" },
	RightHip = { "Torso", "Right Hip" },
	LeftShoulder = { "Torso", "Left Shoulder" },
	RightShoulder = { "Torso", "Right Shoulder" },
}

-- ---------- состояние по персонажам ----------
local rigs = {} -- [character] = { motors = {}, current = {}, phase = 0 }

local function getRig(char)
	local r = rigs[char]
	if r then
		return r
	end
	local hum = char:FindFirstChildOfClass("Humanoid")
	if not hum then
		return nil
	end
	local isR6 = hum.RigType == Enum.HumanoidRigType.R6
	local motors = {}
	if isR6 then
		for joint, path in pairs(JOINTS_R6) do
			local p = char:FindFirstChild(path[1])
			local m = p and p:FindFirstChild(path[2])
			if m and m:IsA("Motor6D") then
				motors[joint] = m
			end
		end
	else
		for joint, partName in pairs(JOINTS) do
			local p = char:FindFirstChild(partName)
			local m = p and p:FindFirstChild(joint)
			if m and m:IsA("Motor6D") then
				motors[joint] = m
			end
		end
	end
	if not motors.Root then
		return nil
	end
	-- запоминаем исходное положение суставов: позу ставим через C0,
	-- его стандартные анимации Roblox никогда не трогают
	local orig, rot, rotInv = {}, {}, {}
	for joint, m in pairs(motors) do
		orig[joint] = m.C0
		rot[joint] = m.C0.Rotation
		rotInv[joint] = m.C0.Rotation:Inverse()
	end
	print("[SkateRush] Поза скейтера включена, тип аватара:", isR6 and "R6" or "R15")
	if Players:GetPlayerFromCharacter(char) == Players.LocalPlayer then
		Players.LocalPlayer:SetAttribute("RiderStatus", "работает (" .. (isR6 and "R6" or "R15") .. ")")
	end
	r = { motors = motors, current = {}, phase = 0, hum = hum, isR6 = isR6, orig = orig, rot = rot, rotInv = rotInv }
	rigs[char] = r
	char.AncestryChanged:Connect(function(_, parent)
		if not parent then
			rigs[char] = nil
		end
	end)
	return r
end

-- Для своего персонажа состояние даёт главный скрипт (без задержки сети)
local localState = "ride"
local localLean = 0
function Rider.setLocal(state, lean)
	localState = state
	localLean = lean or 0
end

local TRICKS = { Kickflip = true, Spin = true, Grab = true, Backflip = true, bail = true }

local function targetFor(char, r, isLocal, dt)
	local state = isLocal and localState or (char:GetAttribute("SkateAnim") or "ride")
	local root = char:FindFirstChild("HumanoidRootPart")
	local hum = r.hum
	if char:GetAttribute("OnTreadmill") then
		r.phase += dt * 11
		return runPose(r.phase)
	end
	-- короткие анимации: встать на доску, олли, приземление
	if not TRICKS[state] then
		local shot
		if isLocal then
			shot = localShot
		else
			if state ~= r.lastAttr then
				r.lastAttr = state
				r.attrStart = os.clock()
			end
			if ONE_SHOT[state] then
				shot = { name = state, start = r.attrStart, dur = ONE_SHOT[state] }
			end
		end
		if shot then
			local p = (os.clock() - shot.start) / shot.dur
			if p < 1 then
				return oneShotPose(shot.name, p)
			end
			if isLocal then
				localShot = nil
			end
		end
		if not isLocal and ONE_SHOT[state] then
			state = state == "ollie" and "air" or "ride"
		end
	end
	if state == "ride" and root then
		local v = root.AssemblyLinearVelocity
		local speed = Vector3.new(v.X, 0, v.Z).Magnitude
		local moving = hum.MoveDirection.Magnitude > 0.1 or (not isLocal and speed > 4)
		local maxSpeed = hum.WalkSpeed > 0 and hum.WalkSpeed or 16
		-- толкаемся, пока не разогнались
		if moving and speed < maxSpeed * 0.92 and hum.FloorMaterial ~= Enum.Material.Air then
			r.phase += dt * 7
			r.pushing = true
			return pushPose(r.phase)
		end
		r.pushing = false
	end
	local pose = built[state] or built.ride
	local lean = isLocal and localLean or 0
	local t = os.clock()
	local copy = table.clone(pose)
	if state == "ride" or state == "grind" then
		-- лёгкое покачивание: колени пружинят, руки балансируют
		local bob = math.sin(t * 5) * 0.06
		copy.Root = pose.Root * CFrame.new(0, bob, 0)
		copy.LeftShoulder = pose.LeftShoulder * A(rad(math.sin(t * 2.2) * 8), 0, rad(math.sin(t * 1.7) * 6))
		copy.RightShoulder = pose.RightShoulder * A(rad(math.sin(t * 2.2 + 1) * 8), 0, rad(math.sin(t * 1.7 + 1) * 6))
		copy.Neck = pose.Neck * A(0, rad(math.sin(t * 0.8) * 6), 0)
	end
	if lean ~= 0 then
		copy.Root = copy.Root * A(0, 0, lean)
		copy.Waist = pose.Waist * A(0, 0, -lean * 0.5)
	end
	return copy
end

function Rider.step(dt)
	local me = Players.LocalPlayer
	local alpha = dt > 0 and (1 - math.exp(-dt * 14)) or 0
	for _, player in ipairs(Players:GetPlayers()) do
		local char = player.Character
		if char and char:FindFirstChild("Skateboard") then
			local r = getRig(char)
			-- на беговой дорожке доску прячем
			local hide = char:GetAttribute("OnTreadmill") == true
			if r and r.hidden ~= hide then
				r.hidden = hide
				for _, d in ipairs(char.Skateboard:GetDescendants()) do
					if d:IsA("BasePart") then
						d.LocalTransparencyModifier = hide and 1 or 0
					end
				end
			end
			if r and r.hum.Health > 0 then
				local target = targetFor(char, r, player == me, dt)
				for joint, m in pairs(r.motors) do
					local goal = target[joint] or CFrame.new()
					if r.isR6 then
						-- у R6 нет коленей: не опускаем таз, только наклоны
						goal = goal.Rotation
					end
					local cur = r.current[joint] or CFrame.new()
					cur = cur:Lerp(goal, alpha)
					r.current[joint] = cur
					-- поворот задан в осях тела, переводим в оси сустава
					m.C0 = r.orig[joint] * (r.rotInv[joint] * cur * r.rot[joint])
					m.Transform = CFrame.new()
				end
			end
		end
	end
end

-- Стандартный бег Roblox выключаем совсем, пока игрок на доске:
-- останавливаем все его анимации каждый кадр.
local function stopDefaultAnimations()
	for _, player in ipairs(Players:GetPlayers()) do
		local char = player.Character
		if char and char:FindFirstChild("Skateboard") then
			local hum = char:FindFirstChildOfClass("Humanoid")
			local animator = hum and hum:FindFirstChildOfClass("Animator")
			if animator then
				for _, track in ipairs(animator:GetPlayingAnimationTracks()) do
					track:Stop(0)
				end
			end
		end
	end
end

-- Позу ставим и до физики, и прямо перед отрисовкой кадра,
-- чтобы стандартные анимации точно не перебили её.
-- если что-то сломается, игра не упадёт, а в Output будет понятная строка
local warned = false
local function safeStep(dt)
	local ok, err = pcall(Rider.step, dt)
	if not ok and not warned then
		warned = true
		warn("[SkateRush] Ошибка анимации скейтера:", err)
		Players.LocalPlayer:SetAttribute("RiderStatus", "ошибка: " .. tostring(err))
	end
end
RunService.Stepped:Connect(function(_, dt)
	pcall(stopDefaultAnimations)
	safeStep(dt)
end)
RunService:BindToRenderStep("SkateRiderPose", Enum.RenderPriority.Character.Value + 5, function()
	safeStep(0)
end)

return Rider
