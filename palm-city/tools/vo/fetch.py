# Palm City voice: download finished clips into assets/vo/<id>.mp3.
#   VO_BASE=<cdn folder url>/ python3 tools/vo/fetch.py 20261106_175509:07bed3d3 ...
# (each arg: the result file's timestamp and the start of its job id, as jobs_wait reports them)
import json, os, sys, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "..", "assets", "vo")
os.makedirs(OUT, exist_ok=True)
jobs = json.load(open(os.path.join(HERE, "jobs.json")))
base = os.environ["VO_BASE"]
for a in sys.argv[1:]:
    stamp, pre = a.split(":")
    hit = [(cid, j) for cid, j in jobs.items() if j.startswith(pre)]
    if len(hit) != 1: print("?", a, len(hit)); continue
    cid, j = hit[0]
    dst = os.path.join(OUT, cid + ".mp3")
    data = urllib.request.urlopen(base + "hf_%s_%s.mp3" % (stamp, j), timeout=60).read()
    if len(data) < 2000 or data[:3] not in (b"ID3",) and data[0] != 0xFF: print("bad", cid, len(data)); continue
    open(dst, "wb").write(data)
print(len([f for f in os.listdir(OUT) if f.endswith(".mp3")]), "clips in assets/vo")
