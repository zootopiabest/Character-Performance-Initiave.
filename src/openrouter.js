const API_BASE = 'https://openrouter.ai/api/v1';

export async function loadModelCatalog(apiKey = '') {
  const response = await fetch(`${API_BASE}/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
  });
  if (!response.ok) throw new Error(`Model catalog returned HTTP ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body.data)) throw new Error('Unexpected model catalog response.');
  return body.data.filter(x => x?.id && (x?.architecture?.output_modalities?.includes('text') ?? true));
}

const flattenText = content => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(x => typeof x === 'string' ? x : x?.text || '').join('\n');
  return '';
};

export async function complete({ apiKey, modelId, messages, temperature, maxTokens, signal, supportsTemperature = true }) {
  const request = {
    model: modelId, messages, stream: false,
    max_tokens: maxTokens, usage: { include: true }
  };
  if (supportsTemperature) request.temperature = temperature;
  let response;
  try {
    response = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST', signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'Character Performance Initiative'
      },
      body: JSON.stringify(request)
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new Error(`Network request failed: ${err.message}. If this is a browser CORS restriction, deploy a trusted server-side relay; never use a public key-forwarding proxy.`);
  }
  let data;
  try { data = await response.json(); } catch { throw new Error(`HTTP ${response.status}: invalid JSON response`); }
  if (!response.ok || data.error) {
    const detail = data?.error?.message || data?.message || response.statusText;
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }
  const choice = data?.choices?.[0];
  const output = flattenText(choice?.message?.content);
  if (!output) throw new Error('The provider returned an empty character response.');
  return {
    response: output, resolvedModel: data.model || modelId,
    finishReason: choice?.finish_reason || null,
    usage: data.usage || null, generationId: data.id || null
  };
}
