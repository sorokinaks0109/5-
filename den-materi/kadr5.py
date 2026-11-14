import os, urllib.request, fal_client
os.environ.setdefault("FAL_KEY","proxy-injected")
p=("Vertical 9:16 close-up frame from the same warm 3D animated film (Pixar-like) as the references. The grown-up son and his older mother from image 1 "
   "hug cheek to cheek, both faces clearly visible to the camera, eyes closed, she smiles through happy tears, he smiles warmly. "
   "CLOTHES ARE STRICT: the mother wears ONLY a burgundy silk blouse with long burgundy sleeves; the son wears ONLY a dark forest-green knitted sweater. "
   "Simple clear pose: the MOTHER's two arms in BURGUNDY sleeves wrap around the son's neck and shoulders, her hands rest on his back; "
   "the SON's two arms in GREEN sleeves wrap around her waist. Every sleeve colour matches its owner. Exactly two arms each, correct anatomy, five fingers. "
   "Her face: silver-grey hair in a bun, reading glasses on a chain, same face as image 1 and image 2. Same cozy living room in warm evening light, soft bokeh. No text.")
refs=["kadry/04.png","kadry/v1/05_zelenyy_rukav.png"]
r=fal_client.subscribe("openai/gpt-image-2.6/flare/edit",arguments={"prompt":p,"image_urls":[fal_client.upload_file(x) for x in refs],
   "image_size":"portrait_16_9","quality":"medium","num_images":2,"output_format":"png"})
for i,im in enumerate(r["images"]): urllib.request.urlretrieve(im["url"],f"kadry/05_var{i}.png")
print("ok")
