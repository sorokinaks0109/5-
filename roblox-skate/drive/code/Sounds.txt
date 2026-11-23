-- Звуки и музыка. Номера звуков — в Config.Sounds.
local SoundService = game:GetService("SoundService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Config = require(ReplicatedStorage:WaitForChild("SkateShared"):WaitForChild("Config"))

local Sounds = {}

local enabled = true
local musicEnabled = true
local cache = {}
local roll
local music
local currentMusic = ""

local function make(id, volume, looped)
	local s = Instance.new("Sound")
	s.SoundId = id
	s.Volume = volume or 0.6
	s.Looped = looped == true
	s.Parent = SoundService
	return s
end

function Sounds.play(name, pitch, volume)
	if not enabled then
		return
	end
	local id = Config.Sounds[name]
	if type(id) ~= "string" or id == "" then
		return
	end
	local s = cache[name]
	if not s then
		s = make(id, 0.6)
		cache[name] = s
	end
	s.PlaybackSpeed = pitch or 1
	s.Volume = volume or 0.6
	s:Play()
end

-- Звук колёс: громкость и высота зависят от скорости
function Sounds.setRoll(speed, onGround)
	local id = Config.Sounds.Roll
	if not enabled or id == "" then
		if roll then
			roll.Volume = 0
		end
		return
	end
	if not roll then
		roll = make(id, 0, true)
		roll:Play()
	end
	local target = onGround and math.clamp(speed / 80, 0, 0.6) or 0
	roll.Volume += (target - roll.Volume) * 0.2
	roll.PlaybackSpeed = 0.8 + math.clamp(speed / 150, 0, 0.6)
end

function Sounds.setZoneMusic(zoneIndex)
	local id = Config.Sounds.Music[zoneIndex] or ""
	if id == currentMusic then
		return
	end
	currentMusic = id
	if music then
		music:Stop()
		music:Destroy()
		music = nil
	end
	if id ~= "" then
		music = make(id, musicEnabled and 0.35 or 0, true)
		music:Play()
	end
end

function Sounds.setEnabled(sfx, mus)
	enabled = sfx
	musicEnabled = mus
	if music then
		music.Volume = mus and 0.35 or 0
	end
	if roll and not sfx then
		roll.Volume = 0
	end
end

return Sounds
