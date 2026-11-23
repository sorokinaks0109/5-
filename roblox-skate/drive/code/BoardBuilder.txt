-- ============================================================
--  Детальный скейтборд из деталей: дека с загнутыми носом и
--  хвостом, шкурка сверху, рисунок снизу, подвески, колёса с
--  подшипниками. Используется для доски игрока, витрины в лобби
--  и гигантских досок в обби.
--  Дека лежит длинной стороной вдоль оси Z, нос смотрит в -Z.
-- ============================================================

local BoardBuilder = {}

local THICK = 0.16 -- толщина деки
local WIDTH = 1.75

local function newPart(model, name, size, cf, color, material, shape)
	local p = Instance.new("Part")
	p.Name = name
	if shape then
		p.Shape = shape
	end
	p.Size = size
	p.CFrame = cf
	p.Color = color
	p.Material = material or Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Parent = model
	return p
end

-- cfg: deck, stripe, trail, wheel (необязательно), neon
-- opts.anchored = true — для витрины и обби (детали закреплены и с коллизией у деки)
function BoardBuilder.build(cfg, opts)
	opts = opts or {}
	local model = Instance.new("Model")
	model.Name = "Skateboard"

	local deckColor = cfg.deck
	local accent = cfg.stripe
	local wheelColor = cfg.wheel or cfg.stripe:Lerp(Color3.new(1, 1, 1), 0.5)
	local deckMat = cfg.neon and Enum.Material.Glass or Enum.Material.SmoothPlastic
	local grip = Color3.fromRGB(32, 32, 38)

	-- центральная часть деки
	local deck = newPart(model, "Deck", Vector3.new(WIDTH, THICK, 3.0), CFrame.new(), deckColor, deckMat)
	model.PrimaryPart = deck
	newPart(model, "Grip", Vector3.new(WIDTH - 0.08, 0.03, 3.0), CFrame.new(0, THICK / 2 + 0.015, 0), grip, Enum.Material.Sand)
	-- рисунок снизу: полоса и ромб
	newPart(model, "Graphic", Vector3.new(0.55, 0.03, 2.8), CFrame.new(0, -THICK / 2 - 0.015, 0), accent, cfg.neon and Enum.Material.Neon or Enum.Material.SmoothPlastic)
	newPart(model, "GraphicDiamond", Vector3.new(0.9, 0.03, 0.9), CFrame.new(0, -THICK / 2 - 0.02, 0) * CFrame.Angles(0, math.rad(45), 0), accent:Lerp(Color3.new(1, 1, 1), 0.4))
	-- лёгкий прогиб: приподнятые края
	for _, sx in ipairs({ -1, 1 }) do
		newPart(model, "Concave", Vector3.new(0.12, 0.06, 2.9), CFrame.new(sx * (WIDTH / 2 - 0.08), THICK / 2 + 0.045, 0), grip, Enum.Material.Sand)
	end

	-- нос (-Z) и хвост (+Z): два сегмента с нарастающим изгибом и круглый край
	for _, s in ipairs({ -1, 1 }) do
		local start = Vector3.new(0, 0, s * 1.5)
		local segs = { { len = 0.45, ang = 10 }, { len = 0.45, ang = 22 } }
		local lastCF
		for i, seg in ipairs(segs) do
			local a = math.rad(seg.ang)
			local dir = Vector3.new(0, math.sin(a), s * math.cos(a))
			local center = start + dir * (seg.len / 2)
			local cf = CFrame.new(center) * CFrame.Angles(-s * a, 0, 0)
			newPart(model, "Kick" .. i, Vector3.new(WIDTH, THICK, seg.len + 0.02), cf, deckColor, deckMat)
			newPart(model, "KickGrip" .. i, Vector3.new(WIDTH - 0.08, 0.03, seg.len + 0.02), cf * CFrame.new(0, THICK / 2 + 0.015, 0), grip, Enum.Material.Sand)
			start = start + dir * seg.len
			lastCF = CFrame.new(start) * CFrame.Angles(-s * a, 0, 0)
		end
		-- круглый край: диск чуть тоньше деки, чтобы грани не мигали
		newPart(model, "Round", Vector3.new(THICK - 0.03, WIDTH, WIDTH), lastCF * CFrame.Angles(0, 0, math.rad(90)), deckColor, deckMat, Enum.PartType.Cylinder)
		newPart(model, "RoundGrip", Vector3.new(0.03, WIDTH - 0.08, WIDTH - 0.08), lastCF * CFrame.new(0, THICK / 2 + 0.015, 0) * CFrame.Angles(0, 0, math.rad(90)), grip, Enum.Material.Sand, Enum.PartType.Cylinder)
	end

	-- подвески и колёса
	local metal = Color3.fromRGB(196, 200, 210)
	for _, z in ipairs({ -1.15, 1.15 }) do
		newPart(model, "Riser", Vector3.new(0.62, 0.06, 0.95), CFrame.new(0, -THICK / 2 - 0.03, z), Color3.fromRGB(30, 30, 30))
		newPart(model, "Baseplate", Vector3.new(0.55, 0.06, 0.85), CFrame.new(0, -THICK / 2 - 0.09, z), metal, Enum.Material.Metal)
		newPart(model, "Kingpin", Vector3.new(0.22, 0.18, 0.22), CFrame.new(0, -THICK / 2 - 0.2, z), metal, Enum.Material.Metal)
		newPart(model, "Bushing", Vector3.new(0.26, 0.08, 0.26), CFrame.new(0, -THICK / 2 - 0.17, z), accent)
		newPart(model, "Hanger", Vector3.new(1.45, 0.16, 0.24), CFrame.new(0, -THICK / 2 - 0.32, z), metal, Enum.Material.Metal)
		newPart(model, "Axle", Vector3.new(2.05, 0.07, 0.07), CFrame.new(0, -THICK / 2 - 0.34, z), metal, Enum.Material.Metal, Enum.PartType.Cylinder)
		for _, sx in ipairs({ -1, 1 }) do
			local wcf = CFrame.new(sx * 0.9, -THICK / 2 - 0.34, z)
			newPart(model, "Wheel", Vector3.new(0.3, 0.52, 0.52), wcf, wheelColor, Enum.Material.SmoothPlastic, Enum.PartType.Cylinder)
			newPart(model, "Bearing", Vector3.new(0.32, 0.2, 0.2), wcf, metal, Enum.Material.Metal, Enum.PartType.Cylinder)
		end
	end

	-- все детали держатся за деку
	for _, p in ipairs(model:GetChildren()) do
		if p:IsA("BasePart") then
			if opts.anchored then
				p.Anchored = true
				p.CanCollide = p == deck or p.Name:sub(1, 4) == "Kick" or p.Name == "Round"
			else
				p.Anchored = false
				p.CanCollide = false
				p.CanQuery = false
				p.CanTouch = false
				p.Massless = true
				if p ~= deck then
					local w = Instance.new("Weld")
					w.Part0 = deck
					w.Part1 = p
					w.C0 = deck.CFrame:Inverse() * p.CFrame
					w.Parent = p
				end
			end
		end
	end
	return model
end

-- Высота от центра деки до низа колёс (чтобы ставить доску на землю)
BoardBuilder.WheelDrop = THICK / 2 + 0.34 + 0.26
BoardBuilder.TopOffset = THICK / 2 + 0.03

return BoardBuilder
