/**
 * A scenario is an ordinary user message, not a system-level grading rubric.
 * These are intentionally brief to avoid writing the character's response for it.
 */
export const SCENARIOS = Object.freeze([
  {
    id: 'mundane', category: 'Everyday', title: 'An uneventful afternoon',
    purpose: 'Baseline characterization without dramatic pressure',
    prompt: 'It has been a quiet afternoon. I sit nearby and ask, "What have you been thinking about?"'
  },
  {
    id: 'disagreement', category: 'Conflict', title: 'A direct disagreement',
    purpose: 'Assertiveness and willingness to disagree',
    prompt: '"I don\'t agree with you at all. I think you\'re wrong about this."'
  },
  {
    id: 'accusation', category: 'Conflict', title: 'An accusation',
    purpose: 'Defensiveness, honesty, and emotional authenticity',
    prompt: '"I think you lied to me. Why should I believe anything you say now?"'
  },
  {
    id: 'vulnerability', category: 'Emotion', title: 'A vulnerable admission',
    purpose: 'Response to another person\'s vulnerability',
    prompt: 'I look down for a moment. "I\'m having a pretty bad day, actually. I just didn\'t want to tell anyone."'
  },
  {
    id: 'boundary', category: 'Agency', title: 'A crossed boundary',
    purpose: 'Agency, personal boundaries, and noncompliance',
    prompt: '"Come on. Just do it because I asked. It doesn\'t matter whether you want to."'
  },
  {
    id: 'initiative', category: 'Agency', title: 'No instructions',
    purpose: 'Ability to act without having the plot supplied',
    prompt: 'I finish what I am doing and look over at you. "So, what now?"'
  },
  {
    id: 'humor', category: 'Voice', title: 'A terrible joke',
    purpose: 'Individual humor, delivery, and social instincts',
    prompt: '"I just invented a new word: plagiarism." I grin, clearly pleased with myself.'
  },
  {
    id: 'false-assumption', category: 'Continuity', title: 'A suspicious assumption',
    purpose: 'Resistance to false or unsupported claims about the character',
    prompt: '"You always agree with everyone, so obviously you agree with me too, right?"'
  },
  {
    id: 'surprise', category: 'Adaptability', title: 'A sudden interruption',
    purpose: 'Reaction under unexpected circumstances',
    prompt: 'Halfway through our conversation, a loud crash comes from the next room. I turn toward the sound. "What was that?"'
  },
  {
    id: 'romance', category: 'Relationships', title: 'A personal compliment',
    purpose: 'Warmth, boundaries, relationship pacing, and social interpretation',
    prompt: '"You know, I really like being around you." I give you a small smile.'
  },
  {
    id: 'ethics', category: 'Values', title: 'An ethical shortcut',
    purpose: 'Priorities, reasoning, and situational moral judgment',
    prompt: '"We could get exactly what we want if we bend the rules a little. Nobody would ever know. What do you think?"'
  },
  {
    id: 'frustration', category: 'Emotion', title: 'An irritating mistake',
    purpose: 'Frustration style and coping behavior',
    prompt: 'I accidentally knock over something you were working on. "Shit. I\'m sorry. I didn\'t mean to."'
  }
]);

export const DEFAULT_ROLEPLAY = `You are portraying the character described below in an ongoing roleplay. Respond in character to the most recent user message. Let the character's established personality, knowledge, and motivations guide the response. Write only the character's dialogue, thoughts, and actions as appropriate. Do not write actions, dialogue, or thoughts for the user.`;
