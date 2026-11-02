/** Browser-side OpenAI-compatible transports. Never store or export credentials. */
export const PROVIDERS = Object.freeze({
  openrouter: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  deepseek: { name: 'DeepSeek direct', baseUrl: 'https://api.deepseek.com' }
});
export const DEEPSEEK_MODELS = [
  {id:'deepseek-flash',name:'DeepSeek Flash'},
  {id:'deepseek-v4-pro',name:'DeepSeek V4 Pro'}
];
export function normalizeBaseUrl(raw) {
  const value=String(raw||'').trim().replace(/\/+$/,'');
  let parsed;
  try { parsed=new URL(value); } catch { throw new Error('Enter a valid absolute API base URL.'); }
  if(parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('API base URL cannot contain credentials, query parameters or fragments.');
  const localhost=['localhost','127.0.0.1','[::1]'].includes(parsed.hostname);
  if(parsed.protocol!=='https:' && !(parsed.protocol==='http:' && localhost)) throw new Error('Custom endpoints require HTTPS (HTTP is allowed only for localhost).');
  return value;
}
export function completionEndpoint(target) {
  const base=target.provider==='custom' ? normalizeBaseUrl(target.baseUrl) : PROVIDERS[target.provider]?.baseUrl;
  if(!base) throw new Error('Unknown API provider.');
  return `${base}/chat/completions`;
}
export function buildCompletionRequest({provider,modelId,messages,temperature,maxTokens,supportsTemperature=true}) {
  if(!modelId || !Array.isArray(messages) || !messages.length) throw new Error('Model and messages are required.');
  const body={model:modelId,messages,stream:false,max_tokens:maxTokens};
  if(supportsTemperature)body.temperature=temperature;
  if(provider==='openrouter')body.usage={include:true};
  return body;
}
const flattenText=content=>typeof content==='string'?content:Array.isArray(content)?content.map(x=>typeof x==='string'?x:x?.text||'').join('\n'):'';
export async function completeViaProvider({provider,baseUrl,apiKey,modelId,messages,temperature,maxTokens,signal,supportsTemperature=true}) {
  if(!apiKey && provider!=='custom')throw new Error(`An API key is required for ${provider}.`);
  const target={provider,baseUrl};
  const headers={'Content-Type':'application/json'};
  if(apiKey)headers.Authorization=`Bearer ${apiKey}`;
  if(provider==='openrouter')headers['X-Title']='Character Performance Initiative';
  let response;
  try {
    response=await fetch(completionEndpoint(target),{
      method:'POST',signal,headers,
      body:JSON.stringify(buildCompletionRequest({provider,modelId,messages,temperature,maxTokens,supportsTemperature}))
    });
  } catch(err) {
    if(signal?.aborted)throw err;
    throw new Error(`Could not reach ${provider} from this browser (${err.message}). The provider might block cross-origin (CORS) requests from GitHub Pages. Use an endpoint you control that explicitly allows your Pages origin; never send API keys to an untrusted proxy.`);
  }
  let data;
  try {data=await response.json();}catch{throw new Error(`HTTP ${response.status}: invalid JSON response from ${provider}.`);}
  if(!response.ok || data?.error)throw new Error(`HTTP ${response.status}: ${data?.error?.message||data?.message||response.statusText||'Provider request failed'}`);
  const choice=data?.choices?.[0];
  const output=flattenText(choice?.message?.content);
  if(!output)throw new Error('Provider returned an empty character response.');
  return {
    response:output,resolvedModel:data.model||modelId,
    finishReason:choice?.finish_reason||null,
    usage:data.usage||null,generationId:data.id||null
  };
}
