import os, sys, urllib.request, fal_client
os.environ.setdefault("FAL_KEY","proxy-injected")
M="openai/gpt-image-2.6/flare/edit"
STIL=("Vertical 9:16 frame from a high-quality warm 3D animated feature film (Pixar-like), soft cinematic light, "
      "cozy warm colors, emotional, expressive faces. No text, no letters, no logos.")
MAMA=("The mother: slim Russian woman with chestnut-brown hair, kind brown eyes, small mole above her lip, "
      "same face in every frame.")
S={
"01":"Night, cozy bedroom lit by a small warm lamp, the clock on the wall shows 3 o'clock. A tired young mother (about 27) "
     "in a soft cardigan gently rocks a crying baby in her arms by the window, she smiles tenderly despite tiredness. ",
"02":"Bright sunny autumn morning, September 1st school day in a Russian town: the same mother, now about 35, holds the hand "
     "of her small son (7) in a white shirt with a backpack and a big bouquet of asters, she looks at him proudly with "
     "happy tears in her eyes. School building and yellow trees behind. ",
"03":"Evening, cozy kitchen, the same mother but clearly OLDER, about 60: mostly silver-grey hair in a bun, visible wrinkles around eyes and mouth, reading glasses on a chain, sits alone by the window with a "
     "cup of tea, holding her phone, looking at it hopefully, waiting for a call. Soft melancholic warm light. ",
"04":"Cozy living room decorated for a family celebration: the same mother clearly OLDER, about 60: mostly silver-grey hair in a bun, visible wrinkles, reading glasses on a chain, sits on the sofa watching a tablet "
     "where an animated cartoon plays: on the screen is a cartoon of HER younger self holding a baby, surrounded by sparkles (no text). Late autumn, NO Christmas tree, NO New Year decorations, a bouquet of flowers on the table, she covers her mouth with her "
     "hand, touched to happy tears; her grown-up son (about 30) and daughter (about 27) hug her from both sides, smiling. ",
}
def go(k, refs):
    p=S[k]+MAMA+STIL+((" Image 1 shows the same woman: keep her face, hair and features identical (age her as described). " if refs else "")+" The last image is ONLY a render-quality and style reference (3D animated look), do not copy its content.")
    args={"prompt":p,"image_size":"portrait_16_9","quality":"medium","num_images":1,"output_format":"png"}
    refs=refs+["/home/user/5-/kartinki-dlya-sayta/poezd_05_maksim_mashinist.jpg"]
    args["image_urls"]=[fal_client.upload_file(r) for r in refs]; m=M
    r=fal_client.subscribe(m,arguments=args)
    urllib.request.urlretrieve(r["images"][0]["url"],f"kadry/{k}.png"); print(k,"ok",flush=True)
ks=sys.argv[1:]
for k in ks:
    go(k, [] if k=="01" else ["kadry/01.png"]+(["kadry/03.png"] if k=="04" else []))
