-- Строит всю карту кодом: 6 зон с трамплинами, перилами, звёздами и декором.
-- Хочешь поменять карту — меняй функции ниже или достраивай руками в Studio
-- поверх (то, что построено руками, скрипт не трогает).

local CollectionService = game:GetService("CollectionService")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("SkateShared")
local Config = require(Shared:WaitForChild("Config"))

local World = {}

local L = Config.ZoneLength
local W = Config.ZoneWidth

local root -- папка Workspace.SkateWorld

-- ---------- helpers ----------

local function part(props, parent)
	local p = Instance.new(props.ClassName or "Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for k, v in pairs(props) do
		if k ~= "ClassName" then
			p[k] = v
		end
	end
	p.Parent = parent
	return p
end

local function zoneStartZ(i)
	return -(i - 1) * L
end

function World.zoneSpawn(i)
	return CFrame.new(0, 4, zoneStartZ(i) - 18) * CFrame.Angles(0, 0, 0)
end

-- Номер зоны по позиции (зоны идут вдоль -Z)
function World.zoneAt(position)
	local i = math.floor(-position.Z / L) + 1
	return math.clamp(i, 1, #Config.Zones)
end

-- Наклонная плита-рампа. Поднимается в сторону -Z (вперёд по ходу игры).
-- x,z — середина нижнего края, height — высота верхнего края.
local function ramp(parent, x, z, width, height, angleDeg, props)
	local a = math.rad(angleDeg)
	local len = height / math.sin(a)
	local depth = len * math.cos(a)
	local cf = CFrame.new(x, height / 2 - 0.5 * math.cos(a), z - depth / 2) * CFrame.Angles(a, 0, 0)
	local p = part({
		Name = "Ramp",
		Size = Vector3.new(width, 1, len),
		CFrame = cf,
		Color = props.Color,
		Material = props.Material or Enum.Material.Wood,
	}, parent)
	-- опора под высоким краем
	part({
		Name = "Support",
		Size = Vector3.new(width, height, 2),
		CFrame = CFrame.new(x, height / 2 - 0.5, z - depth + 1),
		Color = props.SupportColor or Color3.fromRGB(90, 90, 95),
		Material = Enum.Material.Metal,
	}, parent)
	return p, depth
end

local function kicker(parent, x, z, width, power, color)
	local p = ramp(parent, x, z, width, 3.2, 26, { Color = color, Material = Enum.Material.SmoothPlastic })
	p.Name = "Kicker"
	p:SetAttribute("Power", power)
	CollectionService:AddTag(p, "Kicker")
	-- неоновая полоска на краю, чтобы было видно трамплин
	local a = math.rad(26)
	local len = 3.2 / math.sin(a)
	part({
		Name = "KickerStripe",
		Size = Vector3.new(width, 1.05, 0.8),
		CFrame = p.CFrame * CFrame.new(0, 0.02, -len / 2 + 0.4),
		Color = Color3.fromRGB(255, 255, 255),
		Material = Enum.Material.Neon,
		CanCollide = false,
		CanQuery = false,
	}, parent)
	-- стрелка на земле перед трамплином
	part({
		Name = "Arrow",
		Size = Vector3.new(width * 0.6, 0.1, 3),
		CFrame = CFrame.new(x, 0.06, z + 6),
		Color = color,
		Material = Enum.Material.Neon,
		CanCollide = false,
		CanQuery = false,
		Transparency = 0.3,
	}, parent)
	return p
end

local function rail(parent, x, z, length, height, accent)
	height = height or 2.4
	local r = part({
		Name = "Rail",
		Size = Vector3.new(1.6, 0.5, length),
		CFrame = CFrame.new(x, height, z - length / 2),
		Color = Color3.fromRGB(200, 200, 210),
		Material = Enum.Material.DiamondPlate,
	}, parent)
	r:SetAttribute("Rail", true)
	CollectionService:AddTag(r, "Rail")
	-- светящаяся кромка
	part({
		Name = "RailGlow",
		Size = Vector3.new(0.4, 0.2, length),
		CFrame = r.CFrame * CFrame.new(0, -0.35, 0),
		Color = accent,
		Material = Enum.Material.Neon,
		CanCollide = false,
		CanQuery = false,
	}, parent)
	local posts = math.max(2, math.floor(length / 12))
	for k = 0, posts do
		local pz = z - (length * k / posts)
		part({
			Name = "RailPost",
			Size = Vector3.new(0.6, height, 0.6),
			CFrame = CFrame.new(x, height / 2 - 0.2, pz),
			Color = Color3.fromRGB(70, 70, 75),
			Material = Enum.Material.Metal,
			CanQuery = false,
		}, parent)
	end
	-- низкий заезд на перила
	ramp(parent, x, z + 7, 4, height - 0.3, 18, { Color = Color3.fromRGB(110, 110, 115), Material = Enum.Material.Metal })
	return r
end

local function funbox(parent, x, z, color, accent)
	local h, len, w = 3, 18, 22
	local _, d = ramp(parent, x, z, w, h, 20, { Color = color })
	local boxZ = z - d - len / 2
	part({
		Name = "Funbox",
		Size = Vector3.new(w, h, len),
		CFrame = CFrame.new(x, h / 2, boxZ),
		Color = color,
		Material = Enum.Material.Concrete,
	}, parent)
	-- спуск с другой стороны (развёрнутая рампа)
	local a = math.rad(20)
	local rl = h / math.sin(a)
	local rd = rl * math.cos(a)
	part({
		Name = "RampDown",
		Size = Vector3.new(w, 1, rl),
		CFrame = CFrame.new(x, h / 2 - 0.5 * math.cos(a), boxZ - len / 2 - rd / 2) * CFrame.Angles(-a, 0, 0),
		Color = color,
		Material = Enum.Material.Wood,
	}, parent)
	-- перила на фанбоксе
	local r = part({
		Name = "Rail",
		Size = Vector3.new(1.6, 0.5, len - 2),
		CFrame = CFrame.new(x, h + 1.4, boxZ),
		Color = Color3.fromRGB(220, 220, 230),
		Material = Enum.Material.DiamondPlate,
	}, parent)
	r:SetAttribute("Rail", true)
	CollectionService:AddTag(r, "Rail")
	part({
		Name = "RailGlow",
		Size = Vector3.new(0.4, 0.2, len - 2),
		CFrame = r.CFrame * CFrame.new(0, -0.35, 0),
		Color = accent,
		Material = Enum.Material.Neon,
		CanCollide = false,
		CanQuery = false,
	}, parent)
end

-- Мега-рампа: долгий подъём, большой трамплин наверху и площадка для приземления
local function megaRamp(parent, x, z, zone)
	local height = 16
	local _, d = ramp(parent, x, z, 30, height, 17, { Color = zone.accent:Lerp(Color3.new(1, 1, 1), 0.3), Material = Enum.Material.SmoothPlastic })
	local topZ = z - d
	part({
		Name = "MegaTop",
		Size = Vector3.new(30, height, 14),
		CFrame = CFrame.new(x, height / 2 - 0.5, topZ - 7),
		Color = Color3.fromRGB(80, 80, 90),
		Material = Enum.Material.Metal,
	}, parent)
	local k = part({
		Name = "Kicker",
		Size = Vector3.new(30, 1, 8),
		CFrame = CFrame.new(x, height + 1.2, topZ - 13) * CFrame.Angles(math.rad(28), 0, 0),
		Color = zone.accent,
		Material = Enum.Material.Neon,
	}, parent)
	k:SetAttribute("Power", 125)
	k:SetAttribute("Mega", true)
	CollectionService:AddTag(k, "Kicker")
	-- табличка
	local sign = part({
		Name = "MegaSign",
		Size = Vector3.new(30, 5, 1),
		CFrame = CFrame.new(x, height + 8, topZ - 14),
		Transparency = 1,
		CanCollide = false,
		CanQuery = false,
	}, parent)
	local bb = Instance.new("BillboardGui")
	bb.Size = UDim2.fromScale(18, 4)
	bb.AlwaysOnTop = false
	bb.LightInfluence = 0
	bb.Parent = sign
	local t = Instance.new("TextLabel")
	t.Size = UDim2.fromScale(1, 1)
	t.BackgroundTransparency = 1
	t.Text = "МЕГА-ТРАМПЛИН"
	t.TextScaled = true
	t.Font = Enum.Font.GothamBlack
	t.TextColor3 = Color3.new(1, 1, 1)
	t.TextStrokeTransparency = 0
	t.Parent = bb
	return topZ - 17
end

local function star(parent, pos, value)
	local s = part({
		Name = "Star",
		Shape = Enum.PartType.Ball,
		Size = Vector3.new(2.6, 2.6, 2.6),
		CFrame = CFrame.new(pos),
		Color = Color3.fromRGB(255, 215, 0),
		Material = Enum.Material.Neon,
		CanCollide = false,
		CanQuery = false,
	}, parent)
	s:SetAttribute("Value", value)
	CollectionService:AddTag(s, "Pickup")
	local light = Instance.new("PointLight")
	light.Color = s.Color
	light.Range = 8
	light.Brightness = 1.5
	light.Parent = s
	return s
end

-- ---------- декор по темам ----------

local function tree(parent, x, z, rng)
	local h = rng:NextNumber(8, 14)
	part({ Name = "Trunk", Shape = Enum.PartType.Cylinder, Size = Vector3.new(h, 1.6, 1.6), CFrame = CFrame.new(x, h / 2, z) * CFrame.Angles(0, 0, math.rad(90)), Color = Color3.fromRGB(110, 75, 45), Material = Enum.Material.Wood, CanQuery = false }, parent)
	local r = rng:NextNumber(6, 9)
	part({ Name = "Leaves", Shape = Enum.PartType.Ball, Size = Vector3.new(r, r, r), CFrame = CFrame.new(x, h + r * 0.3, z), Color = Color3.fromRGB(60, rng:NextInteger(140, 190), 60), Material = Enum.Material.Grass, CanCollide = false, CanQuery = false }, parent)
end

local function palm(parent, x, z, rng)
	local h = rng:NextNumber(12, 18)
	part({ Name = "PalmTrunk", Shape = Enum.PartType.Cylinder, Size = Vector3.new(h, 1.3, 1.3), CFrame = CFrame.new(x, h / 2, z) * CFrame.Angles(0, 0, math.rad(90 + rng:NextNumber(-8, 8))), Color = Color3.fromRGB(150, 110, 70), Material = Enum.Material.Wood, CanQuery = false }, parent)
	for k = 1, 6 do
		local ang = k * math.pi / 3
		part({ Name = "PalmLeaf", Size = Vector3.new(1.5, 0.3, 8), CFrame = CFrame.new(x, h, z) * CFrame.Angles(0, ang, 0) * CFrame.new(0, 0, -3.5) * CFrame.Angles(math.rad(-25), 0, 0), Color = Color3.fromRGB(40, 170, 70), Material = Enum.Material.Grass, CanCollide = false, CanQuery = false }, parent)
	end
end

local function building(parent, x, z, rng, accent)
	local w = rng:NextNumber(18, 30)
	local d = rng:NextNumber(18, 30)
	local h = rng:NextNumber(40, 110)
	part({ Name = "Building", Size = Vector3.new(w, h, d), CFrame = CFrame.new(x, h / 2, z), Color = Color3.fromRGB(25, 25, 35), Material = Enum.Material.Concrete, CanQuery = false }, parent)
	local colors = { accent, Color3.fromRGB(0, 220, 255), Color3.fromRGB(255, 230, 120) }
	local side = x > 0 and -1 or 1
	for row = 1, math.floor(h / 8) do
		if rng:NextNumber() < 0.7 then
			part({ Name = "Window", Size = Vector3.new(0.3, 2.5, d * 0.8), CFrame = CFrame.new(x + side * (w / 2 + 0.1), row * 8 - 2, z), Color = colors[rng:NextInteger(1, #colors)], Material = Enum.Material.Neon, CanCollide = false, CanQuery = false }, parent)
		end
	end
end

local function crystal(parent, x, z, rng)
	local h = rng:NextNumber(8, 22)
	part({ Name = "Crystal", Size = Vector3.new(h * 0.3, h, h * 0.3), CFrame = CFrame.new(x, h / 2 - 1, z) * CFrame.Angles(math.rad(rng:NextNumber(-20, 20)), rng:NextNumber(0, 6), math.rad(rng:NextNumber(-20, 20))), Color = Color3.fromRGB(140, 220, 255), Material = Enum.Material.Glass, Transparency = 0.25, CanQuery = false }, parent)
end

local function rock(parent, x, z, rng, color)
	local s = rng:NextNumber(5, 14)
	part({ Name = "Rock", Size = Vector3.new(s, s * 0.8, s), CFrame = CFrame.new(x, s * 0.3, z) * CFrame.Angles(rng:NextNumber(0, 1), rng:NextNumber(0, 6), rng:NextNumber(0, 1)), Color = color, Material = Enum.Material.Slate, CanQuery = false }, parent)
end

local function lavaPool(parent, x, z, rng)
	local w = rng:NextNumber(10, 18)
	local d = rng:NextNumber(10, 18)
	local lava = part({ Name = "Lava", Size = Vector3.new(w, 0.3, d), CFrame = CFrame.new(x, 0.1, z), Color = Color3.fromRGB(255, 90, 0), Material = Enum.Material.Neon, CanCollide = false, CanQuery = false }, parent)
	CollectionService:AddTag(lava, "Lava")
	local fire = Instance.new("ParticleEmitter")
	fire.Color = ColorSequence.new(Color3.fromRGB(255, 160, 0), Color3.fromRGB(255, 40, 0))
	fire.LightEmission = 1
	fire.Size = NumberSequence.new(1.5, 0)
	fire.Lifetime = NumberRange.new(0.6, 1.2)
	fire.Rate = 12
	fire.Speed = NumberRange.new(4, 8)
	fire.SpreadAngle = Vector2.new(20, 20)
	fire.EmissionDirection = Enum.NormalId.Top
	fire.Parent = lava
end

local function planet(parent, pos, size, color)
	part({ Name = "Planet", Shape = Enum.PartType.Ball, Size = Vector3.new(size, size, size), CFrame = CFrame.new(pos), Color = color, Material = Enum.Material.SmoothPlastic, CanCollide = false, CanQuery = false }, parent)
end

local function decorate(folder, i, zone, rng)
	local z0 = zoneStartZ(i)
	local theme = zone.theme
	local edge = W / 2
	for k = 1, 14 do
		local z = z0 - k * (L / 15)
		for _, side in ipairs({ -1, 1 }) do
			local x = side * (edge + rng:NextNumber(8, 30))
			if theme == "park" then
				tree(folder, x, z, rng)
			elseif theme == "city" then
				building(folder, side * (edge + 20), z, rng, zone.accent)
			elseif theme == "beach" then
				if side == 1 then
					palm(folder, x, z, rng)
				end
			elseif theme == "ice" then
				crystal(folder, x, z, rng)
			elseif theme == "volcano" then
				rock(folder, x, z, rng, Color3.fromRGB(60, 45, 40))
			end
		end
	end

	if theme == "park" then
		-- трава по краям
		for _, side in ipairs({ -1, 1 }) do
			part({ Name = "Grass", Size = Vector3.new(60, 1, L), CFrame = CFrame.new(side * (edge + 30), -0.4, z0 - L / 2), Color = Color3.fromRGB(80, 170, 70), Material = Enum.Material.Grass }, folder)
		end
	elseif theme == "city" then
		-- разметка дороги
		for k = 1, 20 do
			part({ Name = "RoadLine", Size = Vector3.new(0.8, 0.05, 8), CFrame = CFrame.new(0, 0.03, z0 - k * (L / 21)), Color = Color3.fromRGB(255, 220, 0), Material = Enum.Material.Neon, CanCollide = false, CanQuery = false }, folder)
		end
		for _, side in ipairs({ -1, 1 }) do
			part({ Name = "Sidewalk", Size = Vector3.new(60, 1, L), CFrame = CFrame.new(side * (edge + 30), -0.3, z0 - L / 2), Color = Color3.fromRGB(70, 70, 80), Material = Enum.Material.Concrete }, folder)
		end
	elseif theme == "beach" then
		part({ Name = "Sea", Size = Vector3.new(400, 1, L), CFrame = CFrame.new(-(edge + 200), -0.8, z0 - L / 2), Color = Color3.fromRGB(0, 160, 220), Material = Enum.Material.Glass, Transparency = 0.2, CanQuery = false }, folder)
		part({ Name = "Sand", Size = Vector3.new(80, 1, L), CFrame = CFrame.new(edge + 40, -0.4, z0 - L / 2), Color = zone.floor, Material = Enum.Material.Sand }, folder)
	elseif theme == "ice" then
		for _, side in ipairs({ -1, 1 }) do
			part({ Name = "CanyonWall", Size = Vector3.new(30, 70, L), CFrame = CFrame.new(side * (edge + 25), 35, z0 - L / 2), Color = Color3.fromRGB(170, 210, 240), Material = Enum.Material.Glacier, CanQuery = false }, folder)
		end
	elseif theme == "volcano" then
		local vz = z0 - L / 2
		for k = 0, 5 do
			local r = 160 - k * 25
			part({ Name = "Volcano", Shape = Enum.PartType.Cylinder, Size = Vector3.new(20, r, r), CFrame = CFrame.new(edge + 160, 10 + k * 20, vz) * CFrame.Angles(0, 0, math.rad(90)), Color = Color3.fromRGB(70 - k * 5, 45, 40), Material = Enum.Material.Basalt, CanQuery = false }, folder)
		end
		part({ Name = "Crater", Shape = Enum.PartType.Cylinder, Size = Vector3.new(2, 30, 30), CFrame = CFrame.new(edge + 160, 130, vz) * CFrame.Angles(0, 0, math.rad(90)), Color = Color3.fromRGB(255, 80, 0), Material = Enum.Material.Neon, CanQuery = false }, folder)
		for _ = 1, 7 do
			lavaPool(folder, rng:NextNumber(-edge + 15, edge - 15), z0 - rng:NextNumber(50, L - 40), rng)
		end
	elseif theme == "space" then
		planet(folder, Vector3.new(-260, 120, z0 - 120), 120, Color3.fromRGB(255, 120, 80))
		planet(folder, Vector3.new(300, 200, z0 - 300), 200, Color3.fromRGB(80, 140, 255))
		planet(folder, Vector3.new(-200, 260, z0 - 380), 60, Color3.fromRGB(200, 255, 200))
		-- неоновая сетка на полу
		for k = 1, 12 do
			part({ Name = "Grid", Size = Vector3.new(W, 0.05, 0.4), CFrame = CFrame.new(0, 0.03, z0 - k * (L / 13)), Color = zone.accent, Material = Enum.Material.Neon, CanCollide = false, CanQuery = false }, folder)
		end
		-- летающие платформы со звёздами
		for k = 1, 6 do
			local px = rng:NextNumber(-edge + 20, edge - 20)
			local pz = z0 - rng:NextNumber(60, L - 60)
			local py = rng:NextNumber(14, 26)
			part({ Name = "FloatPad", Size = Vector3.new(14, 1, 14), CFrame = CFrame.new(px, py, pz), Color = zone.accent, Material = Enum.Material.Neon }, folder)
			star(folder, Vector3.new(px, py + 4, pz), Config.Star.Value * 3)
		end
	end
end

-- ---------- зона целиком ----------

local function buildZone(i)
	local zone = Config.Zones[i]
	local folder = Instance.new("Folder")
	folder.Name = string.format("Zone%d_%s", i, zone.name)
	folder.Parent = root

	local rng = Random.new(i * 7919)
	local z0 = zoneStartZ(i)
	local edge = W / 2

	-- пол
	part({
		Name = "Floor",
		Size = Vector3.new(W, 4, L),
		CFrame = CFrame.new(0, -2, z0 - L / 2),
		Color = zone.floor,
		Material = zone.floorMaterial,
	}, folder)

	-- невидимые бортики, чтобы не выпадать
	for _, side in ipairs({ -1, 1 }) do
		part({
			Name = "Border",
			Size = Vector3.new(2, 60, L),
			CFrame = CFrame.new(side * (edge + 1), 30, z0 - L / 2),
			Transparency = 1,
			CanQuery = false,
		}, folder)
		part({
			Name = "BorderGlow",
			Size = Vector3.new(1, 1, L),
			CFrame = CFrame.new(side * edge, 0.5, z0 - L / 2),
			Color = zone.accent,
			Material = Enum.Material.Neon,
			CanQuery = false,
		}, folder)
	end

	-- ворота в начале зоны (кроме первой)
	if i > 1 then
		local gate = part({
			Name = "Gate",
			Size = Vector3.new(W, 50, 2),
			CFrame = CFrame.new(0, 25, z0),
			Color = zone.accent,
			Material = Enum.Material.ForceField,
			Transparency = 0.2,
		}, folder)
		gate:SetAttribute("ZoneIndex", i)
		CollectionService:AddTag(gate, "Gate")
		for _, face in ipairs({ Enum.NormalId.Front, Enum.NormalId.Back }) do
			local sg = Instance.new("SurfaceGui")
			sg.Face = face
			sg.CanvasSize = Vector2.new(1700, 500)
			sg.LightInfluence = 0
			sg.Parent = gate
			local t = Instance.new("TextLabel")
			t.Size = UDim2.fromScale(1, 0.6)
			t.Position = UDim2.fromScale(0, 0.2)
			t.BackgroundTransparency = 1
			t.TextScaled = true
			t.Font = Enum.Font.GothamBlack
			t.TextColor3 = Color3.new(1, 1, 1)
			t.TextStrokeTransparency = 0
			t.Text = string.format("🔒 %s\nУровень %d  •  %s 💰  •  монеты x%s", zone.name:upper(), zone.level, Config.formatNumber(zone.cost), tostring(zone.mult))
			t.Parent = sg
		end
	end

	-- препятствия рядами
	local lanes = { -52, 0, 52 }
	local z = z0 - 40
	local rowIndex = 0
	local megaAt = math.floor(L * 0.55)
	local megaDone = false
	while z > z0 - L + 40 do
		rowIndex += 1
		if not megaDone and (z0 - z) >= megaAt then
			z = megaRamp(folder, 0, z, zone) - 30
			megaDone = true
			-- звёзды в воздухе после мега-трамплина
			for k = 1, 5 do
				star(folder, Vector3.new(0, 26 + k * 2, z + 10 - k * 9), Config.Star.Value * 2)
			end
		else
			for _, x in ipairs(lanes) do
				local roll = rng:NextNumber()
				local jitter = rng:NextNumber(-8, 8)
				if roll < 0.32 then
					kicker(folder, x + jitter, z, 12, rng:NextNumber(70, 90), zone.accent)
					star(folder, Vector3.new(x + jitter, rng:NextNumber(12, 18), z - 16), Config.Star.Value)
				elseif roll < 0.58 then
					rail(folder, x + jitter, z, rng:NextInteger(26, 44), nil, zone.accent)
				elseif roll < 0.74 then
					funbox(folder, x + jitter, z, zone.floor:Lerp(Color3.new(1, 1, 1), 0.25), zone.accent)
				elseif roll < 0.9 then
					star(folder, Vector3.new(x + jitter, 3, z), Config.Star.Value)
					star(folder, Vector3.new(x + jitter, 3, z - 8), Config.Star.Value)
				end
			end
			z -= rng:NextNumber(48, 62)
		end
	end

	decorate(folder, i, zone, rng)

	-- финишная надпись в конце зоны
	if i == #Config.Zones then
		part({
			Name = "EndWall",
			Size = Vector3.new(W, 60, 2),
			CFrame = CFrame.new(0, 30, z0 - L),
			Color = zone.accent,
			Material = Enum.Material.ForceField,
			Transparency = 0.3,
		}, folder)
	end
end

-- Если карта уже лежит в Workspace (ты её построила и сохранила), скрипт её НЕ трогает.
-- Чтобы построить карту заново, удали папку Workspace → SkateWorld.
function World.build()
	local existing = workspace:FindFirstChild("SkateWorld")
	if existing then
		return existing
	end
	root = Instance.new("Folder")
	root.Name = "SkateWorld"
	root.Parent = workspace

	for i = 1, #Config.Zones do
		buildZone(i)
	end

	-- точка появления
	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "SkateSpawn"
	spawn.Anchored = true
	spawn.Neutral = true
	spawn.Duration = 0
	spawn.Size = Vector3.new(12, 1, 12)
	spawn.CFrame = CFrame.new(0, 0.5, -12)
	spawn.Color = Config.Zones[1].accent
	spawn.Material = Enum.Material.Neon
	spawn.TopSurface = Enum.SurfaceType.Smooth
	spawn.Parent = root

	-- стенка позади старта
	part({
		Name = "BackWall",
		Size = Vector3.new(W, 60, 2),
		CFrame = CFrame.new(0, 30, 1),
		Transparency = 1,
	}, root)

	return root
end

return World
