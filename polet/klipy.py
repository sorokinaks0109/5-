import os, sys, urllib.request, fal_client, concurrent.futures as cf
os.environ.setdefault("FAL_KEY","proxy-injected")
T=(" Continuous FPV drone chase shot, the camera keeps flying right behind the little red baby dragon at high speed, smooth, no cuts. "
   "The dragon stays the same (red scales, cream belly, small horns, flame on the tail tip) and keeps holding the cream envelope with the red wax seal. "
   "High-quality 3D animated film motion, snow falling.")
P={
"12":"The dragon races low along the snowy forest path between fir trees, then the forest opens up onto a frozen river and he dives toward the old stone bridge while the steam train crosses above.",
"23":"The dragon dives under the stone bridge, bursts out the other side and soars steeply up into the sky, revealing the glowing festive night city below with fireworks.",
"34":"The dragon banks and dives down from the sky toward the snowy rooftops, flies fast between chimneys and roofs toward a warmly lit slightly open window.",
"45":"The dragon slows down and gently glides in through the open window into the cozy child's bedroom, lands softly on the pillow, carefully places the envelope next to the sleeping child and puts a claw to his lips: shh. The camera slows down and follows him inside. The child keeps sleeping, face hidden.",
}
def odin(k):
    out=f"klipy/{k}.mp4"
    if os.path.exists(out): return k+" есть"
    a,b=k[0],k[1]
    r=fal_client.subscribe("kling/v4/image-to-video",arguments={"prompt":P[k]+T,
        "start_image_url":fal_client.upload_file(f"kadry/{a}.png"),"end_image_url":fal_client.upload_file(f"kadry/{b}.png"),
        "duration":5,"resolution":"720p"})
    urllib.request.urlretrieve(r["video"]["url"],out); return k+" ok"
with cf.ThreadPoolExecutor(2) as ex:
    for f in cf.as_completed([ex.submit(odin,k) for k in (sys.argv[1:] or P)]):
        try: print(f.result(),flush=True)
        except Exception as e: print("ОШИБКА",e,flush=True)
