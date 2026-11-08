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

-- ---------- состояние по персонажам ----------
local rigs = {} -- [character] = { motors = {}, current = {}, phase = 0 }

local function getRig(char)
	local r = rigs[char]
	if r then
		return r
	end
	local hum = char:FindFirstChildOfClass("Humanoid")
	if not hum or hum.RigType ~= Enum.HumanoidRigType.R15 then
		return nil
	end
	local motors = {}
	for joint, partName in pairs(JOINTS) do
		local p = char:FindFirstChild(partName)
		local m = p and p:FindFirstChild(joint)
		if m and m:IsA("Motor6D") then
			motors[joint] = m
		end
	end
	if not motors.Root then
		return nil
	end
	r = { motors = motors, current = {}, phase = 0, hum = hum }
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

local function targetFor(char, r, isLocal, dt)
	local state = isLocal and localState or (char:GetAttribute("SkateAnim") or "ride")
	local root = char:FindFirstChild("HumanoidRootPart")
	local hum = r.hum
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
	if lean ~= 0 then
		local copy = table.clone(pose)
		copy.Root = pose.Root * A(0, 0, lean)
		return copy
	end
	return pose
end

function Rider.step(dt)
	local me = Players.LocalPlayer
	local alpha = dt > 0 and (1 - math.exp(-dt * 14)) or 0
	for _, player in ipairs(Players:GetPlayers()) do
		local char = player.Character
		if char and char:FindFirstChild("Skateboard") then
			local r = getRig(char)
			if r and r.hum.Health > 0 then
				local target = targetFor(char, r, player == me, dt)
				for joint, m in pairs(r.motors) do
					local goal = target[joint] or CFrame.new()
					local cur = r.current[joint] or CFrame.new()
					cur = cur:Lerp(goal, alpha)
					r.current[joint] = cur
					m.Transform = cur
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
RunService.Stepped:Connect(function(_, dt)
	stopDefaultAnimations()
	Rider.step(dt)
end)
RunService:BindToRenderStep("SkateRiderPose", Enum.RenderPriority.Character.Value + 5, function()
	Rider.step(0)
end)

return Rider
