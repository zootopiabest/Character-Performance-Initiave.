import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBaseUrl,completionEndpoint,buildCompletionRequest,completeViaProvider} from '../src/providers.js';
import {estimateCost,planRuns} from '../src/core.js';
import {RELEASES} from '../src/releases.js';

test('provider URLs use the correct direct endpoint',()=>{
  assert.equal(completionEndpoint({provider:'openrouter'}),'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(completionEndpoint({provider:'deepseek'}),'https://api.deepseek.com/chat/completions');
  assert.equal(completionEndpoint({provider:'custom',baseUrl:'https://myhost.test/v1/'}),'https://myhost.test/v1/chat/completions');
});
test('custom endpoints reject unsafe URLs',()=>{
  for(const v of ['http://example.com/v1','javascript:alert(1)','https://user:password@host.test/v1','https://host.test/v1?key=secret'])assert.throws(()=>normalizeBaseUrl(v));
  assert.equal(normalizeBaseUrl('http://localhost:1234/v1/'),'http://localhost:1234/v1');
});
test('OpenRouter-specific usage parameter is not leaked to DeepSeek or custom APIs',()=>{
  const common={modelId:'x',messages:[{role:'user',content:'hello'}],maxTokens:200,temperature:0.8};
  assert.deepEqual(buildCompletionRequest({provider:'openrouter',...common}).usage,{include:true});
  assert.ok(!('usage' in buildCompletionRequest({provider:'deepseek',...common})));
  assert.ok(!('temperature' in buildCompletionRequest({provider:'custom',...common,supportsTemperature:false})));
});
test('direct DeepSeek response is normalized, sent to the right URL, and no extra OpenRouter fields',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,'https://api.deepseek.com/chat/completions');
    assert.equal(options.headers.Authorization,'Bearer dummy-key');
    const body=JSON.parse(options.body);assert.equal(body.model,'deepseek-flash');assert.ok(!body.usage);
    return {ok:true,status:200,json:async()=>({id:'gen',model:'deepseek-flash',choices:[{message:{content:'In character.'},finish_reason:'stop'}],usage:{total_tokens:12}})};
  };
  try {const result=await completeViaProvider({provider:'deepseek',apiKey:'dummy-key',modelId:'deepseek-flash',messages:[{role:'user',content:'hi'}],maxTokens:100,temperature:0.9});assert.equal(result.response,'In character.');assert.equal(result.usage.total_tokens,12);}finally{globalThis.fetch=original;}
});
test('custom endpoint may omit key for localhost-compatible servers',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async(_url,options)=>{
    assert.equal(options.headers.Authorization,undefined);
    return {ok:true,status:200,json:async()=>({choices:[{message:{content:'Hello.'}}]})};
  };
  try{const r=await completeViaProvider({provider:'custom',baseUrl:'http://localhost:11434/v1',apiKey:'',modelId:'my-model',messages:[{role:'user',content:'hi'}],maxTokens:100,temperature:0.9});assert.equal(r.response,'Hello.');}finally{globalThis.fetch=original;}
});
test('custom model pricing contributes to estimate and exports never require credentials',()=>{
  const models=[{id:'m1',modelId:'local-model',provider:'custom',connectionName:'Local',pricing:{prompt:'0.000002',completion:'0.000004'}}];
  const cost=estimateCost({models,scenarios:[{id:'s'}],repetitions:2,card:{profile:'A',depth:'',examples:'',system:''},roleplay:'r',catalog:[]});
  assert.equal(cost.unpriced,0);assert.ok(cost.total>0);
  const runs=planRuns({models,scenarios:[{id:'s',title:'Test',prompt:'Hi'}],repetitions:2});assert.equal(runs[0].provider,'custom');
  assert.equal(runs[0].connectionName,'Local');
  assert.ok(RELEASES.length>=2);assert.equal(RELEASES[0].version,'0.2.0');
});
