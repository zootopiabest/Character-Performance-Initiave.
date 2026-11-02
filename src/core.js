import { DEFAULT_ROLEPLAY } from './scenarios.js';

export const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const normalize = s => String(s ?? '').trim();
/** This is an allowlist, not a list of fields to reject after importing the whole card. */
export const CARD_FIELDS = ['name', 'profile', 'personality', 'depth', 'examples', 'system'];
const aliases = {
  name: ['name', 'char_name', 'character_name', 'display_name'],
  profile: ['description', 'char_persona', 'character_description', 'profile', 'character_profile', 'persona', 'character_persona', 'main_prompt'],
  personality: ['personality', 'personality_summary', 'traits'],
  depth: ['post_history_instructions', 'depth_prompt', 'depth_prompt_text', 'post_history', 'depth'],
  examples: ['mes_example', 'example_dialogue', 'example_messages', 'message_example', 'examples', 'sample_dialogue'],
  system: ['system_prompt', 'system_instructions', 'system']
};
function getField(data, keys) {
  for (const key of keys) {
    const value = data?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value) && value.length && value.every(x => typeof x === 'string')) return value.join('\n').trim();
  }
  return '';
}
function allObjects(obj, depth=0) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || depth > 4) return [];
  // Prefer V2/V3 canonical data to legacy root fields when both are present.
  const nested = ['data', 'character', 'card', 'content', 'character_data']
    .flatMap(k => allObjects(obj[k], depth+1));
  return [...nested, obj];
}
const pick = (objects, key) => objects.map(o => getField(o, aliases[key])).find(Boolean) ?? '';
const emptyCard = () => Object.fromEntries(CARD_FIELDS.map(k => [k, '']));
const cleanTitle = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const markdownField = title => {
  const t = cleanTitle(title);
  if (/^(name|character name)$/.test(t)) return 'name';
  if (/^(description|profile|character description|character profile|main prompt|main prompt description field|character persona)$/.test(t)) return 'profile';
  if (/^(personality|personality summary)$/.test(t)) return 'personality';
  if (/^(depth prompt|post history instructions|post history|character depth prompt)$/.test(t)) return 'depth';
  if (/^(example dialogue|example messages|sample dialogue|message example|mes example|examples)$/.test(t)) return 'examples';
  if (/^(system prompt|system instructions|character system prompt)$/.test(t)) return 'system';
  // Explicitly forbidden fields and all unknown named headings are not copied automatically.
  return null;
};
function markdownToFields(raw) {
  const card = emptyCard();
  const headings = [...raw.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)];
  if (!headings.length) {
    // A simple prose profile is permitted; a broken JSON export should not become a profile.
    if (/^[\[{]\s*["{]/.test(raw)) throw new Error('Invalid JSON card. Correct the JSON or paste a plain-text profile.');
    card.profile = raw.trim();
    return card;
  }
  let fallback = [];
  headings.forEach((m,i) => {
    const title=m[1];
    const content=raw.slice(m.index+m[0].length,headings[i+1]?.index??raw.length).trim();
    const key=markdownField(title);
    if (key && content) card[key]=[card[key],content].filter(Boolean).join('\n\n');
    else if (!key && /^(basic information|physical description|appearance|style|quirks and mannerisms|likes|dislikes|background|relationships|build|occupation|abilities|backstory|behavior|mannerisms|character)$/.test(cleanTitle(title)) && content) {
      fallback.push(`## ${title}\n${content}`);
    }
  });
  if (fallback.length) card.profile = [card.profile,...fallback].filter(Boolean).join('\n\n');
  // Do not copy unknown sections: they might be greetings, creator notes, or other metadata.
  const name = /^(?:\*\*)?Name(?:\*\*)?\s*:\s*(.+)$/mi.exec(card.profile)?.[1];
  if (!card.name && name) card.name=name.trim();
  return card;
}

/** Parse Character Card V1/V2/V3 and common JSON/Markdown exports by field allowlist.
 * Never import greetings, scenarios, creator notes, tags, extensions or lorebooks.
 */
export function parseCharacter(raw) {
  const str = normalize(raw);
  if (!str) return emptyCard();
  let data;
  try { data = JSON.parse(str); } catch { return markdownToFields(str); }
  const objects = allObjects(data);
  if (!objects.length) throw new Error('This JSON does not contain a character card object.');
  const result = Object.fromEntries(CARD_FIELDS.map(key => [key, pick(objects,key)]));
  if (!CARD_FIELDS.some(key=>key!=='name' && result[key])) {
    throw new Error('No supported roleplay fields were found. Please check the card format.');
  }
  return result;
}

/** Returns only fields intentionally selected for API requests and saved run exports. */
export function includedCard(card) {
  const enabled = card?.enabled || {};
  const out = emptyCard();
  for (const key of CARD_FIELDS) out[key] = enabled[key] === false ? '' : normalize(card?.[key]);
  return out;
}

export function buildMessages(card, scenario, roleplay = DEFAULT_ROLEPLAY) {
  const selected = includedCard(card);
  if (!selected.profile && !selected.personality) throw new Error('Include a description or personality to run the benchmark.');
  if (!normalize(scenario.prompt)) throw new Error('The scenario prompt is empty.');
  const blocks = [normalize(roleplay)];
  if (selected.system) blocks.push(`[CHARACTER SYSTEM PROMPT]\n${selected.system}`);
  const profile = [selected.name ? `Name: ${selected.name}` : '',selected.profile,selected.personality ? `[PERSONALITY]\n${selected.personality}` : ''].filter(Boolean).join('\n\n');
  blocks.push(`[CHARACTER PROFILE]\n${profile}`);
  if (selected.depth) blocks.push(`[DEPTH PROMPT]\n${selected.depth}`);
  if (selected.examples) blocks.push(`[EXAMPLE DIALOGUE]\n${selected.examples}`);
  return [
    { role: 'system', content: blocks.filter(Boolean).join('\n\n') },
    { role: 'user', content: normalize(scenario.prompt) }
  ];
}

export function planRuns({ models, scenarios, repetitions }) {
  const count = Math.max(1, Math.min(20, Math.floor(Number(repetitions) || 1)));
  return models.flatMap(model => scenarios.flatMap(scenario =>
    Array.from({ length: count }, (_, i) => ({
      id: uid(), modelInstanceId: model.id, modelId: model.modelId,
      modelLabel: model.label || model.modelId, provider: model.provider || 'openrouter', connectionName: model.connectionName || null, scenarioId: scenario.id,
      scenarioTitle: scenario.title, scenarioPrompt: scenario.prompt, repetition: i + 1,
      status: 'queued'
    }))
  ));
}

export function estimateCost({ models, scenarios, repetitions, card, roleplay, catalog, expectedOutputTokens = 350 }) {
  const selected=includedCard(card);
  const prompt = (roleplay + CARD_FIELDS.map(k=>selected[k]).join('')).length / 4 + 40;
  const byId = new Map(catalog.map(x => [x.id, x]));
  let total = 0;
  let unpriced = 0;
  for (const model of models) {
    const pricing = model.provider === 'openrouter' || !model.provider ? byId.get(model.modelId)?.pricing : model.pricing;
    const inp = Number(pricing?.prompt);
    const out = Number(pricing?.completion);
    const req = Number(pricing?.request || 0);
    if (!pricing || !Number.isFinite(inp) || !Number.isFinite(out)) { unpriced++; continue; }
    total += (prompt * inp + expectedOutputTokens * out + req) * scenarios.length * repetitions;
  }
  return { total, unpriced, promptTokens: Math.ceil(prompt) };
}

export function toMarkdownExport({ card, models, scenarios, settings, runs, createdAt }) {
  const lines = [
    '# Character Performance Initiative — Benchmark Report',
    `Generated: ${createdAt}`, `Character: ${card.name || 'Unnamed'}`, '',
    '## Run configuration',
    `- Models: ${models.map(m => `${m.label} [${m.provider || 'openrouter'}] (${m.modelId})`).join(', ')}`,
    `- Scenarios: ${scenarios.map(s => s.title).join(', ')}`,
    `- Repetitions: ${settings.repetitions}`,
    `- Temperature: ${settings.temperature}`,
    `- Max output tokens: ${settings.maxTokens}`,
    `- Roleplay instructions:\n\n\`\`\`text\n${settings.roleplay}\n\`\`\``, ''
  ];
  for (const run of runs) {
    lines.push(`## ${run.scenarioTitle} / ${run.modelLabel} / #${run.repetition}`);
    lines.push(`- Status: ${run.status}`);
    lines.push(`- Model requested: ${run.modelId}`);
    lines.push(`- Provider: ${run.provider || 'openrouter'}${run.connectionName ? ` (${run.connectionName})` : ''}`);
    if (run.resolvedModel) lines.push(`- Model returned: ${run.resolvedModel}`);
    if (run.finishReason) lines.push(`- Finish reason: ${run.finishReason}`);
    if (run.usage) lines.push(`- Tokens: ${run.usage.prompt_tokens ?? '?'} input, ${run.usage.completion_tokens ?? '?'} output`);
    if (typeof run.usage?.cost === 'number') lines.push(`- Cost: $${run.usage.cost.toFixed(6)}`);
    lines.push('', `**User scenario**\n\n${run.scenarioPrompt}`, '', `**Character response**\n\n${run.response || run.error || '(no response)'}`, '');
  }
  return lines.join('\n');
}

export function summarize(runs) {
  return runs.reduce((a, r) => {
    a[r.status] = (a[r.status] || 0) + 1;
    if (typeof r.usage?.cost === 'number') a.cost += r.usage.cost;
    a.tokens += Number(r.usage?.total_tokens || 0);
    return a;
  }, { queued: 0, running: 0, complete: 0, error: 0, canceled: 0, cost: 0, tokens: 0 });
}
