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
"04":"Cozy living room, late autumn evening. OVER-THE-SHOULDER shot from BEHIND the sofa: we see the back and side of the head of the same mother clearly OLDER, about 60 (mostly silver-grey hair in a bun, visible wrinkles, reading glasses on a chain) sits on the sofa and holds a tablet in both hands in front of her chest with the SCREEN FACING HER EYES (and therefore also facing the camera behind her); she LOOKS DOWN AT THE SCREEN; we see her face in profile (three-quarter from behind) and the screen clearly over her shoulder. On the screen an animated cartoon of HER younger self holding a baby, sparkles (no text). She covers her mouth with one hand, touched to happy tears. Her ONLY child, her grown-up son (about 30, the same boy as in image 2, now an adult with the same brown hair and face), sits beside her, hugs her shoulders and also looks at the screen, his face in profile, smiling. ONLY these two people in the frame, no daughter, no other people. NO Christmas tree, NO New Year decorations, a bouquet of flowers on the table. ",
}
def go(k, refs):
    p=S[k]+MAMA+STIL+((" Image 1 shows the same woman (for frame 4: image 2 shows her son as a child, image 3 the woman older): keep her face, hair and features identical (age her as described). " if refs else "")+" The last image is ONLY a render-quality and style reference (3D animated look), do not copy its content.")
    args={"prompt":p,"image_size":"portrait_16_9","quality":"medium","num_images":1,"output_format":"png"}
    refs=refs+["/home/user/5-/kartinki-dlya-sayta/poezd_05_maksim_mashinist.jpg"]
    args["image_urls"]=[fal_client.upload_file(r) for r in refs]; m=M
    r=fal_client.subscribe(m,arguments=args)
    urllib.request.urlretrieve(r["images"][0]["url"],f"kadry/{k}.png"); print(k,"ok",flush=True)
ks=sys.argv[1:]
for k in ks:
    go(k, [] if k=="01" else ["kadry/01.png"]+(["kadry/02.png","kadry/03.png"] if k=="04" else []))
