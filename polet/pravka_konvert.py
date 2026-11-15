import os, sys, urllib.request, fal_client, concurrent.futures as cf
os.environ.setdefault("FAL_KEY","proxy-injected")
RAZ=("STRICT SIZE RULE (same in every frame): there is exactly ONE closed cream envelope with a red wax seal, landscape rectangle, "
     "exactly as wide as the dragon's torso, as on the size reference sheet (image 2). Not bigger, not smaller, never two envelopes, never a sheet of paper.")
J={
"1":"Edit image 1: keep EVERYTHING the same (composition, camera, forest, path, lanterns, the dragon's pose, wings, light, motion blur), ONLY fix the envelope: the dragon holds exactly ONE wide envelope in both front paws against his chest; because we see him from behind, the left and right ends of the SAME envelope clearly stick out on BOTH sides of his chest, below his shoulders, exactly like in image 2 (dragon seen from behind with the envelope). The envelope is as wide as his torso plus a little on each side.",
"2":"Edit image 1: keep EVERYTHING the same (composition, camera, river, stone bridge, the steam train, aurora, the dragon's pose and wings, light, motion blur), ONLY fix the envelope: the dragon holds exactly ONE wide envelope in both front paws against his chest; because we see him from behind, the left and right ends of the SAME envelope clearly stick out on BOTH sides of his chest, below his shoulders, exactly like in image 2 (dragon seen from behind with the envelope). The envelope is as wide as his torso plus a little on each side.",
"3":"Edit image 1: keep EVERYTHING the same (composition, camera, the festive city, fireworks, the dragon's pose and wings, light, motion blur), ONLY make the envelope in his paws BIGGER: exactly as wide as his torso, like in image 2. The dragon holds exactly ONE wide envelope in both front paws against his chest; because we see him from behind, the left and right ends of the SAME envelope clearly stick out on BOTH sides of his chest, below his shoulders, exactly like in image 2 (dragon seen from behind with the envelope). The envelope is as wide as his torso plus a little on each side.",
"4":"Edit image 1: keep EVERYTHING the same (composition, camera, roofs, chimneys, the open lit window, the dragon's pose and wings, light, motion blur), ONLY fix the envelope: the dragon holds exactly ONE wide envelope in both front paws against his chest; because we see him from behind, the left and right ends of the SAME envelope clearly stick out on BOTH sides of his chest, below his shoulders, exactly like in image 2 (dragon seen from behind with the envelope). The envelope is as wide as his torso plus a little on each side.",
"5":"Edit image 1: keep EVERYTHING the same (the dragon sitting on the pillow with a claw at his lips, the bedroom, the sleeping child with hidden face, toys, light), ONLY fix the envelope lying on the pillow in front of the dragon: exactly ONE envelope, as on image 2 lying on the ground.",
}
SRC={"1":"kadry/1.png","2":"kadry/2.png","3":"kadry/3.png","4":"kadry/4.png","5":"kadry/5.png"}
REF={"1":"razmery_szadi.png","2":"razmery_szadi.png","4":"razmery_szadi.png","3":"razmery_speredi.png"}
def go(k):
    r=fal_client.subscribe("openai/gpt-image-2.6/flare/edit",arguments={"prompt":J[k]+" "+RAZ+" Image 2 is the size reference sheet. No text.",
       "image_urls":[fal_client.upload_file(SRC[k]),fal_client.upload_file(REF[k])],"image_size":"portrait_16_9","quality":"medium","num_images":1,"output_format":"png"})
    urllib.request.urlretrieve(r["images"][0]["url"],f"kadry/{k}.png"); return k
with cf.ThreadPoolExecutor(5) as ex:
    for f in cf.as_completed([ex.submit(go,k) for k in (sys.argv[1:] or J)]):
        try: print(f.result(),"ok",flush=True)
        except Exception as e: print("ОШИБКА",e,flush=True)
