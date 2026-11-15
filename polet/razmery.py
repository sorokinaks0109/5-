import os, urllib.request, fal_client
os.environ.setdefault("FAL_KEY","proxy-injected")
DR="/home/user/5-/masterskaya-skazok/shablony/drakonchik/personazhi/drakonchik_list.png"
p=("Size reference sheet in the same 3D animated cartoon style, plain light background, same scale for everything, no text: "
   "(1) the little red baby dragon from image 1, front view, holding ONE closed cream envelope with a red wax seal in both front paws against his chest; "
   "the envelope is exactly as wide as the dragon's torso (about the width of his belly), rectangular, landscape orientation; "
   "(2) the same dragon flying, seen from BEHIND, wings spread, the same single envelope held under his chest, only its lower edge and corners visible below his belly; "
   "(3) the same envelope lying alone on the ground next to the dragon's foot, same size.")
r=fal_client.subscribe("openai/gpt-image-2.6/flare/edit",arguments={"prompt":p,"image_urls":[fal_client.upload_file(DR)],
   "image_size":"landscape_4_3","quality":"medium","num_images":1,"output_format":"png"})
urllib.request.urlretrieve(r["images"][0]["url"],"razmery.png"); print("ok")
