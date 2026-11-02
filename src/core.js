import { DEFAULT_ROLEPLAY } from './scenarios.js';

export const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const normalize = s => String(s ?? '').trim();
const aliases = {
  name: ['name', 'char_name', 'character_name', 'display_name'],
  description: ['description', 'char_persona', 'character_description', 'profile', 'character_profile', 'persona', 'character_persona'],
  personality: ['personality', 'personality_summary', 'traits'],
  depth: ['depth_prompt', 'depth_prompt_text', 'post_history_instructions', 'post_history', 'depth', 'character_note', 'character_notes'],
  examples: ['mes_example', 'example_dialogue', 'example_messages', 'examples', 'sample_dialogue'],
  system: ['system_prompt', 'system', 'system_instructions']
};
const getField = (data, keys) => {
  for (const key of keys) {
    const value = data?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value) && value.length && value.every(x => typeof x === 'string')) return value.join('\n').trim();
  }
  return '';
};
const allObjects = obj => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
  const children = ['data', 'character', 'card', 'content', 'character_data']
    .map(k => obj[k]).filter(x => x && typeof x === 'object' && !Array.isArray(x));
  return [obj, ...children.flatMap(allObjects)];
};
const pick = (objects, key) => objects.map(o => getField(o, aliases[key])).find(Boolean) ?? '';

function markdownToFields(raw) {
  const headings = [...raw.matchAll(/^#{1,4}\s+(.+?)\s*$/gm)];
  const sections = headings.map((m, i) => ({
    title: m[1].toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
    content: raw.slice(m.index + m[0].length, headings[i + 1]?.index ?? raw.length).trim()
  }));
  const section = (...terms) => sections.filter(s => terms.some(t => s.title === t)).map(s => s.content).filter(Boolean).join('\n\n');
  const profileSections = sections.filter(s => !/(scenario|greeting|first message|first mes|example dialogue|example messages|sample dialogue|depth prompt|post history|system prompt|creator notes|metadata|tags)/.test(s.title));
  const profile = profileSections.length ? profileSections.map(s => `## ${s.title}\n${s.content}`).join('\n\n') : raw;
  return {
    name: (/^(?:\*\*)?name(?:\*\*)?\s*:\s*(.+)$/mi.exec(raw)?.[1] ?? '').trim(),
    profile: profile.trim(),
    depth: section('depth prompt', 'post history instructions', 'character note'),
    examples: section('example dialogue', 'example messages', 'sample dialogue'),
    system: section('system prompt', 'system instructions')
  };
}

/** Accepts plain text, markdown and common character-export JSON shapes.
 * Critically: scenario, greeting and first_mes are never imported into the test context.
 */
export function parseCharacter(raw) {
  const str = normalize(raw);
  if (!str) return { name: '', profile: '', depth: '', examples: '', system: '' };
  let data;
  try { data = JSON.parse(str); } catch { return markdownToFields(str); }
  const objects = allObjects(data);
  if (!objects.length) return markdownToFields(str);
  const description = pick(objects, 'description');
  const personality = pick(objects, 'personality');
  const profile = description && personality && !description.includes(personality)
    ? `${description}\n\nPersonality:\n${personality}` : description || personality;
  return {
    name: pick(objects, 'name'), profile,
    depth: pick(objects, 'depth'), examples: pick(objects, 'examples'), system: pick(objects, 'system')
  };
}

export function buildMessages(card, scenario, roleplay = DEFAULT_ROLEPLAY) {
  if (!normalize(card.profile)) throw new Error('A character profile is required.');
  if (!normalize(scenario.prompt)) throw new Error('The scenario prompt is empty.');
  const blocks = [normalize(roleplay)];
  if (normalize(card.system)) blocks.push(`[CHARACTER SYSTEM PROMPT]\n${normalize(card.system)}`);
  blocks.push(`[CHARACTER PROFILE]\n${normalize(card.name) ? `Name: ${normalize(card.name)}\n` : ''}${normalize(card.profile)}`);
  if (normalize(card.depth)) blocks.push(`[DEPTH PROMPT]\n${normalize(card.depth)}`);
  if (normalize(card.examples)) blocks.push(`[EXAMPLE DIALOGUE]\n${normalize(card.examples)}`);
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
  const prompt = (roleplay + card.profile + card.depth + card.examples + card.system).length / 4 + 40;
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
