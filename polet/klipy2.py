import os, sys, urllib.request, fal_client, concurrent.futures as cf
os.environ.setdefault("FAL_KEY","proxy-injected")
CEL=(" CONSISTENCY: the little red baby dragon looks exactly the same all the time (red scales, cream belly, small cream horns, red-orange wings, golden flame on the tail tip). "
     "He carries exactly ONE closed cream envelope with a red wax seal IN HIS MOUTH, gripped in his teeth; the envelope keeps EXACTLY the same size all the time "
     "(about 1.5 times as wide as his head), never grows, never shrinks, never doubles, never opens, never turns into paper, never moves into his paws. "
     "No new objects, no text. High-quality 3D animated film motion, smooth.")
FPV=" Continuous FPV drone chase shot: the camera keeps flying right behind the dragon at high speed, no cuts."
VPERED=" He keeps looking FORWARD in the direction of flight, his head in side profile, not at the camera."
J={
"12":("1","2","The dragon races low along the snowy forest path between fir trees, then the forest opens onto a frozen river and he speeds toward the old stone bridge while the steam train crosses above."+VPERED+FPV),
"23":("2","3","The dragon dives under the stone bridge, bursts out the other side and soars steeply up into the sky above the glowing festive city with fireworks; at the very end he turns his head and glances back at the camera with a cheerful smile."+FPV),
"34":("3","4","The dragon turns his head forward again, banks and dives from the sky down to the snowy rooftops, flies fast between chimneys toward a warmly lit slightly open window. The Moscow skyline with the red Kremlin towers, the colorful onion domes of the cathedral and the big New Year tree STAYS visible in the distance the whole time, it never disappears or changes."+VPERED+FPV),
"45":("4","5","The dragon slows down and glides in through the open window into the cozy child's bedroom, the camera follows him inside; he lands softly on the pillow next to the sleeping child, "
      "takes the envelope out of his mouth with his front paws and carefully lays it on the pillow, then raises one claw to his lips: shh. The child keeps sleeping, face hidden."),
"5w":("5","5","The little dragon keeps one claw at his lips (shh), looks right into the camera, gives a big cute playful WINK with one eye, smiles sweetly; "
      "the flame on his tail flickers, tiny golden sparkles float. The envelope lies still on the pillow. The camera is almost still, very slow push-in."),
}
J["45"]=("4","5","The dragon slows down and glides in through the open window into the cozy child's bedroom, the camera follows him inside; he lands softly on the pillow next to the sleeping child, bows his head down and gently DROPS the envelope FROM HIS MOUTH onto the pillow, then raises one claw to his lips: shh. STRICT: the envelope stays IN HIS MOUTH, gripped in his teeth, the WHOLE time until he drops it onto the pillow; his front paws NEVER touch or hold the envelope. Exactly ONE closed cream envelope with a red wax seal, always the same size (about 1.5 times as wide as his head), never grows, never shrinks, never doubles, never opens. The dragon looks exactly the same all the time. The child keeps sleeping, face hidden. No new objects, no text. High-quality 3D animated film motion, smooth. The bedroom layout never changes: the bed with the sleeping child stands right under the window, exactly as in the end frame.")
def odin(k):
    out=f"klipy/{k}.mp4"
    if os.path.exists(out): return k+" есть"
    a,b,p=J[k]
    cel="" if k=="45" else CEL if k!="5w" else CEL.replace("IN HIS MOUTH, gripped in his teeth","(in his mouth, then on the pillow)").replace(", never moves into his paws","")
    r=fal_client.subscribe("kling/v4/image-to-video",arguments={"prompt":p+cel,"start_image_url":fal_client.upload_file(f"kadry/{a}.png"),
        "end_image_url":fal_client.upload_file(f"kadry/{b}.png"),"duration":5,"resolution":"720p"})
    urllib.request.urlretrieve(r["video"]["url"],out); return k+" ok"
with cf.ThreadPoolExecutor(2) as ex:
    for f in cf.as_completed([ex.submit(odin,k) for k in (sys.argv[1:] or J)]):
        try: print(f.result(),flush=True)
        except Exception as e: print("ОШИБКА",e,flush=True)
