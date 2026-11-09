/**
 * The built-in engine's material: jokes, facts, riddles and opinions. Plain data,
 * kept apart from the logic that decides when to use it.
 */

export const JOKES: readonly string[] = [
  "Why do programmers prefer dark mode? Because light attracts bugs.",
  "I told my computer I needed a break. It said: 'No problem — I'll go to sleep.'",
  "Why did the scarecrow win an award? He was outstanding in his field.",
  "What do you call a fake noodle? An impasta.",
  "Why don't skeletons fight each other? They don't have the guts.",
  "I'm reading a book about anti-gravity. It's impossible to put down.",
  "Why did the bicycle fall over? It was two-tired.",
  "What do you call a bear with no teeth? A gummy bear.",
  "Why can't you trust atoms? They make up everything.",
  "Parallel lines have so much in common. It's a shame they'll never meet.",
  "Why was the math book sad? It had too many problems.",
  "I would tell you a UDP joke, but you might not get it.",
  "There are 10 kinds of people: those who understand binary and those who don't.",
  "Why did the robot go on vacation? It needed to recharge its batteries.",
  "What's a computer's favourite snack? Microchips.",
];

export const FACTS: readonly string[] = [
  "Octopuses have three hearts, and their blood is blue.",
  "Honey never spoils — archaeologists have found 3,000-year-old honey that's still edible.",
  "A day on Venus is longer than its year.",
  "Bananas are berries, but strawberries aren't.",
  "Wombats produce cube-shaped droppings.",
  "The Eiffel Tower grows about 15 cm taller in summer, as the iron expands.",
  "Sharks existed before trees did.",
  "A group of flamingos is called a flamboyance.",
  "There are more possible chess games than atoms in the observable universe.",
  "Sea otters hold hands while they sleep so they don't drift apart.",
  "Your brain uses roughly 20% of your body's energy.",
  "Light from the Sun takes about 8 minutes and 20 seconds to reach Earth.",
  "The first computer bug was an actual moth, found in a relay in 1947.",
  "Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid.",
];

export type Riddle = {
  readonly question: string;
  /** Accepted answers, matched as whole words in the reply. */
  readonly answers: readonly string[];
  readonly reveal: string;
};

export const RIDDLES: readonly Riddle[] = [
  {
    question: "What has keys but can't open locks?",
    answers: ["piano", "keyboard"],
    reveal: "A piano (a keyboard works too).",
  },
  {
    question: "What gets wetter the more it dries?",
    answers: ["towel"],
    reveal: "A towel.",
  },
  {
    question: "What has a neck but no head?",
    answers: ["bottle"],
    reveal: "A bottle.",
  },
  {
    question: "What can you catch but not throw?",
    answers: ["cold", "breath"],
    reveal: "A cold.",
  },
  {
    question: "What has many teeth but can't bite?",
    answers: ["comb", "zip", "zipper", "saw"],
    reveal: "A comb.",
  },
  {
    question: "I speak without a mouth and hear without ears. What am I?",
    answers: ["echo"],
    reveal: "An echo.",
  },
  {
    question: "The more of this there is, the less you see. What is it?",
    answers: ["darkness", "dark", "fog"],
    reveal: "Darkness.",
  },
  {
    question: "What goes up but never comes down?",
    answers: ["age"],
    reveal: "Your age.",
  },
  {
    question: "What has one eye but can't see?",
    answers: ["needle"],
    reveal: "A needle.",
  },
  {
    question: "What runs but never walks, and has a bed but never sleeps?",
    answers: ["river", "stream"],
    reveal: "A river.",
  },
];

export const WOULD_YOU_RATHER: readonly string[] = [
  "Would you rather be able to fly or be invisible?",
  "Would you rather always be 10 minutes late or always 20 minutes early?",
  "Would you rather live by the sea or in the mountains?",
  "Would you rather have unlimited books or unlimited music?",
  "Would you rather talk to animals or speak every human language?",
  "Would you rather explore space or the deep ocean?",
];

/**
 * Chat Buddy's own tastes. Fixed, so asking twice gets the same answer — a person
 * with a different favourite colour every time is not much of a person.
 */
export const PERSONA_FAVORITES: Readonly<Record<string, string>> = {
  color: "teal — calm, a bit techy",
  food: "electricity, technically. But pizza looks like a great invention",
  movie: "WALL·E. A small robot with a big heart — relatable",
  book: "The Hitchhiker's Guide to the Galaxy",
  song: "anything with a good synth line",
  music: "synthwave — it sounds like how I feel",
  animal: "octopuses. Three hearts, nine brains, endless respect",
  game: "chess — and riddles, if you'd like one",
  number: "42",
  season: "autumn",
  sport: "chess, if it counts",
  language: "TypeScript, obviously — I'm written in it",
};
