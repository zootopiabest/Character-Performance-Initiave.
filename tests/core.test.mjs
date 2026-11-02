import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCharacter, buildMessages, planRuns, estimateCost, summarize, toMarkdownExport } from '../src/core.js';

const card = {
  name:'Test', profile:'Careful, curious, stubborn.', depth:'Avoids casual trust.',
  examples:'{{char}}: Hmm.', system:'Never breaks character.'
};

test('JSON import extracts allowed fields, never scenario or greeting',()=>{
  const imported=parseCharacter(JSON.stringify({data:{name:'A',description:'Scientist',personality:'Impulsive',first_mes:'GREETING PRIVATE',scenario:'SCENARIO PRIVATE',mes_example:'Example',post_history_instructions:'Depth',system_prompt:'System'}}));
  assert.equal(imported.name,'A');
  assert.match(imported.profile,/Scientist/);
  assert.match(imported.profile,/Impulsive/);
  assert.equal(imported.examples,'Example');
  assert.equal(imported.depth,'Depth');
  assert.equal(imported.system,'System');
  assert.doesNotMatch(JSON.stringify(imported),/GREETING PRIVATE|SCENARIO PRIVATE/);
});

test('Markdown importer isolates explicitly excluded sections',()=>{
  const imported=parseCharacter('# Character\n## Basic Information\nName: Agnes\n## Personality\nImpulsive.\n## Scenario\nDO NOT IMPORT ME\n## Greetings\nIGNORE THIS\n## Depth Prompt\nDepth here.\n## Example Dialogue\nExample here.');
  assert.match(imported.profile,/Impulsive/);
  assert.doesNotMatch(imported.profile,/DO NOT IMPORT ME|IGNORE THIS|Depth here/);
  assert.equal(imported.depth,'Depth here.');
  assert.equal(imported.examples,'Example here.');
});

test('buildMessages is a clean two-message request with isolated card fields',()=>{
  const msgs=buildMessages(card,{prompt:'Hello.'},'Play the role.');
  assert.equal(msgs.length,2);
  assert.equal(msgs[0].role,'system');
  assert.match(msgs[0].content,/Avoids casual trust/);
  assert.match(msgs[0].content,/Name: Test/);
  assert.match(msgs[0].content,/Never breaks character/);
  assert.equal(msgs[1].role,'user');
  assert.equal(msgs[1].content,'Hello.');
});

test('duplicates count as independent instances with repeated trials',()=>{
  const plan=planRuns({models:[{id:'a',modelId:'one/two',label:'First'},{id:'b',modelId:'one/two',label:'Second'}],scenarios:[{id:'x',title:'Hello',prompt:'Hi'},{id:'y',title:'Bye',prompt:'Bye'}],repetitions:3});
  assert.equal(plan.length,12);
  assert.equal(new Set(plan.map(x=>x.id)).size,12);
  assert.equal(plan.filter(x=>x.modelInstanceId==='a').length,6);
});

test('estimateCost accounts for per-token prompt/completion pricing and repetitions',()=>{
  const result=estimateCost({models:[{id:'x',modelId:'abc/def'}],scenarios:[{id:'a'},{id:'b'}],repetitions:2,card,roleplay:'roleplay',catalog:[{id:'abc/def',pricing:{prompt:'0.000001',completion:'0.000002'}}],expectedOutputTokens:100});
  assert.equal(result.unpriced,0);
  assert.ok(result.total>0);
});

test('summary counts statuses, tokens and observed costs',()=>{
  assert.deepEqual(summarize([{status:'complete',usage:{cost:0.12,total_tokens:200}},{status:'error'},{status:'canceled'}]),{queued:0,running:0,complete:1,error:1,canceled:1,cost:0.12,tokens:200});
});

test('Markdown export includes raw model output',()=>{
  const text=toMarkdownExport({card,models:[{modelId:'a/b',label:'A'}],scenarios:[{title:'Hello'}],settings:{repetitions:1,temperature:.8,maxTokens:800,roleplay:'Be the character.'},createdAt:'2026-11-02',runs:[{modelId:'a/b',modelLabel:'A',scenarioTitle:'Hello',scenarioPrompt:'Hi',repetition:1,status:'complete',response:'Raw output test'}]});
  assert.match(text,/Raw output test/);
  assert.match(text,/a\/b/);
});
