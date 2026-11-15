import os, sys, urllib.request, fal_client, concurrent.futures as cf
os.environ.setdefault("FAL_KEY","proxy-injected")
RAZ=("The envelope: exactly ONE closed cream envelope with a red wax seal, a landscape rectangle about 1.5 times as wide as the dragon's head "
     "(the same size as on the reference sheet, image 2). Not bigger, not smaller, never two envelopes.")
def go(k):
    look=("he glances back over his shoulder at the camera with a cheerful smile, three-quarter view, " if k=="3" else
          "he LOOKS FORWARD in the direction of flight, toward where he is flying (NOT at the camera); his head is turned slightly to the side so we see it in SIDE PROFILE: his snout points forward, one eye looks ahead, ")
    p=("Edit image 1: keep the composition, camera angle, background, lighting, motion blur and the dragon's body and wings the same, but "+look+
       "and his mouth is clearly visible. He carries the envelope IN HIS MOUTH: one short edge of the envelope is gripped between his front teeth and the envelope sticks out "
       "sideways from his mouth, clearly OUTSIDE his head, like a puppy carrying a letter. It must be obvious that the envelope is in his mouth, not behind or through his head. "
       "His front paws are empty and tucked under his chest. "+RAZ+" No text.")
    r=fal_client.subscribe("openai/gpt-image-2.6/flare/edit",arguments={"prompt":p,
       "image_urls":[fal_client.upload_file(f"kadry/v1/{k}.png" if k!="3" else "kadry/rot_3.png"),fal_client.upload_file("razmery.png")],"image_size":"portrait_16_9","quality":"medium","num_images":1,"output_format":"png"})
    urllib.request.urlretrieve(r["images"][0]["url"],f"kadry/rot_{k}.png"); return k
with cf.ThreadPoolExecutor(4) as ex:
    for f in cf.as_completed([ex.submit(go,k) for k in sys.argv[1:]]):
        try: print(f.result(),"ok",flush=True)
        except Exception as e: print("ОШИБКА",e,flush=True)
