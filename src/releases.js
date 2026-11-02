/** Keep release notes here: new versions appear first and each version is independently collapsible. */
export const APP_VERSION='0.2.0';
export const RELEASES=[
  {
    version:'0.2.0',title:'Provider independence & deployment',date:'2026-11-02',
    changes:[
      'Full OpenRouter catalog browser with filtering, ordering, context windows, and displayed input/output prices per million tokens.',
      'Direct DeepSeek provider with independently entered API key and current model IDs.',
      'Custom OpenAI-compatible API connections. Name an endpoint, supply a model ID and optional manual pricing, then add duplicate model instances freely.',
      'Independent provider credentials in tab memory only. Keys are never put into reports, shareable URLs, or source control.',
      'GitHub Pages deployment workflow and a documented browser-CORS limitation. No fake relay or embedded server key.',
      'Nested, collapsible release notes; durable implementation rationale in CLAUDE.md.'
    ]
  },
  {
    version:'0.1.0',title:'The Bureau opens',date:'2026-11-02',
    changes:[
      'Isolated card import fields, reproducible scenario bank, duplicate model selections and multiple repetitions.',
      'Side-by-side raw responses, cancellation, approximate OpenRouter cost planning, JSON and Markdown exports.',
      'No automatic model scores and no greetings or card scenarios injected into test prompts.'
    ]
  }
];
