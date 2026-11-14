import os, sys, urllib.request, fal_client, concurrent.futures as cf
os.environ.setdefault("FAL_KEY","proxy-injected")
ENV=(" The envelope is ALWAYS the same small closed cream envelope with a red wax seal, about as wide as the dragon's head: it NEVER opens, NEVER unfolds, "
     "NEVER turns into a sheet of paper and NEVER changes size. The dragon looks exactly the same all the time. The child keeps sleeping, face hidden. "
     "High-quality 3D animated film motion, smooth.")
J={
"45":("start","4.png","5.png","The dragon slows down and glides in through the open window into the cozy child's bedroom, the camera follows him inside, "
      "he lands softly on the pillow next to the sleeping child, carefully places the small envelope on the pillow, then raises one claw to his lips: shh."),
"5w":("start","5.png","5.png","The little dragon keeps the claw at his lips for a moment (shh), looks right into the camera, gives a big cute playful WINK with one eye, "
      "smiles sweetly, the flame on his tail flickers, tiny golden sparkles float in the air. The camera is almost still, very slow push-in."),
}
def odin(k):
    _,a,b,p=J[k]
    r=fal_client.subscribe("kling/v4/image-to-video",arguments={"prompt":p+ENV,"start_image_url":fal_client.upload_file("kadry/"+a),
        "end_image_url":fal_client.upload_file("kadry/"+b),"duration":5,"resolution":"720p"})
    urllib.request.urlretrieve(r["video"]["url"],f"klipy/{k}.mp4"); return k+" ok"
with cf.ThreadPoolExecutor(2) as ex:
    for f in cf.as_completed([ex.submit(odin,k) for k in (sys.argv[1:] or J)]):
        try: print(f.result(),flush=True)
        except Exception as e: print("ОШИБКА",e,flush=True)
