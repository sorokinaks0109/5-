import os, sys, urllib.request, fal_client
os.environ.setdefault("FAL_KEY","proxy-injected")
M="openai/gpt-image-2.6/flare/edit"
STIL=(" Same warm high-quality 3D animated feature film style (Pixar-like) as the references, soft cinematic light, expressive faces. "
      "Vertical 9:16. No text, no letters, no logos. Correct anatomy, five fingers.")
MAMA=(" The mother is the same woman as in image 1 (same face, chestnut-brown hair in a messy bun, brown eyes), about 30 years old."
      " The boy is the same boy as in image 2 (same face, brown hair), at the age described.")
def go(out, p, refs):
    r=fal_client.subscribe(M,arguments={"prompt":p,"image_urls":[fal_client.upload_file(x) for x in refs],
       "image_size":"portrait_16_9","quality":"medium","num_images":1,"output_format":"png"})
    urllib.request.urlretrieve(r["images"][0]["url"],out); print(out,"ok",flush=True)
NEW={
"a_privivka":"Bright friendly children's clinic room with pastel walls and toys: the mother sits on a chair holding her 1.5-year-old son on her lap, hugging him tightly and holding his little hand, "
  "comforting him and smiling encouragingly; a kind female nurse in light-blue uniform gently puts a small round plaster on the boy's upper arm; the boy has a tear but is brave. "
  "The mother wears a soft sage-green turtleneck sweater and jeans (NOT a cardigan).",
"b_luzhi":"Bright spring day in a city park after rain: the mother and her 3-year-old son jump together into a big puddle holding hands, splashes flying, both laughing happily. "
  "The mother wears a bright yellow raincoat and blue jeans with rubber boots, the boy wears a red raincoat and green rubber boots. Fresh green trees, sunlight.",
"c_risuem":"Cozy sunny kitchen: the mother and her 5-year-old son sit at the table drawing together with colorful paints and pencils, the boy shows her his drawing of their family (simple child drawing, no text), "
  "both laugh, a small smear of paint on their noses. Child drawings are pinned to the fridge behind them. The mother wears a white-and-navy striped t-shirt (NOT a cardigan).",
}
k=sys.argv[1]
if k in NEW:
    go(f"kadry/{k}.png", NEW[k]+MAMA+STIL+" Images 1 and 2 are only references for the faces and style, do not copy their composition or clothes.",
       ["kadry/v1/01.png","kadry/v1/02.png"])
elif k=="02":
    go("kadry/02.png","Edit image 1: keep EVERYTHING the same (composition, faces, the boy, his clothes and flowers, the school, autumn light, pose, hands), "
       "ONLY change the mother's clothes: she now wears an elegant dark-navy dress and an open light camel trench coat, a thin silk scarf; the brown leather bag stays. No cardigan. No text.",["kadry/v1/02.png"])
elif k=="03":
    go("kadry/03.png","Edit image 1: keep EVERYTHING the same (composition, her face, grey hair, glasses, pose, phone, table, cup, room, light), "
       "ONLY change her clothes: she now wears a soft dusty-blue knitted turtleneck sweater instead of the beige cardigan and blouse. No text.",["kadry/v1/03.png"])
elif k=="04":
    go("kadry/04.png","Edit image 1: keep EVERYTHING the same (composition, camera angle, faces, hair, glasses, the tablet with the cartoon on its screen, hands, room, light), "
       "ONLY change the clothes: the mother now wears an elegant burgundy silk blouse instead of the beige cardigan, the son wears a dark forest-green knitted sweater. No text.",["kadry/v1/04.png"])
elif k=="05":
    go("kadry/05.png","Edit image 1: keep EVERYTHING the same (composition, faces, expressions, tears, hug pose, hands, room, light), "
       "ONLY change the clothes to match image 2: the mother wears the same elegant burgundy silk blouse, the son wears the same dark forest-green knitted sweater. No text.",["kadry/v1/05.png","kadry/04.png"])
