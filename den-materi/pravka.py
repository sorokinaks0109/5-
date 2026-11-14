import os, sys, urllib.request, fal_client
os.environ.setdefault("FAL_KEY","proxy-injected")
M="openai/gpt-image-2.6/flare/edit"
def go(out, prompt, refs):
    r=fal_client.subscribe(M,arguments={"prompt":prompt,"image_urls":[fal_client.upload_file(x) for x in refs],
       "image_size":"portrait_16_9","quality":"medium","num_images":1,"output_format":"png"})
    urllib.request.urlretrieve(r["images"][0]["url"],out); print(out,"ok",flush=True)
k=sys.argv[1]
if k=="04":
    go("kadry/04.png","Edit image 1: keep EVERYTHING exactly the same (composition, camera angle, the tablet and the cartoon on its screen, the son, the room, light, style), "
       "ONLY change the mother's hands: she no longer touches her face; she holds the tablet with BOTH hands, one on each side of the tablet. "
       "Her face is visible in profile with a touched, happy expression and a tear on her cheek. Exactly two hands for her, anatomically correct. No text.",
       ["kadry/04_v3.png"])
else:
    go("kadry/05.png","Vertical 9:16 close-up frame from the same warm 3D animated film (Pixar-like) as image 1: the grown-up son from image 1 hugs his mother "
       "(the same older woman from image 1: silver-grey hair in a bun, reading glasses on a chain, beige knitted cardigan) tightly, cheek to cheek, "
       "both faces clearly visible to the camera. She has her eyes closed with happy tears on her cheeks and a gentle smile, he smiles warmly with eyes closed. "
       "Her arms hug his back. Correct anatomy, exactly two arms each. Same cozy living room in soft warm evening light, blurred background, "
       "no Christmas decorations. Same faces as in image 1, the son looks like the boy in image 2 grown up. No text.",
       ["kadry/04_v3.png","kadry/02.png","kadry/03.png"])
