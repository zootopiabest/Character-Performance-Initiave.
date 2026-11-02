import { SCENARIOS, DEFAULT_ROLEPLAY } from './scenarios.js';
import { uid, parseCharacter, buildMessages, planRuns, estimateCost, toMarkdownExport, summarize } from './core.js';
import { loadModelCatalog } from './openrouter.js';
import { completeViaProvider, normalizeBaseUrl, DEEPSEEK_MODELS } from './providers.js';
import { RELEASES, APP_VERSION } from './releases.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmtUSD = n => Number(n).toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:4,maximumFractionDigits:6});
const fmtCount = n => Number(n || 0).toLocaleString('en-US');
const clamp = (n, min, max, fallback) => Number.isFinite(n) ? Math.min(max,Math.max(min,n)) : fallback;

const state = {
  models: [], catalog: [], customScenarios: [], connections: [], catalogLimit: 35,
  selected: new Set(['mundane','disagreement','boundary','initiative']),
  runs: [], snapshot: null, activeScenario: null,
  running: false, controller: null, toastTimer: null
};
$('roleplay-prompt').value = DEFAULT_ROLEPLAY;
$('releases-list').innerHTML=RELEASES.map((release,i)=>`<details class="release-entry" ${i===0?'open':''}><summary>v${esc(release.version)} · ${esc(release.title)} <time>${esc(release.date)}</time></summary><ul>${release.changes.map(change=>`<li>${esc(change)}</li>`).join('')}</ul></details>`).join('');


const readCard = () => ({
  name: $('character-name').value.trim(), profile: $('character-profile').value.trim(),
  depth: $('character-depth').value.trim(), examples: $('character-examples').value.trim(),
  system: $('character-system').value.trim()
});
const readSettings = () => ({
  repetitions: clamp(Math.floor(Number($('repetitions').value)),1,20,2),
  concurrency: clamp(Math.floor(Number($('concurrency').value)),1,8,3),
  temperature: clamp(Number($('temperature').value),0,2,0.9),
  maxTokens: clamp(Math.floor(Number($('max-tokens').value)),64,16000,900),
  roleplay: $('roleplay-prompt').value.trim()
});
const scenarios = () => [...SCENARIOS,...state.customScenarios];
const selectedScenarios = () => scenarios().filter(x => state.selected.has(x.id));

function toast(message, isError = false) {
  const node = $('toast');
  node.textContent = message;
  node.classList.toggle('error',isError);
  node.classList.add('visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => node.classList.remove('visible'),5500);
}

function hydrateCard(card) {
  for (const [key,field] of Object.entries({name:'character-name',profile:'character-profile',depth:'character-depth',examples:'character-examples',system:'character-system'})) {
    $(field).value = card[key] || '';
  }
  updatePlan();
  toast('Dossier imported. Review the extracted fields before running.');
}

$('card-file').addEventListener('change', async e => {
  const file = e.target.files?.[0]; if (!file) return;
  try { hydrateCard(parseCharacter(await file.text())); }
  catch (err) { toast(`Could not import file: ${err.message}`,true); }
  e.target.value = '';
});
$('toggle-paste').addEventListener('click', () => $('paste-wrap').classList.toggle('hidden'));
$('parse-raw').addEventListener('click', () => {
  const value = $('raw-import').value;
  if (!value.trim()) return toast('Paste a card export first.',true);
  hydrateCard(parseCharacter(value));
});
$('toggle-key').addEventListener('click', () => {
  const key=$('api-key'); const show=key.type==='password';
  key.type = show ? 'text':'password'; $('toggle-key').textContent = show ? 'Hide':'Show';
  $('toggle-key').setAttribute('aria-label',show?'Hide API key':'Show API key');
});
$('reset-roleplay').addEventListener('click', () => { $('roleplay-prompt').value=DEFAULT_ROLEPLAY;updatePlan(); });

function modelPrice(model) {
  const p = model?.pricing; if (!p) return '';
  const input=Number(p.prompt)*1e6, output=Number(p.completion)*1e6;
  if (!Number.isFinite(input)||!Number.isFinite(output)) return '';
  return `$${input.toFixed(2)} / $${output.toFixed(2)} per 1M`;
}

function addModel(id, name = '', options = {}) {
  const modelId=String(id||'').trim();
  const provider=options.provider||'openrouter';
  if(!modelId || /\s/.test(modelId) || (provider==='openrouter'&&!modelId.includes('/')))return toast('Enter a valid model ID.',true);
  const found=provider==='openrouter'?state.catalog.find(x=>x.id===modelId):null;
  state.models.push({id:uid(),modelId,label:name||found?.name||modelId,provider,
    connectionId:options.connectionId||null,connectionName:options.connectionName||null,
    pricing:options.pricing||null});
  $('model-search').value='';
  $('model-suggestions').classList.add('hidden');
  renderRoster();updatePlan();
}
function showPassword(buttonId,inputId){
  $(buttonId).addEventListener('click',()=>{
    const input=$(inputId);const visible=input.type==='password';
    input.type=visible?'text':'password';$(buttonId).textContent=visible?'Hide':'Show';
  });
}
showPassword('toggle-deepseek-key','deepseek-key');
showPassword('toggle-custom-key','custom-api-key');
$('add-deepseek').addEventListener('click',()=>{
  const id=$('deepseek-model').value.trim();
  addModel(id,DEEPSEEK_MODELS.find(m=>m.id===id)?.name||id,{provider:'deepseek'});
});
function renderConnections(){
  $('connection-list').innerHTML=state.connections.map(c=>`<div class="connection-item"><div><strong>${esc(c.name)}</strong><small>${esc(c.baseUrl)} · ${c.apiKey?'Key in tab memory':'No key'}</small></div><button type="button" data-remove-connection="${esc(c.id)}" aria-label="Remove connection ${esc(c.name)}">×</button></div>`).join('');
  $('custom-connection-select').innerHTML=state.connections.length?state.connections.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join(''):'<option value="">Create a connection first</option>';
}
$('save-custom-connection').addEventListener('click',()=>{
  const name=$('custom-api-name').value.trim(), apiKey=$('custom-api-key').value.trim();
  if(!name)return toast('Give your custom API connection a name.',true);
  let baseUrl;
  try{baseUrl=normalizeBaseUrl($('custom-api-url').value);}catch(err){return toast(err.message,true);}
  const c={id:uid(),name,baseUrl,apiKey};state.connections.push(c);
  $('custom-api-name').value='';$('custom-api-url').value='';$('custom-api-key').value='';
  renderConnections();$('custom-connection-select').value=c.id;
  toast(`Saved ${name} in this tab only.`);
});
$('connection-list').addEventListener('click',e=>{
  const b=e.target.closest('[data-remove-connection]');if(!b)return;
  const id=b.dataset.removeConnection;
  state.connections=state.connections.filter(c=>c.id!==id);
  state.models=state.models.filter(m=>m.connectionId!==id);
  renderConnections();renderRoster();updatePlan();toast('Connection and its model instances removed.');
});
$('add-custom-model').addEventListener('click',()=>{
  const c=state.connections.find(x=>x.id===$('custom-connection-select').value);
  if(!c)return toast('Create or choose a custom API connection first.',true);
  const input=$('custom-input-price').value.trim(), output=$('custom-output-price').value.trim();
  if((input&&!output)||(!input&&output))return toast('Supply both input and output prices, or leave both blank.',true);
  let pricing=null;
  if(input&&output){
    const a=Number(input),b=Number(output);
    if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<0)return toast('Prices must be nonnegative numbers.',true);
    pricing={prompt:String(a/1e6),completion:String(b/1e6)};
  }
  addModel($('custom-model-id').value,undefined,{provider:'custom',connectionId:c.id,connectionName:c.name,pricing});
});
renderConnections();

$('load-catalog').addEventListener('click', async () => {
  const button=$('load-catalog');
  button.disabled=true;button.textContent='Loading catalog…';
  try {
    state.catalog=await loadModelCatalog($('api-key').value.trim());
    updateProviderOptions();
    toast(`Catalog loaded: ${fmtCount(state.catalog.length)} text-capable models.`);
    renderSuggestions();renderCatalog();updatePlan();
  } catch(err) {toast(`Catalog unavailable: ${err.message}. You can still enter IDs manually.`,true);}
  finally {button.disabled=false;button.textContent='↻   Refresh live model catalog';}
});
$('model-search').addEventListener('input',renderSuggestions);
$('model-search').addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();
    const query=e.target.value.trim();
    const exact=state.catalog.find(m=>m.id.toLowerCase()===query.toLowerCase());
    addModel(exact?.id || query);
  }
  if(e.key==='Escape')$('model-suggestions').classList.add('hidden');
});
$('add-manual').addEventListener('click',()=>addModel($('model-search').value));
$('model-suggestions').addEventListener('click',e=>{
  const button=e.target.closest('[data-model]'); if(button) addModel(button.dataset.model);
});
document.addEventListener('click',e=>{
  if(!e.target.closest('.model-search-wrap'))$('model-suggestions').classList.add('hidden');
});

function renderCatalog(){
  const list=$('catalog-results');
  if(!state.catalog.length){list.innerHTML='<p class="empty-inline">Load the OpenRouter catalog to see models and pricing.</p>';$('catalog-more').classList.add('hidden');return;}
  const provider=$('catalog-provider').value;
  const query=$('catalog-search').value.trim().toLowerCase();
  const sort=$('catalog-sort').value;
  const price=(m,k)=>{const n=Number(m.pricing?.[k]);return Number.isFinite(n)?n:Infinity;};
  const filtered=state.catalog.filter(m=>(!provider||m.id.split('/')[0]===provider)&&(!query||`${m.id} ${m.name}`.toLowerCase().includes(query)));
  filtered.sort((a,b)=>sort==='input'?price(a,'prompt')-price(b,'prompt'):sort==='output'?price(a,'completion')-price(b,'completion'):sort==='context'?(Number(b.context_length)||0)-(Number(a.context_length)||0):String(a.name||a.id).localeCompare(String(b.name||b.id)));
  $('catalog-count').textContent=`${fmtCount(filtered.length)} models · Prices USD per 1 million input/output tokens. Live provider pricing may change.`;
  list.innerHTML=filtered.slice(0,state.catalogLimit).map(m=>{
    const inp=Number(m.pricing?.prompt)*1e6,out=Number(m.pricing?.completion)*1e6;
    const cost=Number.isFinite(inp)&&Number.isFinite(out)?`Input $${inp.toFixed(2)} / Output $${out.toFixed(2)}`:'Pricing unavailable';
    return `<div class="catalog-item"><div class="catalog-item-main"><strong>${esc(m.name||m.id)}</strong><small>${esc(m.id)} · Context: ${fmtCount(m.context_length||0)}</small><div class="catalog-prices">${esc(cost)} / 1M tokens</div></div><button type="button" data-catalog-add="${esc(m.id)}">+ Add</button></div>`;
  }).join('')||'<p class="empty-inline">No models match those filters.</p>';
  $('catalog-more').classList.toggle('hidden',filtered.length<=state.catalogLimit);
}
for(const id of ['catalog-search','catalog-sort','catalog-provider'])$(id).addEventListener('input',()=>{state.catalogLimit=35;renderCatalog();});
$('catalog-more').addEventListener('click',()=>{state.catalogLimit+=35;renderCatalog();});
$('catalog-results').addEventListener('click',e=>{const b=e.target.closest('[data-catalog-add]');if(b)addModel(b.dataset.catalogAdd);});
function updateProviderOptions(){
  const select=$('catalog-provider'),selected=select.value;
  const developers=[...new Set(state.catalog.map(m=>m.id.split('/')[0]))].sort();
  select.innerHTML='<option value="">All developers</option>'+developers.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('');
  if(developers.includes(selected))select.value=selected;
}
function renderSuggestions(){
  const q=$('model-search').value.trim().toLowerCase();
  const suggestionBox=$('model-suggestions');
  if(!q || !state.catalog.length){suggestionBox.classList.add('hidden');return;}
  const matches=state.catalog.filter(x=>x.id.toLowerCase().includes(q)||x.name?.toLowerCase().includes(q)).slice(0,10);
  suggestionBox.innerHTML=matches.length ? matches.map(m=>`<button type="button" class="suggestion" data-model="${esc(m.id)}"><span><strong>${esc(m.name||m.id)}</strong><small>${esc(m.id)}</small></span><i>${esc(modelPrice(m))}</i></button>`).join('') : `<div class="empty-inline" style="padding:12px">No catalog match. You can add a manually entered ID.</div>`;
  suggestionBox.classList.remove('hidden');
}
function renderRoster(){
  $('model-count').textContent=state.models.length;
  $('model-roster').innerHTML=state.models.length ? state.models.map((m,i)=>`
    <div class="model-instance" data-instance="${esc(m.id)}"><span class="model-number">${String(i+1).padStart(2,'0')}</span><div class="model-instance-main"><input aria-label="Label for model instance ${i+1}" data-label="${esc(m.id)}" value="${esc(m.label)}"/><small>${esc(m.modelId)}</small><span class="model-origin">${esc(m.provider==='custom'?`Custom · ${m.connectionName}`:m.provider==='deepseek'?'DeepSeek direct':'OpenRouter')}</span><span class="price-label">${esc(m.provider==='openrouter'?modelPrice(state.catalog.find(x=>x.id===m.modelId)):m.pricing?`$${(Number(m.pricing.prompt)*1e6).toFixed(2)} / $${(Number(m.pricing.completion)*1e6).toFixed(2)} per 1M`:'Price unavailable')}</span></div><button type="button" data-remove="${esc(m.id)}" aria-label="Remove model instance ${i+1}" title="Remove model">×</button></div>
  `).join('') : '<p class="empty-inline">No models enlisted yet.</p>';
}
$('model-roster').addEventListener('click',e=>{
  const button=e.target.closest('[data-remove]');if(!button)return;
  state.models=state.models.filter(x=>x.id!==button.dataset.remove);
  renderRoster();updatePlan();
});
$('model-roster').addEventListener('input',e=>{
  const id=e.target.dataset.label;
  if(!id)return;const instance=state.models.find(x=>x.id===id);
  if(instance)instance.label=e.target.value;
});

function renderScenarios(){
  $('scenario-selected-count').textContent=`${state.selected.size} of ${scenarios().length} selected`;
  $('scenario-list').innerHTML=scenarios().map(s=>`
    <label class="scenario-card"><input type="checkbox" data-scenario="${esc(s.id)}" ${state.selected.has(s.id)?'checked':''}/><span><span class="category">${esc(s.category)}</span><strong>${esc(s.title)}</strong><span class="purpose">${esc(s.purpose)}</span></span>${s.custom?`<button type="button" class="scenario-remove" data-remove-scenario="${esc(s.id)}" aria-label="Remove custom scenario">×</button>`:''}</label>
  `).join('');
}
$('scenario-list').addEventListener('change',e=>{
  const id=e.target.dataset.scenario;if(!id)return;
  if(e.target.checked)state.selected.add(id);else state.selected.delete(id);
  $('scenario-selected-count').textContent=`${state.selected.size} of ${scenarios().length} selected`;
  updatePlan();
});
$('scenario-list').addEventListener('click',e=>{
  const b=e.target.closest('[data-remove-scenario]');if(!b)return;
  e.preventDefault();
  state.customScenarios=state.customScenarios.filter(x=>x.id!==b.dataset.removeScenario);
  state.selected.delete(b.dataset.removeScenario);renderScenarios();updatePlan();
});
$('select-all').addEventListener('click',()=>{state.selected=new Set(scenarios().map(s=>s.id));renderScenarios();updatePlan();});
$('clear-scenarios').addEventListener('click',()=>{state.selected.clear();renderScenarios();updatePlan();});
$('add-scenario').addEventListener('click',()=>{
  const title=$('custom-title').value.trim(), prompt=$('custom-prompt').value.trim();
  if(!title||!prompt)return toast('A custom scenario needs a title and a user message.',true);
  const id=uid();state.customScenarios.push({id,title,prompt,category:'Custom',purpose:'User-defined stimulus',custom:true});
  state.selected.add(id);$('custom-title').value='';$('custom-prompt').value='';
  renderScenarios();updatePlan();toast('Custom scenario added.');
});

function updatePlan(){
  const card=readCard(), settings=readSettings(), selected=selectedScenarios();
  const n=state.models.length * selected.length * settings.repetitions;
  $('request-count').textContent=fmtCount(n);
  const estimate=estimateCost({models:state.models,scenarios:selected,repetitions:settings.repetitions,card,roleplay:settings.roleplay,catalog:state.catalog});
  $('cost-estimate').textContent=estimate.unpriced===0 && state.models.length ? `≈${fmtUSD(estimate.total)}` : 'Unknown';
  $('cost-help').textContent=estimate.unpriced ? `${estimate.unpriced} model instance(s) lack pricing. OpenRouter prices come from the catalog; custom prices are user supplied. Direct DeepSeek is unpriced here. Actual charges vary.` : 'Estimate assumes ~350 output tokens per response; actual length, provider pricing and tokens can differ.';
  let preview='Complete a profile and select a scenario to preview the request.';
  if(card.profile && selected.length){
    try { preview=JSON.stringify({provider:state.models[0]?.provider||'openrouter',model:state.models[0]?.modelId||'provider/model-id',messages:buildMessages(card,selected[0],settings.roleplay),temperature:settings.temperature,max_tokens:settings.maxTokens,usage:{include:true}},null,2); }
    catch(err){preview=err.message;}
  }
  $('request-preview').textContent=preview;
}
for(const id of ['character-name','character-profile','character-depth','character-examples','character-system','repetitions','concurrency','temperature','max-tokens','roleplay-prompt']){
  $(id).addEventListener('input',updatePlan);
}

let currentExport = null;
function resultsForScenario() {
  const available=state.snapshot?.scenarios || [];
  if(!state.activeScenario || !available.some(s=>s.id===state.activeScenario))state.activeScenario=available[0]?.id||null;
  return state.runs.filter(r=>r.scenarioId===state.activeScenario);
}
function renderResultTabs(){
  const available=state.snapshot?.scenarios||[];
  $('result-tabs').innerHTML=available.map(s=>`<button type="button" class="tab-btn ${s.id===state.activeScenario?'active':''}" data-tab="${esc(s.id)}">${esc(s.title)}</button>`).join('');
}
$('result-tabs').addEventListener('click',e=>{
  const b=e.target.closest('[data-tab]');if(!b)return;
  state.activeScenario=b.dataset.tab;renderResults();
});
$('result-grid').addEventListener('click', async e=>{
  const b=e.target.closest('[data-copy]');if(!b)return;
  const run=state.runs.find(x=>x.id===b.dataset.copy);if(!run)return;
  try {await navigator.clipboard.writeText(run.response||run.error||'');toast('Response copied.');}
  catch {toast('Clipboard access is unavailable in this browser.',true);}
});

function renderResults(){
  const stats=summarize(state.runs);
  $('stat-complete').textContent=fmtCount(stats.complete);
  $('stat-failed').textContent=fmtCount(stats.error);
  $('stat-tokens').textContent=fmtCount(stats.tokens);
  $('stat-cost').textContent=fmtUSD(stats.cost);
  $('export-json').disabled=!state.runs.length;
  $('export-md').disabled=!state.runs.length;
  $('progress-wrap').classList.toggle('hidden',!state.runs.length);
  const done=stats.complete+stats.error+stats.canceled;
  const percent=state.runs.length?Math.round(100*done/state.runs.length):0;
  $('progress-label').textContent=state.running ? 'Examination in progress…' : `Examination ${state.runs.length ? 'recorded' : 'not started'} · ${done} of ${state.runs.length} settled`;
  $('progress-value').textContent=`${percent}%`;
  $('progress-fill').style.width=`${percent}%`;
  if(!state.runs.length)return;
  if(!state.activeScenario)state.activeScenario=state.snapshot?.scenarios?.[0]?.id||null;
  renderResultTabs();
  $('result-grid').innerHTML=resultsForScenario().map(run=>{
    const body=run.response||run.error||(run.status==='running'?'Request in progress…':run.status==='canceled'?'Canceled before completion.':'Awaiting execution…');
    const classes=run.error?'failure':run.response?'':'muted';
    const tokens=run.usage?.total_tokens!=null?`${fmtCount(run.usage.total_tokens)} tokens`:'No usage reported';
    const cost=typeof run.usage?.cost==='number'?fmtUSD(run.usage.cost):'Cost unavailable';
    return `<article class="result-card"><div class="result-card-head"><div><strong>${esc(run.modelLabel)}</strong><small>${esc(run.modelId)} · repetition ${run.repetition}</small></div><span class="result-status ${esc(run.status)}">${esc(run.status)}</span></div><div class="result-body ${classes}">${esc(body)}</div><div class="result-meta"><span>${esc(tokens)} · ${esc(cost)}</span><button type="button" data-copy="${esc(run.id)}">Copy</button></div><details class="result-debug"><summary>Scenario & request metadata</summary><p><strong>Scenario:</strong> ${esc(run.scenarioPrompt)}</p><p><strong>Resolved model:</strong> ${esc(run.resolvedModel||'Unknown')}</p><p><strong>Finish reason:</strong> ${esc(run.finishReason||'Unknown')}</p><p><strong>Generation ID:</strong> ${esc(run.generationId||'N/A')}</p></details></article>`;
  }).join('');
}

function download(name,text,format){
  const file=new Blob([text],{type:format});
  const url=URL.createObjectURL(file);
  const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function makeExport(){
  return {...state.snapshot,formatVersion:1,application:'Character Performance Initiative',runs:state.runs.map(r=>({...r}))};
}
$('export-json').addEventListener('click',()=>{
  if(!state.snapshot)return;
  download(`cpi-results-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(makeExport(),null,2),'application/json');
});
$('export-md').addEventListener('click',()=>{
  if(!state.snapshot)return;
  download(`cpi-results-${new Date().toISOString().slice(0,10)}.md`,toMarkdownExport(makeExport()),'text/markdown');
});

function validate(card,models,selected,settings){
  if(!card.profile)return 'Import or paste a character profile first.';
  if(!models.length)return 'Add at least one model.';
  if(!selected.length)return 'Select at least one test scenario.';
  if(models.some(m=>m.provider==='openrouter')&&!$('api-key').value.trim())return 'Enter your OpenRouter API key for OpenRouter models.';
  if(models.some(m=>m.provider==='deepseek')&&!$('deepseek-key').value.trim())return 'Enter your DeepSeek API key for direct DeepSeek models.';
  if(models.some(m=>m.provider==='custom'&&!state.connections.some(c=>c.id===m.connectionId)))return 'A custom model has no associated API connection.';
  if(!settings.roleplay)return 'Roleplay instructions cannot be blank.';
  return null;
}

async function runAll(){
  if(state.running)return;
  const card=readCard(),settings=readSettings(),models=state.models.map(x=>({...x})),selected=selectedScenarios().map(x=>({...x}));
  // Credentials are captured only in this closure, never in the export snapshot.
  const secrets={openrouter:$('api-key').value.trim(),deepseek:$('deepseek-key').value.trim()};
  const connections=new Map(state.connections.map(c=>[c.id,{...c}]));
  const issue=validate(card,models,selected,settings);
  if(issue)return toast(issue,true);
  const count=models.length*selected.length*settings.repetitions;
  if(count>500)return toast('Please reduce the test size to 500 requests or fewer per run.',true);
  state.snapshot={createdAt:new Date().toISOString(),appVersion:APP_VERSION,card,models,scenarios:selected,settings};
  state.runs=planRuns({models,scenarios:selected,repetitions:settings.repetitions});
  state.activeScenario=selected[0].id;
  state.controller=new AbortController();state.running=true;
  $('start-run').disabled=true;$('start-run').textContent='Examination in progress…';
  $('stop-run').classList.remove('hidden');
  $('results-section').scrollIntoView({behavior:'smooth',block:'start'});
  renderResults();
  const next={index:0};
  const catalog=new Map(state.catalog.map(m=>[m.id,m]));
  const modelById=new Map(models.map(m=>[m.id,m]));
  const worker=async()=>{
    while(next.index<state.runs.length && !state.controller.signal.aborted){
      const run=state.runs[next.index++];
      run.status='running';renderResults();
      try {
        const model=catalog.get(run.modelId);
        const supportsTemperature=!model?.supported_parameters || model.supported_parameters.includes('temperature');
        const instance=modelById.get(run.modelInstanceId);
        const connection=connections.get(instance.connectionId);
        const output=await completeViaProvider({provider:instance.provider,baseUrl:connection?.baseUrl,apiKey:instance.provider==='custom'?connection?.apiKey:secrets[instance.provider],modelId:run.modelId,
          messages:buildMessages(card,{prompt:run.scenarioPrompt},settings.roleplay),
          temperature:settings.temperature,maxTokens:settings.maxTokens,
          signal:state.controller.signal,supportsTemperature});
        Object.assign(run,output,{status:'complete'});
        // Keep the label from the immutable snapshot, not a user edit mid-run.
        run.modelLabel=modelById.get(run.modelInstanceId)?.label||run.modelId;
      } catch(err){
        run.status=state.controller.signal.aborted?'canceled':'error';
        run.error=err?.message||String(err);
      } finally{renderResults();}
    }
  };
  try {await Promise.all(Array.from({length:Math.min(settings.concurrency,state.runs.length)},worker));}
  finally {
    if(state.controller.signal.aborted)for(const run of state.runs)if(run.status==='queued')run.status='canceled';
    state.running=false;state.controller=null;
    $('start-run').disabled=false;$('start-run').textContent='▶   Begin new examination';
    $('stop-run').classList.add('hidden');renderResults();
    const stats=summarize(state.runs);
    toast(`Examination finished. ${stats.complete} completed, ${stats.error} failed, ${stats.canceled} canceled.`, stats.error>0);
  }
}
$('start-run').addEventListener('click',runAll);
$('stop-run').addEventListener('click',()=>{
  if(!state.running)return;
  state.controller?.abort();toast('Stop requested. Pending calls are canceled. Provider billing for already-started calls may still apply.');
});
renderScenarios();renderRoster();renderCatalog();updatePlan();
