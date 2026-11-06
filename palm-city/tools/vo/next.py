# Palm City voice: print the next generate_audio_batch request (lines that have no job yet), or record jobs.
#   python3 tools/vo/next.py [count]             -> JSON requests for the next lines without a job
#   python3 tools/vo/next.py add i=job_id ...    -> remember submitted jobs by spec index
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
spec = json.load(open(os.path.join(HERE, "spec.json")))
jp = os.path.join(HERE, "jobs.json")
jobs = json.load(open(jp)) if os.path.exists(jp) else {}
if len(sys.argv) > 1 and sys.argv[1] == "add":
    for a in sys.argv[2:]:
        i, j = a.split("="); jobs[spec[int(i)]["id"]] = j
    json.dump(jobs, open(jp, "w"), indent=0)
    print(len(jobs), "of", len(spec), "submitted")
else:
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 12
    req = [{"index": i, "params": {"model": "seed_audio", "voice_type": "preset", "voice_id": e["vid"], "prompt": e["text"], "format": "mp3", "sample_rate": 24000, "speech_rate": e["rate"]}}
           for i, e in enumerate(spec) if e["id"] not in jobs][:n]
    print(json.dumps(req, separators=(",", ":"), ensure_ascii=False))
