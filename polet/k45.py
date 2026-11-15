import os, urllib.request, fal_client, concurrent.futures as cf
os.environ.setdefault("FAL_KEY","proxy-injected")
p=("The dragon slows down and glides in through the open window into the cozy child's bedroom, the camera follows him inside; he lands softly on the pillow next to the sleeping child, "
   "bows his head down and gently DROPS the envelope FROM HIS MOUTH onto the pillow, then raises one claw to his lips: shh. "
   "STRICT: the envelope stays IN HIS MOUTH, gripped in his teeth, the WHOLE time until he drops it onto the pillow; his front paws NEVER touch or hold the envelope. "
   "Exactly ONE closed cream envelope with a red wax seal, always the same size (about 1.5 times as wide as his head), never grows, never shrinks, never doubles, never opens. "
   "The dragon looks exactly the same all the time. The child keeps sleeping, face hidden. No new objects, no text. High-quality 3D animated film motion, smooth.")
def odin(i):
    r=fal_client.subscribe("kling/v4/image-to-video",arguments={"prompt":p,"start_image_url":fal_client.upload_file("kadry/4.png"),
        "end_image_url":fal_client.upload_file("kadry/5.png"),"duration":5,"resolution":"720p"})
    urllib.request.urlretrieve(r["video"]["url"],f"klipy/45_var{i}.mp4"); return i
with cf.ThreadPoolExecutor(2) as ex:
    for f in cf.as_completed([ex.submit(odin,i) for i in (1,2)]):
        try: print(f.result(),"ok",flush=True)
        except Exception as e: print("ОШИБКА",e,flush=True)
