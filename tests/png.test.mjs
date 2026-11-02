import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { parsePngCharacter, parseCharacterFile } from '../src/png.js';

const enc = new TextEncoder();
const payload=JSON.stringify({spec:'chara_card_v2',spec_version:'2.0',data:{name:'Élodie',description:'Warm observer',personality:'Skeptical',mes_example:'Sample',post_history_instructions:'Focus',system_prompt:'Instruction',first_mes:'NEVER INCLUDE GREETING',scenario:'NEVER INCLUDE SCENARIO',creator_notes:'NEVER INCLUDE NOTES',character_book:{entries:[{content:'NEVER INCLUDE LORE'}]}}});
const base64=Buffer.from(payload,'utf8').toString('base64');
const chunk=(type,bytes)=>{
  const out=new Uint8Array(bytes.length+12);
  new DataView(out.buffer).setUint32(0,bytes.length);
  out.set(enc.encode(type),4);out.set(bytes,8);
  // CRC isn't consulted by the metadata scanner; file still uses valid PNG structure.
  return out;
};
const makePng=(parts)=>{
  const chunks=[new Uint8Array([137,80,78,71,13,10,26,10]),...parts,chunk('IEND',new Uint8Array())];
  return Uint8Array.from(chunks.flatMap(x=>[...x]));
};
const text=(key,value)=>chunk('tEXt',enc.encode(`${key}\0${value}`));
const itxt=(key,value)=>chunk('iTXt',new Uint8Array([...enc.encode(key),0,0,0,0,0,...enc.encode(value)]));
const ztxt=(key,value)=>chunk('zTXt',new Uint8Array([...enc.encode(key),0,0,...deflateSync(Buffer.from(value))]));

test('V2 PNG chara tEXt extracts only permitted fields',async()=>{
  const result=await parsePngCharacter(makePng([text('chara',base64)]));
  assert.equal(result.name,'Élodie');
  assert.equal(result.profile,'Warm observer');
  assert.equal(result.personality,'Skeptical');
  assert.equal(result.depth,'Focus');
  assert.equal(result.examples,'Sample');
  assert.equal(result.system,'Instruction');
  assert.doesNotMatch(JSON.stringify(result),/NEVER INCLUDE/);
});

test('V3 ccv3 metadata takes precedence over V2 chara and supports iTXt',async()=>{
  const v3=JSON.stringify({spec:'chara_card_v3',data:{name:'V3',description:'New description',mes_example:'New examples'}});
  const result=await parsePngCharacter(makePng([text('chara',base64),itxt('ccv3',Buffer.from(v3).toString('base64'))]));
  assert.equal(result.name,'V3');
  assert.equal(result.profile,'New description');
});

test('zTXt metadata and older base64(zlib(JSON)) data are supported',async()=>{
  const z=await parsePngCharacter(makePng([ztxt('chara',base64)]));
  assert.equal(z.name,'Élodie');
  const older=Buffer.from(deflateSync(Buffer.from(payload))).toString('base64');
  const legacy=await parsePngCharacter(makePng([text('chara',older)]));
  assert.equal(legacy.name,'Élodie');
});

test('PNG import rejects plain images, invalid files and oversized chunks clearly',async()=>{
  await assert.rejects(()=>parsePngCharacter(makePng([])),/No embedded character card/);
  await assert.rejects(()=>parsePngCharacter(enc.encode('not a png')),/not a valid PNG/);
  const damaged=makePng([text('chara',base64)]);
  new DataView(damaged.buffer).setUint32(8,100000000);
  await assert.rejects(()=>parsePngCharacter(damaged),/malformed or oversized/);
});

test('file import dispatches by .png and JSON filename',async()=>{
  const png=makePng([text('chara',base64)]);
  const imported=await parseCharacterFile({name:'character.png',type:'image/png',arrayBuffer:async()=>png});
  assert.equal(imported.name,'Élodie');
  const json=await parseCharacterFile({name:'character.json',type:'application/json',text:async()=>payload});
  assert.equal(json.name,'Élodie');
});
