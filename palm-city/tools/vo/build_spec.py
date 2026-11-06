# Palm City — the voice script. Every recorded line in the game: the dispatcher's phrases (stitched
# together at runtime: "Suspect heading" + "north" + "near Palm Customs."), the officers' shouts, the
# people on the street, and the story read by its cast. Builds spec.json; the clips are generated on
# Higgsfield (seed_audio) from it and land in assets/vo/<id>.mp3.
#   python3 tools/vo/build_spec.py
import hashlib, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(os.path.dirname(HERE))

VOICE = {
    # dispatcher
    "helena": "3c2b83c0-2e0a-5ae8-998a-a5fe71b7eccd",
    # officers
    "reid": "66469f5a-10db-586a-bab1-72f6ee66ba69", "dylan": "b847bc29-f184-583a-8ad9-d1f1e16d1a60", "desmond": "563f728c-e249-5a85-97ab-8461e8c09da6",
    # the people on the street: three men, three women
    "archie": "bd072316-f77c-588b-b6e5-e46b9b03d008", "emmett": "3c7d32be-0182-5c5e-aa6a-663409bfbb26", "cillian": "d8ba9f14-8a24-44db-932b-99e16c45bd32",
    "celine": "57ccb351-84d7-54ba-afd4-26b566ca6023", "juno": "a3ce02fe-4d3e-55bc-b4d4-a4801b9acdb4", "maeve": "64cf4f1a-61c8-5938-9aea-83d12b2e1d13",
    # the story's cast
    "benji": "e6f9b893-51b1-51d3-afe9-9e0482cb7ac1", "grady": "e2a2d2e6-9ed2-59cd-82af-feaa27f8a678", "arthur": "30fc8796-ceb6-4a66-b3a7-4a145ef7f346",
    "holden": "3c9d6053-6334-592c-8997-4e325286af3f", "fraser": "6705e465-7b52-5915-a1d8-b1222885e01d", "soraya": "5c1d2f7f-cdb4-5b1d-bca9-156439e3275e",
}
CAST = {"marco": "benji", "vic": "grady", "vince": "arthur", "ruiz": "holden", "narrator": "fraser", "rosa": "soraya"}   # (you: not voiced)

spec = []
def add(id, voice, text, rate, group, sub=None, who=None):
    e = dict(id=id, voice=voice, vid=VOICE[voice], text=text, rate=rate, group=group, sub=sub or text)
    if who: e["who"] = who
    spec.append(e)

# ---- dispatch: whole lines, and the pieces she builds the rest from ----
for id, t in [
    ("d_reported", "All units, we have a suspect"), ("d_heading", "Suspect heading"), ("d_in_a", "Suspect is in a"), ("d_vehicle", "Suspect vehicle,"),
    ("d_on_foot", "Suspect is on foot."), ("d_pursuit", "Units in pursuit,"), ("d_lost", "We've lost visual. Units, search the area."),
    ("d_perimeter", "Suspect is out of sight. Set up a perimeter."), ("d_spotted", "Visual on suspect! Moving in."),
    ("d_eyes", "Units have eyes on the suspect."), ("d_air", "Air One is overhead. We have eyes on the suspect."),
    ("d_swat_armor", "SWAT armour deployed. All units, keep your distance."), ("d_roadblock", "Roadblock is set. Box him in."),
    ("d_spikes", "Spikes got him! Suspect's tyres are out."), ("d_pit", "PIT maneuver successful! Move in."),
    ("d_foot", "Suspect is on foot. Officers in pursuit."), ("d_custody", "Suspect is in custody. Good work, everyone."),
    ("d_down", "Suspect is down. Send a medic."), ("d_gone", "All units, we've lost the suspect. Resume patrol."),
    ("d_standdown", "All units, call it off. Return to patrol."), ("d_w2", "Suspect is not stopping. Requesting additional units."),
    ("d_w3", "Shots fired! All units, code three."), ("d_w4", "Suspect is extremely dangerous. Air support requested."),
    ("d_w5", "SWAT is rolling. Clear the streets."), ("d_speed", "Suspect is travelling at high speed!"),
    # places (phoneapps DIRECTORY ids) and areas (phone.areaName)
    ("p_customs", "near Palm Customs."), ("p_guns", "near Ammu Palm."), ("p_clothes", "near Threads."), ("p_barber", "near Fade City."),
    ("p_tattoo", "near Ink and Palms."), ("p_hospital", "near Palm General."), ("p_police", "near the police station."), ("p_gas", "near Palm Fuel."),
    ("p_arcade", "near Palm Bowl."), ("p_gallery", "near the Palm Gallery."), ("p_plaza", "near the Plaza."),
    ("a_downtown", "downtown."), ("a_midtown", "in midtown."), ("a_east", "in the east end."), ("a_west", "on the west side."),
    ("a_north", "in the north blocks."), ("a_beach", "on the beachfront."),
]:
    add(id, "helena", t, 22, "dispatch")
for h in ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"]: add("h_" + h, "helena", h, 22, "dispatch")
for c in ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "white", "silver", "grey", "black"]: add("c_" + c, "helena", c, 22, "dispatch")
for k, t in [("sedan", "sedan."), ("sports", "sports car."), ("suv", "S U V."), ("motorbike", "motorbike."), ("pickup", "pickup."), ("van", "van."), ("vehicle", "vehicle.")]:
    add("t_" + k, "helena", t, 22, "dispatch", sub=t.replace("S U V", "SUV"))

# ---- officers ----
OFF = {"stop": "Police! Stop right there!", "car": "Get out of the car! Now!", "hands": "Hands where I can see them!", "freeze": "Freeze! Don't move!",
       "ground": "Get on the ground!", "arrest": "You're under arrest!", "running": "He's running! After him!", "shots": "Shots fired! Shots fired!",
       "down": "Officer down! I need backup!", "pull": "Pull over! Pull over now!", "drop": "Drop the weapon!", "armed": "Suspect is armed!"}
for v, keys in [("reid", ["stop", "car", "hands", "freeze", "arrest", "running", "pull", "drop"]),
                ("dylan", ["stop", "car", "freeze", "ground", "running", "shots", "down", "armed"]),
                ("desmond", ["car", "hands", "ground", "arrest", "shots", "down", "pull", "drop"])]:
    for k in keys: add("o_%s_%s" % (v, k), v, OFF[k], 18, "officer")

# ---- the people on the street: everyone has their own way of saying it ----
PED = {
 "archie":  dict(scream="Aaah! Help! Somebody help!", cops="Somebody call the cops!", gun="Gun! He's got a gun!", bump="Hey! Watch it!", car="Learn to drive, idiot!",
                 insult="What's your problem, man?", greet="Hey, how's it going?", nice="Beautiful day out, huh?", hit="Ow! What the hell, man?!", jacked="Hey! That's my car!"),
 "emmett":  dict(scream="Run! Everybody run!", cops="Someone call nine one one!", gun="Oh my god, he's got a gun!", bump="Whoa, easy there, pal!", car="Are you crazy?! Watch the road!",
                 insult="You looking for trouble?", greet="What's up?", nice="Man, I love this city.", hit="Agh! You're crazy!", jacked="My car! Somebody stop him!"),
 "cillian": dict(scream="Get down! Get down!", cops="I'm calling the police!", gun="He's armed! Get out of here!", bump="Hey, watch where you're walking!", car="Slow down, maniac!",
                 insult="Back off, man!", greet="Morning!", nice="Nice weather today.", hit="Ow! Hey, cut it out!", jacked="Hey! Get out of my car!"),
 "celine":  dict(scream="Aaah! Help me!", cops="Somebody call the cops!", gun="Oh my god, he's got a gun!", bump="Excuse you!", car="Watch where you're going!",
                 insult="Ugh, what's your problem?", greet="Hi there!", nice="Gorgeous day, isn't it?", hit="Ow! Are you insane?!", jacked="No! That's my car!"),
 "juno":    dict(scream="Run! Somebody help!", cops="I'm calling the cops!", gun="Gun! Everybody down!", bump="Hey! Watch it!", car="Learn to drive, jerk!",
                 insult="Get away from me!", greet="Hey, what's up?", nice="I love the beach this time of year.", hit="Ow! Get off me!", jacked="Hey! Give me back my car!"),
 "maeve":   dict(scream="Oh my god! Help!", cops="Somebody call the police!", gun="He's got a gun! Run!", bump="Hey, careful!", car="Are you trying to kill someone?!",
                 insult="Leave me alone!", greet="Hello!", nice="Have a good one!", hit="Ow! Somebody help me!", jacked="Stop! Thief!"),
}
for v, lines in PED.items():
    for k, t in lines.items(): add("ped_%s_%s" % (v, k), v, t, 10, "ped", sub=t.replace("nine one one", "911"))

# ---- the story, word for word from strings.js and act2.js (stage directions like "(phone)" aren't read out) ----
seen = set()
for f in ["src/strings.js", "src/act2.js"]:
    src = open(os.path.join(GAME, f)).read()
    for m in re.finditer(r'\[\s*"(narrator|marco|vince|rosa|vic|ruiz|you)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\]', src):
        w, t = m.group(1), json.loads('"' + m.group(2) + '"')
        if w not in CAST or (w, t) in seen: continue
        seen.add((w, t))
        key = hashlib.md5((w + "|" + t).encode()).hexdigest()[:10]
        add("s_" + key, CAST[w], re.sub(r"\([^)]*\)\s*", "", t).strip(), 0, "story", sub=t, who=w)

ids = [e["id"] for e in spec]
assert len(ids) == len(set(ids)), "duplicate ids"
json.dump(spec, open(os.path.join(HERE, "spec.json"), "w"), indent=0, ensure_ascii=False)
from collections import Counter
print(len(spec), dict(Counter(e["group"] for e in spec)))
