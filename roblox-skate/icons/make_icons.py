# Генерирует HTML с аниме-иконками (SVG) для рендера в PNG
HAIR = "#ff9ec7"; HAIR_D = "#e9709f"; SKIN = "#ffe6d6"; EYE = "#5b2a86"; EYE2 = "#9b5de5"

def chan(eyes="open", mouth="smile", x=0, y=0, s=1.0):
    if eyes == "open":
        e = f'''
  <ellipse cx="-22" cy="8" rx="11" ry="14" fill="{EYE}"/>
  <ellipse cx="22" cy="8" rx="11" ry="14" fill="{EYE}"/>
  <ellipse cx="-22" cy="13" rx="8" ry="8" fill="{EYE2}"/>
  <ellipse cx="22" cy="13" rx="8" ry="8" fill="{EYE2}"/>
  <circle cx="-26" cy="2" r="4.5" fill="#fff"/><circle cx="18" cy="2" r="4.5" fill="#fff"/>
  <circle cx="-18" cy="15" r="2" fill="#fff"/><circle cx="26" cy="15" r="2" fill="#fff"/>
  <path d="M-34 -6 Q-22 -12 -12 -6" stroke="#3a1d55" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M12 -6 Q22 -12 34 -6" stroke="#3a1d55" stroke-width="3" fill="none" stroke-linecap="round"/>'''
    elif eyes == "happy":
        e = '''
  <path d="M-32 10 Q-22 -2 -12 10" stroke="#3a1d55" stroke-width="4.5" fill="none" stroke-linecap="round"/>
  <path d="M12 10 Q22 -2 32 10" stroke="#3a1d55" stroke-width="4.5" fill="none" stroke-linecap="round"/>'''
    else:  # wink
        e = f'''
  <path d="M-32 10 Q-22 -2 -12 10" stroke="#3a1d55" stroke-width="4.5" fill="none" stroke-linecap="round"/>
  <ellipse cx="22" cy="8" rx="11" ry="14" fill="{EYE}"/>
  <ellipse cx="22" cy="13" rx="8" ry="8" fill="{EYE2}"/>
  <circle cx="18" cy="2" r="4.5" fill="#fff"/><circle cx="26" cy="15" r="2" fill="#fff"/>'''
    if mouth == "smile":
        m = '<path d="M-7 30 Q0 37 7 30" stroke="#b03a5b" stroke-width="3" fill="none" stroke-linecap="round"/>'
    elif mouth == "open":
        m = '<path d="M-8 28 Q0 42 8 28 Z" fill="#c2405f"/><path d="M-5 33 Q0 38 5 33" fill="#ff8aa8"/>'
    else:  # cat
        m = '<path d="M-9 29 Q-4.5 34 0 29 Q4.5 34 9 29" stroke="#b03a5b" stroke-width="3" fill="none" stroke-linecap="round"/>'
    return f'''
<g transform="translate({x},{y}) scale({s})">
  <!-- хвостики -->
  <path d="M-48 -20 C-90 -10 -88 50 -62 70 C-70 40 -60 10 -40 0 Z" fill="{HAIR}" stroke="{HAIR_D}" stroke-width="2"/>
  <path d="M48 -20 C90 -10 88 50 62 70 C70 40 60 10 40 0 Z" fill="{HAIR}" stroke="{HAIR_D}" stroke-width="2"/>
  <!-- голова -->
  <ellipse cx="0" cy="5" rx="50" ry="46" fill="{SKIN}"/>
  <!-- волосы и чёлка -->
  <path d="M-54 8 C-60 -50 60 -50 54 8 C46 -10 36 -16 30 -4 C24 -18 12 -22 6 -8 C0 -22 -14 -20 -18 -6 C-26 -18 -40 -14 -54 8 Z" fill="{HAIR}" stroke="{HAIR_D}" stroke-width="2"/>
  <path d="M-30 -34 Q-10 -46 14 -40" stroke="#ffd1e4" stroke-width="5" fill="none" stroke-linecap="round"/>
  <!-- бантик -->
  <g transform="translate(34,-38) rotate(20)">
    <path d="M0 0 L-16 -10 L-16 10 Z" fill="#fff" stroke="{HAIR_D}" stroke-width="2"/>
    <path d="M0 0 L16 -10 L16 10 Z" fill="#fff" stroke="{HAIR_D}" stroke-width="2"/>
    <circle r="5" fill="#ffd166" stroke="{HAIR_D}" stroke-width="2"/>
  </g>
  {e}
  <!-- румянец -->
  <ellipse cx="-34" cy="24" rx="9" ry="5" fill="#ff9bb5" opacity="0.75"/>
  <ellipse cx="34" cy="24" rx="9" ry="5" fill="#ff9bb5" opacity="0.75"/>
  {m}
</g>'''

def sparkle(x, y, r, c="#fff"):
    return f'<path d="M{x} {y-r} Q{x} {y} {x+r} {y} Q{x} {y} {x} {y+r} Q{x} {y} {x-r} {y} Q{x} {y} {x} {y-r} Z" fill="{c}"/>'

def heart(x, y, s, c):
    return f'<path transform="translate({x},{y}) scale({s})" d="M0 6 C-12 -6 -6 -16 0 -9 C6 -16 12 -6 0 6 Z" fill="{c}" stroke="#fff" stroke-width="1.5"/>'

ITEMS = {
 "Boards": ('#ffb86b','#ff7eb3', chan("open","open",-12,26,0.95) + '''
   <g transform="translate(66,-58) rotate(-35)">
     <rect x="-14" y="-62" width="28" height="124" rx="14" fill="#ff7eb3" stroke="#fff" stroke-width="5"/>
     <rect x="-4" y="-52" width="8" height="104" rx="4" fill="#fff" opacity="0.8"/>
     <circle cx="-17" cy="-36" r="7" fill="#ffd166" stroke="#7a4a2a" stroke-width="2"/><circle cx="17" cy="-36" r="7" fill="#ffd166" stroke="#7a4a2a" stroke-width="2"/>
     <circle cx="-17" cy="36" r="7" fill="#ffd166" stroke="#7a4a2a" stroke-width="2"/><circle cx="17" cy="36" r="7" fill="#ffd166" stroke="#7a4a2a" stroke-width="2"/>
   </g>'''),
 "Speed": ('#7cc6ff','#5a7dff', chan("happy","open",-18,26,0.95) + '''
   <path d="M70 -100 L30 -20 L58 -20 L36 50 L96 -40 L66 -40 L90 -100 Z" fill="#ffe14d" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>
   <path d="M-96 -70 L-40 -70 M-96 -50 L-56 -50 M-96 -30 L-66 -30" stroke="#fff" stroke-width="7" stroke-linecap="round"/>'''),
 "Zones": ('#8ee3a8','#3fb6a8', chan("wink","smile",-16,28,0.95) + '''
   <path d="M66 -18 C40 -50 34 -70 34 -82 A32 32 0 0 1 98 -82 C98 -70 92 -50 66 -18 Z" fill="#ff6b9a" stroke="#fff" stroke-width="5"/>
   <circle cx="66" cy="-82" r="12" fill="#fff"/>'''),
 "Shop": ('#ff9ed2','#c77dff', chan("open","cat",-16,30,0.92) + '''
   <rect x="34" y="-70" width="70" height="66" rx="12" fill="#fff" stroke="#c77dff" stroke-width="5"/>
   <path d="M50 -70 Q50 -100 69 -100 Q88 -100 88 -70" stroke="#c77dff" stroke-width="6" fill="none"/>''' + heart(69,-38,2.0,"#ff6b9a")),
 "Daily": ('#ffd36b','#ff9a5a', chan("happy","smile",-16,30,0.92) + '''
   <rect x="30" y="-96" width="76" height="76" rx="12" fill="#fff" stroke="#ff7a59" stroke-width="5"/>
   <rect x="30" y="-96" width="76" height="22" rx="10" fill="#ff7a59"/>
   <circle cx="48" cy="-98" r="5" fill="#fff" stroke="#ff7a59" stroke-width="3"/><circle cx="88" cy="-98" r="5" fill="#fff" stroke="#ff7a59" stroke-width="3"/>''' + heart(68,-48,1.9,"#ff6b9a")),
 "Gifts": ('#7ee0c5','#4cb3ff', chan("open","open",-16,30,0.92) + '''
   <rect x="32" y="-60" width="72" height="56" rx="8" fill="#ff7eb3" stroke="#fff" stroke-width="5"/>
   <rect x="26" y="-74" width="84" height="20" rx="6" fill="#ff9ec7" stroke="#fff" stroke-width="5"/>
   <rect x="62" y="-74" width="12" height="70" fill="#ffe14d"/>
   <path d="M68 -74 C50 -104 36 -86 68 -74 C86 -104 100 -86 68 -74 Z" fill="#ffe14d" stroke="#fff" stroke-width="4"/>'''),
 "Trails": ('#b8a4ff','#ff8ad8', chan("wink","open",-16,30,0.92) + '''
   <path d="M-90 -40 Q0 -120 100 -70" stroke="#ff6b9a" stroke-width="10" fill="none" stroke-linecap="round"/>
   <path d="M-90 -28 Q0 -108 100 -58" stroke="#ffe14d" stroke-width="10" fill="none" stroke-linecap="round"/>
   <path d="M-90 -16 Q0 -96 100 -46" stroke="#5ad1ff" stroke-width="10" fill="none" stroke-linecap="round"/>'''),
 "Codes": ('#ffb0c8','#ff7aa2', chan("happy","cat",-16,30,0.92) + '''
   <g transform="translate(68,-60) rotate(-15)">
     <path d="M-40 -24 H40 V-8 A8 8 0 0 0 40 8 V24 H-40 V8 A8 8 0 0 0 -40 -8 Z" fill="#fff" stroke="#ff4f8b" stroke-width="5"/>
     <text x="0" y="8" font-family="Arial Black,Arial" font-weight="900" font-size="20" text-anchor="middle" fill="#ff4f8b">CODE</text>
   </g>'''),
 "Rebirth": ('#c3a6ff','#7a5cff', chan("open","smile",-16,30,0.92) + '''
   <g transform="translate(68,-58)">
     <path d="M-30 0 A30 30 0 0 1 26 -15" stroke="#fff" stroke-width="9" fill="none" stroke-linecap="round"/>
     <path d="M30 0 A30 30 0 0 1 -26 15" stroke="#fff" stroke-width="9" fill="none" stroke-linecap="round"/>
     <path d="M18 -30 L32 -14 L12 -8 Z" fill="#fff"/><path d="M-18 30 L-32 14 L-12 8 Z" fill="#fff"/>
   </g>''' + sparkle(68,-58,12,"#ffe14d")),
 "Settings": ('#c9c9e8','#8c8cc4', chan("open","smile",-16,30,0.92) + '''
   <g transform="translate(68,-58)">
     <circle r="26" fill="#fff" stroke="#8c8cc4" stroke-width="5"/>
     ''' + ''.join(f'<rect x="-7" y="-40" width="14" height="16" rx="3" fill="#fff" stroke="#8c8cc4" stroke-width="4" transform="rotate({a})"/>' for a in range(0,360,45)) + '''
     <circle r="10" fill="#8c8cc4"/>
   </g>'''),
 "Starter": ('#ffd36b','#ff6b9a', chan("happy","open",-16,30,0.92) + '''
   <rect x="28" y="-62" width="78" height="60" rx="8" fill="#a66bff" stroke="#fff" stroke-width="5"/>
   <rect x="22" y="-78" width="90" height="22" rx="6" fill="#c79bff" stroke="#fff" stroke-width="5"/>
   <rect x="61" y="-78" width="12" height="76" fill="#ffe14d"/>
   <path d="M67 -78 C48 -110 32 -90 67 -78 C86 -110 102 -90 67 -78 Z" fill="#ffe14d" stroke="#fff" stroke-width="4"/>''' + sparkle(104,-100,12) + sparkle(28,-96,9)),
}

parts = []
for name, (c1, c2, art) in ITEMS.items():
    head, item = art.split('\n</g>', 1)
    art = head + '\n</g>' + '<g transform="translate(-4,30) scale(0.8)">' + item + '</g>'
    parts.append(f'''
<div class="icon" id="{name}">
<svg viewBox="-128 -128 256 256" width="256" height="256" xmlns="http://www.w3.org/2000/svg">
  <defs><radialGradient id="g{name}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></radialGradient>
  <clipPath id="c{name}"><circle r="118"/></clipPath></defs>
  <circle r="118" fill="url(#g{name})" stroke="#fff" stroke-width="8"/>
  <g clip-path="url(#c{name})">
    {sparkle(-88,-88,10)}{sparkle(-60,-104,6)}{sparkle(96,70,8)}
    {art}
  </g>
  <circle r="118" fill="none" stroke="#fff" stroke-width="8"/>
</svg></div>''')

html = '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:transparent} .icon{width:256px;height:256px;display:inline-block}</style></head><body>' + ''.join(parts) + '</body></html>'
open('icons.html','w').write(html)
print(list(ITEMS))
