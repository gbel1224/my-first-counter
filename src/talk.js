// Palm City — talking to people. Everybody on the street has a personality: nice, chatty, rude,
// annoyed, flirty, weird, tough or nervous. You pick what to say; they answer the way that kind of
// person would, with the face to match — and some of them will swing at you, run off, or slip you
// their number. People also mutter to themselves, take phone calls and yell when things kick off.

export const PERSONAS = ["nice", "nice", "chatty", "rude", "annoyed", "flirty", "weird", "tough", "nervous", "nice", "annoyed", "chatty", "rude", "flirty"];

export const CHOICES = [
  { id: "greet", icon: "👋", label: "Small talk" },
  { id: "compliment", icon: "😊", label: "Compliment" },
  { id: "flirt", icon: "😏", label: "Flirt" },
  { id: "joke", icon: "😂", label: "Joke" },
  { id: "ask", icon: "❓", label: "What's new?" },
  { id: "insult", icon: "🤬", label: "Insult" },
  { id: "bye", icon: "✋", label: "Bye" },
];

// what you say
export const YOU = {
  greet: ["Hey, how's it going?", "What's up?", "Yo. Nice day, huh?", "Hey there. How's your day?", "Sup. You from around here?"],
  compliment: ["I like your style.", "Nice shoes, seriously.", "You've got a great smile.", "That fit? Fire.", "You look like you've got your life together. Respect."],
  flirt: ["So... you come here often?", "Is it hot out here or is it just you?", "I'd buy you a coffee. If you wanted.", "Are you a parking ticket? 'Cause you've got FINE written all over you.", "I was gonna walk past, but... nah."],
  joke: ["Why don't skeletons fight each other? They don't have the guts.", "I told my wife she draws her eyebrows too high. She looked surprised.", "I'm reading a book on anti-gravity. Can't put it down.", "What do you call a fake noodle? An impasta.", "I used to hate facial hair. Then it grew on me."],
  ask: ["What's new around here?", "Heard anything interesting lately?", "Anything worth seeing in this town?", "What's the word on the street?"],
  insult: ["You look like a 'before' picture.", "Did you get dressed in the dark?", "Bold choice, that face.", "Move. You're blocking my sunlight.", "I've seen better hair on a coconut."],
  bye: ["Alright, take it easy.", "Catch you later.", "Peace.", "Anyway — gotta run."],
};

// how they open when you walk up
export const OPEN = {
  nice: [["Oh, hey! How you doing?", "happy"], ["Hi there! Gorgeous day, right?", "happy"], ["Hey! You need directions or something?", "happy"]],
  chatty: [["Oh my god, hi! Okay, you will NOT believe the morning I've had.", "surprised"], ["Hey! You look like someone who'd appreciate a good story.", "happy"], ["Hiii. Sorry, I talk a lot when I've had coffee. I've had four.", "laugh"]],
  rude: [["What.", "annoyed"], ["Do I know you?", "disgusted"], ["You gonna say something or just stand there breathing?", "annoyed"]],
  annoyed: [["Ugh. I'm literally on my way somewhere.", "annoyed"], ["Make it quick.", "annoyed"], ["*sigh* ...Yes?", "annoyed"]],
  flirty: [["Well, hello there.", "flirty"], ["Hey you. I was hoping someone interesting would show up.", "flirty"], ["Mmm. And who might you be?", "smug"]],
  weird: [["Shh. The pigeons are listening.", "surprised"], ["Do you ever think about how soup is just wet salad?", "neutral"], ["You're standing in my aura. It's fine. It's fine.", "smug"]],
  tough: [["You lost or something?", "annoyed"], ["Something I can do for you, chief?", "smug"], ["You're standing real close, buddy.", "mad"]],
  nervous: [["Oh! Uh— hi. Sorry. Hi.", "surprised"], ["Is— is this about the parking ticket?", "scared"], ["H-hey. Did I do something?", "scared"]],
};

// what they say back: [line, expression, effect?]
// effects: fight (they swing at you), flee (they run), leave (they walk off), number (they like you), tip (a rumour)
export const REPLY = {
  nice: {
    greet: [["Pretty good, thanks for asking! Most people just walk by.", "happy"], ["Can't complain! Well, I could, but who'd listen?", "laugh"], ["Not bad! Just grabbed a coffee, so the day's looking up.", "happy"]],
    compliment: [["Aww, stop it! You just made my whole day.", "happy"], ["Really? Thank you! I almost changed, too.", "laugh"], ["That's so sweet. Right back at you!", "happy"]],
    flirt: [["Ha! Smooth. I'm flattered, but I'm seeing someone.", "laugh"], ["Oh! Wow. I'm... blushing. Is it obvious?", "happy"], ["You're cute, but my mom told me never to date strangers.", "smug"]],
    joke: [["HA! Oh, that's terrible. I love it.", "laugh"], ["Okay, I'm stealing that one for my dad.", "laugh"], ["*snort* Sorry. That was a real laugh.", "laugh"]],
    ask: [["Let me think...", "neutral", "tip"]],
    insult: [["Wow. Okay. I was having a nice day.", "sad", "leave"], ["...Did someone hurt you? Like, as a kid?", "sad"], ["That's... really mean. Why would you say that?", "sad", "leave"]],
    bye: [["Bye! Stay safe out there!", "happy"], ["Take care! Drink some water!", "happy"]],
  },
  chatty: {
    greet: [["So my cousin Dee — you know Dee? No? — anyway, she's opening a smoothie place. Inside a laundromat. Genius or crazy? Both.", "laugh"], ["Honestly? I've been up since four. My neighbor's parrot learned the microwave beep. EVERY. TEN. MINUTES.", "annoyed"], ["Good! Great! I just found twenty bucks in a jacket I haven't worn since 2019. Life's a gift.", "laugh"]],
    compliment: [["Thank you! I got this at a thrift store for three dollars, and the lady said it used to belong to a magician. Can't prove it. Can't disprove it.", "laugh"], ["Stoooop. You're gonna make me tell you my whole skincare routine. It's eleven steps.", "happy"]],
    flirt: [["Oh, you're BAD. I like it. Okay, I'm gonna tell my group chat about this.", "flirty", "number"], ["Ha! You know my last date took me to a car wash? Like, for fun? We stayed in the car. It was actually kinda romantic.", "laugh"]],
    joke: [["HA! Okay, okay, here's one back: what do you call a fish with no eyes? A fsh. ...I'll see myself out.", "laugh"], ["Oh my god, that's my uncle's joke. He tells it at every wedding. Every. Single. One.", "laugh"]],
    ask: [["Oh, you want the TEA? Okay, sit down—", "surprised", "tip"]],
    insult: [["Excuse me?! I'm telling everybody about this. EVERYBODY.", "mad", "leave"], ["Wow. Okay. That's going in the group chat. With a photo.", "disgusted", "leave"]],
    bye: [["Bye! Oh wait — one more thing — no, never mind. Bye!", "laugh"], ["Okay, byeee! Tell your mom I said hi! I don't know your mom.", "laugh"]],
  },
  rude: {
    greet: [["It WAS going fine.", "annoyed"], ["Do I look like I want to talk?", "disgusted"], ["Great. Fantastic. Is that all?", "annoyed"]],
    compliment: [["Yeah, I know.", "smug"], ["What are you selling?", "disgusted"], ["Okay, weirdo.", "annoyed"]],
    flirt: [["Ew. No.", "disgusted"], ["Does that line ever work? Like, ever?", "smug"], ["I'd rather lick a bus seat.", "disgusted", "leave"]],
    joke: [["...Was that supposed to be funny?", "annoyed"], ["My grandma's funnier. She's dead.", "disgusted"], ["Don't quit your day job. Actually — do you have one?", "smug"]],
    ask: [["The 'word on the street' is MOVE.", "annoyed"], ["Read a newspaper.", "annoyed", "leave"]],
    insult: [["Say that again. I DARE you.", "mad", "fight"], ["Oh, you wanna go? Let's go.", "mad", "fight"], ["You talking to ME?!", "mad", "fight"]],
    bye: [["Finally.", "annoyed"], ["Don't come back.", "annoyed"]],
  },
  annoyed: {
    greet: [["I'm late, my phone's at two percent, and somebody stole my parking spot. So — great.", "annoyed"], ["Fine. Busy. Bye.", "annoyed", "leave"], ["It's going. Slowly. Like this conversation.", "annoyed"]],
    compliment: [["...Thanks? I guess?", "annoyed"], ["Cool. Can I go now?", "annoyed", "leave"]],
    flirt: [["I do not have the energy for this today.", "annoyed", "leave"], ["Buddy. I haven't slept since Tuesday.", "sad"]],
    joke: [["*stares* ...Are you done?", "annoyed"], ["Heh. Okay. Funny. Bye.", "annoyed", "leave"]],
    ask: [["Rent's up. Coffee's up. Everything's up except my paycheck.", "annoyed"], ["*sighs* Fine. Quick one—", "annoyed", "tip"]],
    insult: [["Wow. Today, of all days.", "mad", "leave"], ["You know what? I don't even care. Whatever.", "annoyed", "leave"]],
    bye: [["Yep.", "annoyed"], ["Mhm.", "annoyed"]],
  },
  flirty: {
    greet: [["Better now that you're here.", "flirty"], ["Oh, it's going. Where are YOU going?", "smug"], ["I was bored. Then you showed up.", "flirty"]],
    compliment: [["Mmm, keep talking.", "flirty"], ["You noticed? Most people don't pay attention.", "smug"], ["Careful. I might start to like you.", "flirty"]],
    flirt: [["Okay, that was smooth. Here — put your number in my phone. Don't make it weird.", "flirty", "number"], ["Coffee, huh? I take mine black. Like my car. And my heart.", "smug", "number"], ["You're trouble. I can tell. I like trouble.", "flirty", "number"]],
    joke: [["Ha! Cute AND funny? Dangerous combo.", "laugh"], ["That's so dumb. Tell me another one.", "laugh"]],
    ask: [["Word on the street? Somebody cute's been walking around asking questions.", "flirty"], ["Hmm, I'll tell you a secret—", "smug", "tip"]],
    insult: [["Ooh, feisty. Wrong move though.", "annoyed", "leave"], ["Wow. And I was about to give you my number.", "disgusted", "leave"]],
    bye: [["Don't be a stranger.", "flirty"], ["Leaving already? Shame.", "smug"]],
  },
  weird: {
    greet: [["My day? I counted every crack in this sidewalk. There are 4,012. One fewer than yesterday. Somebody's FIXING them.", "surprised"], ["Good. The voices are quiet today. Just kidding. ...Mostly.", "smug"], ["I had cereal with orange juice this morning. It's a whole new life.", "happy"]],
    compliment: [["Thank you. I grew this face myself.", "happy"], ["I feel the same way about your elbows.", "smug"]],
    flirt: [["Are you a ghost? You're definitely a ghost. Prove you're not a ghost.", "scared"], ["I only date people who can name all the moons of Jupiter. There are ninety-five. Go.", "smug"]],
    joke: [["I don't understand jokes. I understand birds.", "neutral"], ["Haha. Haha. ...Why are we laughing?", "laugh"]],
    ask: [["The palm trees are watching. Have you noticed they all lean the same way? Coincidence?", "surprised"], ["There's a guy downtown who says he's from 2087. He knew the lottery numbers. Allegedly.", "smug"], ["Fish can't blink. Think about that next time you're sad.", "neutral"]],
    insult: [["I accept your hostility into my heart and turn it into a little flower.", "happy"], ["That's exactly what the lizard people said.", "surprised", "leave"]],
    bye: [["Bye. Watch out for the seagulls. They know.", "neutral"], ["Farewell, traveller.", "happy"]],
  },
  tough: {
    greet: [["Fine. Long as nobody's in my way.", "annoyed"], ["Can't complain. Nobody'd dare.", "smug"], ["Day's good. You making it worse?", "annoyed"]],
    compliment: [["...Appreciate it. Don't make it weird.", "smug"], ["You hitting on me, chief?", "annoyed"]],
    flirt: [["Keep walking.", "mad"], ["You got guts. No brains. But guts.", "smug", "leave"]],
    joke: [["Heh. Alright, that one's decent.", "smug"], ["I've broken noses for worse jokes.", "mad"]],
    ask: [["Stay off Moreno's turf if you like your teeth.", "annoyed"], ["Gangs run the east blocks. Cops don't even go there after dark.", "annoyed", "tip"]],
    insult: [["Wrong guy, pal.", "mad", "fight"], ["Oh, you're DONE.", "mad", "fight"], ["Say it to my face. ...Oh, you did. Big mistake.", "mad", "fight"]],
    bye: [["Yeah. Walk.", "annoyed"], ["Watch yourself.", "smug"]],
  },
  nervous: {
    greet: [["G-good! Fine! Totally normal day! Why do you ask?", "scared"], ["Oh, you know. Anxious. Mostly anxious. How are— how are you?", "sad"]],
    compliment: [["Oh! Oh gosh. Th-thank you. Nobody says stuff like that.", "happy"], ["Really? You're not making fun of me?", "surprised"]],
    flirt: [["I— I— I have to go. To a place. Bye!", "scared", "flee"], ["Oh no. Oh no, I'm sweating. Is it obvious? It's obvious.", "surprised"]],
    joke: [["Ha! Haha. Ha. Sorry, I laugh when I'm nervous. And when it's funny. That was both.", "laugh"]],
    ask: [["I-I don't know anything! I didn't see anything! ...Okay, one thing—", "scared", "tip"]],
    insult: [["*voice cracks* Okay. Okay. That's fine. I'm fine.", "sad", "flee"], ["P-please don't hurt me!", "scared", "flee"]],
    bye: [["Bye! Sorry! Bye!", "surprised"], ["O-okay. Bye. Thanks for... talking.", "happy"]],
  },
};

// rumours and tips — real things in the game, told like gossip
export const GOSSIP = [
  "They say the gallery vault's on a time lock. Opens at nine sharp. Just saying.",
  "Cops crawl all over downtown after dark. Keep your nose clean.",
  "Marina's renting boats again. My cousin flipped one. Twice.",
  "Some mystery buyer keeps snapping up businesses round here. Probably laundering money. Or opening yoga studios.",
  "Neon Palms gets packed on weekends. VIP's a joke unless you're loaded.",
  "Best slice in the city? The pizza place. Don't tell the burger guys I said that.",
  "There's a garage that'll fix any ride. New paint, the works.",
  "Somebody hit the ATM on 4th last night. Cops did nothing.",
  "The hospital charges a hundred and twenty bucks just to LOOK at you.",
  "People been racing boats around the bay at night. Wild stuff.",
  "Fade City does the cleanest cuts in town. Your hair could use it. No offense.",
  "Heard the depot's paying cash for anybody who'll haul boxes.",
  "Gas station on the strip's cheaper. Barely. But still.",
  "The arcade's got a spin machine. I lost my rent money in there. Twice.",
];

// people talking to nobody, on the phone, or to themselves as you pass
export const AMBIENT = [
  "...no, YOU hang up.", "I swear I parked right here.", "Mom, I'm an adult. ...Yes, I ate.", "Bro, the group chat is on FIRE right now.",
  "Who puts raisins in potato salad? Who?", "If my boss texts me ONE more time...", "I should've gone to law school.", "Is that guy filming? Don't film me.",
  "Twelve dollars for a smoothie. Twelve.", "My horoscope said today would be chaotic. Nailed it.", "I'm not lost. I'm exploring.", "Gonna get a dog. Gonna name him Kevin.",
  "Okay, but hear me out — tacos for breakfast.", "Pretty sure that seagull just stole my fries.", "The bus is late. The bus is ALWAYS late.", "Do fish get thirsty? Like, ever?",
  "I could totally fight a goose. Probably.", "Why is everyone in this city so tan?", "My ex lives on this street. Walk faster.", "...and THAT'S why I don't trust ferrets.",
  "Uh-huh. Uh-huh. No, she did NOT.", "I left the stove on. Did I leave the stove on?", "Gym tomorrow. Definitely tomorrow.", "Whoever invented Mondays owes me money.",
  "Ninety-four degrees. In the SHADE.", "Babe, I'm literally five minutes away. ...Okay, twenty.", "That's the third time today I've seen that guy.", "Why do they call it a building if it's already built?",
];
// what people yell when things kick off
export const SHOUT = {
  gun: ["WHAT THE—!", "He's got a GUN!", "Somebody call 911!", "RUN!", "Oh my god, oh my god—", "Not today, not today!", "Get DOWN!", "Are you CRAZY?!", "I just bought these shoes!"],
  fight: ["Ayyy! Fight! Fight!", "Yo, chill, CHILL!", "Somebody's getting knocked out!", "Ooooh, he felt that.", "Break it up!", "Call the cops!", "Hit him back!"],
  hit: ["My LEG!", "Watch where you're driving!", "You hit me! You actually hit me!", "OW. Oh, that's broken."],
};
// you've got heat: they recognise you from the news
export const WANTED = [["You're— you're the one the cops are after!", "scared", "flee"], ["Aren't you the guy from the news?! Nope. Nope nope nope.", "shocked", "flee"], ["I didn't see you. I didn't see ANYTHING.", "scared", "flee"]];
export const TOO_LONG = [["Anyway — I gotta go. Nice talking to you!", "happy", "leave"], ["Okay, I've really gotta run. Later!", "neutral", "leave"], ["My bus! That's my bus. Bye!", "surprised", "leave"]];
