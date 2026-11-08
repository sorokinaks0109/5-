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

local function kicker(parent, x, z, width, power, color)
	local p = ramp(parent, x, z, width, 3.4, 26, color)
	p.Name = "Kicker"
	p:SetAttribute("Power", power)
	CollectionService:AddTag(p, "Kicker")
	local len = 3.4 / math.sin(math.rad(26))
	deco({ Name = "KickerStripe", Size = Vector3.new(width, 1.05, 0.9), CFrame = p.CFrame * CFrame.new(0, 0.02, -len / 2 + 0.45), Color = Color3.new(1, 1, 1), Material = Enum.Material.Neon }, parent)
	for k = 0, 1 do
		deco({ Name = "Arrow", Size = Vector3.new(width * 0.5, 0.1, 2), CFrame = CFrame.new(x, 0.06, z + 5 + k * 4), Color = color, Material = Enum.Material.Neon, Transparency = 0.2 }, parent)
	end
	return p
end

local function rail(parent, x, z, length, accent)
	local height = 2.4
	local r = part({ Name = "Rail", Size = Vector3.new(1.6, 0.5, length), CFrame = CFrame.new(x, height, z - length / 2), Color = Color3.fromRGB(235, 235, 245), Material = Enum.Material.Metal }, parent)
	r:SetAttribute("Rail", true)
	CollectionService:AddTag(r, "Rail")
	deco({ Name = "RailGlow", Size = Vector3.new(0.5, 0.2, length), CFrame = r.CFrame * CFrame.new(0, -0.35, 0), Color = accent, Material = Enum.Material.Neon }, parent)
	local posts = math.max(2, math.floor(length / 12))
	for k = 0, posts do
		deco({ Name = "RailPost", Size = Vector3.new(0.6, height, 0.6), CFrame = CFrame.new(x, height / 2 - 0.2, z - length * k / posts), Color = accent:Lerp(Color3.new(1, 1, 1), 0.3), CanCollide = true }, parent)
	end
	ramp(parent, x, z + 7, 4, height - 0.3, 18, Color3.fromRGB(200, 200, 215))
	return r
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
	local pad = part({ Name = "BoostPad", Size = Vector3.new(12, 0.3, 10), CFrame = CFrame.new(x, 0.1, z), Color = color, Material = Enum.Material.Neon, CanCollide = false }, parent)
	CollectionService:AddTag(pad, "Boost")
	for k = 0, 2 do
		deco({ Name = "Chevron", Size = Vector3.new(8 - k * 2, 0.35, 1), CFrame = CFrame.new(x, 0.15, z + 3 - k * 3), Color = Color3.new(1, 1, 1), Material = Enum.Material.Neon }, parent)
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
	local lava = part({ Name = "Lava", Size = Vector3.new(w, 0.3, d), CFrame = CFrame.new(x, 0.12, z), Color = Color3.fromRGB(255, 100, 0), Material = Enum.Material.Neon, CanCollide = false, CanQuery = false }, parent)
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

-- Скалы-террасы по краям трассы
local function terraces(parent, i, zone, rng)
	local z0 = zoneStartZ(i)
	local edge = W / 2
	local step = 35
	local z = z0
	while z > z0 - L do
		for _, side in ipairs({ -1, 1 }) do
			local h1 = rng:NextNumber(6, 12)
			local h2 = h1 + rng:NextNumber(10, 22)
			local len = step + 2
			deco({ Name = "Cliff", Size = Vector3.new(28, h1, len), CFrame = CFrame.new(side * (edge + 14), h1 / 2, z - step / 2), Color = zone.cliff, CanCollide = true }, parent)
			deco({ Name = "CliffTop", Size = Vector3.new(28.4, 1.5, len + 0.4), CFrame = CFrame.new(side * (edge + 14), h1 + 0.25, z - step / 2), Color = zone.cliff2 }, parent)
			deco({ Name = "Cliff", Size = Vector3.new(34, h2, len), CFrame = CFrame.new(side * (edge + 44), h2 / 2, z - step / 2), Color = zone.cliff:Lerp(Color3.new(0, 0, 0), 0.08), CanCollide = true }, parent)
			deco({ Name = "CliffTop", Size = Vector3.new(34.4, 1.5, len + 0.4), CFrame = CFrame.new(side * (edge + 44), h2 + 0.25, z - step / 2), Color = zone.cliff2 }, parent)
		end
		z -= step
	end
end

-- Шахматная кромка трассы
local function checkerEdges(parent, i, zone)
	local z0 = zoneStartZ(i)
	local edge = W / 2
	local tile = 10
	local n = math.floor(L / tile)
	for k = 0, n - 1 do
		for _, side in ipairs({ -1, 1 }) do
			for col = 0, 1 do
				local dark = (k + col) % 2 == 0
				deco({ Name = "Tile", Size = Vector3.new(tile, 0.1, tile), CFrame = CFrame.new(side * (edge - tile / 2 - col * tile), 0.03, z0 - k * tile - tile / 2), Color = dark and zone.accent or zone.floor2, CastShadow = false }, parent)
			end
		end
	end
	-- поперечные полосы
	for k = 1, 13 do
		deco({ Name = "Stripe", Size = Vector3.new(W - 40, 0.06, 6), CFrame = CFrame.new(0, 0.02, z0 - k * (L / 14)), Color = zone.floor2, CastShadow = false }, parent)
	end
end

local function decorate(folder, i, zone, rng)
	local z0 = zoneStartZ(i)
	local edge = W / 2
	local theme = zone.theme

	terraces(folder, i, zone, rng)
	checkerEdges(folder, i, zone)

	-- облака
	if theme ~= "space" and theme ~= "city" then
		for k = 1, 7 do
			cloud(folder, Vector3.new(rng:NextNumber(-180, 180), rng:NextNumber(70, 110), z0 - rng:NextNumber(0, L)), rng)
		end
	end

	for k = 1, 10 do
		local z = z0 - k * (L / 11)
		for _, side in ipairs({ -1, 1 }) do
			-- декор стоит на кромке трассы, у подножия скал
			local x = side * (edge - rng:NextNumber(6, 9))
			if theme == "sakura" then
				blockTree(folder, x, z, rng, { Color3.fromRGB(255, 170, 205), Color3.fromRGB(255, 200, 225), Color3.fromRGB(250, 140, 190) }, Color3.fromRGB(200, 100, 60), k % 3 == 0)
			elseif theme == "candy" then
				if k % 2 == 0 then
					lollipop(folder, x, z, rng)
				else
					candyCane(folder, x, z)
				end
			elseif theme == "beach" then
				if side == 1 then
					palm(folder, x, z, rng)
				else
					umbrella(folder, -edge + 25, z, rng)
				end
			elseif theme == "city" then
				building(folder, side * (edge + 46), z, rng, zone.accent)
			elseif theme == "ice" then
				if k % 3 == 0 then
					snowman(folder, x, z)
				else
					crystal(folder, x, z, rng)
				end
			elseif theme == "volcano" then
				rock(folder, x, z, rng, Color3.fromRGB(70, 50, 45))
			elseif theme == "space" then
				if k % 2 == 0 then
					crystal(folder, x, z, rng)
				end
			end
		end
	end

	if theme == "sakura" or theme == "candy" or theme == "beach" then
		for k = 1, 3 do
			for _, side in ipairs({ -1, 1 }) do
				waterfall(folder, side * (edge + 1), z0 - k * (L / 4) + side * 20, 26, side)
			end
		end
	end

	if theme == "candy" then
		for k = 1, 2 do
			donutArch(folder, z0 - k * (L / 3), rng)
		end
		for _ = 1, 8 do
			gumdrop(folder, rng:NextNumber(-edge + 8, edge - 8), z0 - rng:NextNumber(30, L - 30), rng)
		end
	elseif theme == "beach" then
		deco({ Name = "Sea", Size = Vector3.new(500, 1, L), CFrame = CFrame.new(-(edge + 300), 2, z0 - L / 2), Color = Color3.fromRGB(0, 190, 230), Material = Enum.Material.Glass, Transparency = 0.15 }, folder)
	elseif theme == "city" then
		for k = 1, 3 do
			neonArch(folder, z0 - k * (L / 4), ({ zone.accent, Color3.fromRGB(0, 230, 255), Color3.fromRGB(255, 220, 0) })[k])
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
	elseif theme == "space" then
		planet(folder, Vector3.new(-280, 130, z0 - 120), 130, Color3.fromRGB(255, 130, 90), Color3.fromRGB(255, 220, 160))
		planet(folder, Vector3.new(320, 210, z0 - 300), 210, Color3.fromRGB(90, 150, 255), nil)
		planet(folder, Vector3.new(-220, 270, z0 - 380), 70, Color3.fromRGB(200, 255, 200), Color3.fromRGB(150, 255, 255))
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

	-- дорога посередине со стрелками «вперёд», чтобы было видно, куда ехать
	local road = zone.floor:Lerp(Color3.new(0, 0, 0), 0.45)
	deco({ Name = "Road", Size = Vector3.new(30, 0.08, L), CFrame = CFrame.new(0, 0.04, z0 - L / 2), Color = road, CastShadow = false }, folder)
	for _, side in ipairs({ -1, 1 }) do
		deco({ Name = "RoadLine", Size = Vector3.new(1, 0.1, L), CFrame = CFrame.new(side * 15.5, 0.05, z0 - L / 2), Color = Color3.new(1, 1, 1), Material = Enum.Material.Neon, CastShadow = false }, folder)
	end
	for k = 1, math.floor(L / 30) - 1 do
		local az = z0 - k * 30
		for _, side in ipairs({ -1, 1 }) do
			deco({ Name = "RoadArrow", Size = Vector3.new(1.4, 0.12, 7), CFrame = CFrame.new(side * 2.5, 0.06, az) * CFrame.Angles(0, side * math.rad(35), 0), Color = Color3.new(1, 1, 1), Material = Enum.Material.Neon, CastShadow = false }, folder)
		end
	end

	-- табличка с названием зоны над въездом
	local sign = deco({ Name = "ZoneSign", Size = Vector3.new(1, 1, 1), CFrame = CFrame.new(0, 34, z0 - 6), Transparency = 1 }, folder)
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

	if i == #Config.Zones then
		part({ Name = "EndWall", Size = Vector3.new(W, 60, 2), CFrame = CFrame.new(0, 30, z0 - L), Color = zone.accent, Material = Enum.Material.ForceField, Transparency = 0.3 }, folder)
	end
end

-- ---------- лобби с витриной досок ----------

local function buildLobby()
	local folder = Instance.new("Folder")
	folder.Name = "Lobby"
	folder.Parent = root
	local rng = Random.new(42)
	local zone = Config.Zones[1]

	part({ Name = "LobbyFloor", Size = Vector3.new(W, 4, LOBBY), CFrame = CFrame.new(0, -2, LOBBY / 2), Color = Color3.fromRGB(150, 140, 200) }, folder)
	-- шахматный пол площади
	for gx = -3, 3 do
		for gz = 1, 6 do
			if (gx + gz) % 2 == 0 then
				deco({ Name = "PlazaTile", Size = Vector3.new(14, 0.1, 14), CFrame = CFrame.new(gx * 14, 0.03, 40 + gz * 14), Color = Color3.fromRGB(235, 150, 195), CastShadow = false }, folder)
			end
		end
	end
	for _, side in ipairs({ -1, 1 }) do
		part({ Name = "Border", Size = Vector3.new(2, 80, LOBBY), CFrame = CFrame.new(side * (W / 2 + 1), 40, LOBBY / 2), Transparency = 1, CanQuery = false }, folder)
		blockTree(folder, side * 70, 130, rng, { Color3.fromRGB(255, 170, 205), Color3.fromRGB(255, 200, 225) }, Color3.fromRGB(200, 100, 60), true)
		blockTree(folder, side * 70, 25, rng, { Color3.fromRGB(255, 170, 205), Color3.fromRGB(255, 200, 225) }, Color3.fromRGB(200, 100, 60), false)
	end
	part({ Name = "BackWall", Size = Vector3.new(W, 80, 2), CFrame = CFrame.new(0, 40, LOBBY + 1), Transparency = 1 }, folder)
	for k = 1, 5 do
		cloud(folder, Vector3.new(rng:NextNumber(-150, 150), rng:NextNumber(70, 100), rng:NextNumber(0, LOBBY)), rng)
	end

	-- арка «СТАРТ»
	for _, side in ipairs({ -1, 1 }) do
		deco({ Name = "StartPost", Size = Vector3.new(6, 36, 6), CFrame = CFrame.new(side * 40, 18, 4), Color = zone.accent, CanCollide = true }, folder)
	end
	local top = deco({ Name = "StartTop", Size = Vector3.new(86, 8, 6), CFrame = CFrame.new(0, 38, 4), Color = Color3.fromRGB(255, 255, 255) }, folder)
	for _, face in ipairs({ Enum.NormalId.Front, Enum.NormalId.Back }) do
		local sg = Instance.new("SurfaceGui")
		sg.Face = face
		sg.CanvasSize = Vector2.new(860, 80)
		sg.LightInfluence = 0
		sg.Parent = top
		local t = Instance.new("TextLabel")
		t.Size = UDim2.fromScale(1, 1)
		t.BackgroundTransparency = 1
		t.TextScaled = true
		t.Font = Enum.Font.GothamBlack
		t.TextColor3 = zone.accent
		t.Text = "СТАРТ ▶ SKATE RUSH"
		t.Parent = sg
	end

	-- витрина досок слева
	local n = #Config.Boards
	for idx, b in ipairs(Config.Boards) do
		local z = 20 + (idx - 1) * (110 / math.max(1, n - 1))
		local x = -62
		local base = part({ Name = "BoardStand", Shape = Enum.PartType.Cylinder, Size = Vector3.new(2, 12, 12), CFrame = CFrame.new(x, 1, z) * CFrame.Angles(0, 0, math.rad(90)), Color = Color3.fromRGB(255, 255, 255) }, folder)
		deco({ Name = "StandGlow", Shape = Enum.PartType.Cylinder, Size = Vector3.new(2.2, 12.6, 12.6), CFrame = CFrame.new(x, 0.9, z) * CFrame.Angles(0, 0, math.rad(90)), Color = b.trail, Material = Enum.Material.Neon }, folder)
		base:SetAttribute("BoardId", b.id)
		CollectionService:AddTag(base, "BoardStand")
		-- модель доски над подставкой (её крутит клиент)
		local deck = deco({ Name = "ShowDeck", Size = Vector3.new(1.7, 0.25, 4.6), CFrame = CFrame.new(x, 5, z) * CFrame.Angles(0, 0, math.rad(25)), Color = b.deck, Material = b.neon and Enum.Material.Neon or Enum.Material.SmoothPlastic }, folder)
		deck:SetAttribute("Spin", true)
		CollectionService:AddTag(deck, "ShowDeck")
		local bb, label = billboard(base, b.name, Vector2.new(10, 3.2), 9, Color3.new(1, 1, 1))
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
	local showSign = deco({ Name = "ShopSign", Size = Vector3.new(1, 1, 1), CFrame = CFrame.new(-62, 22, 75), Transparency = 1 }, folder)
	billboard(showSign, "🛹 МАГАЗИН ДОСОК", Vector2.new(34, 6), 0, Color3.fromRGB(255, 220, 60))

	-- спавн
	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "SkateSpawn"
	spawn.Anchored = true
	spawn.Neutral = true
	spawn.Duration = 0
	spawn.Size = Vector3.new(14, 1, 14)
	spawn.CFrame = CFrame.new(0, 0.5, LOBBY - 30)
	spawn.Color = zone.accent
	spawn.Material = Enum.Material.Neon
	spawn.TopSurface = Enum.SurfaceType.Smooth
	spawn.Parent = folder
end

-- ---------- свет и «красивость» ----------

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
	atm.Haze = 0.6
	local bloom = ensure("BloomEffect", "SkateBloom")
	bloom.Intensity = 0.2
	bloom.Size = 20
	bloom.Threshold = 2.6
	local cc = ensure("ColorCorrectionEffect", "SkateColor")
	cc.Saturation = 0.25
	cc.Contrast = 0.15
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

return World
