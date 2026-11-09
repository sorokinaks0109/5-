# Детальные аниме-иконки: Скейт-тян по плечи + предмет, объём, блики, тени
OUT = "#4a2340"  # цвет обводки

def defs(n, c1, c2, hood):
    return f'''
<defs>
 <radialGradient id="bg{n}" cx="35%" cy="28%" r="80%"><stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></radialGradient>
 <linearGradient id="hair{n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc2dc"/><stop offset="0.55" stop-color="#ff8fbf"/><stop offset="1" stop-color="#e2669c"/></linearGradient>
 <linearGradient id="iris{n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b1667"/><stop offset="0.55" stop-color="#7b3fd1"/><stop offset="1" stop-color="#c79bff"/></linearGradient>
 <radialGradient id="skin{n}" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#fff1e6"/><stop offset="1" stop-color="#ffd9c4"/></radialGradient>
 <linearGradient id="hood{n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{hood}"/><stop offset="1" stop-color="{hood}" stop-opacity="0.75"/></linearGradient>
 <filter id="sh{n}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#3a1030" flood-opacity="0.35"/></filter>
 <clipPath id="clip{n}"><circle r="116"/></clipPath>
</defs>'''

def eye(cx, n, mode, flip=1):
    if mode == "happy":
        return f'<path d="M{cx-15} {14} Q{cx} {-2} {cx+15} {14}" stroke="{OUT}" stroke-width="5" fill="none" stroke-linecap="round"/>'
    return f'''
 <g>
  <ellipse cx="{cx}" cy="10" rx="15" ry="19" fill="#fff" stroke="{OUT}" stroke-width="2.5"/>
  <ellipse cx="{cx}" cy="12" rx="12" ry="16" fill="url(#iris{n})"/>
  <ellipse cx="{cx}" cy="14" rx="5.5" ry="7" fill="#24093f"/>
  <ellipse cx="{cx-5*flip}" cy="3" rx="5" ry="6" fill="#fff"/>
  <circle cx="{cx+5*flip}" cy="20" r="2.6" fill="#fff"/>
  <path d="M{cx-9} 22 Q{cx} 27 {cx+9} 22" stroke="#e7c9ff" stroke-width="2" fill="none" opacity="0.8"/>
  <path d="M{cx-17} -6 Q{cx} -16 {cx+17} -6" stroke="{OUT}" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M{cx+15*flip} -6 l{6*flip} -5" stroke="{OUT}" stroke-width="3.5" stroke-linecap="round"/>
 </g>'''

def chan(n, eyes=("open", "open"), mouth="smile"):
    m = {
        "smile": f'<path d="M-8 34 Q0 41 8 34" stroke="#b0345a" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
        "open": f'<path d="M-10 31 Q0 47 10 31 Z" fill="#c2365c" stroke="{OUT}" stroke-width="2"/><path d="M-6 38 Q0 44 6 38 Q0 41 -6 38" fill="#ff8aa8"/>',
        "cat": f'<path d="M-10 32 Q-5 38 0 32 Q5 38 10 32" stroke="#b0345a" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
    }[mouth]
    return f'''
<g transform="translate(-22,22)">
 <!-- хвостики сзади -->
 <path d="M-50 -24 C-98 -18 -104 52 -70 92 C-74 52 -66 18 -44 2 Z" fill="url(#hair{n})" stroke="{OUT}" stroke-width="3"/>
 <path d="M50 -24 C98 -18 104 52 70 92 C74 52 66 18 44 2 Z" fill="url(#hair{n})" stroke="{OUT}" stroke-width="3"/>
 <path d="M-62 0 C-80 26 -80 50 -70 72" stroke="#ffd6e8" stroke-width="3" fill="none" opacity="0.8"/>
 <!-- плечи в толстовке -->
 <path d="M-62 120 C-60 74 -34 60 0 60 C34 60 60 74 62 120 Z" fill="url(#hood{n})" stroke="{OUT}" stroke-width="3"/>
 <path d="M-22 62 L-14 96 M22 62 L14 96" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
 <circle cx="-14" cy="98" r="3.5" fill="#fff"/><circle cx="14" cy="98" r="3.5" fill="#fff"/>
 <path d="M-12 58 L0 72 L12 58" fill="url(#skin{n})" stroke="{OUT}" stroke-width="2"/>
 <!-- голова -->
 <ellipse cx="0" cy="8" rx="52" ry="48" fill="url(#skin{n})" stroke="{OUT}" stroke-width="3"/>
 <!-- волосы: макушка и пряди чёлки -->
 <path d="M-56 12 C-62 -56 62 -56 56 12 C50 -6 42 -14 34 -2 C30 -18 18 -24 10 -8 C6 -24 -8 -26 -14 -8 C-20 -22 -34 -18 -40 -2 C-46 -12 -52 -4 -56 12 Z" fill="url(#hair{n})" stroke="{OUT}" stroke-width="3" stroke-linejoin="round"/>
 <path d="M-52 10 C-54 30 -50 44 -44 52 C-46 34 -44 20 -40 6 Z" fill="url(#hair{n})" stroke="{OUT}" stroke-width="2.5"/>
 <path d="M52 10 C54 30 50 44 44 52 C46 34 44 20 40 6 Z" fill="url(#hair{n})" stroke="{OUT}" stroke-width="2.5"/>
 <path d="M-36 -32 Q-12 -46 18 -40" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" opacity="0.85"/>
 <path d="M-20 -26 Q-6 -32 6 -30" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.7"/>
 <!-- бантик-заколка -->
 <g transform="translate(38,-40) rotate(18)" filter="url(#sh{n})">
  <path d="M0 0 C-10 -16 -24 -14 -24 0 C-24 14 -10 16 0 0 Z" fill="#fff" stroke="{OUT}" stroke-width="2.5"/>
  <path d="M0 0 C10 -16 24 -14 24 0 C24 14 10 16 0 0 Z" fill="#fff" stroke="{OUT}" stroke-width="2.5"/>
  <circle r="6" fill="#ffd166" stroke="{OUT}" stroke-width="2.5"/>
 </g>
 {eye(-22, n, eyes[0], 1)}
 {eye(22, n, eyes[1], -1)}
 <!-- румянец со штрихами -->
 <ellipse cx="-36" cy="27" rx="11" ry="6" fill="#ff8fb0" opacity="0.6"/>
 <ellipse cx="36" cy="27" rx="11" ry="6" fill="#ff8fb0" opacity="0.6"/>
 <path d="M-42 25 l3 5 M-36 24 l3 5 M30 24 l3 5 M36 25 l3 5" stroke="#e05583" stroke-width="1.6" stroke-linecap="round"/>
 <path d="M-1 22 l2 3" stroke="#e8a088" stroke-width="2" stroke-linecap="round"/>
 {m}
</g>'''

def sparkle(x, y, r, c="#fff"):
    return f'<path d="M{x} {y-r} Q{x+r*0.15} {y-r*0.15} {x+r} {y} Q{x+r*0.15} {y+r*0.15} {x} {y+r} Q{x-r*0.15} {y+r*0.15} {x-r} {y} Q{x-r*0.15} {y-r*0.15} {x} {y-r} Z" fill="{c}"/>'

def heart(x, y, s, c):
    return f'<path transform="translate({x},{y}) scale({s})" d="M0 7 C-14 -5 -8 -17 0 -9 C8 -17 14 -5 0 7 Z" fill="{c}" stroke="{OUT}" stroke-width="{2/s}"/>'

# ---------- предметы (рисуются справа сверху) ----------
def item(name, n):
    g = f'filter="url(#sh{n})"'
    if name == "Boards":
        return f'''<g transform="translate(60,-38) rotate(-38)" {g}>
  <rect x="-17" y="-70" width="34" height="140" rx="17" fill="#ff6fa8" stroke="{OUT}" stroke-width="3.5"/>
  <rect x="-12" y="-62" width="24" height="124" rx="12" fill="#3a2a40"/>
  <path d="M-10 -40 L10 -20 M-10 -10 L10 10 M-10 20 L10 40" stroke="#ffd166" stroke-width="5" stroke-linecap="round"/>
  {''.join(f'<rect x="{sx-6}" y="{sy-9}" width="12" height="18" rx="5" fill="#fff6d6" stroke="{OUT}" stroke-width="2.5"/>' for sx in (-22,22) for sy in (-44,44))}
  <rect x="-24" y="-48" width="48" height="8" rx="3" fill="#c9ced8" stroke="{OUT}" stroke-width="2"/>
  <rect x="-24" y="40" width="48" height="8" rx="3" fill="#c9ced8" stroke="{OUT}" stroke-width="2"/>
 </g>'''
    if name == "Speed":
        return f'''<g {g}><path d="M78 -104 L38 -20 L64 -20 L42 52 L104 -38 L74 -38 L98 -104 Z" fill="#ffe14d" stroke="{OUT}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M82 -96 L56 -40" stroke="#fff8c2" stroke-width="5" stroke-linecap="round"/></g>
  <path d="M-104 -64 H-52 M-104 -44 H-66 M-100 -24 H-74" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity="0.9"/>'''
    if name == "Zones":
        return f'''<g {g} transform="translate(64,-60)">
  <ellipse cx="0" cy="62" rx="26" ry="8" fill="#000" opacity="0.15"/>
  <path d="M0 58 C-28 22 -36 2 -36 -12 A36 36 0 0 1 36 -12 C36 2 28 22 0 58 Z" fill="#ff5c93" stroke="{OUT}" stroke-width="4"/>
  <circle cy="-12" r="14" fill="#fff" stroke="{OUT}" stroke-width="3"/>
  <path d="M-24 -28 Q-14 -40 0 -42" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.7"/></g>'''
    if name == "Shop":
        return f'''<g {g} transform="translate(62,-30) scale(0.9)">
  <path d="M-40 -26 H40 L34 46 H-34 Z" fill="#fff" stroke="{OUT}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M-40 -26 H40 L38 -6 H-38 Z" fill="#c77dff"/>
  <path d="M-20 -26 C-20 -60 20 -60 20 -26" stroke="{OUT}" stroke-width="5" fill="none"/>
  {heart(0,14,2.2,"#ff5c93")}{sparkle(26,26,7,"#ffd166")}</g>'''
    if name == "Daily":
        return f'''<g {g} transform="translate(64,-52)">
  <rect x="-40" y="-36" width="80" height="78" rx="12" fill="#fff" stroke="{OUT}" stroke-width="4"/>
  <path d="M-40 -24 a12 12 0 0 1 12 -12 h56 a12 12 0 0 1 12 12 v10 h-80 Z" fill="#ff7a59" stroke="{OUT}" stroke-width="4"/>
  <rect x="-24" y="-46" width="8" height="18" rx="4" fill="#fff" stroke="{OUT}" stroke-width="3"/><rect x="16" y="-46" width="8" height="18" rx="4" fill="#fff" stroke="{OUT}" stroke-width="3"/>
  <text x="0" y="30" font-family="Arial Black,Arial" font-weight="900" font-size="34" text-anchor="middle" fill="#ff5c93">7</text>
  {sparkle(30,-2,7,"#ffd166")}</g>'''
    if name in ("Gifts", "Starter"):
        box = "#ff6fa8" if name == "Gifts" else "#a66bff"
        lid = "#ff9ec7" if name == "Gifts" else "#c79bff"
        return f'''<g {g} transform="translate(64,-40)">
  <rect x="-38" y="-14" width="76" height="58" rx="8" fill="{box}" stroke="{OUT}" stroke-width="4"/>
  <rect x="-44" y="-30" width="88" height="22" rx="7" fill="{lid}" stroke="{OUT}" stroke-width="4"/>
  <rect x="-7" y="-30" width="14" height="74" fill="#ffe14d" stroke="{OUT}" stroke-width="3"/>
  <path d="M0 -30 C-22 -64 -44 -42 0 -30 C22 -64 44 -42 0 -30 Z" fill="#ffe14d" stroke="{OUT}" stroke-width="3.5"/>
  <path d="M-30 -2 L-30 34" stroke="#fff" stroke-width="4" opacity="0.5" stroke-linecap="round"/></g>''' + (sparkle(108,-96,13) + sparkle(24,-100,9,"#ffe14d") if name == "Starter" else "")
    if name == "Trails":
        cols = ["#ff5c93", "#ff9f43", "#ffe14d", "#4cd98b", "#4cb3ff", "#a66bff"]
        return ''.join(f'<path d="M-112 {-30+i*9} Q-10 {-128+i*9} 116 {-62+i*9}" stroke="{c}" stroke-width="9" fill="none" stroke-linecap="round"/>' for i, c in enumerate(cols)) + sparkle(96,-92,12) + sparkle(-70,-76,8)
    if name == "Codes":
        return f'''<g {g} transform="translate(52,-50) rotate(-14) scale(0.9)">
  <path d="M-46 -28 H46 V-9 A9 9 0 0 0 46 9 V28 H-46 V9 A9 9 0 0 0 -46 -9 Z" fill="#fff" stroke="{OUT}" stroke-width="4"/>
  <path d="M-26 -28 V28" stroke="#ff5c93" stroke-width="3" stroke-dasharray="5 5"/>
  <text x="12" y="8" font-family="Arial Black,Arial" font-weight="900" font-size="19" text-anchor="middle" fill="#ff3d7f">CODE</text>
  {heart(-36,0,1.1,"#ff5c93")}</g>'''
    if name == "Rebirth":
        return f'''<g {g} transform="translate(64,-56)">
  <circle r="40" fill="#fff" stroke="{OUT}" stroke-width="4"/>
  <path d="M-24 -6 A24 24 0 0 1 20 -14" stroke="#7a5cff" stroke-width="8" fill="none" stroke-linecap="round"/>
  <path d="M24 6 A24 24 0 0 1 -20 14" stroke="#ff5c93" stroke-width="8" fill="none" stroke-linecap="round"/>
  <path d="M12 -26 L28 -12 L8 -6 Z" fill="#7a5cff"/><path d="M-12 26 L-28 12 L-8 6 Z" fill="#ff5c93"/>
  {sparkle(0,0,10,"#ffd166")}</g>'''
    if name == "Settings":
        teeth = ''.join(f'<rect x="-8" y="-46" width="16" height="18" rx="4" fill="#fff" stroke="{OUT}" stroke-width="3" transform="rotate({a})"/>' for a in range(0, 360, 45))
        return f'''<g {g} transform="translate(64,-56)">{teeth}
  <circle r="32" fill="#fff" stroke="{OUT}" stroke-width="4"/><circle r="13" fill="#8c8cc4" stroke="{OUT}" stroke-width="3"/>
  {heart(0,1,1.0,"#ff9ec7")}</g>'''
    return ""

STYLE = {
    "Boards": ("#ffc48a", "#ff6fa8", "#ff8fb8", ("open", "open"), "open"),
    "Speed": ("#8fd3ff", "#5a6dff", "#6aa8ff", ("happy", "happy"), "open"),
    "Zones": ("#9ff0b8", "#2fb39c", "#5fd0a0", ("happy", "open"), "smile"),
    "Shop": ("#ffb6e1", "#b56dff", "#c79bff", ("open", "open"), "cat"),
    "Daily": ("#ffe08a", "#ff8f5a", "#ffb36b", ("happy", "happy"), "smile"),
    "Gifts": ("#97ecd6", "#3fa5ff", "#6cc6ff", ("open", "open"), "open"),
    "Trails": ("#cbb8ff", "#ff7fd1", "#ffa6dd", ("happy", "open"), "open"),
    "Codes": ("#ffc2d6", "#ff6f9e", "#ff9ec0", ("happy", "happy"), "cat"),
    "Rebirth": ("#d3bdff", "#6a4cff", "#9d86ff", ("open", "open"), "smile"),
    "Settings": ("#dcdcf2", "#8585c0", "#a9a9d8", ("open", "open"), "smile"),
    "Starter": ("#ffe08a", "#ff5c93", "#ff8fb8", ("happy", "happy"), "open"),
}

def pattern(n):
    dots = ''.join(f'<circle cx="{x}" cy="{y}" r="2.2" fill="#fff" opacity="0.25"/>' for x in range(-120, 121, 18) for y in range(-120, 121, 18) if (x // 18 + y // 18) % 2 == 0)
    return dots + sparkle(-84, -84, 11) + sparkle(-56, -102, 6) + sparkle(98, 72, 8) + sparkle(-98, 40, 6)

parts = []
for name, (c1, c2, hood, eyes, mouth) in STYLE.items():
    n = name
    svg = f'''<svg viewBox="-128 -128 256 256" width="512" height="512" xmlns="http://www.w3.org/2000/svg">
{defs(n, c1, c2, hood)}
<circle r="120" fill="#fff"/>
<circle r="114" fill="url(#bg{n})"/>
<g clip-path="url(#clip{n})">
 {pattern(n)}
 {chan(n, eyes, mouth)}
 {item(name, n)}
</g>
<circle r="114" fill="none" stroke="{OUT}" stroke-width="5"/>
<circle r="120" fill="none" stroke="#ffd98a" stroke-width="4"/>
</svg>'''
    parts.append(f'<div class="icon" id="{name}">{svg}</div>')

html = '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:transparent}.icon{width:512px;height:512px;display:inline-block}</style></head><body>' + ''.join(parts) + '</body></html>'
open('icons.html', 'w').write(html)
