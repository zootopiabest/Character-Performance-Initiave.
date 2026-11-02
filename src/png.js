import { parseCharacter } from './core.js';

const MAX_PNG = 24 * 1024 * 1024;
const MAX_CHUNK = 8 * 1024 * 1024;
const MAX_DECODED = 4 * 1024 * 1024;
const signature = [137,80,78,71,13,10,26,10];
const ascii = new TextDecoder('latin1');
const utf8 = new TextDecoder('utf-8', { fatal: true });

function nullByte(bytes, from = 0) { return bytes.indexOf(0, from); }
async function inflate(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot decompress the PNG card metadata. Try a JSON export.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  const reader = stream.getReader();
  const chunks=[];
  let size=0;
  try {
    while(true) {
      const { done, value } = await reader.read();
      if(done) break;
      size += value.byteLength;
      if (size > MAX_DECODED) throw new Error('PNG metadata expands beyond the safe limit (4 MB).');
      chunks.push(value);
    }
  } catch(err) { await reader.cancel().catch(()=>{}); throw err; }
  const out = new Uint8Array(size);let offset=0;
  for (const chunk of chunks) {out.set(chunk,offset);offset+=chunk.length;}
  return out;
}
function decodeB64(str) {
  const clean=str.replace(/\s/g,'');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length%4 === 1) throw new Error('Invalid base64 card payload.');
  return Uint8Array.from(atob(clean),char=>char.charCodeAt(0));
}
async function asCardText(raw) {
  const txt = raw.replace(/^\uFEFF/,'').trim();
  if(txt.startsWith('{')) return txt;
  const decoded=decodeB64(txt);
  if(decoded.length>MAX_DECODED) throw new Error('PNG character metadata exceeds 4 MB.');
  try {
    const plain=utf8.decode(decoded);
    if(plain.trimStart().startsWith('{')) return plain;
  }catch { /* Older cards sometimes zlib-compress before base64 encoding. */ }
  return utf8.decode(await inflate(decoded));
}
async function chunkText(type, bytes) {
  const sep=nullByte(bytes);
  if(sep < 1) return null;
  const keyword=ascii.decode(bytes.subarray(0,sep));
  if(keyword!=='chara'&&keyword!=='ccv3') return null;
  let content;
  if(type==='tEXt') content=bytes.subarray(sep+1);
  if(type==='zTXt') {
    if(bytes[sep+1]!==0) throw new Error('Unsupported PNG text compression method.');
    content=await inflate(bytes.subarray(sep+2));
  }
  if(type==='iTXt') {
    const flag=bytes[sep+1],method=bytes[sep+2];
    if((flag!==0&&flag!==1)||method!==0) throw new Error('Unsupported PNG international text format.');
    const langEnd=nullByte(bytes,sep+3);
    const translatedEnd=langEnd<0?-1:nullByte(bytes,langEnd+1);
    if(translatedEnd<0) throw new Error('Malformed PNG international text chunk.');
    const payload=bytes.subarray(translatedEnd+1);
    content=flag===1?await inflate(payload):payload;
  }
  return {keyword,content:await asCardText(utf8.decode(content))};
}
/** PNG character card extraction. All metadata is processed locally; image pixels are ignored.
 * Supports tEXt/iTXt/zTXt and V2 chara or V3 ccv3 (V3 preferred).
 */
export async function parsePngCharacter(input) {
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  if(bytes.length>MAX_PNG) throw new Error('PNG is too large for browser card import (24 MB maximum).');
  if(bytes.length<20 || signature.some((b,i)=>bytes[i]!==b)) throw new Error('This file is not a valid PNG.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const found=[];
  let offset=8;
  while(offset+12<=bytes.length) {
    const length=view.getUint32(offset);
    if(length>MAX_CHUNK || length>bytes.length-offset-12) throw new Error('The PNG contains a malformed or oversized chunk.');
    const type=ascii.decode(bytes.subarray(offset+4,offset+8));
    if(['tEXt','zTXt','iTXt'].includes(type)) {
      // Ignore all unrelated PNG text rather than inadvertently importing unrelated metadata.
      const entry=await chunkText(type,bytes.subarray(offset+8,offset+8+length));
      if(entry) found.push(entry);
    }
    offset+=length+12;
    if(type==='IEND') break;
  }
  if(!found.length) throw new Error('No embedded character card found. This PNG may have had its metadata stripped. Import the original card PNG or its JSON export.');
  let lastError;
  for(const entry of found.sort((a,b)=>(a.keyword==='ccv3'?-1:1)-(b.keyword==='ccv3'?-1:1))) {
    try{return parseCharacter(entry.content);}catch(err){lastError=err;}
  }
  throw new Error(`Embedded card data could not be parsed: ${lastError?.message||'unknown format'}`);
}

export async function parseCharacterFile(file) {
  if (/\.png$/i.test(file.name) || file.type==='image/png') return parsePngCharacter(await file.arrayBuffer());
  return parseCharacter(await file.text());
}
