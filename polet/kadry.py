import os, sys, urllib.request, fal_client, concurrent.futures as cf
os.environ.setdefault("FAL_KEY","proxy-injected")
B="/home/user/5-/masterskaya-skazok/shablony/"
DR=B+"drakonchik/personazhi/drakonchik_list.png"; POEZD=B+"poezd/kadry/01.png"; MSK=B+"vau/final_kadr.png"
OB=("Vertical 9:16 frame from a high-quality 3D animated feature film, magical New Year night, snow falling, warm glowing lights, cinematic. "
    "FPV DRONE CHASE SHOT: the camera flies right BEHIND and slightly above the little red baby dragon, we see the dragon mostly from behind "
    "(back, spread red-orange wings, tail with a small golden flame on the tip), strong sense of speed and motion blur at the edges. "
    "The baby dragon must look exactly like the dragon on the reference sheet (image 1). He carries a big cream-colored envelope with a red wax seal in his front paws. "
    "No text, no letters, no logos.")
S={
"1":(OB+" Scene: the dragon flies very low and fast along a snowy path through a magical winter fir forest, snow-covered fir trees rush by on both sides, the path ahead lit by small lanterns.",[DR]),
"2":(OB+" Scene: the dragon swoops low over a frozen river and dives UNDER an old arched stone railway bridge, while above on the bridge the green-and-gold steam train from image 2 crosses with glowing windows and puffs of steam.",[DR,POEZD]),
"3":(OB+" Scene: the dragon soars high over a night city that looks like the festive lit city in image 2 (Moscow-like old city, snowy roofs, garlands, a big lit New Year tree on a square far below), banking into a turn, city lights sparkle below.",[DR,MSK]),
"4":(OB+" Scene: the dragon flies low between snowy roofs and chimneys of old cozy houses toward ONE warmly lit window of a house that is slightly OPEN, a small child's room behind it with a night lamp; the window comes close.",[DR]),
"5":("Vertical 9:16 frame from a high-quality 3D animated feature film. Inside a cozy child's bedroom at night, soft warm night-lamp light, snow outside the open window. "
     "The little red baby dragon (exactly like the dragon on image 1) has just flown in and very gently places a big cream-colored envelope with a red wax seal on the pillow "
     "next to a sleeping child; the child is seen from behind/side under a blanket, face mostly hidden, only hair visible (no identifiable face). "
     "The dragon smiles tenderly and puts a claw to his lips: 'shh'. Sparkles in the air. No text, no letters.",[DR]),
}
def go(k):
    p,refs=S[k]
    r=fal_client.subscribe("openai/gpt-image-2.6/flare/edit",arguments={"prompt":p+" Image 1 is the dragon reference sheet"+(", image 2 is a reference for the world." if len(refs)>1 else "."),
       "image_urls":[fal_client.upload_file(x) for x in refs],"image_size":"portrait_16_9","quality":"medium","num_images":1,"output_format":"png"})
    urllib.request.urlretrieve(r["images"][0]["url"],f"kadry/{k}.png"); return k
with cf.ThreadPoolExecutor(5) as ex:
    for f in cf.as_completed([ex.submit(go,k) for k in (sys.argv[1:] or S)]):
        try: print(f.result(),"ok",flush=True)
        except Exception as e: print("ОШИБКА",e,flush=True)
