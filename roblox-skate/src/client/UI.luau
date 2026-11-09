-- ============================================================
--  SKATE RUSH — интерфейс. Всё рисуется кодом, картинки не нужны.
-- ============================================================

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")

local player = Players.LocalPlayer
local Config = require(ReplicatedStorage:WaitForChild("SkateShared"):WaitForChild("Config"))
local fmt = Config.formatNumber

local UI = {}

local ctx -- колбэки из главного скрипта
local data -- последние данные с сервера
local gui
local refs = {}
local openWindowRefresh = nil
local displayedCoins = 0
local boostEnds = 0

-- ---------- цвета ----------
local C = {
	panel = Color3.fromRGB(18, 18, 32),
	panel2 = Color3.fromRGB(32, 32, 54),
	text = Color3.fromRGB(255, 255, 255),
	dim = Color3.fromRGB(170, 170, 200),
	gold = Color3.fromRGB(255, 205, 40),
	green = Color3.fromRGB(60, 220, 110),
	red = Color3.fromRGB(255, 70, 90),
	blue = Color3.fromRGB(40, 170, 255),
	pink = Color3.fromRGB(255, 60, 170),
	orange = Color3.fromRGB(255, 140, 0),
	purple = Color3.fromRGB(150, 90, 255),
}

-- ---------- helpers ----------
local function new(class, props, children)
	local o = Instance.new(class)
	for k, v in pairs(props or {}) do
		if k ~= "Parent" then
			o[k] = v
		end
	end
	for _, ch in ipairs(children or {}) do
		ch.Parent = o
	end
	if props and props.Parent then
		o.Parent = props.Parent
	end
	return o
end

local function corner(r)
	return new("UICorner", { CornerRadius = UDim.new(0, r or 12) })
end

local function stroke(color, th)
	return new("UIStroke", { Color = color or Color3.new(0, 0, 0), Thickness = th or 2, ApplyStrokeMode = Enum.ApplyStrokeMode.Border })
end

local function gradient(c1, c2, rot)
	return new("UIGradient", { Color = ColorSequence.new(c1, c2), Rotation = rot or 90 })
end

local function label(props)
	local maxText = props.MaxText or 40
	props.MaxText = nil
	props.BackgroundTransparency = props.BackgroundTransparency or 1
	props.Font = props.Font or Enum.Font.GothamBlack
	props.TextColor3 = props.TextColor3 or C.text
	props.TextScaled = props.TextScaled ~= false
	local l = new("TextLabel", props)
	if props.TextScaled ~= false then
		new("UITextSizeConstraint", { MaxTextSize = maxText, Parent = l })
	end
	return l
end

local function textStroke(l, th)
	new("UIStroke", { Color = Color3.new(0, 0, 0), Thickness = th or 2, ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual, Parent = l })
	return l
end

local function button(props, onClick)
	local color = props.Color or C.green
	local maxText = props.MaxText or 26
	props.Color = nil
	props.MaxText = nil
	props.BackgroundColor3 = color
	props.AutoButtonColor = true
	props.Font = props.Font or Enum.Font.GothamBlack
	props.TextColor3 = props.TextColor3 or C.text
	props.TextScaled = true
	local b = new("TextButton", props, { corner(10), gradient(Color3.new(1, 1, 1), Color3.fromRGB(190, 190, 190)) })
	new("UITextSizeConstraint", { MaxTextSize = maxText, Parent = b })
	new("UIPadding", { PaddingLeft = UDim.new(0, 6), PaddingRight = UDim.new(0, 6), PaddingTop = UDim.new(0, 4), PaddingBottom = UDim.new(0, 4), Parent = b })
	textStroke(b, 1.5)
	b.MouseButton1Click:Connect(function()
		if ctx and ctx.sounds then
			ctx.sounds.play("Click", 1, 0.4)
		end
		local s = b:FindFirstChildOfClass("UIScale") or new("UIScale", { Parent = b })
		s.Scale = 0.9
		TweenService:Create(s, TweenInfo.new(0.25, Enum.EasingStyle.Back), { Scale = 1 }):Play()
		onClick()
	end)
	return b
end

local function pop(obj, from)
	local s = obj:FindFirstChild("PopScale") or new("UIScale", { Name = "PopScale", Parent = obj })
	s.Scale = from or 1.35
	TweenService:Create(s, TweenInfo.new(0.35, Enum.EasingStyle.Back), { Scale = 1 }):Play()
end

local function timeText(sec)
	sec = math.max(0, math.floor(sec))
	return string.format("%d:%02d", math.floor(sec / 60), sec % 60)
end

-- ---------- уведомления ----------
function UI.toast(text, kind)
	if not refs.toasts then
		return
	end
	local color = ({ good = C.green, warn = C.red, level = C.gold, event = C.purple })[kind] or C.blue
	local f = new("Frame", {
		Size = UDim2.new(1, 0, 0, 40),
		BackgroundColor3 = C.panel,
		BackgroundTransparency = 0.15,
		Parent = refs.toasts,
	}, { corner(10), stroke(color, 2) })
	local l = textStroke(label({ Text = text, Size = UDim2.new(1, -16, 1, -8), Position = UDim2.fromOffset(8, 4), TextColor3 = kind == "level" and C.gold or C.text, MaxText = 22, Parent = f }), 1)
	pop(f, 0.6)
	task.delay(3.2, function()
		TweenService:Create(f, TweenInfo.new(0.4), { BackgroundTransparency = 1 }):Play()
		TweenService:Create(l, TweenInfo.new(0.4), { TextTransparency = 1 }):Play()
		local st = f:FindFirstChildOfClass("UIStroke")
		if st then
			TweenService:Create(st, TweenInfo.new(0.4), { Transparency = 1 }):Play()
		end
		task.wait(0.45)
		f:Destroy()
	end)
	if kind == "level" then
		UI.floatText(text, C.gold, 1.6)
	end
end

function UI.floatText(text, color, size)
	if not gui then
		return
	end
	local l = textStroke(label({
		Text = text,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5 + (math.random() - 0.5) * 0.12, 0.55),
		Size = UDim2.fromScale(0.5 * (size or 1), 0.07 * (size or 1)),
		TextColor3 = color or C.gold,
		MaxText = 60,
		ZIndex = 20,
		Parent = gui,
	}), 3)
	pop(l, 0.3)
	TweenService:Create(l, TweenInfo.new(1.3, Enum.EasingStyle.Quad), { Position = l.Position - UDim2.fromScale(0, 0.12), TextTransparency = 1 }):Play()
	task.delay(1.35, function()
		l:Destroy()
	end)
end

-- ---------- комбо ----------
local function compress(entries)
	-- «Грайнд, Грайнд, Грайнд» → «Грайнд x3»; показываем последние 4 трюка
	local out = {}
	for _, name in ipairs(entries) do
		local display = Config.Tricks[name] and Config.Tricks[name].display or name
		local last = out[#out]
		if last and last.name == display then
			last.n += 1
		else
			table.insert(out, { name = display, n = 1 })
		end
	end
	local parts = {}
	for i = math.max(1, #out - 3), #out do
		local e = out[i]
		table.insert(parts, e.n > 1 and (e.name .. " x" .. e.n) or e.name)
	end
	return table.concat(parts, " + ")
end

function UI.comboUpdate(entries, base, mult, coins)
	local f = refs.combo
	if not f then
		return
	end
	f.Visible = true
	refs.comboTricks.Text = compress(entries)
	local multText = "x" .. (mult % 1 == 0 and tostring(mult) or string.format("%.1f", mult))
	if refs.comboMult.Text ~= multText then
		refs.comboMult.Text = multText
		pop(refs.comboMult, 1.6)
	end
	local hue = math.clamp((mult - 1) / 10, 0, 1)
	refs.comboMult.TextColor3 = C.gold:Lerp(C.pink, hue)
	refs.comboCoins.Text = "+" .. fmt(coins) .. " 💰"
	refs.comboBar.Size = UDim2.fromScale(1, 1)
end

function UI.comboTimer(p)
	if refs.comboBar then
		refs.comboBar.Size = UDim2.fromScale(math.clamp(p, 0, 1), 1)
	end
end

function UI.comboEnd(banked)
	if refs.combo then
		refs.combo.Visible = false
	end
end

local function comboWord(mult)
	if not gui or not mult then
		return
	end
	local word
	for _, w in ipairs(Config.ComboWords) do
		if mult >= w.mult then
			word = w.text
			break
		end
	end
	if not word then
		return
	end
	local burst = new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.72, 0.42),
		Size = UDim2.fromOffset(250, 110),
		BackgroundColor3 = C.gold,
		Rotation = -8,
		ZIndex = 25,
		Parent = gui,
	}, { corner(26), stroke(Color3.new(0, 0, 0), 4), gradient(Color3.fromRGB(255, 240, 120), Color3.fromRGB(255, 150, 0)) })
	local multText = "x" .. (mult % 1 == 0 and tostring(mult) or string.format("%.1f", mult))
	textStroke(label({ Text = word, Size = UDim2.new(1, -16, 0.55, 0), Position = UDim2.new(0, 8, 0.06, 0), MaxText = 34, ZIndex = 26, Parent = burst }), 2.5)
	textStroke(label({ Text = multText, Size = UDim2.new(1, -16, 0.4, 0), Position = UDim2.new(0, 8, 0.56, 0), MaxText = 34, TextColor3 = C.pink, ZIndex = 26, Parent = burst }), 2.5)
	pop(burst, 0.2)
	task.delay(1.4, function()
		TweenService:Create(burst, TweenInfo.new(0.3), { Position = burst.Position - UDim2.fromScale(0, 0.06), BackgroundTransparency = 1 }):Play()
		for _, d in ipairs(burst:GetDescendants()) do
			if d:IsA("TextLabel") then
				TweenService:Create(d, TweenInfo.new(0.3), { TextTransparency = 1 }):Play()
			elseif d:IsA("UIStroke") then
				TweenService:Create(d, TweenInfo.new(0.3), { Transparency = 1 }):Play()
			end
		end
		task.wait(0.35)
		burst:Destroy()
	end)
end

function UI.comboResult(coins, xp, record, mult)
	comboWord(mult)
	UI.floatText("+" .. fmt(coins) .. " 💰", C.gold, coins > 1000 and 1.4 or 1.1)
	if record then
		task.delay(0.4, function()
			UI.floatText("НОВЫЙ РЕКОРД КОМБО!", C.pink, 1.3)
		end)
	end
end

function UI.trickPop(text)
	UI.floatText(text, C.text, 0.8)
end

function UI.bail(lostCoins, reason)
	UI.floatText(reason or "ПАДЕНИЕ!", C.red, 1.2)
	local f = refs.bail
	if not f or lostCoins < Config.Combo.SaveOfferMin then
		return
	end
	refs.bailText.Text = "Комбо потеряно: " .. fmt(lostCoins) .. " 💰"
	f.Visible = true
	pop(f, 0.5)
	local token = {}
	refs.bailToken = token
	task.delay(6, function()
		if refs.bailToken == token then
			f.Visible = false
		end
	end)
end

function UI.landBurst(position)
	local p = new("Part", {
		Anchored = true,
		CanCollide = false,
		CanQuery = false,
		CanTouch = false,
		Transparency = 1,
		Size = Vector3.new(1, 1, 1),
		CFrame = CFrame.new(position),
		Parent = workspace,
	})
	local e = new("ParticleEmitter", {
		Color = ColorSequence.new(Color3.fromRGB(230, 230, 230)),
		Size = NumberSequence.new(1.2, 0),
		Transparency = NumberSequence.new(0.3, 1),
		Lifetime = NumberRange.new(0.3, 0.6),
		Speed = NumberRange.new(8, 14),
		SpreadAngle = Vector2.new(80, 10),
		Enabled = false,
		Parent = p,
	})
	e:Emit(18)
	task.delay(1, function()
		p:Destroy()
	end)
end

-- ---------- зоны ----------
function UI.zoneBanner(i)
	local zone = Config.Zones[i]
	if not gui or not zone then
		return
	end
	local l = textStroke(label({
		Text = zone.name:upper() .. "\nмонеты x" .. tostring(zone.mult),
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.3),
		Size = UDim2.fromScale(0.6, 0.14),
		TextColor3 = zone.accent:Lerp(Color3.new(1, 1, 1), 0.35),
		MaxText = 70,
		ZIndex = 15,
		Parent = gui,
	}), 4)
	pop(l, 0.4)
	task.delay(2, function()
		TweenService:Create(l, TweenInfo.new(0.8), { TextTransparency = 1 }):Play()
		task.wait(0.85)
		l:Destroy()
	end)
end

-- ---------- окна ----------
local function closeWindow()
	if refs.window then
		refs.window.Visible = false
	end
	openWindowRefresh = nil
end

local function openWindow(title, color, build, manual)
	local w = refs.window
	refs.windowTitle.Text = title
	refs.windowHeader.BackgroundColor3 = color
	refs.windowManual = manual
	local function refresh()
		local list = refs.windowList
		local scroll = list.CanvasPosition
		task.defer(function()
			list.CanvasPosition = scroll
		end)
		for _, ch in ipairs(list:GetChildren()) do
			if not ch:IsA("UIListLayout") and not ch:IsA("UIPadding") then
				ch:Destroy()
			end
		end
		if data then
			build(list)
		end
	end
	openWindowRefresh = refresh
	refs.windowList.CanvasPosition = Vector2.zero
	refresh()
	w.Visible = true
	pop(w, 0.7)
end

local rowOrder = 0
local function row(parent, opts)
	rowOrder += 1
	local f = new("Frame", {
		Size = UDim2.new(1, 0, 0, opts.height or 74),
		BackgroundColor3 = opts.highlight and C.panel2:Lerp(opts.highlight, 0.25) or C.panel2,
		LayoutOrder = rowOrder,
		Parent = parent,
	}, { corner(12) })
	if opts.highlight then
		stroke(opts.highlight, 2).Parent = f
	end
	label({ Text = opts.icon or "", Size = UDim2.new(0, 56, 1, -12), Position = UDim2.fromOffset(6, 6), MaxText = 38, Parent = f })
	textStroke(label({ Text = opts.title, Size = UDim2.new(1, -210, 0.45, 0), Position = UDim2.new(0, 66, 0.08, 0), TextXAlignment = Enum.TextXAlignment.Left, MaxText = 22, Parent = f }), 1)
	label({ Text = opts.subtitle or "", Size = UDim2.new(1, -210, 0.38, 0), Position = UDim2.new(0, 66, 0.55, 0), TextXAlignment = Enum.TextXAlignment.Left, Font = Enum.Font.GothamBold, TextColor3 = C.dim, MaxText = 16, Parent = f })
	if opts.buttonText then
		local b = button({
			Text = opts.buttonText,
			Size = UDim2.new(0, 132, 0, 46),
			AnchorPoint = Vector2.new(1, 0.5),
			Position = UDim2.new(1, -10, 0.5, 0),
			Color = opts.disabled and Color3.fromRGB(90, 90, 110) or (opts.buttonColor or C.green),
			MaxText = 20,
			Parent = f,
		}, function()
			if opts.onClick then
				opts.onClick()
			end
		end)
		b.AutoButtonColor = not opts.disabled
	end
	return f
end

local function header(parent, text)
	rowOrder += 1
	textStroke(label({ Text = text, Size = UDim2.new(1, 0, 0, 30), TextColor3 = C.gold, MaxText = 22, LayoutOrder = rowOrder, Parent = parent }), 1)
end

-- Доски
local function buildBoards(list)
	header(list, "Доски дают скорость и прыжок")
	for _, b in ipairs(Config.Boards) do
		local owned = (b.pass and data.passes[b.pass]) or data.boards[b.id]
		local equipped = data.equipped == b.id
		local btn, color, click
		if equipped then
			btn, color = "НАДЕТА", C.blue
		elseif owned then
			btn, color = "НАДЕТЬ", C.blue
			click = function()
				ctx.request("BuyBoard", b.id)
			end
		elseif b.pass then
			btn, color = Config.GamePasses[b.pass].price .. " R$", C.pink
			click = function()
				ctx.buy("pass", b.pass)
			end
		else
			btn, color = fmt(b.price) .. " 💰", data.coins >= b.price and C.green or Color3.fromRGB(90, 90, 110)
			click = function()
				ctx.request("BuyBoard", b.id)
			end
		end
		local sub = string.format("%s  •  ⚡x%.2f  ⤒+%d", b.desc or "", b.speed, b.jump)
		if b.coinBonus then
			sub ..= "  •  Монеты +" .. math.floor(b.coinBonus * 100) .. "%"
		end
		row(list, { icon = b.pass and "👑" or "🛹", title = b.name, subtitle = sub, buttonText = btn, buttonColor = color, onClick = click, highlight = equipped and b.trail or nil })
	end
end

-- Скорость
local function buildSpeed(list)
	local lvl = data.speedLevel
	local maxLvl = Config.Speed.MaxLevel
	local now = math.floor(Config.maxSpeed(lvl, data.equipped))
	header(list, "Скорость " .. now .. "  •  Ступень " .. lvl .. " из " .. maxLvl)
	if lvl >= maxLvl then
		row(list, { icon = "⚡", title = "Максимум!", subtitle = "Сделай перерождение, чтобы монет стало больше" })
		return
	end
	local cost = Config.speedCost(lvl)
	local nextSpeed = math.floor(Config.maxSpeed(lvl + 1, data.equipped))
	row(list, {
		icon = "⚡",
		title = "+1 к скорости",
		subtitle = now .. " → " .. nextSpeed,
		buttonText = fmt(cost) .. " 💰",
		buttonColor = data.coins >= cost and C.green or Color3.fromRGB(90, 90, 110),
		onClick = function()
			ctx.request("BuySpeed")
		end,
	})
	row(list, {
		icon = "⏩",
		title = "Купить на все монеты",
		subtitle = "Максимум, что можешь себе позволить",
		buttonText = "МАКС",
		buttonColor = C.orange,
		onClick = function()
			ctx.request("BuySpeedMax")
		end,
	})
end

-- Зоны
local function buildZones(list)
	header(list, "Открывай зоны: чем дальше, тем больше монет")
	row(list, { icon = "🏠", title = "Лобби", subtitle = "Магазин досок и старт", buttonText = "ПОЕХАЛИ", buttonColor = C.blue, onClick = function()
		if ctx.request("Teleport", 0) then
			closeWindow()
		end
	end })
	for i, z in ipairs(Config.Zones) do
		local opts = { icon = i <= data.maxZone and "🗺️" or "🔒", title = i .. ". " .. z.name, highlight = i == data.maxZone and z.accent or nil }
		if i <= data.maxZone then
			opts.subtitle = "Монеты x" .. tostring(z.mult) .. "  •  открыта"
			opts.buttonText = "ПОЕХАЛИ"
			opts.buttonColor = C.blue
			opts.onClick = function()
				if ctx.request("Teleport", i) then
					closeWindow()
				end
			end
		elseif i == data.maxZone + 1 then
			local canLevel = data.level >= z.level
			local canCoins = data.coins >= z.cost
			opts.subtitle = string.format("Нужен ур. %d %s  •  %s 💰 %s", z.level, canLevel and "✅" or "❌", fmt(z.cost), canCoins and "✅" or "❌")
			opts.buttonText = "ОТКРЫТЬ"
			opts.buttonColor = (canLevel and canCoins) and C.green or Color3.fromRGB(90, 90, 110)
			opts.onClick = function()
				ctx.request("UnlockZone", i)
			end
		else
			opts.subtitle = "Уровень " .. z.level .. "  •  монеты x" .. tostring(z.mult)
		end
		row(list, opts)
	end
	if data.maxZone < #Config.Zones then
		local p = Config.Products.SkipZone
		row(list, { icon = p.icon, title = p.name, subtitle = p.desc, buttonText = p.price .. " R$", buttonColor = C.pink, onClick = function()
			ctx.buy("product", "SkipZone")
		end, highlight = C.pink })
	end
end

-- Магазин
local function buildShop(list)
	header(list, "Навсегда")
	for _, key in ipairs(Config.GamePassOrder) do
		local p = Config.GamePasses[key]
		local owned = data.passes[key]
		row(list, {
			icon = p.icon,
			title = p.name,
			subtitle = p.desc,
			buttonText = owned and "ЕСТЬ ✅" or (p.price .. " R$"),
			buttonColor = owned and C.blue or C.pink,
			disabled = owned,
			highlight = (not owned) and C.gold or nil,
			onClick = function()
				if not owned then
					ctx.buy("pass", key)
				end
			end,
		})
	end
	header(list, "Бусты и монеты")
	for _, key in ipairs(Config.ProductOrder) do
		local p = Config.Products[key]
		local sub = p.desc
		if Config.CoinPackBase[key] then
			sub = "+" .. fmt(Config.CoinPackBase[key] * Config.Zones[data.maxZone].mult) .. " 💰 прямо сейчас"
		end
		row(list, { icon = p.icon, title = p.name, subtitle = sub, buttonText = p.price .. " R$", buttonColor = C.pink, onClick = function()
			ctx.buy("product", key)
		end })
	end
end

-- Ежедневная награда
local function buildDaily(list)
	header(list, "Заходи каждый день — награда растёт!")
	local mult = Config.Zones[data.maxZone].mult
	local nextDay = data.dailyReady and data.dailyNext or data.dailyStreak
	local streakShown = data.dailyReady and (nextDay - 1) or data.dailyStreak
	for day, amount in ipairs(Config.Daily) do
		local isNext = data.dailyReady and day == nextDay
		local done = day <= streakShown
		row(list, {
			height = 54,
			icon = day == #Config.Daily and "💎" or "🎁",
			title = "День " .. day,
			subtitle = "+" .. fmt(amount * mult) .. " 💰",
			buttonText = isNext and "ЗАБРАТЬ" or (done and "✅" or nil),
			buttonColor = isNext and C.green or C.blue,
			highlight = isNext and C.green or nil,
			onClick = function()
				if isNext then
					ctx.request("ClaimDaily")
				end
			end,
		})
	end
	if not data.dailyReady then
		header(list, "Следующая награда — завтра")
	end
end

-- Коды
local function buildCodes(list)
	header(list, "Коды ищи в соцсетях игры")
	rowOrder += 1
	local f = new("Frame", { Size = UDim2.new(1, 0, 0, 64), BackgroundColor3 = C.panel2, LayoutOrder = rowOrder, Parent = list }, { corner(12) })
	local box = new("TextBox", {
		Size = UDim2.new(1, -160, 0, 44),
		Position = UDim2.fromOffset(10, 10),
		BackgroundColor3 = Color3.fromRGB(12, 12, 22),
		PlaceholderText = "Введи код...",
		Text = "",
		ClearTextOnFocus = false,
		Font = Enum.Font.GothamBold,
		TextColor3 = C.text,
		PlaceholderColor3 = C.dim,
		TextScaled = true,
		Parent = f,
	}, { corner(8), new("UITextSizeConstraint", { MaxTextSize = 22 }) })
	button({ Text = "ВВЕСТИ", Size = UDim2.new(0, 130, 0, 44), AnchorPoint = Vector2.new(1, 0), Position = UDim2.new(1, -10, 0, 10), Color = C.green, Parent = f }, function()
		ctx.request("RedeemCode", box.Text)
	end)
end

-- Перерождение
local function buildRebirth(list)
	local cost = Config.rebirthCost(data.rebirths)
	local bonusNow = math.floor(Config.Rebirth.Bonus * data.rebirths * 100)
	local bonusNext = math.floor(Config.Rebirth.Bonus * (data.rebirths + 1) * 100)
	header(list, "Перерождений: " .. data.rebirths .. "  •  бонус к монетам +" .. bonusNow .. "%")
	row(list, { height = 90, icon = "♻️", title = "Сбросить монеты и скорость", subtitle = "Зоны, доски и уровень останутся.\nБонус станет +" .. bonusNext .. "% навсегда" })
	row(list, {
		icon = "🔥",
		title = "ПЕРЕРОДИТЬСЯ",
		subtitle = "Нужно " .. fmt(cost) .. " 💰",
		buttonText = fmt(cost) .. " 💰",
		buttonColor = data.coins >= cost and C.purple or Color3.fromRGB(90, 90, 110),
		onClick = function()
			ctx.request("Rebirth")
		end,
	})
end

-- Следы
local function buildTrails(list)
	header(list, "След тянется за доской. Только для красоты!")
	for _, t in ipairs(Config.Trails) do
		local owned = data.trails[t.id]
		local equipped = data.trail == t.id
		local btn, color, click
		if equipped then
			btn, color = "НАДЕТ", C.blue
		elseif owned then
			btn, color = "НАДЕТЬ", C.blue
			click = function()
				ctx.request("BuyTrail", t.id)
			end
		elseif t.starter then
			btn, color = "В НАБОРЕ", C.pink
			click = function()
				if data.starterLeft and data.starterLeft > 0 then
					ctx.buy("product", "StarterPack")
				else
					UI.toast("Этот след был в стартовом наборе", "warn")
				end
			end
		else
			btn, color = fmt(t.price) .. " 💰", data.coins >= t.price and C.green or Color3.fromRGB(90, 90, 110)
			click = function()
				ctx.request("BuyTrail", t.id)
			end
		end
		local f = row(list, { icon = "✨", title = t.name, subtitle = t.colors and "" or "Цвет как у доски", buttonText = btn, buttonColor = color, onClick = click, highlight = equipped and C.blue or nil })
		if t.colors then
			local keys = {}
			for k, c in ipairs(t.colors) do
				table.insert(keys, ColorSequenceKeypoint.new((k - 1) / math.max(1, #t.colors - 1), c))
			end
			local strip = new("Frame", { Size = UDim2.new(1, -230, 0, 12), Position = UDim2.new(0, 66, 0.62, 0), BackgroundColor3 = Color3.new(1, 1, 1), Parent = f }, { corner(6) })
			new("UIGradient", { Color = ColorSequence.new(keys), Parent = strip })
		end
	end
end

-- Подарки за время
local function giftReadyCount()
	if not data then
		return 0
	end
	local played = data.played + (os.clock() - (refs.dataTime or os.clock()))
	local n = 0
	for i, g in ipairs(Config.Gifts) do
		if not data.gifts[i] and played >= g.minutes * 60 then
			n += 1
		end
	end
	return n
end

local function buildGifts(list)
	header(list, "Играй дольше — получай подарки!")
	local mult = Config.Zones[data.maxZone].mult
	local played = data.played + (os.clock() - (refs.dataTime or os.clock()))
	for i, g in ipairs(Config.Gifts) do
		local claimed = data.gifts[i]
		local left = g.minutes * 60 - played
		local opts = { height = 56, icon = claimed and "✅" or "🎁", title = "+" .. fmt(g.coins * mult) .. " 💰", subtitle = "через " .. g.minutes .. " мин. игры" }
		if claimed then
			opts.buttonText, opts.buttonColor = "ЗАБРАН", Color3.fromRGB(90, 90, 110)
		elseif left <= 0 then
			opts.buttonText, opts.buttonColor, opts.highlight = "ЗАБРАТЬ", C.green, C.green
			opts.onClick = function()
				ctx.request("ClaimGift", i)
			end
		else
			opts.buttonText, opts.buttonColor = timeText(left), Color3.fromRGB(90, 90, 110)
		end
		row(list, opts)
	end
end

-- Настройки
local function buildSettings(list)
	local st = data.settings or { music = true, sfx = true, speedLimit = 100 }
	local function save(changes)
		local copy = { music = st.music, sfx = st.sfx, speedLimit = st.speedLimit }
		for k, v in pairs(changes) do
			copy[k] = v
		end
		ctx.request("SaveSettings", copy)
	end
	header(list, "Настройки")
	row(list, { icon = "🎵", title = "Музыка", subtitle = st.music and "Включена" or "Выключена", buttonText = st.music and "ВКЛ" or "ВЫКЛ", buttonColor = st.music and C.green or C.red, onClick = function()
		save({ music = not st.music })
	end })
	row(list, { icon = "🔊", title = "Звуки", subtitle = st.sfx and "Включены" or "Выключены", buttonText = st.sfx and "ВКЛ" or "ВЫКЛ", buttonColor = st.sfx and C.green or C.red, onClick = function()
		save({ sfx = not st.sfx })
	end })
	header(list, "Ограничение скорости: " .. st.speedLimit .. "%")
	row(list, { icon = "🐢", title = "Медленнее", subtitle = "Если слишком быстро и трудно управлять", buttonText = "−10%", buttonColor = C.blue, onClick = function()
		save({ speedLimit = math.max(30, st.speedLimit - 10) })
	end })
	row(list, { icon = "🐇", title = "Быстрее", subtitle = "Максимум — 100%", buttonText = "+10%", buttonColor = C.blue, onClick = function()
		save({ speedLimit = math.min(100, st.speedLimit + 10) })
	end })
end

local windows = {
	Boards = { "🛹 ДОСКИ", C.orange, buildBoards },
	Speed = { "⚡ СКОРОСТЬ", C.blue, buildSpeed },
	Zones = { "🗺️ ЗОНЫ", C.green, buildZones },
	Shop = { "💎 МАГАЗИН", C.pink, buildShop },
	Daily = { "🎁 НАГРАДА", C.gold, buildDaily },
	Codes = { "🎟️ КОДЫ", C.purple, buildCodes, true },
	Rebirth = { "♻️ ПЕРЕРОЖДЕНИЕ", C.purple, buildRebirth },
	Trails = { "✨ СЛЕДЫ", C.blue, buildTrails },
	Gifts = { "🎁 ПОДАРКИ", C.green, buildGifts },
	Settings = { "⚙️ НАСТРОЙКИ", Color3.fromRGB(120, 120, 150), buildSettings },
}

local function open(name)
	local w = windows[name]
	if refs.window.Visible and refs.windowTitle.Text == w[1] then
		closeWindow()
		return
	end
	openWindow(w[1], w[2], w[3], w[4])
end

function UI.openZones()
	if data then
		open("Zones")
	end
end

-- ---------- данные ----------
function UI.setData(snap)
	data = snap
	refs.dataTime = os.clock()
	boostEnds = os.clock() + (snap.boostLeft or 0)
	if refs.level then
		local need = Config.xpForLevel(snap.level)
		refs.level.Text = "УР. " .. snap.level
		TweenService:Create(refs.xpFill, TweenInfo.new(0.3), { Size = UDim2.fromScale(math.clamp(snap.xp / need, 0, 1), 1) }):Play()
		refs.xpText.Text = fmt(snap.xp) .. " / " .. fmt(need)
		refs.mult.Text = string.format("монеты x%s", (snap.coinMult % 1 == 0) and tostring(snap.coinMult) or string.format("%.1f", snap.coinMult))
		refs.dailyDot.Visible = snap.dailyReady
	end
	updateQuest()
	if openWindowRefresh and not refs.windowManual then
		openWindowRefresh()
	end
end

local function updateQuest()
	if not refs.quest or not data then
		return
	end
	local q = Config.Quests[data.quest or 1]
	refs.quest.Visible = q ~= nil
	if q then
		local text = "🎯 " .. q.text .. "   •   +" .. fmt(q.reward) .. " 💰"
		if refs.questText.Text ~= text then
			refs.questText.Text = text
			pop(refs.quest, 1.15)
		end
	end
end

function UI.setSpeed(v)
	if refs.speed then
		refs.speed.Text = tostring(math.floor(v))
	end
end

-- ---------- обучение ----------
function UI.tutorial()
	local touch = UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled
	local tips = {
		"Разгоняйся и заезжай на трамплины со стрелками!",
		touch and "В воздухе жми кнопки ФЛИП, СПИН, ГРЭБ, БЭК" or "В воздухе жми E, Q, R, F — это трюки",
		"Не успел докрутить трюк до приземления — упадёшь!",
		"Трюки подряд = множитель комбо. Разные трюки дают больше",
		"Заезжай на перила — это грайнд, он не даёт комбо закончиться",
		"Прокачивай скорость, покупай доски и открывай новые зоны!",
	}
	task.spawn(function()
		task.wait(2)
		for _, t in ipairs(tips) do
			UI.toast("💡 " .. t, "info")
			task.wait(4)
		end
	end)
end

-- ---------- построение интерфейса ----------
local function buildHud()
	local screen = new("ScreenGui", { Name = "SkateRushUI", ResetOnSpawn = false, IgnoreGuiInset = false, ZIndexBehavior = Enum.ZIndexBehavior.Sibling, Parent = player:WaitForChild("PlayerGui") })
	-- весь интерфейс рисуем в «виртуальных» пикселях и масштабируем под экран телефона/компьютера
	gui = new("Frame", { Name = "Root", BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1), Parent = screen })
	local scale = new("UIScale", { Parent = gui })
	local function rescale()
		local vp = workspace.CurrentCamera.ViewportSize
		local s = math.clamp(math.min(vp.X / 1280, vp.Y / 680), 0.5, 1.15)
		scale.Scale = s
		gui.Size = UDim2.fromScale(1 / s, 1 / s)
	end
	rescale()
	workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(rescale)

	-- монеты и уровень
	local stats = new("Frame", { Size = UDim2.fromOffset(300, 118), Position = UDim2.fromOffset(16, 12), BackgroundColor3 = C.panel, BackgroundTransparency = 0.2, Parent = gui }, { corner(16), stroke(C.gold, 2) })
	refs.coins = textStroke(label({ Text = "💰 0", Size = UDim2.new(1, -20, 0, 44), Position = UDim2.fromOffset(12, 6), TextXAlignment = Enum.TextXAlignment.Left, TextColor3 = C.gold, MaxText = 38, Parent = stats }), 2)
	refs.level = textStroke(label({ Text = "УР. 1", Size = UDim2.new(0, 90, 0, 24), Position = UDim2.fromOffset(12, 54), TextXAlignment = Enum.TextXAlignment.Left, MaxText = 20, Parent = stats }), 1)
	local xpBg = new("Frame", { Size = UDim2.new(1, -116, 0, 20), Position = UDim2.fromOffset(104, 56), BackgroundColor3 = Color3.fromRGB(10, 10, 20), Parent = stats }, { corner(10) })
	refs.xpFill = new("Frame", { Size = UDim2.fromScale(0, 1), BackgroundColor3 = C.blue, Parent = xpBg }, { corner(10), gradient(C.blue, C.purple, 0) })
	refs.xpText = label({ Text = "", Size = UDim2.fromScale(1, 1), Font = Enum.Font.GothamBold, MaxText = 14, ZIndex = 2, Parent = xpBg })
	refs.mult = textStroke(label({ Text = "монеты x1", Size = UDim2.new(0.55, 0, 0, 24), Position = UDim2.fromOffset(12, 86), TextXAlignment = Enum.TextXAlignment.Left, TextColor3 = C.green, MaxText = 18, Parent = stats }), 1)
	refs.boost = textStroke(label({ Text = "", Size = UDim2.new(0.45, -12, 0, 24), Position = UDim2.new(0.55, 0, 0, 86), TextXAlignment = Enum.TextXAlignment.Right, TextColor3 = C.orange, MaxText = 18, Parent = stats }), 1)

	-- кнопки меню слева
	local menu = new("Frame", { Size = UDim2.fromOffset(160, 400), Position = UDim2.new(0, 16, 0, 144), BackgroundTransparency = 1, Parent = gui }, {
		new("UIGridLayout", { CellSize = UDim2.fromOffset(74, 68), CellPadding = UDim2.fromOffset(8, 8), SortOrder = Enum.SortOrder.LayoutOrder }),
	})
	local items = {
		{ "Boards", "🛹", "Доски", C.orange },
		{ "Speed", "⚡", "Скорость", C.blue },
		{ "Zones", "🗺️", "Зоны", C.green },
		{ "Shop", "💎", "Магазин", C.pink },
		{ "Daily", "📅", "Награда", C.gold },
		{ "Gifts", "🎁", "Подарки", C.green },
		{ "Trails", "✨", "Следы", C.blue },
		{ "Codes", "🎟️", "Коды", C.purple },
		{ "Rebirth", "♻️", "Перерожд.", C.purple },
		{ "Settings", "⚙️", "Настройки", Color3.fromRGB(120, 120, 150) },
	}
	for i, it in ipairs(items) do
		local b = new("TextButton", { Size = UDim2.fromOffset(72, 66), BackgroundColor3 = it[4], Text = "", AutoButtonColor = true, LayoutOrder = i, Parent = menu }, { corner(14), stroke(Color3.new(0, 0, 0), 2), gradient(Color3.new(1, 1, 1), Color3.fromRGB(170, 170, 170)) })
		local iconId = Config.Icons and Config.Icons[it[1]]
		if iconId and iconId ~= "" then
			-- аниме-картинка вместо эмодзи
			new("ImageLabel", { Image = iconId, BackgroundTransparency = 1, Size = UDim2.new(1, 6, 0.8, 4), Position = UDim2.new(0, -3, 0, -6), ScaleType = Enum.ScaleType.Fit, Parent = b })
		else
			label({ Text = it[2], Size = UDim2.new(1, 0, 0.62, 0), MaxText = 30, Parent = b })
		end
		textStroke(label({ Text = it[3], Size = UDim2.new(1, -4, 0.32, 0), Position = UDim2.new(0, 2, 0.64, 0), MaxText = 13, Parent = b }), 1)
		b.MouseButton1Click:Connect(function()
			if ctx and ctx.sounds then
				ctx.sounds.play("Click", 1, 0.4)
			end
			open(it[1])
		end)
		if it[1] == "Gifts" then
			refs.giftDot = new("Frame", { Size = UDim2.fromOffset(18, 18), Position = UDim2.new(1, -12, 0, -6), BackgroundColor3 = C.red, Visible = false, Parent = b }, { corner(9), stroke(Color3.new(1, 1, 1), 2) })
		end
		if it[1] == "Daily" then
			refs.dailyDot = new("Frame", { Size = UDim2.fromOffset(18, 18), Position = UDim2.new(1, -12, 0, -6), BackgroundColor3 = C.red, Visible = false, Parent = b }, { corner(9), stroke(Color3.new(1, 1, 1), 2) })
		end
		if it[1] == "Shop" then
			-- магазин мягко пульсирует, чтобы его замечали
			local s = new("UIScale", { Parent = b })
			TweenService:Create(s, TweenInfo.new(0.8, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true), { Scale = 1.07 }):Play()
		end
	end

	-- комбо
	refs.combo = new("Frame", { Size = UDim2.fromOffset(560, 130), AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 16), BackgroundTransparency = 1, Visible = false, Parent = gui })
	refs.comboMult = textStroke(label({ Text = "x1", Size = UDim2.new(1, 0, 0, 56), MaxText = 56, TextColor3 = C.gold, Parent = refs.combo }), 3)
	refs.comboTricks = textStroke(label({ Text = "", Size = UDim2.new(1, 0, 0, 30), Position = UDim2.fromOffset(0, 56), MaxText = 24, Parent = refs.combo }), 2)
	refs.comboCoins = textStroke(label({ Text = "", Size = UDim2.new(1, 0, 0, 26), Position = UDim2.fromOffset(0, 88), MaxText = 22, TextColor3 = C.gold, Parent = refs.combo }), 2)
	local barBg = new("Frame", { Size = UDim2.new(0.6, 0, 0, 8), Position = UDim2.new(0.2, 0, 0, 118), BackgroundColor3 = Color3.fromRGB(0, 0, 0), BackgroundTransparency = 0.4, Parent = refs.combo }, { corner(4) })
	refs.comboBar = new("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = C.gold, Parent = barBg }, { corner(4) })

	-- уведомления
	refs.toasts = new("Frame", { Size = UDim2.fromOffset(520, 300), AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 160), BackgroundTransparency = 1, Parent = gui }, {
		new("UIListLayout", { Padding = UDim.new(0, 6), HorizontalAlignment = Enum.HorizontalAlignment.Center, SortOrder = Enum.SortOrder.LayoutOrder }),
	})

	-- падение: спасти комбо
	refs.bail = new("Frame", { Size = UDim2.fromOffset(380, 120), AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.68), BackgroundColor3 = C.panel, BackgroundTransparency = 0.1, Visible = false, Parent = gui }, { corner(16), stroke(C.red, 3) })
	refs.bailText = textStroke(label({ Text = "", Size = UDim2.new(1, -20, 0, 36), Position = UDim2.fromOffset(10, 8), MaxText = 22, Parent = refs.bail }), 1)
	button({ Text = "🛟 ВЕРНУТЬ ЗА " .. Config.Products.SaveCombo.price .. " R$", Size = UDim2.new(1, -40, 0, 56), Position = UDim2.fromOffset(20, 52), Color = C.green, Parent = refs.bail }, function()
		refs.bail.Visible = false
		ctx.buy("product", "SaveCombo")
	end)

	-- номер версии в углу
	label({ Text = Config.GameName .. " " .. (Config.Version or ""), AnchorPoint = Vector2.new(1, 1), Position = UDim2.new(1, -8, 1, -4), Size = UDim2.fromOffset(200, 18), Font = Enum.Font.GothamBold, TextColor3 = Color3.new(1, 1, 1), TextTransparency = 0.3, TextXAlignment = Enum.TextXAlignment.Right, MaxText = 14, Parent = gui })

	-- текущее задание (внизу по центру)
	refs.quest = new("Frame", { Size = UDim2.fromOffset(640, 46), AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -46), BackgroundColor3 = C.panel, BackgroundTransparency = 0.15, Visible = false, Parent = gui }, { corner(14), stroke(C.gold, 2) })
	refs.questText = textStroke(label({ Text = "", Size = UDim2.new(1, -20, 1, -10), Position = UDim2.fromOffset(10, 5), MaxText = 20, Parent = refs.quest }), 1)

	-- спидометр
	local speedBox = new("Frame", { Size = UDim2.fromOffset(140, 70), AnchorPoint = Vector2.new(0, 1), Position = UDim2.new(0, 16, 1, -16), BackgroundColor3 = C.panel, BackgroundTransparency = 0.25, Parent = gui }, { corner(14), stroke(C.blue, 2) })
	refs.speed = textStroke(label({ Text = "0", Size = UDim2.new(1, -10, 0.65, 0), Position = UDim2.fromOffset(5, 2), MaxText = 40, TextColor3 = C.blue, Parent = speedBox }), 2)
	label({ Text = "скорость", Size = UDim2.new(1, 0, 0.3, 0), Position = UDim2.fromScale(0, 0.66), Font = Enum.Font.GothamBold, TextColor3 = C.dim, MaxText = 14, Parent = speedBox })

	-- подсказка по клавишам (на компьютере)
	if UserInputService.KeyboardEnabled then
		local parts = {}
		for _, b in ipairs(Config.TrickButtons) do
			table.insert(parts, b.label .. " " .. Config.Tricks[b.trick].display)
		end
		textStroke(label({ Text = "В воздухе:  " .. table.concat(parts, "   ") .. "   •   Пробел — прыжок", AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -12), Size = UDim2.fromOffset(760, 26), Font = Enum.Font.GothamBold, MaxText = 18, TextColor3 = C.text, Parent = gui }), 1)
	end

	-- кнопки трюков на телефоне
	if UserInputService.TouchEnabled then
		local pad = new("Frame", { Size = UDim2.fromOffset(200, 200), AnchorPoint = Vector2.new(1, 1), Position = UDim2.new(1, -16, 1, -240), BackgroundTransparency = 1, Parent = gui })
		local spots = { UDim2.fromOffset(100, 0), UDim2.fromOffset(0, 60), UDim2.fromOffset(100, 120), UDim2.fromOffset(0, 140) }
		for i, b in ipairs(Config.TrickButtons) do
			local tb = new("TextButton", { Size = UDim2.fromOffset(90, 60), Position = spots[i], BackgroundColor3 = b.color, Text = b.mobile, Font = Enum.Font.GothamBlack, TextScaled = true, TextColor3 = C.text, Parent = pad }, { corner(30), stroke(Color3.new(0, 0, 0), 2), new("UITextSizeConstraint", { MaxTextSize = 20 }) })
			textStroke(tb, 1.5)
			tb.InputBegan:Connect(function(input)
				if input.UserInputType == Enum.UserInputType.Touch or input.UserInputType == Enum.UserInputType.MouseButton1 then
					ctx.onTrick(b.trick)
				end
			end)
		end
	end

	-- справа: стартовый набор и быстрый буст
	local side = new("Frame", { Size = UDim2.fromOffset(200, 190), AnchorPoint = Vector2.new(1, 0), Position = UDim2.new(1, -16, 0, 12), BackgroundTransparency = 1, Parent = gui }, {
		new("UIListLayout", { Padding = UDim.new(0, 10), HorizontalAlignment = Enum.HorizontalAlignment.Right, SortOrder = Enum.SortOrder.LayoutOrder }),
	})
	refs.starter = new("TextButton", { Size = UDim2.fromOffset(190, 120), BackgroundColor3 = C.pink, Text = "", AutoButtonColor = true, Visible = false, LayoutOrder = 1, Parent = side }, { corner(16), stroke(Color3.new(0, 0, 0), 3), gradient(Color3.fromRGB(255, 150, 220), Color3.fromRGB(200, 60, 255)) })
	if Config.Icons and Config.Icons.Starter ~= "" then
		new("ImageLabel", { Image = Config.Icons.Starter, BackgroundTransparency = 1, Size = UDim2.fromOffset(70, 70), Position = UDim2.fromOffset(0, 0), ScaleType = Enum.ScaleType.Fit, Parent = refs.starter })
	else
		label({ Text = "🎁", Size = UDim2.fromOffset(60, 60), Position = UDim2.fromOffset(6, 6), MaxText = 46, Parent = refs.starter })
	end
	textStroke(label({ Text = "СТАРТОВЫЙ\nНАБОР", Size = UDim2.new(1, -72, 0, 50), Position = UDim2.fromOffset(66, 8), MaxText = 20, Parent = refs.starter }), 1.5)
	refs.starterTimer = textStroke(label({ Text = "", Size = UDim2.new(0.5, -8, 0, 26), Position = UDim2.new(0, 8, 1, -34), TextColor3 = C.gold, MaxText = 20, Parent = refs.starter }), 1.5)
	textStroke(label({ Text = "Только " .. Config.Products.StarterPack.price .. " R$", Size = UDim2.new(0.5, -8, 0, 26), Position = UDim2.new(0.5, 0, 1, -34), TextColor3 = C.text, MaxText = 20, Parent = refs.starter }), 1.5)
	local starterScale = new("UIScale", { Parent = refs.starter })
	TweenService:Create(starterScale, TweenInfo.new(0.7, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true), { Scale = 1.05 }):Play()
	refs.starter.MouseButton1Click:Connect(function()
		ctx.buy("product", "StarterPack")
	end)
	local boostBtn = button({ Text = "⚡ x2 МОНЕТЫ  " .. Config.Products.Boost2x.price .. " R$", Size = UDim2.fromOffset(190, 52), Color = C.blue, LayoutOrder = 2, MaxText = 18, Parent = side }, function()
		ctx.buy("product", "Boost2x")
	end)
	boostBtn.Name = "BoostQuick"

	-- трюк-битва
	refs.event = new("Frame", { Size = UDim2.fromOffset(260, 170), AnchorPoint = Vector2.new(1, 0), Position = UDim2.new(1, -228, 0, 12), BackgroundColor3 = C.panel, BackgroundTransparency = 0.15, Visible = false, Parent = gui }, { corner(14), stroke(C.purple, 3) })
	refs.eventTitle = textStroke(label({ Text = "🏆 ТРЮК-БИТВА", Size = UDim2.new(1, -16, 0, 30), Position = UDim2.fromOffset(8, 6), TextColor3 = C.gold, MaxText = 22, Parent = refs.event }), 1)
	refs.eventList = label({ Text = "", Size = UDim2.new(1, -16, 1, -44), Position = UDim2.fromOffset(8, 38), Font = Enum.Font.GothamBold, TextXAlignment = Enum.TextXAlignment.Left, TextYAlignment = Enum.TextYAlignment.Top, MaxText = 17, Parent = refs.event })

	-- окно меню
	refs.window = new("Frame", { Size = UDim2.fromOffset(600, 470), AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.52), BackgroundColor3 = C.panel, Visible = false, ZIndex = 30, Parent = gui }, { corner(18), stroke(Color3.new(0, 0, 0), 3) })
	refs.windowHeader = new("Frame", { Size = UDim2.new(1, 0, 0, 58), BackgroundColor3 = C.orange, Parent = refs.window }, { corner(18), gradient(Color3.new(1, 1, 1), Color3.fromRGB(180, 180, 180)) })
	refs.windowTitle = textStroke(label({ Text = "", Size = UDim2.new(1, -90, 1, -12), Position = UDim2.fromOffset(16, 6), TextXAlignment = Enum.TextXAlignment.Left, MaxText = 32, Parent = refs.windowHeader }), 2)
	button({ Text = "✕", Size = UDim2.fromOffset(46, 46), AnchorPoint = Vector2.new(1, 0.5), Position = UDim2.new(1, -8, 0.5, 0), Color = C.red, Parent = refs.windowHeader }, closeWindow)
	refs.windowList = new("ScrollingFrame", {
		Size = UDim2.new(1, -24, 1, -74),
		Position = UDim2.fromOffset(12, 66),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ScrollBarThickness = 6,
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		CanvasSize = UDim2.new(),
		Parent = refs.window,
	}, {
		new("UIListLayout", { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder }),
		new("UIPadding", { PaddingRight = UDim.new(0, 8) }),
	})
end

local function updateEvent()
	local active = ReplicatedStorage:GetAttribute("EventActive") == true
	refs.event.Visible = active
	if not active then
		return
	end
	local left = (ReplicatedStorage:GetAttribute("EventEnds") or 0) - workspace:GetServerTimeNow()
	refs.eventTitle.Text = "🏆 ТРЮК-БИТВА " .. timeText(left)
	local list = {}
	for _, p in ipairs(Players:GetPlayers()) do
		table.insert(list, { name = p.DisplayName, score = p:GetAttribute("EventScore") or 0, me = p == player })
	end
	table.sort(list, function(a, b)
		return a.score > b.score
	end)
	local lines = {}
	local medals = { "🥇", "🥈", "🥉" }
	local myPlace
	for i, e in ipairs(list) do
		if e.me then
			myPlace = i
		end
		if i <= 3 then
			table.insert(lines, (medals[i] or "") .. " " .. e.name .. " — " .. fmt(e.score))
		end
	end
	if myPlace and myPlace > 3 then
		table.insert(lines, "…\n" .. myPlace .. ". Ты — " .. fmt(list[myPlace].score))
	end
	refs.eventList.Text = table.concat(lines, "\n")
end

function UI.init(context)
	ctx = context
	buildHud()
	if data then
		UI.setData(data)
	end

	local acc = 0
	RunService.RenderStepped:Connect(function(dt)
		-- монеты плавно «набегают»
		if data then
			local target = data.coins
			displayedCoins += (target - displayedCoins) * math.min(1, dt * 8)
			if math.abs(target - displayedCoins) < 1 then
				displayedCoins = target
			end
			refs.coins.Text = "💰 " .. fmt(displayedCoins)
		end
		acc += dt
		if acc >= 0.25 then
			acc = 0
			local left = boostEnds - os.clock()
			refs.boost.Text = left > 0 and ("⚡x2 " .. timeText(left)) or ""
			updateEvent()
			if data then
				local sl = (data.starterLeft or 0) - (os.clock() - (refs.dataTime or os.clock()))
				refs.starter.Visible = sl > 0
				refs.starterTimer.Text = "⏰ " .. timeText(sl)
				refs.giftDot.Visible = giftReadyCount() > 0
			end
		end
	end)
end

return UI
