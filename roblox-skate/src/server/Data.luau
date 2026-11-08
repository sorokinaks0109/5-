-- Сохранение прогресса игроков (DataStore).
-- В Roblox Studio сохранение работает, только если включено:
-- Game Settings → Security → Enable Studio Access to API Services.

local DataStoreService = game:GetService("DataStoreService")
local RunService = game:GetService("RunService")

local Data = {}

local STORE_NAME = "SkateRush_v1"

local store = nil
do
	local ok, result = pcall(function()
		return DataStoreService:GetDataStore(STORE_NAME)
	end)
	if ok then
		store = result
	else
		warn("[SkateRush] DataStore недоступен, прогресс не будет сохраняться:", result)
	end
end

function Data.default()
	return {
		coins = 0,
		xp = 0,
		level = 1,
		speedLevel = 0,
		boards = { basic = true },
		equipped = "basic",
		maxZone = 1,
		lastZone = 1,
		rebirths = 0,
		dailyStreak = 0,
		lastDailyDay = 0,
		codes = {},
		receipts = {},
		boostUntil = 0,
		bestCombo = 0,
		totalTricks = 0,
		trails = { board = true },
		trail = "board",
		firstJoin = 0,
		starterBought = false,
		quest = 1,
		settings = { music = true, sfx = true, speedLimit = 100 },
	}
end

local function reconcile(saved)
	local fresh = Data.default()
	if type(saved) ~= "table" then
		return fresh
	end
	for k, v in pairs(fresh) do
		if saved[k] == nil or type(saved[k]) ~= type(v) then
			saved[k] = v
		end
	end
	return saved
end

local function key(player)
	return "player_" .. player.UserId
end

-- Возвращает data, loadedOk. Если загрузка сломалась на живом сервере,
-- loadedOk = false, и мы такой профиль НЕ сохраняем, чтобы не стереть прогресс.
function Data.load(player)
	if not store then
		return Data.default(), false
	end
	for attempt = 1, 3 do
		local ok, result = pcall(function()
			return store:GetAsync(key(player))
		end)
		if ok then
			return reconcile(result), true
		end
		warn("[SkateRush] Ошибка загрузки (попытка " .. attempt .. "):", result)
		if RunService:IsStudio() and tostring(result):find("API") then
			break
		end
		task.wait(1.5 * attempt)
	end
	return Data.default(), false
end

function Data.save(player, data)
	if not store or not data then
		return false
	end
	for attempt = 1, 3 do
		local ok, err = pcall(function()
			store:UpdateAsync(key(player), function()
				return data
			end)
		end)
		if ok then
			return true
		end
		warn("[SkateRush] Ошибка сохранения (попытка " .. attempt .. "):", err)
		task.wait(1 * attempt)
	end
	return false
end

return Data
