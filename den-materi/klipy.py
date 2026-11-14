import os, sys, urllib.request, fal_client, concurrent.futures as cf
os.environ.setdefault("FAL_KEY","proxy-injected")
T=(" Keep everything consistent: same faces, same clothes, same hairstyle, same room, no new objects, no new people, "
   "correct hands with five fingers, no text appears. Smooth, gentle, high-quality 3D animated film motion.")
D={
"01":"The mother gently rocks the crying baby, softly sways side to side, kisses the top of his head, the baby slowly calms down and stops crying. Lamp light flickers warmly, snow falls slowly outside the window. Slow camera push-in.",
"02":"The mother and her son walk forward slowly holding hands, the boy looks up at her and smiles, she wipes a happy tear with her free hand and smiles back. Yellow autumn leaves fall slowly. Slow tracking camera.",
"03":"The mother looks at her phone hopefully, sighs softly, puts it down on the table next to the cup, then looks at it again. Steam rises from the tea, snow falls outside the window. Very slow camera push-in, quiet melancholic mood.",
"04":"The mother watches the cartoon on the tablet held in both hands, her eyes fill with tears, she smiles, the son next to her smiles and gently squeezes her shoulder. On the tablet screen the cartoon gently moves with sparkles. Slow camera push-in over her shoulder.",
"a_privivka":"The mother hugs her little son on her lap and gently strokes his hair, kisses his forehead, the boy stops being scared and smiles at her, the nurse smiles and finishes putting on the plaster. Slow camera push-in.",
"b_luzhi":"The mother and her little son jump together into the puddle holding hands, water splashes in slow motion, both laugh joyfully, sunlight sparkles in the drops. Slow tracking camera.",
"c_risuem":"The boy proudly shows his drawing to his mother, she laughs, gently touches the paint on his nose with her finger, he giggles. Sunlight, cozy kitchen. Slow camera push-in.",
"05":"The son and the mother hug tightly cheek to cheek, swaying gently, she smiles through happy tears, he hugs her closer. Warm light, soft bokeh. Very slow camera push-in.",
}
def odin(k):
    out=f"klipy/{k}.mp4"
    if os.path.exists(out): return k+" есть"
    r=fal_client.subscribe("kling/v4/image-to-video",arguments={"prompt":D[k]+T,"start_image_url":fal_client.upload_file(f"kadry/{k}.png"),"duration":5,"resolution":"720p"})
    urllib.request.urlretrieve(r["video"]["url"],out); return k+" ok"
os.makedirs("klipy",exist_ok=True)
with cf.ThreadPoolExecutor(2) as ex:
    for f in cf.as_completed([ex.submit(odin,k) for k in (sys.argv[1:] or D)]):
        try: print(f.result(),flush=True)
        except Exception as e: print("ОШИБКА",e,flush=True)
