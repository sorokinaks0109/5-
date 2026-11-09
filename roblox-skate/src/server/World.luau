-- ============================================================
--  Строит всю карту кодом: лобби с витриной досок и 7 зон.
--  Если папка Workspace → SkateWorld уже есть (ты построила карту
--  в Studio и сохранила), скрипт её НЕ трогает — можно править руками.
--  Построить карту в Studio без запуска игры (Command Bar):
--    require(game.ServerScriptService.SkateServer.World).build()
-- ============================================================

local CollectionService = game:GetService("CollectionService")
local Lighting = game:GetService("Lighting")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("SkateShared")
local Config = require(Shared:WaitForChild("Config"))
local BoardBuilder = require(Shared:WaitForChild("BoardBuilder"))

local World = {}

local L = Config.ZoneLength
local W = Config.ZoneWidth
local LOBBY = 150 -- длина лобби (от z = 0 до z = +LOBBY)

local root

-- ---------- helpers ----------

local function part(props, parent)
	local p = Instance.new(props.ClassName or "Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Material = Enum.Material.SmoothPlastic
	if props.Shape then
		p.Shape = props.Shape
	end
	for k, v in pairs(props) do
		if k ~= "ClassName" and k ~= "Shape" then
			p[k] = v
		end
	end
	p.Parent = parent
	return p
end

local function deco(props, parent)
	props.CanCollide = props.CanCollide == true
	props.CanQuery = false
	props.CanTouch = false
	props.CastShadow = props.CastShadow ~= false
	return part(props, parent)
end

local function billboard(parent, text, size, offsetY, color)
	local bb = Instance.new("BillboardGui")
	bb.Size = UDim2.fromScale(size.X, size.Y)
	bb.StudsOffset = Vector3.new(0, offsetY or 0, 0)
	bb.LightInfluence = 0
	bb.MaxDistance = 250
	bb.Parent = parent
	local t = Instance.new("TextLabel")
	t.Name = "Text"
	t.Size = UDim2.fromScale(1, 1)
	t.BackgroundTransparency = 1
	t.Text = text
	t.TextScaled = true
	t.Font = Enum.Font.GothamBlack
	t.TextColor3 = color or Color3.new(1, 1, 1)
	t.Parent = bb
	local st = Instance.new("UIStroke")
	st.Thickness = 3
	st.Parent = t
	return bb, t
end

local function zoneStartZ(i)
	return -(i - 1) * L
end

function World.zoneSpawn(i)
	if i <= 0 then
		return CFrame.new(0, 4, LOBBY - 30)
	end
	return CFrame.new(0, 4, zoneStartZ(i) - 18)
end

function World.zoneAt(position)
	local i = math.floor(-position.Z / L) + 1
	return math.clamp(i, 1, #Config.Zones)
end

-- Наклонная плита: поднимается в сторону -Z (по ходу игры)
local function ramp(parent, x, z, width, height, angleDeg, color, material)
	local a = math.rad(angleDeg)
	local len = height / math.sin(a)
	local depth = len * math.cos(a)
	local p = part({
		Name = "Ramp",
		Size = Vector3.new(width, 1, len),
		CFrame = CFrame.new(x, height / 2 - 0.5 * math.cos(a), z - depth / 2) * CFrame.Angles(a, 0, 0),
		Color = color,
		Material = material or Enum.Material.SmoothPlastic,
	}, parent)
	part({
		Name = "Support",
		Size = Vector3.new(width, height, 2),
		CFrame = CFrame.new(x, height / 2 - 0.5, z - depth + 1),
		Color = color:Lerp(Color3.new(0, 0, 0), 0.25),
	}, parent)
	return p, depth
end

-- Изогнутый трамплин как в скейт-парке: несколько секций с нарастающим
-- наклоном, боковые стенки, металлическая кромка (coping) и неоновая полоса.
local WOOD = Color3.fromRGB(214, 176, 128)
local WOOD_DARK = Color3.fromRGB(150, 110, 75)
local function curvedRamp(parent, x, z, width, height, angles, surfaceColor, tag, power)
	local sumSin = 0
	for _, a in ipairs(angles) do
		sumSin += math.sin(math.rad(a))
	end
	local l = height / sumSin
	local p = Vector3.new(x, 0, z)
	local segs = {}
	for i, aDeg in ipairs(angles) do
		local a = math.rad(aDeg)
		local d = Vector3.new(0, math.sin(a), -math.cos(a))
		local up = Vector3.new(0, math.cos(a), math.sin(a))
		local center = p + d * (l / 2) - up * 0.5
		local seg = part({ Name = "RampSurface", Size = Vector3.new(width, 1, l + 0.05), CFrame = CFrame.new(center) * CFrame.Angles(a, 0, 0), Color = surfaceColor }, parent)
		-- полоски-доски на поверхности
		deco({ Name = "RampPlank", Size = Vector3.new(width - 0.6, 0.06, 0.25), CFrame = seg.CFrame * CFrame.new(0, 0.53, 0), Color = surfaceColor:Lerp(Color3.new(0, 0, 0), 0.18), CastShadow = false }, parent)
		local pEnd = p + d * l
		-- заполнение и боковые стенки
		local hMid = (p.Y + pEnd.Y) / 2
		local depth = l * math.cos(a)
		if hMid > 0.3 then
			deco({ Name = "RampFill", Size = Vector3.new(width - 0.4, hMid - 0.2, depth), CFrame = CFrame.new(x, (hMid - 0.2) / 2, (p.Z + pEnd.Z) / 2), Color = WOOD_DARK }, parent)
		end
		for _, sx in ipairs({ -1, 1 }) do
			deco({ Name = "RampSide", Size = Vector3.new(0.35, math.max(0.3, pEnd.Y), depth + 0.02), CFrame = CFrame.new(x + sx * (width / 2 + 0.05), math.max(0.3, pEnd.Y) / 2 - 0.05, (p.Z + pEnd.Z) / 2), Color = WOOD, CanCollide = true }, parent)
		end
		if tag and i >= #angles - 1 then
			seg.Name = "Kicker"
			seg:SetAttribute("Power", power)
			CollectionService:AddTag(seg, tag)
		end
		table.insert(segs, seg)
		p = pEnd
	end
	-- задняя стенка, металлическая кромка и неоновая полоса
	deco({ Name = "RampBack", Size = Vector3.new(width + 0.7, p.Y, 0.4), CFrame = CFrame.new(x, p.Y / 2, p.Z - 0.2), Color = WOOD, CanCollide = true }, parent)
	deco({ Name = "Coping", Shape = Enum.PartType.Cylinder, Size = Vector3.new(width + 0.6, 0.55, 0.55), CFrame = CFrame.new(x, p.Y, p.Z), Color = Color3.fromRGB(215, 220, 230), Material = Enum.Material.Metal }, parent)
	return segs, p
end

local function kicker(parent, x, z, width, power, color)
	local segs, top = curvedRamp(parent, x, z, width, 3.6, { 6, 14, 24, 34 }, color:Lerp(Color3.new(1, 1, 1), 0.35), "Kicker", power)
	deco({ Name = "KickerStripe", Size = Vector3.new(width + 0.1, 0.12, 0.6), CFrame = CFrame.new(x, top.Y - 0.25, top.Z + 0.6) * CFrame.Angles(math.rad(34), 0, 0), Color = color, Material = Enum.Material.Neon }, parent)
	for k = 0, 1 do
		deco({ Name = "Arrow", Size = Vector3.new(width * 0.5, 0.1, 2), CFrame = CFrame.new(x, 0.25, z + 4 + k * 4), Color = color, Material = Enum.Material.Neon, Transparency = 0.2 }, parent)
	end
	return segs[#segs]
end

local function rail(parent, x, z, length, accent)
	local height = 2.4
	-- невидимая «ступенька» для грайнда и красивая круглая труба поверх
	local r = part({ Name = "Rail", Size = Vector3.new(1.6, 0.5, length), CFrame = CFrame.new(x, height, z - length / 2), Transparency = 1 }, parent)
	r:SetAttribute("Rail", true)
	CollectionService:AddTag(r, "Rail")
	deco({ Name = "RailPipe", Shape = Enum.PartType.Cylinder, Size = Vector3.new(length, 0.7, 0.7), CFrame = CFrame.new(x, height + 0.05, z - length / 2) * CFrame.Angles(0, math.rad(90), 0), Color = Color3.fromRGB(225, 230, 240), Material = Enum.Material.Metal }, parent)
	deco({ Name = "RailGlow", Size = Vector3.new(0.25, 0.15, length), CFrame = CFrame.new(x, height - 0.38, z - length / 2), Color = accent, Material = Enum.Material.Neon }, parent)
	local posts = math.max(2, math.floor(length / 10))
	for k = 0, posts do
		local pz = z - length * k / posts
		deco({ Name = "RailPost", Shape = Enum.PartType.Cylinder, Size = Vector3.new(height, 0.4, 0.4), CFrame = CFrame.new(x, height / 2 - 0.2, pz) * CFrame.Angles(0, 0, math.rad(90)), Color = accent:Lerp(Color3.new(1, 1, 1), 0.3), CanCollide = true }, parent)
		deco({ Name = "RailBase", Size = Vector3.new(1.4, 0.15, 1.4), CFrame = CFrame.new(x, 0.3, pz), Color = Color3.fromRGB(120, 120, 130), Material = Enum.Material.DiamondPlate }, parent)
	end
	curvedRamp(parent, x, z + 7, 4, height - 0.3, { 8, 16, 22 }, Color3.fromRGB(205, 205, 220))
	return r
end

-- Гирлянда флажков над трассой
local function garland(parent, z, colors)
	local edge = W / 2 - 4
	for _, sx in ipairs({ -1, 1 }) do
		deco({ Name = "GarlandPole", Shape = Enum.PartType.Cylinder, Size = Vector3.new(20, 0.6, 0.6), CFrame = CFrame.new(sx * edge, 10, z) * CFrame.Angles(0, 0, math.rad(90)), Color = Color3.fromRGB(240, 240, 245), CanCollide = true }, parent)
		deco({ Name = "GarlandTop", Shape = Enum.PartType.Ball, Size = Vector3.new(1.4, 1.4, 1.4), CFrame = CFrame.new(sx * edge, 20.4, z), Color = colors[1] }, parent)
	end
	local n = 30
	for k = 0, n do
		local t = k / n
		local px = -edge + t * edge * 2
		local sag = 4 * (1 - (2 * t - 1) ^ 2)
		local py = 19.5 - sag
		if k < n then
			local t2 = (k + 1) / n
			local px2 = -edge + t2 * edge * 2
			local py2 = 19.5 - 4 * (1 - (2 * t2 - 1) ^ 2)
			local mid = Vector3.new((px + px2) / 2, (py + py2) / 2, z)
			local len = (Vector3.new(px2, py2, z) - Vector3.new(px, py, z)).Magnitude
			deco({ Name = "GarlandString", Size = Vector3.new(len, 0.12, 0.12), CFrame = CFrame.new(mid) * CFrame.Angles(0, 0, math.atan2(py2 - py, px2 - px)), Color = Color3.fromRGB(250, 250, 250), CastShadow = false }, parent)
			do
				deco({ Name = "Flag", Size = Vector3.new(1.3, 1.3, 0.08), CFrame = CFrame.new(mid.X, mid.Y - 0.9, z) * CFrame.Angles(0, 0, math.rad(45)), Color = colors[k % #colors + 1], CastShadow = false }, parent)
			end
		end
	end
end

local function funbox(parent, x, z, color, accent)
	local h, len, w = 3, 18, 22
	local _, d = ramp(parent, x, z, w, h, 20, color)
	local boxZ = z - d - len / 2
	part({ Name = "Funbox", Size = Vector3.new(w, h, len), CFrame = CFrame.new(x, h / 2, boxZ), Color = color }, parent)
	deco({ Name = "FunboxEdge", Size = Vector3.new(w + 0.2, 0.4, len + 0.2), CFrame = CFrame.new(x, h - 0.1, boxZ), Color = accent, Material = Enum.Material.Neon }, parent)
	local a = math.rad(20)
	local rl = h / math.sin(a)
	local rd = rl * math.cos(a)
	part({ Name = "RampDown", Size = Vector3.new(w, 1, rl), CFrame = CFrame.new(x, h / 2 - 0.5 * math.cos(a), boxZ - len / 2 - rd / 2) * CFrame.Angles(-a, 0, 0), Color = color }, parent)
	local r = part({ Name = "Rail", Size = Vector3.new(1.6, 0.5, len - 2), CFrame = CFrame.new(x, h + 1.4, boxZ), Color = Color3.fromRGB(235, 235, 245), Material = Enum.Material.Metal }, parent)
	r:SetAttribute("Rail", true)
	CollectionService:AddTag(r, "Rail")
end

local function boostPad(parent, x, z, color)
	local pad = part({ Name = "BoostPad", Size = Vector3.new(12, 0.3, 10), CFrame = CFrame.new(x, 0.2, z), Color = color, Material = Enum.Material.Neon, CanCollide = false }, parent)
	CollectionService:AddTag(pad, "Boost")
	for k = 0, 2 do
		deco({ Name = "Chevron", Size = Vector3.new(8 - k * 2, 0.3, 1), CFrame = CFrame.new(x, 0.42, z + 3 - k * 3), Color = Color3.new(1, 1, 1), Material = Enum.Material.Neon }, parent)
	end
	return pad
end

local function megaRamp(parent, x, z, zone)
	local height = 16
	local _, d = ramp(parent, x, z, 30, height, 17, zone.floor2:Lerp(zone.accent, 0.35))
	local topZ = z - d
	part({ Name = "MegaTop", Size = Vector3.new(30, height, 14), CFrame = CFrame.new(x, height / 2 - 0.5, topZ - 7), Color = zone.cliff }, parent)
	local k = part({ Name = "Kicker", Size = Vector3.new(30, 1, 8), CFrame = CFrame.new(x, height + 1.2, topZ - 13) * CFrame.Angles(math.rad(28), 0, 0), Color = zone.accent, Material = Enum.Material.Neon }, parent)
	k:SetAttribute("Power", 125)
	k:SetAttribute("Mega", true)
	CollectionService:AddTag(k, "Kicker")
	local sign = deco({ Name = "MegaSign", Size = Vector3.new(1, 1, 1), CFrame = CFrame.new(x, height + 9, topZ - 14), Transparency = 1 }, parent)
	billboard(sign, "МЕГА-ТРАМПЛИН", Vector2.new(20, 4), 0)
	return topZ - 17
end

local function star(parent, pos, value)
	local s = part({ Name = "Star", Shape = Enum.PartType.Ball, Size = Vector3.new(2.6, 2.6, 2.6), CFrame = CFrame.new(pos), Color = Color3.fromRGB(255, 215, 0), Material = Enum.Material.Neon, CanCollide = false, CanQuery = false }, parent)
	s:SetAttribute("Value", value)
	CollectionService:AddTag(s, "Pickup")
	return s
end

-- ---------- красивые модели из Toolbox ----------
-- Положи модель в ReplicatedStorage → SkateAssets с нужным именем
-- (например Tree_sakura, Palm, Lollipop, Cloud), и игра поставит её
-- вместо простой фигуры. Имена — в инструкции.
local function asset(name, cf, parent, ground)
	local folder = game:GetService("ReplicatedStorage"):FindFirstChild("SkateAssets")
	local src = folder and folder:FindFirstChild(name)
	if not src or not (src:IsA("Model") or src:IsA("BasePart")) then
		return false
	end
	local c = src:Clone()
	if c:IsA("BasePart") then
		c.Anchored = true
		c.CFrame = cf
		if ground then
			c.CFrame = cf + Vector3.new(0, c.Size.Y / 2, 0)
		end
	else
		for _, d in ipairs(c:GetDescendants()) do
			if d:IsA("BasePart") then
				d.Anchored = true
			end
		end
		c:PivotTo(cf)
		if ground then
			local bcf, size = c:GetBoundingBox()
			c:PivotTo(c:GetPivot() + Vector3.new(0, cf.Position.Y - (bcf.Position.Y - size.Y / 2), 0))
		end
	end
	c.Parent = parent
	return true
end

-- ---------- декор ----------

local function cloud(parent, pos, rng)
	if asset("Cloud", CFrame.new(pos) * CFrame.Angles(0, rng:NextNumber(0, 6), 0), parent, false) then
		return
	end
	for k = 1, 6 do
		local r = rng:NextNumber(10, 22)
		deco({ Name = "Cloud", Shape = Enum.PartType.Ball, Size = Vector3.new(r, r, r), CFrame = CFrame.new(pos + Vector3.new(rng:NextNumber(-16, 16), rng:NextNumber(-3, 4), rng:NextNumber(-8, 8))), Color = Color3.new(1, 1, 1), CastShadow = false }, parent)
	end
end

local function blockTree(parent, x, z, rng, leafColors, trunkColor, petals, assetName)
	if asset(assetName or "Tree_sakura", CFrame.new(x, 0, z) * CFrame.Angles(0, rng:NextNumber(0, 6), 0), parent, true) then
		return
	end
	local h = rng:NextNumber(10, 16)
	-- круглый изогнутый ствол
	local lean = rng:NextNumber(-0.15, 0.15)
	for k = 1, 3 do
		local seg = h / 3
		deco({ Name = "Trunk", Shape = Enum.PartType.Cylinder, Size = Vector3.new(seg + 0.6, 2.2 - k * 0.35, 2.2 - k * 0.35), CFrame = CFrame.new(x + lean * k * 2, (k - 0.5) * seg, z) * CFrame.Angles(0, 0, math.rad(90) + lean * k), Color = trunkColor, CanCollide = k == 1 }, parent)
	end
	-- ветки
	for _, side in ipairs({ -1, 1 }) do
		deco({ Name = "Branch", Shape = Enum.PartType.Cylinder, Size = Vector3.new(5, 0.8, 0.8), CFrame = CFrame.new(x + side * 2.2 + lean * 6, h - 1, z) * CFrame.Angles(0, 0, side * math.rad(35)), Color = trunkColor }, parent)
	end
	-- пышная круглая крона
	local canopy
	local cx = x + lean * 6
	for k = 1, 9 do
		local s = rng:NextNumber(5, 9)
		local ang = k / 9 * math.pi * 2
		local c = deco({
			Name = "Leaves",
			Shape = Enum.PartType.Ball,
			Size = Vector3.new(s, s, s),
			CFrame = CFrame.new(cx + math.cos(ang) * rng:NextNumber(2, 5), h + 1.5 + rng:NextNumber(-1, 3.5), z + math.sin(ang) * rng:NextNumber(2, 5)),
			Color = leafColors[rng:NextInteger(1, #leafColors)],
			CastShadow = true,
		}, parent)
		canopy = canopy or c
	end
	deco({ Name = "LeavesTop", Shape = Enum.PartType.Ball, Size = Vector3.new(8, 8, 8), CFrame = CFrame.new(cx, h + 5, z), Color = leafColors[1]:Lerp(Color3.new(1, 1, 1), 0.2) }, parent)
	if petals and canopy then
		local e = Instance.new("ParticleEmitter")
		e.Color = ColorSequence.new(leafColors[1])
		e.Size = NumberSequence.new(0.35)
		e.Lifetime = NumberRange.new(4, 6)
		e.Rate = 3
		e.Speed = NumberRange.new(1, 2)
		e.Acceleration = Vector3.new(1, -1.5, 0)
		e.Rotation = NumberRange.new(0, 360)
		e.RotSpeed = NumberRange.new(-90, 90)
		e.SpreadAngle = Vector2.new(180, 180)
		e.Parent = canopy
	end
end

local function waterfall(parent, x, z, top, side)
	local w = 10
	deco({ Name = "Waterfall", Size = Vector3.new(1, top, w), CFrame = CFrame.new(x, top / 2, z), Color = Color3.fromRGB(120, 210, 255), Material = Enum.Material.Glass, Transparency = 0.25, CastShadow = false }, parent)
	deco({ Name = "WaterfallShine", Size = Vector3.new(1.1, top, 2), CFrame = CFrame.new(x, top / 2, z + 2), Color = Color3.fromRGB(235, 250, 255), Material = Enum.Material.Neon, Transparency = 0.4, CastShadow = false }, parent)
	local pool = deco({ Name = "Pool", Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.4, 18, 18), CFrame = CFrame.new(x - side * 6, 0.15, z) * CFrame.Angles(0, 0, math.rad(90)), Color = Color3.fromRGB(90, 200, 255), Material = Enum.Material.Glass, Transparency = 0.2 }, parent)
	for k = 1, 4 do
		deco({ Name = "Foam", Shape = Enum.PartType.Ball, Size = Vector3.new(4, 4, 4), CFrame = CFrame.new(x - side * 2, 0.6, z + (k - 2.5) * 3), Color = Color3.new(1, 1, 1), CastShadow = false }, parent)
	end
	local e = Instance.new("ParticleEmitter")
	e.Color = ColorSequence.new(Color3.new(1, 1, 1))
	e.Size = NumberSequence.new(1.2, 0)
	e.Transparency = NumberSequence.new(0.2, 1)
	e.Lifetime = NumberRange.new(0.6, 1)
	e.Rate = 15
	e.Speed = NumberRange.new(6, 10)
	e.SpreadAngle = Vector2.new(60, 60)
	e.EmissionDirection = Enum.NormalId.Top
	e.Parent = pool
end

local function donutArch(parent, z, rng)
	local radius = 72
	local icing = ({ Color3.fromRGB(255, 130, 190), Color3.fromRGB(150, 90, 60), Color3.fromRGB(255, 255, 255), Color3.fromRGB(180, 120, 255) })[rng:NextInteger(1, 4)]
	local dough = Color3.fromRGB(240, 190, 120)
	local n = 20
	for k = 0, n do
		local a = math.pi * k / n
		local px, py = math.cos(a) * radius, math.sin(a) * radius
		local cf = CFrame.new(px, py, z) * CFrame.Angles(0, 0, a)
		deco({ Name = "Donut", Size = Vector3.new(9, 15, 15), CFrame = cf, Color = dough, CanCollide = true }, parent)
		deco({ Name = "Icing", Size = Vector3.new(4, 15.4, 15.4), CFrame = cf * CFrame.new(3.5, 0, 0), Color = icing }, parent)
		if k % 2 == 0 then
			local sprinkle = ({ Color3.fromRGB(255, 255, 255), Color3.fromRGB(255, 220, 0), Color3.fromRGB(0, 200, 255), Color3.fromRGB(255, 60, 120) })[rng:NextInteger(1, 4)]
			deco({ Name = "Sprinkle", Size = Vector3.new(0.6, 0.6, 2.4), CFrame = cf * CFrame.new(5.8, rng:NextNumber(-5, 5), rng:NextNumber(-5, 5)) * CFrame.Angles(0, rng:NextNumber(0, 3), 0), Color = sprinkle, Material = Enum.Material.Neon }, parent)
		end
	end
end

local function lollipop(parent, x, z, rng)
	if asset("Lollipop", CFrame.new(x, 0, z) * CFrame.Angles(0, rng:NextNumber(0, 6), 0), parent, true) then
		return
	end
	local h = rng:NextNumber(14, 22)
	deco({ Name = "Stick", Shape = Enum.PartType.Cylinder, Size = Vector3.new(h, 1, 1), CFrame = CFrame.new(x, h / 2, z) * CFrame.Angles(0, 0, math.rad(90)), Color = Color3.new(1, 1, 1), CanCollide = true }, parent)
	local c1 = ({ Color3.fromRGB(255, 80, 150), Color3.fromRGB(255, 200, 0), Color3.fromRGB(80, 220, 255), Color3.fromRGB(170, 100, 255) })[rng:NextInteger(1, 4)]
	deco({ Name = "Candy", Shape = Enum.PartType.Cylinder, Size = Vector3.new(2, 11, 11), CFrame = CFrame.new(x, h + 4, z) * CFrame.Angles(0, rng:NextNumber(0, 3), 0), Color = c1 }, parent)
	deco({ Name = "CandySwirl", Shape = Enum.PartType.Cylinder, Size = Vector3.new(2.2, 6, 6), CFrame = CFrame.new(x, h + 4, z) * CFrame.Angles(0, rng:NextNumber(0, 3), 0), Color = Color3.new(1, 1, 1) }, parent)
end

local function candyCane(parent, x, z)
	if asset("CandyCane", CFrame.new(x, 0, z), parent, true) then
		return
	end
	for k = 0, 7 do
		deco({ Name = "Cane", Size = Vector3.new(2, 2, 2), CFrame = CFrame.new(x, 1 + k * 2, z), Color = (k % 2 == 0) and Color3.fromRGB(255, 50, 70) or Color3.new(1, 1, 1), CanCollide = true }, parent)
	end
	for k = 1, 3 do
		deco({ Name = "Cane", Size = Vector3.new(2, 2, 2), CFrame = CFrame.new(x + k * 1.6, 16 + math.sin(k / 3 * math.pi) * 2, z), Color = (k % 2 == 0) and Color3.fromRGB(255, 50, 70) or Color3.new(1, 1, 1) }, parent)
	end
end

local function gumdrop(parent, x, z, rng)
	local s = rng:NextNumber(5, 9)
	local c = ({ Color3.fromRGB(255, 90, 160), Color3.fromRGB(120, 230, 120), Color3.fromRGB(255, 210, 60), Color3.fromRGB(110, 170, 255) })[rng:NextInteger(1, 4)]
	deco({ Name = "Gumdrop", Shape = Enum.PartType.Ball, Size = Vector3.new(s, s, s), CFrame = CFrame.new(x, s * 0.25, z), Color = c, Material = Enum.Material.Glass, Transparency = 0.1, CanCollide = true }, parent)
end

local function palm(parent, x, z, rng)
	if asset("Palm", CFrame.new(x, 0, z) * CFrame.Angles(0, rng:NextNumber(0, 6), 0), parent, true) then
		return
	end
	local h = rng:NextNumber(14, 20)
	local lean = rng:NextNumber(-0.15, 0.15)
	for k = 0, 5 do
		deco({ Name = "PalmTrunk", Size = Vector3.new(1.6, h / 6 + 0.2, 1.6), CFrame = CFrame.new(x + lean * k * 3, k * h / 6 + h / 12, z) * CFrame.Angles(0, k * 0.3, 0), Color = (k % 2 == 0) and Color3.fromRGB(170, 120, 70) or Color3.fromRGB(150, 100, 60), CanCollide = k == 0 }, parent)
	end
	local top = Vector3.new(x + lean * 15, h, z)
	for k = 1, 7 do
		local ang = k * math.pi * 2 / 7
		deco({ Name = "PalmLeaf", Size = Vector3.new(2, 0.4, 9), CFrame = CFrame.new(top) * CFrame.Angles(0, ang, 0) * CFrame.new(0, 0, -4) * CFrame.Angles(math.rad(-25), 0, 0), Color = Color3.fromRGB(40, 190, 80) }, parent)
	end
	deco({ Name = "Coconut", Shape = Enum.PartType.Ball, Size = Vector3.new(1.6, 1.6, 1.6), CFrame = CFrame.new(top - Vector3.new(0, 1, 0)), Color = Color3.fromRGB(110, 70, 40) }, parent)
end

local function umbrella(parent, x, z, rng)
	if asset("Umbrella", CFrame.new(x, 0, z), parent, true) then
		return
	end
	deco({ Name = "Pole", Size = Vector3.new(0.5, 9, 0.5), CFrame = CFrame.new(x, 4.5, z), Color = Color3.new(1, 1, 1) }, parent)
	local c = ({ Color3.fromRGB(255, 80, 80), Color3.fromRGB(0, 180, 255), Color3.fromRGB(255, 200, 0) })[rng:NextInteger(1, 3)]
	deco({ Name = "Umbrella", Shape = Enum.PartType.Cylinder, Size = Vector3.new(1, 12, 12), CFrame = CFrame.new(x, 9, z) * CFrame.Angles(0, 0, math.rad(90)), Color = c }, parent)
	deco({ Name = "UmbrellaTop", Shape = Enum.PartType.Cylinder, Size = Vector3.new(1.2, 5, 5), CFrame = CFrame.new(x, 9.3, z) * CFrame.Angles(0, 0, math.rad(90)), Color = Color3.new(1, 1, 1) }, parent)
end

local function building(parent, x, z, rng, accent)
	local w = rng:NextNumber(20, 30)
	local d = rng:NextNumber(20, 30)
	local h = rng:NextNumber(50, 130)
	deco({ Name = "Building", Size = Vector3.new(w, h, d), CFrame = CFrame.new(x, h / 2, z), Color = Color3.fromRGB(35, 30, 60), CanCollide = true }, parent)
	local colors = { accent, Color3.fromRGB(0, 230, 255), Color3.fromRGB(255, 230, 120) }
	local side = x > 0 and -1 or 1
	for row = 1, math.floor(h / 9) do
		if rng:NextNumber() < 0.75 then
			deco({ Name = "Window", Size = Vector3.new(0.3, 3, d * 0.8), CFrame = CFrame.new(x + side * (w / 2 + 0.1), row * 9 - 3, z), Color = colors[rng:NextInteger(1, #colors)], Material = Enum.Material.Neon }, parent)
		end
	end
	deco({ Name = "Roof", Size = Vector3.new(w + 1, 1, d + 1), CFrame = CFrame.new(x, h + 0.5, z), Color = accent, Material = Enum.Material.Neon }, parent)
end

local function neonArch(parent, z, color)
	for _, side in ipairs({ -1, 1 }) do
		deco({ Name = "ArchPost", Size = Vector3.new(3, 40, 3), CFrame = CFrame.new(side * 70, 20, z), Color = color, Material = Enum.Material.Neon, CanCollide = true }, parent)
	end
	deco({ Name = "ArchTop", Size = Vector3.new(143, 3, 3), CFrame = CFrame.new(0, 40, z), Color = color, Material = Enum.Material.Neon }, parent)
end

local function crystal(parent, x, z, rng)
	if asset("Crystal", CFrame.new(x, 0, z) * CFrame.Angles(0, rng:NextNumber(0, 6), 0), parent, true) then
		return
	end
	local h = rng:NextNumber(10, 26)
	deco({ Name = "Crystal", Size = Vector3.new(h * 0.3, h, h * 0.3), CFrame = CFrame.new(x, h / 2 - 1, z) * CFrame.Angles(math.rad(rng:NextNumber(-20, 20)), rng:NextNumber(0, 6), math.rad(rng:NextNumber(-20, 20))), Color = Color3.fromRGB(140, 220, 255), Material = Enum.Material.Glass, Transparency = 0.2, CanCollide = true }, parent)
end

local function snowman(parent, x, z)
	if asset("Snowman", CFrame.new(x, 0, z), parent, true) then
		return
	end
	local y = 0
	for k, s in ipairs({ 8, 6, 4 }) do
		y += s / 2
		deco({ Name = "Snow", Shape = Enum.PartType.Ball, Size = Vector3.new(s, s, s), CFrame = CFrame.new(x, y, z), Color = Color3.new(1, 1, 1), CanCollide = k == 1 }, parent)
		y += s / 2 - 0.8
	end
	deco({ Name = "Nose", Size = Vector3.new(0.6, 0.6, 2), CFrame = CFrame.new(x, y - 1.5, z + 2), Color = Color3.fromRGB(255, 140, 0) }, parent)
end

local function rock(parent, x, z, rng, color)
	if asset("Rock", CFrame.new(x, 0, z) * CFrame.Angles(0, rng:NextNumber(0, 6), 0), parent, true) then
		return
	end
	local s = rng:NextNumber(6, 15)
	deco({ Name = "Rock", Size = Vector3.new(s, s * 0.8, s), CFrame = CFrame.new(x, s * 0.3, z) * CFrame.Angles(rng:NextNumber(0, 1), rng:NextNumber(0, 6), rng:NextNumber(0, 1)), Color = color, Material = Enum.Material.Slate, CanCollide = true }, parent)
end

local function lavaPool(parent, x, z, rng)
	local w, d = rng:NextNumber(10, 18), rng:NextNumber(10, 18)
	local lava = part({ Name = "Lava", Size = Vector3.new(w, 0.3, d), CFrame = CFrame.new(x, 0.3, z), Color = Color3.fromRGB(255, 100, 0), Material = Enum.Material.Neon, CanCollide = false, CanQuery = false }, parent)
	CollectionService:AddTag(lava, "Lava")
	local fire = Instance.new("ParticleEmitter")
	fire.Color = ColorSequence.new(Color3.fromRGB(255, 170, 0), Color3.fromRGB(255, 40, 0))
	fire.LightEmission = 1
	fire.Size = NumberSequence.new(1.5, 0)
	fire.Lifetime = NumberRange.new(0.6, 1.2)
	fire.Rate = 10
	fire.Speed = NumberRange.new(4, 8)
	fire.EmissionDirection = Enum.NormalId.Top
	fire.Parent = lava
end

local function planet(parent, pos, size, color, ring)
	deco({ Name = "Planet", Shape = Enum.PartType.Ball, Size = Vector3.new(size, size, size), CFrame = CFrame.new(pos), Color = color, CastShadow = false }, parent)
	if ring then
		deco({ Name = "Ring", Shape = Enum.PartType.Cylinder, Size = Vector3.new(1, size * 1.8, size * 1.8), CFrame = CFrame.new(pos) * CFrame.Angles(0.4, 0, math.rad(90) + 0.3), Color = ring, Material = Enum.Material.Neon, Transparency = 0.4, CastShadow = false }, parent)
	end
end

-- ---------- слои пола (разная высота = ничего не мигает) ----------
local Y_STRIPE = 0.03 -- центр полос (верх 0.06)
local Y_TILE = 0.09 -- центр плиток кромки (верх 0.12)
local Y_ROAD = 0.15 -- центр дороги (верх 0.18)
local Y_MARK = 0.21 -- центр разметки и цветочков (верх 0.24)
local LAYER = 0.06

-- Ставит любой декор на высоту y (например, на верх скалы)
local function at(parent, y, fn, ...)
	local tmp = Instance.new("Folder")
	fn(tmp, ...)
	for _, d in ipairs(tmp:GetDescendants()) do
		if d:IsA("BasePart") then
			d.CFrame = d.CFrame + Vector3.new(0, y, 0)
		end
	end
	for _, ch in ipairs(tmp:GetChildren()) do
		if ch:IsA("Model") then
			ch:PivotTo(ch:GetPivot())
		end
		ch.Parent = parent
	end
	tmp:Destroy()
end

local function pick(rng, list)
	return list[rng:NextInteger(1, #list)]
end

-- ---------- новые предметы декора ----------

local function bush(parent, x, z, rng, color)
	for k = 1, 3 do
		local s = rng:NextNumber(3, 5)
		deco({ Name = "Bush", Shape = Enum.PartType.Ball, Size = Vector3.new(s, s, s), CFrame = CFrame.new(x + (k - 2) * 1.8, s * 0.35, z + rng:NextNumber(-1, 1)), Color = color }, parent)
	end
end

local function flowerPatch(parent, x, z, rng, colors)
	for _ = 1, 5 do
		local c = pick(rng, colors)
		local px, pz = x + rng:NextNumber(-3, 3), z + rng:NextNumber(-3, 3)
		deco({ Name = "Stem", Size = Vector3.new(0.2, 1, 0.2), CFrame = CFrame.new(px, 0.5, pz), Color = Color3.fromRGB(90, 170, 80), CastShadow = false }, parent)
		deco({ Name = "Flower", Shape = Enum.PartType.Ball, Size = Vector3.new(0.9, 0.9, 0.9), CFrame = CFrame.new(px, 1.1, pz), Color = c, CastShadow = false }, parent)
	end
end

local function torii(parent, z)
	local red = Color3.fromRGB(220, 70, 60)
	for _, sx in ipairs({ -1, 1 }) do
		deco({ Name = "ToriiPost", Shape = Enum.PartType.Cylinder, Size = Vector3.new(30, 3, 3), CFrame = CFrame.new(sx * 24, 15, z) * CFrame.Angles(0, 0, math.rad(90)), Color = red, CanCollide = true }, parent)
		deco({ Name = "ToriiFoot", Shape = Enum.PartType.Cylinder, Size = Vector3.new(2, 4, 4), CFrame = CFrame.new(sx * 24, 1, z) * CFrame.Angles(0, 0, math.rad(90)), Color = Color3.fromRGB(40, 35, 35) }, parent)
	end
	deco({ Name = "ToriiTop", Size = Vector3.new(62, 2.2, 3.6), CFrame = CFrame.new(0, 31, z), Color = Color3.fromRGB(40, 35, 35) }, parent)
	deco({ Name = "ToriiBeam", Size = Vector3.new(58, 2, 2.8), CFrame = CFrame.new(0, 29, z), Color = red }, parent)
	deco({ Name = "ToriiBeam2", Size = Vector3.new(52, 1.4, 2), CFrame = CFrame.new(0, 24, z), Color = red }, parent)
	deco({ Name = "ToriiPlate", Size = Vector3.new(3, 5, 2.4), CFrame = CFrame.new(0, 26.5, z), Color = Color3.fromRGB(40, 35, 35) }, parent)
end

local function lantern(parent, x, z)
	local stone = Color3.fromRGB(190, 185, 180)
	deco({ Name = "LanternBase", Size = Vector3.new(2.4, 0.6, 2.4), CFrame = CFrame.new(x, 0.3, z), Color = stone, CanCollide = true }, parent)
	deco({ Name = "LanternPole", Shape = Enum.PartType.Cylinder, Size = Vector3.new(3, 0.9, 0.9), CFrame = CFrame.new(x, 2.1, z) * CFrame.Angles(0, 0, math.rad(90)), Color = stone }, parent)
	local light = deco({ Name = "LanternLight", Size = Vector3.new(1.8, 1.6, 1.8), CFrame = CFrame.new(x, 4.4, z), Color = Color3.fromRGB(255, 220, 150), Material = Enum.Material.Neon }, parent)
	deco({ Name = "LanternRoof", Size = Vector3.new(3, 0.6, 3), CFrame = CFrame.new(x, 5.5, z) * CFrame.Angles(0, math.rad(45), 0), Color = stone }, parent)
	local pl = Instance.new("PointLight")
	pl.Color = light.Color
	pl.Range = 10
	pl.Brightness = 0.8
	pl.Parent = light
end

local function cupcake(parent, x, z, rng)
	local s = rng:NextNumber(1, 1.6)
	deco({ Name = "CupBase", Shape = Enum.PartType.Cylinder, Size = Vector3.new(4 * s, 6 * s, 6 * s), CFrame = CFrame.new(x, 2 * s, z) * CFrame.Angles(0, 0, math.rad(90)), Color = pick(rng, { Color3.fromRGB(150, 200, 255), Color3.fromRGB(255, 200, 120), Color3.fromRGB(200, 160, 255) }), CanCollide = true }, parent)
	deco({ Name = "Frosting", Shape = Enum.PartType.Ball, Size = Vector3.new(7 * s, 5 * s, 7 * s), CFrame = CFrame.new(x, 5 * s, z), Color = pick(rng, { Color3.fromRGB(255, 190, 220), Color3.fromRGB(255, 255, 255), Color3.fromRGB(180, 120, 90) }) }, parent)
	deco({ Name = "Cherry", Shape = Enum.PartType.Ball, Size = Vector3.new(1.6 * s, 1.6 * s, 1.6 * s), CFrame = CFrame.new(x, 7.6 * s, z), Color = Color3.fromRGB(230, 30, 60) }, parent)
end

local function iceCream(parent, x, z, rng)
	deco({ Name = "Cone", Shape = Enum.PartType.Cylinder, Size = Vector3.new(8, 2.4, 2.4), CFrame = CFrame.new(x, 4, z) * CFrame.Angles(0, 0, math.rad(90)), Color = Color3.fromRGB(220, 170, 100), CanCollide = true }, parent)
	deco({ Name = "ConeTop", Shape = Enum.PartType.Cylinder, Size = Vector3.new(1.2, 4, 4), CFrame = CFrame.new(x, 8.4, z) * CFrame.Angles(0, 0, math.rad(90)), Color = Color3.fromRGB(220, 170, 100) }, parent)
	for k = 1, 3 do
		deco({ Name = "Scoop", Shape = Enum.PartType.Ball, Size = Vector3.new(4.4, 4.4, 4.4), CFrame = CFrame.new(x, 9.5 + (k - 1) * 3, z), Color = pick(rng, { Color3.fromRGB(255, 180, 210), Color3.fromRGB(180, 255, 210), Color3.fromRGB(255, 245, 200), Color3.fromRGB(190, 150, 110) }) }, parent)
	end
end

local function surfboard(parent, x, z, rng)
	local c = pick(rng, { Color3.fromRGB(255, 120, 120), Color3.fromRGB(80, 200, 255), Color3.fromRGB(255, 220, 80) })
	local cf = CFrame.new(x, 4, z) * CFrame.Angles(0, rng:NextNumber(0, 3), math.rad(rng:NextNumber(-12, 12)))
	deco({ Name = "Surfboard", Size = Vector3.new(2.2, 7, 0.35), CFrame = cf, Color = c, CanCollide = true }, parent)
	deco({ Name = "SurfTip", Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.34, 2.2, 2.2), CFrame = cf * CFrame.new(0, 3.5, 0) * CFrame.Angles(0, math.rad(90), 0), Color = c }, parent)
	deco({ Name = "SurfStripe", Size = Vector3.new(0.4, 6.6, 0.4), CFrame = cf, Color = Color3.new(1, 1, 1) }, parent)
end

local function sandcastle(parent, x, z)
	local sand = Color3.fromRGB(235, 205, 140)
	deco({ Name = "Castle", Size = Vector3.new(7, 3, 7), CFrame = CFrame.new(x, 1.5, z), Color = sand, CanCollide = true }, parent)
	for _, o in ipairs({ Vector3.new(-3, 0, -3), Vector3.new(3, 0, -3), Vector3.new(-3, 0, 3), Vector3.new(3, 0, 3) }) do
		deco({ Name = "Tower", Shape = Enum.PartType.Cylinder, Size = Vector3.new(5, 2.4, 2.4), CFrame = CFrame.new(x + o.X, 2.5, z + o.Z) * CFrame.Angles(0, 0, math.rad(90)), Color = sand }, parent)
	end
	deco({ Name = "Flag", Size = Vector3.new(0.2, 3, 0.2), CFrame = CFrame.new(x, 4.5, z), Color = Color3.new(1, 1, 1) }, parent)
	deco({ Name = "FlagCloth", Size = Vector3.new(1.4, 0.9, 0.1), CFrame = CFrame.new(x + 0.7, 5.5, z), Color = Color3.fromRGB(255, 80, 80) }, parent)
end

local function lifeguard(parent, x, z)
	local wood = Color3.fromRGB(230, 230, 235)
	for _, o in ipairs({ Vector3.new(-2, 0, -2), Vector3.new(2, 0, -2), Vector3.new(-2, 0, 2), Vector3.new(2, 0, 2) }) do
		deco({ Name = "Leg", Size = Vector3.new(0.5, 8, 0.5), CFrame = CFrame.new(x + o.X, 4, z + o.Z), Color = wood, CanCollide = true }, parent)
	end
	deco({ Name = "Hut", Size = Vector3.new(6, 4, 6), CFrame = CFrame.new(x, 10, z), Color = Color3.fromRGB(255, 90, 90) }, parent)
	deco({ Name = "HutRoof", Size = Vector3.new(7, 0.6, 7), CFrame = CFrame.new(x, 12.3, z), Color = Color3.new(1, 1, 1) }, parent)
end

local function beachBall(parent, x, z, rng)
	local b = deco({ Name = "BeachBall", Shape = Enum.PartType.Ball, Size = Vector3.new(3, 3, 3), CFrame = CFrame.new(x, 1.5, z), Color = Color3.new(1, 1, 1) }, parent)
	for k = 0, 2 do
		deco({ Name = "BallStripe", Shape = Enum.PartType.Ball, Size = Vector3.new(3.06, 3.06, 1), CFrame = b.CFrame * CFrame.Angles(0, k * math.pi / 3, 0), Color = pick(rng, { Color3.fromRGB(255, 70, 70), Color3.fromRGB(60, 160, 255), Color3.fromRGB(255, 220, 0) }) }, parent)
	end
end

local function streetLamp(parent, x, z, color)
	deco({ Name = "LampPole", Size = Vector3.new(0.7, 14, 0.7), CFrame = CFrame.new(x, 7, z), Color = Color3.fromRGB(40, 40, 50), CanCollide = true }, parent)
	local arm = x > 0 and -1 or 1
	deco({ Name = "LampArm", Size = Vector3.new(4, 0.5, 0.5), CFrame = CFrame.new(x + arm * 2, 14, z), Color = Color3.fromRGB(40, 40, 50) }, parent)
	local bulb = deco({ Name = "Lamp", Size = Vector3.new(2, 0.6, 1.2), CFrame = CFrame.new(x + arm * 3.6, 13.6, z), Color = color, Material = Enum.Material.Neon }, parent)
	local pl = Instance.new("PointLight")
	pl.Color = color
	pl.Range = 18
	pl.Brightness = 1.2
	pl.Parent = bulb
end

local function neonSign(parent, x, z, text, color)
	local board = deco({ Name = "NeonSign", Size = Vector3.new(24, 9, 1), CFrame = CFrame.new(x, 30, z) * CFrame.Angles(0, x > 0 and -math.rad(90) or math.rad(90), 0), Color = Color3.fromRGB(20, 15, 35) }, parent)
	deco({ Name = "NeonFrame", Size = Vector3.new(24.6, 9.6, 0.6), CFrame = board.CFrame * CFrame.new(0, 0, 0.4), Color = color, Material = Enum.Material.Neon }, parent)
	local sg = Instance.new("SurfaceGui")
	sg.Face = Enum.NormalId.Back
	sg.CanvasSize = Vector2.new(480, 180)
	sg.LightInfluence = 0
	sg.Parent = board
	local t = Instance.new("TextLabel")
	t.Size = UDim2.fromScale(1, 1)
	t.BackgroundTransparency = 1
	t.Text = text
	t.TextScaled = true
	t.Font = Enum.Font.GothamBlack
	t.TextColor3 = color
	t.Parent = sg
end

local function pineTree(parent, x, z, rng)
	if asset("PineTree", CFrame.new(x, 0, z), parent, true) then
		return
	end
	local h = rng:NextNumber(14, 22)
	deco({ Name = "PineTrunk", Shape = Enum.PartType.Cylinder, Size = Vector3.new(4, 1.4, 1.4), CFrame = CFrame.new(x, 2, z) * CFrame.Angles(0, 0, math.rad(90)), Color = Color3.fromRGB(110, 75, 50), CanCollide = true }, parent)
	for k = 0, 3 do
		local r = (4 - k) * 3
		local y = 4 + k * (h - 4) / 4
		deco({ Name = "PineLayer", Shape = Enum.PartType.Cylinder, Size = Vector3.new(h / 5, r, r), CFrame = CFrame.new(x, y, z) * CFrame.Angles(0, 0, math.rad(90)), Color = Color3.fromRGB(50, 120, 90) }, parent)
		deco({ Name = "Snow", Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.5, r * 0.85, r * 0.85), CFrame = CFrame.new(x, y + h / 10 + 0.1, z) * CFrame.Angles(0, 0, math.rad(90)), Color = Color3.new(1, 1, 1) }, parent)
	end
end

local function igloo(parent, x, z)
	deco({ Name = "Igloo", Shape = Enum.PartType.Ball, Size = Vector3.new(14, 14, 14), CFrame = CFrame.new(x, 0, z), Color = Color3.fromRGB(240, 250, 255), CanCollide = true }, parent)
	deco({ Name = "IglooDoor", Shape = Enum.PartType.Ball, Size = Vector3.new(5, 5, 5), CFrame = CFrame.new(x + (x > 0 and -6 or 6), 0.5, z), Color = Color3.fromRGB(60, 80, 110) }, parent)
end

local function deadTree(parent, x, z, rng)
	local c = Color3.fromRGB(45, 35, 35)
	deco({ Name = "DeadTrunk", Shape = Enum.PartType.Cylinder, Size = Vector3.new(12, 1.4, 1.4), CFrame = CFrame.new(x, 6, z) * CFrame.Angles(0, 0, math.rad(90)), Color = c, CanCollide = true }, parent)
	for k = 1, 4 do
		local ang = rng:NextNumber(0, math.pi * 2)
		deco({ Name = "DeadBranch", Shape = Enum.PartType.Cylinder, Size = Vector3.new(5, 0.6, 0.6), CFrame = CFrame.new(x, 6 + k * 1.4, z) * CFrame.Angles(0, ang, math.rad(35)) * CFrame.new(2.2, 0, 0), Color = c }, parent)
	end
end

local function beacon(parent, x, z, color)
	deco({ Name = "BeaconBase", Shape = Enum.PartType.Cylinder, Size = Vector3.new(1, 5, 5), CFrame = CFrame.new(x, 0.5, z) * CFrame.Angles(0, 0, math.rad(90)), Color = Color3.fromRGB(200, 200, 220), CanCollide = true }, parent)
	deco({ Name = "BeaconPole", Size = Vector3.new(0.6, 10, 0.6), CFrame = CFrame.new(x, 6, z), Color = Color3.fromRGB(200, 200, 220) }, parent)
	deco({ Name = "BeaconLight", Shape = Enum.PartType.Ball, Size = Vector3.new(2, 2, 2), CFrame = CFrame.new(x, 11.5, z), Color = color, Material = Enum.Material.Neon }, parent)
end

local function ringPortal(parent, z, color)
	local n = 24
	local radius = 40
	for k = 0, n - 1 do
		local a = k / n * math.pi * 2
		deco({ Name = "Ring", Size = Vector3.new(3, 11, 3), CFrame = CFrame.new(math.cos(a) * radius, 30 + math.sin(a) * radius, z) * CFrame.Angles(0, 0, a), Color = color, Material = Enum.Material.Neon }, parent)
	end
end

local function rockArch(parent, z, color)
	for _, sx in ipairs({ -1, 1 }) do
		deco({ Name = "ArchRock", Size = Vector3.new(10, 34, 10), CFrame = CFrame.new(sx * 30, 17, z) * CFrame.Angles(0, 0, sx * 0.1), Color = color, Material = Enum.Material.Slate, CanCollide = true }, parent)
	end
	deco({ Name = "ArchTopRock", Size = Vector3.new(72, 8, 11), CFrame = CFrame.new(0, 35, z), Color = color, Material = Enum.Material.Slate }, parent)
end

local function lavaFall(parent, x, z, top)
	deco({ Name = "LavaFall", Size = Vector3.new(1.2, top, 8), CFrame = CFrame.new(x, top / 2, z), Color = Color3.fromRGB(255, 110, 0), Material = Enum.Material.Neon, CastShadow = false }, parent)
end

-- ---------- скалы-террасы (возвращают места на верхушках для декора) ----------
local function terraces(parent, i, zone, rng)
	local z0 = zoneStartZ(i)
	local edge = W / 2
	local step = 35
	local spots = {}
	local z = z0
	while z > z0 - L + 1 do
		for _, side in ipairs({ -1, 1 }) do
			local h1 = rng:NextNumber(6, 12)
			local h2 = h1 + rng:NextNumber(10, 22)
			local cz = z - step / 2
			deco({ Name = "Cliff", Size = Vector3.new(28, h1, step), CFrame = CFrame.new(side * (edge + 14), h1 / 2, cz), Color = zone.cliff, CanCollide = true }, parent)
			deco({ Name = "CliffTop", Size = Vector3.new(28.6, 1.5, step - 0.3), CFrame = CFrame.new(side * (edge + 14), h1 + 0.3, cz), Color = zone.cliff2 }, parent)
			deco({ Name = "Cliff", Size = Vector3.new(34, h2, step), CFrame = CFrame.new(side * (edge + 45), h2 / 2, cz), Color = zone.cliff:Lerp(Color3.new(0, 0, 0), 0.08), CanCollide = true }, parent)
			deco({ Name = "CliffTop", Size = Vector3.new(34.6, 1.5, step - 0.3), CFrame = CFrame.new(side * (edge + 45), h2 + 0.3, cz), Color = zone.cliff2 }, parent)
			table.insert(spots, { x = side * (edge + 14), y = h1 + 1.05, z = cz, side = side, low = true })
			table.insert(spots, { x = side * (edge + 45), y = h2 + 1.05, z = cz, side = side, low = false })
		end
		z -= step
	end
	return spots
end

local function floorLayers(parent, i, zone)
	local z0 = zoneStartZ(i)
	local edge = W / 2
	local tile = 10
	for k = 0, math.floor(L / tile) - 1 do
		for _, side in ipairs({ -1, 1 }) do
			for col = 0, 1 do
				local dark = (k + col) % 2 == 0
				deco({ Name = "Tile", Size = Vector3.new(tile, LAYER, tile), CFrame = CFrame.new(side * (edge - tile / 2 - col * tile), Y_TILE, z0 - k * tile - tile / 2), Color = dark and zone.accent or zone.floor2, CastShadow = false }, parent)
			end
		end
	end
	for k = 1, 13 do
		deco({ Name = "Stripe", Size = Vector3.new(W - 42, LAYER, 6), CFrame = CFrame.new(0, Y_STRIPE, z0 - k * (L / 14)), Color = zone.floor2, CastShadow = false }, parent)
	end
	-- дорога со стрелками
	deco({ Name = "Road", Size = Vector3.new(30, LAYER, L - 0.2), CFrame = CFrame.new(0, Y_ROAD, z0 - L / 2), Color = zone.floor:Lerp(Color3.new(0, 0, 0), 0.45), CastShadow = false }, parent)
	for _, side in ipairs({ -1, 1 }) do
		deco({ Name = "RoadLine", Size = Vector3.new(1, LAYER, L - 0.2), CFrame = CFrame.new(side * 15.5, Y_ROAD, z0 - L / 2), Color = Color3.new(1, 1, 1), Material = Enum.Material.Neon, CastShadow = false }, parent)
	end
	for k = 1, math.floor(L / 30) - 1 do
		for _, side in ipairs({ -1, 1 }) do
			deco({ Name = "RoadArrow", Size = Vector3.new(1.4, LAYER, 7), CFrame = CFrame.new(side * 2.5, Y_MARK, z0 - k * 30) * CFrame.Angles(0, side * math.rad(35), 0), Color = Color3.new(1, 1, 1), Material = Enum.Material.Neon, CastShadow = false }, parent)
		end
	end
end

-- мелочи на земле между препятствиями
local function scatter(parent, i, zone, rng)
	local z0 = zoneStartZ(i)
	local theme = zone.theme
	for _ = 1, 26 do
		local x = rng:NextNumber(-70, 70)
		if math.abs(x) > 18 then
			local z = z0 - rng:NextNumber(20, L - 20)
			if theme == "sakura" then
				deco({ Name = "Petals", Shape = Enum.PartType.Cylinder, Size = Vector3.new(LAYER, rng:NextNumber(2, 4), rng:NextNumber(2, 4)), CFrame = CFrame.new(x, Y_MARK, z) * CFrame.Angles(0, 0, math.rad(90)), Color = Color3.fromRGB(255, 190, 215), CastShadow = false }, parent)
			elseif theme == "candy" then
				deco({ Name = "Sprinkle", Size = Vector3.new(0.6, LAYER, 2.2), CFrame = CFrame.new(x, Y_MARK, z) * CFrame.Angles(0, rng:NextNumber(0, 3), 0), Color = pick(rng, { Color3.fromRGB(255, 255, 255), Color3.fromRGB(255, 220, 0), Color3.fromRGB(0, 200, 255), Color3.fromRGB(255, 60, 120) }), Material = Enum.Material.Neon, CastShadow = false }, parent)
			elseif theme == "beach" then
				deco({ Name = "Shell", Shape = Enum.PartType.Ball, Size = Vector3.new(1.2, 0.6, 1.2), CFrame = CFrame.new(x, 0.3, z), Color = pick(rng, { Color3.fromRGB(255, 200, 200), Color3.fromRGB(255, 240, 220) }) }, parent)
			elseif theme == "city" then
				deco({ Name = "Cone", Size = Vector3.new(1, 2, 1), CFrame = CFrame.new(x, 1, z), Color = Color3.fromRGB(255, 120, 0), CanCollide = false }, parent)
			elseif theme == "ice" then
				deco({ Name = "SnowPile", Shape = Enum.PartType.Ball, Size = Vector3.new(4, 1.6, 4), CFrame = CFrame.new(x, 0.3, z), Color = Color3.new(1, 1, 1), CastShadow = false }, parent)
			elseif theme == "volcano" then
				deco({ Name = "Ember", Shape = Enum.PartType.Ball, Size = Vector3.new(1, 0.5, 1), CFrame = CFrame.new(x, 0.25, z), Color = Color3.fromRGB(255, 120, 0), Material = Enum.Material.Neon, CastShadow = false }, parent)
			elseif theme == "space" then
				deco({ Name = "Glow", Shape = Enum.PartType.Ball, Size = Vector3.new(1.2, 1.2, 1.2), CFrame = CFrame.new(x, 0.8, z), Color = pick(rng, { Color3.fromRGB(150, 255, 255), Color3.fromRGB(255, 150, 255) }), Material = Enum.Material.Neon, CastShadow = false }, parent)
			end
		end
	end
end

local SAKURA_LEAVES = { Color3.fromRGB(255, 170, 205), Color3.fromRGB(255, 200, 225), Color3.fromRGB(250, 140, 190) }
local SAKURA_TRUNK = Color3.fromRGB(150, 80, 60)

local function decorate(folder, i, zone, rng)
	local z0 = zoneStartZ(i)
	local edge = W / 2
	local theme = zone.theme

	local spots = terraces(folder, i, zone, rng)
	floorLayers(folder, i, zone)
	scatter(folder, i, zone, rng)

	if theme ~= "space" and theme ~= "city" and theme ~= "volcano" then
		for _ = 1, 8 do
			cloud(folder, Vector3.new(rng:NextNumber(-200, 200), rng:NextNumber(70, 110), z0 - rng:NextNumber(0, L)), rng)
		end
	end

	-- верхушки скал
	for _, sp in ipairs(spots) do
		local x, z, y = sp.x + rng:NextNumber(-6, 6), sp.z + rng:NextNumber(-8, 8), sp.y
		if theme == "sakura" then
			at(folder, y, blockTree, x, z, rng, SAKURA_LEAVES, SAKURA_TRUNK, rng:NextNumber() < 0.25)
			if sp.low then
				at(folder, y, bush, sp.x + 8 * -sp.side, sp.z + 10, rng, Color3.fromRGB(110, 190, 100))
			end
		elseif theme == "candy" then
			if sp.low then
				at(folder, y, cupcake, x, z, rng)
			else
				at(folder, y, rng:NextNumber() < 0.5 and lollipop or iceCream, x, z, rng)
			end
		elseif theme == "beach" then
			at(folder, y, palm, x, z, rng)
		elseif theme == "city" then
			if not sp.low then
				at(folder, y, building, sp.x, sp.z, rng, zone.accent)
			end
		elseif theme == "ice" then
			at(folder, y, pineTree, x, z, rng)
		elseif theme == "volcano" then
			at(folder, y, deadTree, x, z, rng)
		elseif theme == "space" then
			at(folder, y, crystal, x, z, rng)
		end
	end

	-- кромка трассы
	for k = 1, 12 do
		local z = z0 - k * (L / 13)
		for _, side in ipairs({ -1, 1 }) do
			local x = side * (edge - rng:NextNumber(6, 9))
			local alt = (k + (side > 0 and 1 or 0)) % 2 == 0
			if theme == "sakura" then
				if alt then
					lantern(folder, x, z)
				else
					flowerPatch(folder, x, z, rng, { Color3.fromRGB(255, 160, 200), Color3.fromRGB(255, 255, 255), Color3.fromRGB(255, 220, 120) })
				end
			elseif theme == "candy" then
				if alt then
					candyCane(folder, x, z)
				else
					gumdrop(folder, x, z, rng)
				end
			elseif theme == "beach" then
				if k % 3 == 0 then
					sandcastle(folder, x, z)
				elseif alt then
					surfboard(folder, x, z, rng)
				else
					umbrella(folder, x, z, rng)
					beachBall(folder, x + side * -4, z + 3, rng)
				end
			elseif theme == "city" then
				streetLamp(folder, x, z, alt and zone.accent or Color3.fromRGB(0, 230, 255))
			elseif theme == "ice" then
				if alt then
					snowman(folder, x, z)
				else
					crystal(folder, x, z, rng)
				end
			elseif theme == "volcano" then
				rock(folder, x, z, rng, Color3.fromRGB(70, 50, 45))
			elseif theme == "space" then
				beacon(folder, x, z, alt and zone.accent or Color3.fromRGB(120, 255, 255))
			end
		end
	end

	-- арки над дорогой и особые штуки
	if theme == "sakura" then
		torii(folder, z0 - L * 0.2)
		torii(folder, z0 - L * 0.8)
		for k = 1, 3 do
			for _, side in ipairs({ -1, 1 }) do
				waterfall(folder, side * (edge + 1), z0 - k * (L / 4) + side * 20, 26, side)
			end
		end
	elseif theme == "candy" then
		donutArch(folder, z0 - L * 0.25, rng)
		donutArch(folder, z0 - L * 0.8, rng)
		for k = 1, 2 do
			for _, side in ipairs({ -1, 1 }) do
				waterfall(folder, side * (edge + 1), z0 - k * (L / 3) + side * 15, 26, side)
			end
		end
	elseif theme == "beach" then
		deco({ Name = "Sea", Size = Vector3.new(500, 1, L), CFrame = CFrame.new(-(edge + 300), 2, z0 - L / 2), Color = Color3.fromRGB(0, 190, 230), Material = Enum.Material.Glass, Transparency = 0.15 }, folder)
		lifeguard(folder, edge - 22, z0 - L * 0.35)
		lifeguard(folder, -edge + 22, z0 - L * 0.75)
	elseif theme == "city" then
		for k = 1, 3 do
			neonArch(folder, z0 - k * (L / 4), ({ zone.accent, Color3.fromRGB(0, 230, 255), Color3.fromRGB(255, 220, 0) })[k])
		end
		neonSign(folder, -edge - 2, z0 - L * 0.3, "SKATE ♡", zone.accent)
		neonSign(folder, edge + 2, z0 - L * 0.6, "RUSH", Color3.fromRGB(0, 230, 255))
	elseif theme == "ice" then
		igloo(folder, -edge + 20, z0 - L * 0.3)
		igloo(folder, edge - 20, z0 - L * 0.7)
		for _ = 1, 6 do
			cloud(folder, Vector3.new(rng:NextNumber(-150, 150), rng:NextNumber(60, 90), z0 - rng:NextNumber(0, L)), rng)
		end
	elseif theme == "volcano" then
		local vz = z0 - L / 2
		for k = 0, 5 do
			local r = 170 - k * 26
			deco({ Name = "Volcano", Shape = Enum.PartType.Cylinder, Size = Vector3.new(22, r, r), CFrame = CFrame.new(edge + 190, 11 + k * 22, vz) * CFrame.Angles(0, 0, math.rad(90)), Color = Color3.fromRGB(80 - k * 6, 50, 45), Material = Enum.Material.Basalt }, folder)
		end
		deco({ Name = "Crater", Shape = Enum.PartType.Cylinder, Size = Vector3.new(2, 34, 34), CFrame = CFrame.new(edge + 190, 143, vz) * CFrame.Angles(0, 0, math.rad(90)), Color = Color3.fromRGB(255, 90, 0), Material = Enum.Material.Neon }, folder)
		for _ = 1, 7 do
			lavaPool(folder, rng:NextNumber(-edge + 25, edge - 25), z0 - rng:NextNumber(50, L - 40), rng)
		end
		for k = 1, 4 do
			for _, side in ipairs({ -1, 1 }) do
				lavaFall(folder, side * (edge + 0.5), z0 - k * (L / 5) + side * 12, 24)
			end
		end
		rockArch(folder, z0 - L * 0.3, Color3.fromRGB(70, 50, 45))
		rockArch(folder, z0 - L * 0.8, Color3.fromRGB(70, 50, 45))
	elseif theme == "space" then
		planet(folder, Vector3.new(-280, 130, z0 - 120), 130, Color3.fromRGB(255, 130, 90), Color3.fromRGB(255, 220, 160))
		planet(folder, Vector3.new(320, 210, z0 - 300), 210, Color3.fromRGB(90, 150, 255), nil)
		planet(folder, Vector3.new(-220, 270, z0 - 380), 70, Color3.fromRGB(200, 255, 200), Color3.fromRGB(150, 255, 255))
		ringPortal(folder, z0 - L * 0.25, zone.accent)
		ringPortal(folder, z0 - L * 0.8, Color3.fromRGB(120, 255, 255))
		for _ = 1, 6 do
			local px, pz, py = rng:NextNumber(-edge + 25, edge - 25), z0 - rng:NextNumber(60, L - 60), rng:NextNumber(14, 26)
			part({ Name = "FloatPad", Size = Vector3.new(14, 1, 14), CFrame = CFrame.new(px, py, pz), Color = zone.accent, Material = Enum.Material.Neon }, folder)
			star(folder, Vector3.new(px, py + 4, pz), Config.Star.Value * 3)
		end
	end
end

-- ---------- зона ----------

local function buildZone(i)
	local zone = Config.Zones[i]
	local folder = Instance.new("Folder")
	folder.Name = string.format("Zone%d_%s", i, zone.name)
	folder.Parent = root

	local rng = Random.new(i * 7919)
	local z0 = zoneStartZ(i)
	local edge = W / 2

	part({ Name = "Floor", Size = Vector3.new(W, 4, L), CFrame = CFrame.new(0, -2, z0 - L / 2), Color = zone.floor }, folder)
	for _, side in ipairs({ -1, 1 }) do
		part({ Name = "Border", Size = Vector3.new(2, 80, L), CFrame = CFrame.new(side * (edge + 1), 40, z0 - L / 2), Transparency = 1, CanQuery = false }, folder)
	end

	if i > 1 then
		local gate = part({ Name = "Gate", Size = Vector3.new(W, 50, 2), CFrame = CFrame.new(0, 25, z0), Color = zone.accent, Material = Enum.Material.ForceField, Transparency = 0.2 }, folder)
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
			t.Text = string.format("🔒 %s\nУровень %d  •  %s 💰  •  монеты x%s", zone.name, zone.level, Config.formatNumber(zone.cost), tostring(zone.mult))
			t.Parent = sg
		end
	end

	local sign = deco({ Name = "ZoneSign", Size = Vector3.new(1, 1, 1), CFrame = CFrame.new(0, 40, z0 - 8), Transparency = 1 }, folder)
	billboard(sign, zone.name, Vector2.new(60, 10), 0, zone.accent:Lerp(Color3.new(1, 1, 1), 0.4))

	local lanes = { -48, 0, 48 }
	local z = z0 - 40
	local megaDone = false
	while z > z0 - L + 40 do
		if not megaDone and (z0 - z) >= L * 0.55 then
			z = megaRamp(folder, 0, z, zone) - 30
			megaDone = true
			for k = 1, 5 do
				star(folder, Vector3.new(0, 26 + k * 2, z + 10 - k * 9), Config.Star.Value * 2)
			end
		else
			for _, x in ipairs(lanes) do
				local roll = rng:NextNumber()
				local jitter = rng:NextNumber(-6, 6)
				if roll < 0.3 then
					kicker(folder, x + jitter, z, 12, rng:NextNumber(72, 92), zone.accent)
					star(folder, Vector3.new(x + jitter, rng:NextNumber(12, 18), z - 16), Config.Star.Value)
				elseif roll < 0.52 then
					rail(folder, x + jitter, z, rng:NextInteger(26, 44), zone.accent)
				elseif roll < 0.66 then
					funbox(folder, x + jitter, z, zone.floor2:Lerp(zone.accent, 0.25), zone.accent)
				elseif roll < 0.8 then
					boostPad(folder, x + jitter, z, zone.accent)
					star(folder, Vector3.new(x + jitter, 3, z - 14), Config.Star.Value)
				elseif roll < 0.92 then
					star(folder, Vector3.new(x + jitter, 3, z), Config.Star.Value)
					star(folder, Vector3.new(x + jitter, 3, z - 8), Config.Star.Value)
				end
			end
			z -= rng:NextNumber(48, 62)
		end
	end

	decorate(folder, i, zone, rng)

	-- гирлянды флажков над трассой
	local flagColors = { zone.accent, zone.floor2, Color3.new(1, 1, 1), zone.cliff2 }
	for k = 1, 5 do
		garland(folder, z0 - k * (L / 6) + 12, flagColors)
	end

	if i == #Config.Zones then
		part({ Name = "EndWall", Size = Vector3.new(W, 60, 2), CFrame = CFrame.new(0, 30, z0 - L), Color = zone.accent, Material = Enum.Material.ForceField, Transparency = 0.3 }, folder)
	end
end

-- ============================================================
--  ЛОББИ: магазин досок, беговые дорожки, обби
-- ============================================================

local PINK = Color3.fromRGB(232, 178, 196) -- приглушённый розовый
local PINK2 = Color3.fromRGB(245, 215, 225)
local GOLD = Color3.fromRGB(228, 192, 120)
local WHITE = Color3.fromRGB(252, 248, 250)

local function surfaceText(partObj, face, text, color, canvas)
	local sg = Instance.new("SurfaceGui")
	sg.Face = face
	sg.CanvasSize = canvas or Vector2.new(800, 160)
	sg.LightInfluence = 0
	sg.Parent = partObj
	local t = Instance.new("TextLabel")
	t.Size = UDim2.fromScale(1, 1)
	t.BackgroundTransparency = 1
	t.Text = text
	t.TextScaled = true
	t.Font = Enum.Font.GothamBlack
	t.TextColor3 = color
	t.Parent = sg
	local st = Instance.new("UIStroke")
	st.Thickness = 3
	st.Color = Color3.fromRGB(60, 30, 50)
	st.Parent = t
	return t
end

local function heart(parent, cf, size, color, collide)
	local r = size * 0.55
	deco({ Name = "HeartL", Shape = Enum.PartType.Ball, Size = Vector3.new(r, r, r * 0.5), CFrame = cf * CFrame.new(-size * 0.22, size * 0.15, 0), Color = color, CanCollide = collide }, parent)
	deco({ Name = "HeartR", Shape = Enum.PartType.Ball, Size = Vector3.new(r, r, r * 0.5), CFrame = cf * CFrame.new(size * 0.22, size * 0.15, 0), Color = color, CanCollide = collide }, parent)
	deco({ Name = "HeartTip", Size = Vector3.new(size * 0.46, size * 0.46, r * 0.45), CFrame = cf * CFrame.new(0, -size * 0.08, 0) * CFrame.Angles(0, 0, math.rad(45)), Color = color, CanCollide = collide }, parent)
end

local function bow(parent, cf, size, color)
	for _, sx in ipairs({ -1, 1 }) do
		deco({ Name = "BowWing", Size = Vector3.new(size * 0.5, size * 0.42, size * 0.15), CFrame = cf * CFrame.new(sx * size * 0.28, 0, 0) * CFrame.Angles(0, 0, sx * math.rad(15)), Color = color }, parent)
	end
	deco({ Name = "BowKnot", Shape = Enum.PartType.Ball, Size = Vector3.new(size * 0.24, size * 0.24, size * 0.24), CFrame = cf, Color = GOLD }, parent)
end

local function sparkles(partObj, color)
	local e = Instance.new("ParticleEmitter")
	e.Color = ColorSequence.new(color)
	e.LightEmission = 0.6
	e.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0), NumberSequenceKeypoint.new(0.5, 0.5), NumberSequenceKeypoint.new(1, 0) })
	e.Lifetime = NumberRange.new(1, 2)
	e.Rate = 4
	e.Speed = NumberRange.new(0.5, 1.5)
	e.SpreadAngle = Vector2.new(180, 180)
	e.Parent = partObj
end

-- ---------- магазин досок ----------
local function buildShop(folder)
	local x0, x1 = -84, -40 -- от задней стены до витрины
	local z0, z1 = 18, 132
	local cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
	local depth, length = x1 - x0, z1 - z0
	local H = 22
	local wall = Color3.fromRGB(250, 236, 242)

	part({ Name = "ShopFloor", Size = Vector3.new(depth, 0.6, length), CFrame = CFrame.new(cx, 0.3, cz), Color = Color3.fromRGB(205, 180, 160), Material = Enum.Material.WoodPlanks }, folder)
	part({ Name = "ShopBack", Size = Vector3.new(1, H, length), CFrame = CFrame.new(x0, H / 2, cz), Color = wall }, folder)
	for _, z in ipairs({ z0, z1 }) do
		part({ Name = "ShopSide", Size = Vector3.new(depth, H, 1), CFrame = CFrame.new(cx, H / 2, z), Color = wall }, folder)
	end
	part({ Name = "ShopRoof", Size = Vector3.new(depth + 2, 1, length + 2), CFrame = CFrame.new(cx, H + 0.5, cz), Color = PINK }, folder)
	-- фасад над входом и вывеска
	local facade = part({ Name = "ShopFacade", Size = Vector3.new(1.4, 6, length + 2), CFrame = CFrame.new(x1, H - 2, cz), Color = WHITE }, folder)
	surfaceText(facade, Enum.NormalId.Right, "♡ SKATE SHOP ♡", Color3.fromRGB(235, 120, 165), Vector2.new(1600, 90))
	-- полосатый навес
	local n = 14
	for k = 0, n - 1 do
		local z = z0 + (k + 0.5) * length / n
		deco({ Name = "Awning", Size = Vector3.new(7, 0.4, length / n), CFrame = CFrame.new(x1 + 3.2, H - 6, z) * CFrame.Angles(0, 0, math.rad(-22)), Color = k % 2 == 0 and PINK or WHITE }, folder)
		deco({ Name = "AwningScallop", Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.4, length / n, length / n), CFrame = CFrame.new(x1 + 6.4, H - 7.4, z) * CFrame.Angles(0, math.rad(90), 0), Color = k % 2 == 0 and PINK or WHITE }, folder)
	end
	-- колонны витрины
	for k = 0, 4 do
		local z = z0 + k * length / 4
		part({ Name = "ShopColumn", Shape = Enum.PartType.Cylinder, Size = Vector3.new(H - 5, 2, 2), CFrame = CFrame.new(x1, (H - 5) / 2, z) * CFrame.Angles(0, 0, math.rad(90)), Color = GOLD }, folder)
	end
	-- постеры с досками на задней стене
	for k = 0, 5 do
		local z = z0 + 10 + k * (length - 20) / 5
		deco({ Name = "PosterFrame", Size = Vector3.new(0.4, 9, 6), CFrame = CFrame.new(x0 + 0.8, 12, z), Color = GOLD }, folder)
		deco({ Name = "Poster", Size = Vector3.new(0.5, 8.2, 5.2), CFrame = CFrame.new(x0 + 0.85, 12, z), Color = ({ PINK, Color3.fromRGB(180, 210, 255), Color3.fromRGB(255, 230, 160) })[k % 3 + 1] }, folder)
		heart(folder, CFrame.new(x0 + 1.2, 12.5, z) * CFrame.Angles(0, math.rad(90), 0), 3, WHITE, false)
	end
	-- лампы
	for k = 0, 3 do
		local lamp = deco({ Name = "ShopLamp", Shape = Enum.PartType.Ball, Size = Vector3.new(2.4, 2.4, 2.4), CFrame = CFrame.new(cx, H - 2, z0 + 15 + k * (length - 30) / 3), Color = Color3.fromRGB(255, 240, 220), Material = Enum.Material.Neon }, folder)
		local pl = Instance.new("PointLight")
		pl.Range = 26
		pl.Brightness = 1.2
		pl.Color = Color3.fromRGB(255, 230, 220)
		pl.Parent = lamp
	end

	-- подставки с досками
	local nB = #Config.Boards
	for idx, b in ipairs(Config.Boards) do
		local z = z0 + 8 + (idx - 1) * ((length - 16) / math.max(1, nB - 1))
		local x = -60
		local base = part({ Name = "BoardStand", Shape = Enum.PartType.Cylinder, Size = Vector3.new(2, 9, 9), CFrame = CFrame.new(x, 1.6, z) * CFrame.Angles(0, 0, math.rad(90)), Color = WHITE }, folder)
		deco({ Name = "StandRing", Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.4, 9.6, 9.6), CFrame = CFrame.new(x, 2.45, z) * CFrame.Angles(0, 0, math.rad(90)), Color = b.trail, Material = Enum.Material.Neon }, folder)
		base:SetAttribute("BoardId", b.id)
		CollectionService:AddTag(base, "BoardStand")
		local model = BoardBuilder.build(b, { anchored = true })
		model.Name = "ShowBoard_" .. b.id
		for _, d in ipairs(model:GetDescendants()) do
			if d:IsA("BasePart") then
				d.CanCollide = false
				d.CanQuery = false
			end
		end
		model:ScaleTo(1.4)
		model:PivotTo(CFrame.new(x, 6, z) * CFrame.Angles(0, 0, math.rad(20)))
		model.Parent = folder
		CollectionService:AddTag(model, "ShowDeck")
		local bb, label = billboard(base, b.name, Vector2.new(11, 3.6), 9, Color3.new(1, 1, 1))
		bb.Name = "Info"
		label.Name = "Text"
		local prompt = Instance.new("ProximityPrompt")
		prompt.ObjectText = b.name
		prompt.ActionText = "Купить / надеть"
		prompt.HoldDuration = 0
		prompt.MaxActivationDistance = 12
		prompt.RequiresLineOfSight = false
		prompt.Parent = base
	end
end

-- ---------- беговые дорожки ----------
local function buildTreadmills(folder)
	local xs = { -31, -19, 20 } -- по бокам от дорожки к старту
	for idx, t in ipairs(Config.Treadmills) do
		local x = xs[idx] or (idx * 13)
		local z = 112
		local body = part({ Name = "TreadmillBody", Size = Vector3.new(8, 1.2, 14), CFrame = CFrame.new(x, 0.6, z), Color = Color3.fromRGB(60, 60, 75) }, folder)
		local belt = part({ Name = "TreadmillBelt", Size = Vector3.new(6.4, 0.2, 13), CFrame = CFrame.new(x, 1.3, z), Color = Color3.fromRGB(35, 35, 45) }, folder)
		-- полоски на ленте (их двигает клиент)
		for k = 0, 5 do
			local stripe = deco({ Name = "BeltStripe", Size = Vector3.new(6.2, 0.06, 0.4), CFrame = CFrame.new(x, 1.43, z - 6 + k * 2.2), Color = t.color, Material = Enum.Material.Neon, CastShadow = false }, folder)
			stripe:SetAttribute("BeltZ", z)
			CollectionService:AddTag(stripe, "BeltStripe")
		end
		-- поручни и пульт спереди
		for _, sx in ipairs({ -1, 1 }) do
			deco({ Name = "Handle", Size = Vector3.new(0.4, 5, 0.4), CFrame = CFrame.new(x + sx * 3.6, 3.7, z - 5.5), Color = Color3.fromRGB(200, 200, 210), CanCollide = true }, folder)
			deco({ Name = "Rail", Size = Vector3.new(0.4, 0.4, 5), CFrame = CFrame.new(x + sx * 3.6, 5, z - 3.2), Color = Color3.fromRGB(200, 200, 210) }, folder)
		end
		local console = deco({ Name = "Console", Size = Vector3.new(7.6, 2.6, 1), CFrame = CFrame.new(x, 6.4, z - 5.8) * CFrame.Angles(math.rad(-20), 0, 0), Color = Color3.fromRGB(45, 45, 60), CanCollide = true }, folder)
		deco({ Name = "Screen", Size = Vector3.new(5, 1.6, 0.2), CFrame = console.CFrame * CFrame.new(0, 0, 0.55), Color = t.color, Material = Enum.Material.Neon }, folder)
		-- невидимая зона: кто стоит на ленте — копит монеты
		local zone = part({ Name = "TreadmillZone", Size = Vector3.new(6.4, 7, 12), CFrame = CFrame.new(x, 4.9, z + 0.5), Transparency = 1, CanCollide = false, CanQuery = false, CanTouch = false }, folder)
		zone:SetAttribute("Index", idx)
		CollectionService:AddTag(zone, "Treadmill")
		local bb = billboard(console, string.format("%s\n+%d 💰 / 2 сек  •  ур. %d", t.name, t.coins, t.level), Vector2.new(12, 3.2), 3, Color3.new(1, 1, 1))
		bb.Name = "TreadInfo"
		belt.Name = "TreadmillBelt"
		body.Name = "TreadmillBody"
	end
	local sign = deco({ Name = "AfkSign", Size = Vector3.new(1, 1, 1), CFrame = CFrame.new(-27, 13, 104), Transparency = 1 }, folder)
	billboard(sign, "🏃 БЕГОВЫЕ ДОРОЖКИ — стой и копи монеты!", Vector2.new(46, 4), 0, Color3.fromRGB(255, 230, 120))
end

-- ---------- обби в стиле гяру ----------
local function buildObby(folder)
	local obby = Instance.new("Folder")
	obby.Name = "Obby"
	obby.Parent = folder

	local start = Vector3.new(58, 0, 136)
	part({ Name = "ObbyStart", Shape = Enum.PartType.Cylinder, Size = Vector3.new(1, 16, 16), CFrame = CFrame.new(start + Vector3.new(0, 0.5, 0)) * CFrame.Angles(0, 0, math.rad(90)), Color = PINK2 }, obby)
	deco({ Name = "ObbyStartRing", Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.3, 16.6, 16.6), CFrame = CFrame.new(start + Vector3.new(0, 1.05, 0)) * CFrame.Angles(0, 0, math.rad(90)), Color = GOLD }, obby)
	local startSign = deco({ Name = "ObbySign", Size = Vector3.new(16, 6, 1), CFrame = CFrame.new(start + Vector3.new(0, 10, 7)) * CFrame.Angles(0, math.rad(180), 0), Color = PINK }, obby)
	surfaceText(startSign, Enum.NormalId.Front, "♡ ОББИ ♡\nпройди — получи 💰", WHITE, Vector2.new(400, 150))
	bow(obby, CFrame.new(start + Vector3.new(0, 14, 7.6)), 5, WHITE)

	-- путь: гигантские доски и площадки-сердечки, всё выше и выше
	local pos = start
	local platforms = 13
	local finishPos
	for k = 1, platforms do
		local zig = (k % 2 == 0) and 1 or -1
		pos = Vector3.new(60 + zig * (4 + (k % 3) * 2), 2.4 * k, start.Z - 9.5 * k)
		if k % 3 == 1 then
			-- гигантский скейт
			local cfgBoard = { deck = (k % 2 == 0) and PINK or WHITE, stripe = GOLD, wheel = PINK2, trail = PINK }
			local m = BoardBuilder.build(cfgBoard, { anchored = true })
			m:ScaleTo(3)
			m:PivotTo(CFrame.new(pos) * CFrame.Angles(0, math.rad(90), 0))
			m.Name = "ObbyBoard"
			m.Parent = obby
		elseif k % 3 == 2 then
			-- сердечко-площадка
			part({ Name = "HeartPad", Shape = Enum.PartType.Cylinder, Size = Vector3.new(1, 8, 8), CFrame = CFrame.new(pos) * CFrame.Angles(0, 0, math.rad(90)), Color = PINK }, obby)
			heart(obby, CFrame.new(pos + Vector3.new(0, 3.5, 0)) * CFrame.Angles(0, math.rad(90), 0), 3, WHITE, false)
		else
			-- маленький кубик с бантиком (прыжок посложнее)
			part({ Name = "BowBlock", Size = Vector3.new(4.5, 1, 4.5), CFrame = CFrame.new(pos), Color = PINK2 }, obby)
			bow(obby, CFrame.new(pos + Vector3.new(0, 1.6, 0)), 2.2, PINK)
		end
		-- блёстки над каждой ступенью
		local glitter = deco({ Name = "Glitter", Size = Vector3.new(1, 1, 1), CFrame = CFrame.new(pos + Vector3.new(0, 4, 0)), Transparency = 1 }, obby)
		sparkles(glitter, k % 2 == 0 and GOLD or WHITE)
		finishPos = pos
	end
	-- финиш
	local fz = finishPos.Z - 12
	local fy = finishPos.Y + 1
	local finish = part({ Name = "ObbyFinish", Size = Vector3.new(14, 1, 14), CFrame = CFrame.new(60, fy, fz), Color = GOLD, Material = Enum.Material.Neon }, obby)
	CollectionService:AddTag(finish, "ObbyFinish")
	heart(obby, CFrame.new(60, fy + 9, fz - 6), 10, PINK, false)
	billboard(finish, "🏆 ФИНИШ! +" .. Config.Obby.Reward .. " 💰", Vector2.new(18, 4), 15, GOLD)
	-- опоры-столбики под ступенями (чтобы обби не висело в воздухе)
	for k = 0, 3 do
		deco({ Name = "ObbyPillar", Shape = Enum.PartType.Cylinder, Size = Vector3.new(fy, 2, 2), CFrame = CFrame.new(78, fy / 2, start.Z - 15 - k * 32) * CFrame.Angles(0, 0, math.rad(90)), Color = WHITE, CanCollide = true }, obby)
		heart(obby, CFrame.new(78, fy + 2, start.Z - 15 - k * 32) * CFrame.Angles(0, math.rad(90), 0), 4, PINK, false)
	end
end

local function buildLobby()
	local folder = Instance.new("Folder")
	folder.Name = "Lobby"
	folder.Parent = root
	local rng = Random.new(42)
	local zone = Config.Zones[1]

	part({ Name = "LobbyFloor", Size = Vector3.new(W, 4, LOBBY), CFrame = CFrame.new(0, -2, LOBBY / 2), Color = Color3.fromRGB(176, 166, 214) }, folder)
	-- дорожка от спавна к старту
	deco({ Name = "LobbyPath", Size = Vector3.new(26, LAYER, LOBBY - 10), CFrame = CFrame.new(0, Y_STRIPE, LOBBY / 2 - 5), Color = Color3.fromRGB(235, 200, 220), CastShadow = false }, folder)
	for k = 1, 6 do
		for _, side in ipairs({ -1, 1 }) do
			deco({ Name = "PathArrow", Size = Vector3.new(1.4, LAYER, 6), CFrame = CFrame.new(side * 2.4, Y_TILE, 95 - k * 14) * CFrame.Angles(0, side * math.rad(35), 0), Color = Color3.new(1, 1, 1), Material = Enum.Material.Neon, CastShadow = false }, folder)
		end
	end
	for _, side in ipairs({ -1, 1 }) do
		part({ Name = "Border", Size = Vector3.new(2, 80, LOBBY), CFrame = CFrame.new(side * (W / 2 + 1), 40, LOBBY / 2), Transparency = 1, CanQuery = false }, folder)
	end
	part({ Name = "BackWall", Size = Vector3.new(W, 80, 2), CFrame = CFrame.new(0, 40, LOBBY + 1), Transparency = 1 }, folder)
	for _, x in ipairs({ -30, 30 }) do
		blockTree(folder, x, 140, rng, SAKURA_LEAVES, SAKURA_TRUNK, true)
		blockTree(folder, x, 30, rng, SAKURA_LEAVES, SAKURA_TRUNK, false)
		lantern(folder, x * 0.6, 60)
	end
	for k = 1, 6 do
		cloud(folder, Vector3.new(rng:NextNumber(-150, 150), rng:NextNumber(70, 100), rng:NextNumber(0, LOBBY)), rng)
	end

	-- арка «СТАРТ»
	for _, side in ipairs({ -1, 1 }) do
		deco({ Name = "StartPost", Shape = Enum.PartType.Cylinder, Size = Vector3.new(36, 5, 5), CFrame = CFrame.new(side * 30, 18, 4) * CFrame.Angles(0, 0, math.rad(90)), Color = zone.accent, CanCollide = true }, folder)
	end
	local top = deco({ Name = "StartTop", Size = Vector3.new(66, 8, 5), CFrame = CFrame.new(0, 38, 4), Color = WHITE }, folder)
	for _, face in ipairs({ Enum.NormalId.Front, Enum.NormalId.Back }) do
		surfaceText(top, face, "СТАРТ ▶ SKATE RUSH", zone.accent, Vector2.new(660, 80))
	end
	heart(folder, CFrame.new(0, 45, 4), 7, PINK, false)

	buildShop(folder)
	buildTreadmills(folder)
	buildObby(folder)

	-- спавн: невидимая точка позади беговых дорожек
	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "SkateSpawn"
	spawn.Anchored = true
	spawn.Neutral = true
	spawn.Duration = 0
	spawn.Size = Vector3.new(12, 1, 6)
	spawn.CFrame = CFrame.new(0, 0.5, 132)
	spawn.Transparency = 1
	spawn.CanCollide = false
	spawn.CanQuery = false
	spawn.Parent = folder
	for _, d in ipairs(spawn:GetChildren()) do
		if d:IsA("Decal") then
			d:Destroy()
		end
	end
end

-- ---------- свет ----------

local function setupLighting()
	local function ensure(class, name)
		local o = Lighting:FindFirstChild(name)
		if not o then
			o = Instance.new(class)
			o.Name = name
			o.Parent = Lighting
		end
		return o
	end
	local atm = ensure("Atmosphere", "SkateAtmosphere")
	atm.Density = 0.12
	atm.Offset = 0.1
	atm.Color = Color3.fromRGB(230, 225, 245)
	atm.Decay = Color3.fromRGB(150, 140, 200)
	atm.Glare = 0
	atm.Haze = 0.4
	local bloom = ensure("BloomEffect", "SkateBloom")
	bloom.Intensity = 0.2
	bloom.Size = 20
	bloom.Threshold = 2.6
	local cc = ensure("ColorCorrectionEffect", "SkateColor")
	cc.Saturation = 0.2
	cc.Contrast = 0.12
	cc.Brightness = -0.02
	local rays = Lighting:FindFirstChild("SkateSunRays")
	if rays then
		rays:Destroy()
	end
	Lighting.GlobalShadows = true
	Lighting.ExposureCompensation = -0.35
	Lighting.Brightness = 2
	Lighting.EnvironmentDiffuseScale = 0.5
	Lighting.EnvironmentSpecularScale = 0.5
end

function World.build()
	setupLighting()
	local existing = workspace:FindFirstChild("SkateWorld")
	if existing then
		return existing
	end
	root = Instance.new("Folder")
	root.Name = "SkateWorld"
	root.Parent = workspace

	buildLobby()
	for i = 1, #Config.Zones do
		buildZone(i)
	end
	return root
end

function World.lobbySpawn()
	return CFrame.new(0, 4, 132)
end

return World
