#!/usr/bin/env python3
"""Собирает SkateRush.rbxlx из файлов в src/.

Запуск:  python3 build_place.py
Получившийся SkateRush.rbxlx открывается в Roblox Studio (File → Open from File).
"""
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).parent
SRC = ROOT / "src"
OUT = ROOT / "SkateRush.rbxlx"

_ref = 0


def ref():
    global _ref
    _ref += 1
    return f"RBX{_ref:08X}"


def script_item(cls, name, source, children=""):
    if "]]>" in source:
        raise ValueError(f"{name}: в коде не должно быть ']]>'")
    return (
        f'<Item class="{cls}" referent="{ref()}"><Properties>'
        f'<string name="Name">{escape(name)}</string>'
        f'<ProtectedString name="Source"><![CDATA[{source}]]></ProtectedString>'
        f"</Properties>{children}</Item>"
    )


def folder(name, children):
    return (
        f'<Item class="Folder" referent="{ref()}"><Properties>'
        f'<string name="Name">{escape(name)}</string></Properties>{children}</Item>'
    )


def service(cls, children="", props=""):
    return (
        f'<Item class="{cls}" referent="{ref()}"><Properties>'
        f'<string name="Name">{cls}</string>{props}</Properties>{children}</Item>'
    )


def read(rel):
    return (SRC / rel).read_text(encoding="utf-8")


def main():
    shared = script_item("ModuleScript", "Config", read("shared/Config.luau"))

    server_children = script_item("ModuleScript", "Data", read("server/Data.luau")) + script_item(
        "ModuleScript", "World", read("server/World.luau")
    )
    server = script_item("Script", "SkateServer", read("server/init.server.luau"), server_children)

    client_children = script_item("ModuleScript", "UI", read("client/UI.luau"))
    client = script_item("LocalScript", "SkateClient", read("client/init.client.luau"), client_children)

    starter_player_props = (
        '<bool name="CharacterUseJumpPower">true</bool>'
        '<float name="CharacterJumpPower">60</float>'
        '<float name="CameraMaxZoomDistance">60</float>'
    )
    lighting_props = '<float name="ClockTime">14</float><float name="FogEnd">1100</float>'

    body = (
        service("ReplicatedStorage", folder("SkateShared", shared))
        + service("ServerScriptService", server)
        + service(
            "StarterPlayer",
            service("StarterPlayerScripts", client),
            starter_player_props,
        )
        + service("Lighting", "", lighting_props)
    )

    xml = (
        '<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" '
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
        'xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">'
        f"{body}</roblox>\n"
    )
    OUT.write_text(xml, encoding="utf-8")
    print(f"Готово: {OUT}")


if __name__ == "__main__":
    main()
