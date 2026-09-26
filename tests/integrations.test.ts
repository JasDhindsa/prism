import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { createProviders } from '../server/providers.js';
import { mastery, type Annotation } from '../shared/contracts.js';

const adapted={title:'A clearer idea',explanation:'A derivative is the rate of change.',takeaway:'Think of a speedometer.',narration:'A derivative tells us how fast something changes.'};
const input={selection:{text:'The derivative measures a local rate of change.',page:1},level:'Beginner' as const,language:'French' as const,context:'[Page 1] Functions'};
const config=readConfig({GEMINI_API_KEY:'test-gemini-secret',ELEVENLABS_API_KEY:'test-eleven-secret'});
const geminiResponse=(data:unknown)=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(data)}]}}]}),{headers:{'Content-Type':'application/json'}});

test('Gemini uses server credentials, selected passage, language, context and a JSON schema; repeated requests are cached',async()=>{
  let calls=0;
  const providers=createProviders(config,async(url,options)=>{calls++;assert.match(String(url),/models\/gemini-3\.8-flash:generateContent$/);assert.equal(new Headers(options?.headers).get('x-goog-api-key'),config.geminiKey);assert.ok(!String(url).includes(config.geminiKey));const body=JSON.parse(String(options?.body));const passage=JSON.parse(body.contents[0].parts[0].text);assert.equal(passage.language,'French');assert.equal(passage.level,'Beginner');assert.equal(passage.passage,input.selection.text);assert.equal(passage.earlierContext,input.context);assert.equal(body.generationConfig.responseMimeType,'application/json');assert.ok(body.generationConfig.responseJsonSchema.properties.narration);assert.match(body.systemInstruction.parts[0].text,/untrusted/);return geminiResponse(adapted);});
  assert.deepEqual(await providers.generate('adapt',input),adapted);await providers.generate('adapt',input);assert.equal(calls,1);
});
test('multimodal figure crops are sent as inline image data',async()=>{
  const providers=createProviders(config,async(_url,options)=>{const body=JSON.parse(String(options?.body));assert.deepEqual(body.contents[0].parts[1],{inlineData:{mimeType:'image/jpeg',data:'YWJj'}});return geminiResponse(adapted);});
  await providers.generate('adapt',{...input,selection:{...input.selection,image:'data:image/jpeg;base64,YWJj'}});
});
test('malformed and truncated generations are rejected instead of becoming broken annotations',async()=>{
  const malformed=createProviders(config,async()=>geminiResponse({title:'Missing everything else'}));await assert.rejects(()=>malformed.generate('adapt',input),/incomplete annotation/);
  const truncated=createProviders(config,async()=>new Response(JSON.stringify({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{}'}]}}]})));await assert.rejects(()=>truncated.generate('adapt',input),/could not complete/);
});
test('all Gemini actions validate usable structured results',async()=>{
  const responses={quiz:{title:'Rates',questions:Array.from({length:3},(_,i)=>({id:`q${i}`,question:'What does the derivative measure?',options:['Rate','Position','Area','Volume'],answerIndex:0,explanation:'It measures rate of change.',concept:'Derivative'}))},animate:{title:'Rates in motion',beats:Array.from({length:4},()=>({title:'Rate',narration:'Think of motion.',primitive:'flow',labels:['Position','Velocity'],values:[],equation:'',caption:'A rate tells us how something changes.'}))},prerequisites:{title:'Start here',suggestions:[{concept:'Functions',reason:'Rates depend on functions.',review:'A function maps an input to an output.',page:1}]},'study-pack':{title:'Rate review',summary:'Review rates of change.',keyIdeas:['Derivatives measure rates.'],reviewPlan:['Take a quiz.']}};
  for(const [action,result] of Object.entries(responses)){const provider=createProviders(config,async()=>geminiResponse(result));assert.deepEqual(await provider.generate(action as keyof typeof responses,input),result);}
});
test('ElevenLabs returns real audio bytes with configured voice and multilingual model; identical audio is cached',async()=>{
  let calls=0;const bytes=new Uint8Array([73,68,51,1,2,3]);
  const provider=createProviders(config,async(url,options)=>{calls++;assert.match(String(url),/text-to-speech\/JBFqnCBsd6RMkjVDRZzb\?output_format=mp3_44100_128/);assert.equal(new Headers(options?.headers).get('xi-api-key'),config.elevenKey);const body=JSON.parse(String(options?.body));assert.equal(body.model_id,'eleven_multilingual_v2');assert.equal(body.text,'Bonjour');return new Response(bytes,{headers:{'Content-Type':'audio/mpeg'}});});
  assert.deepEqual(await provider.narrate('Bonjour'),Buffer.from(bytes));await provider.narrate('Bonjour');assert.equal(calls,1);
});
test('quota, credentials, missing keys, network failures and empty audio produce actionable errors without leaking secrets',async()=>{
  for(const [status,pattern] of [[429,/quota/],[401,/credentials/],[403,/credentials/],[404,/model or voice/]] as const){const provider=createProviders(config,async()=>new Response('{}',{status}));await assert.rejects(()=>provider.generate('adapt',input),pattern);}
  const missing=createProviders(readConfig({}),async()=>{throw new Error('Should not call provider');});await assert.rejects(()=>missing.generate('adapt',input),/GEMINI_API_KEY/);await assert.rejects(()=>missing.narrate('Hello'),/ELEVENLABS_API_KEY/);
  const network=createProviders(config,async()=>{throw new Error(config.geminiKey);});await assert.rejects(()=>network.generate('adapt',input),e=>e instanceof Error&&!e.message.includes(config.geminiKey)&&/Could not reach/.test(e.message));
  const empty=createProviders(config,async()=>new Response('',{headers:{'Content-Type':'audio/mpeg'}}));await assert.rejects(()=>empty.narrate('Hi'),/no playable audio/);
});
test('API validates payloads, keeps secrets out of health, returns audio and persists collaborative annotations with owner enforcement',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'lumen-test-'));let calls=0;
  const app=createApp({...config,dataDir:directory},async(url)=>{calls++;return String(url).includes('elevenlabs')?new Response(new Uint8Array([73,68,51]),{headers:{'Content-Type':'audio/mpeg'}}):geminiResponse(adapted);});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address() as {port:number};const base=`http://127.0.0.1:${address.port}`;
  const post=(route:string,data:unknown,origin?:string)=>fetch(`${base}${route}`,{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(data)});
  try{
    const health=await(await fetch(`${base}/api/health`)).text();assert.ok(!health.includes(config.geminiKey)&&!health.includes(config.elevenKey));assert.match(health,/configured/);
    assert.equal((await post('/api/generate/adapt',{selection:{text:'',page:1}})).status,400);assert.equal(calls,0);
    assert.equal((await post('/api/generate/unknown',input)).status,404);
    assert.equal((await post('/api/generate/adapt',input,'https://malicious.example')).status,403);
    assert.deepEqual(await(await post('/api/generate/adapt',input)).json(),adapted);
    const audio=await post('/api/narrate',{text:'Hi'});assert.equal(audio.headers.get('content-type'),'audio/mpeg');assert.equal((await audio.arrayBuffer()).byteLength,3);
    const documentId='a'.repeat(64);const {id}=await(await post('/api/rooms',{documentId,documentName:'Reading.pdf'})).json();
    const owner=crypto.randomUUID();const annotation:Annotation={id:crypto.randomUUID(),documentId,type:'adapt',author:'Student',createdAt:Date.now(),selection:{text:input.selection.text,page:1,rects:[]},data:adapted,answers:{},reviewAt:{},watched:false};
    assert.equal((await post(`/api/rooms/${id}/annotations`,{owner,annotation})).status,200);
    assert.equal((await post(`/api/rooms/${id}/annotations`,{owner:crypto.randomUUID(),annotation:{...annotation,author:'Other'}})).status,403);
    const room=await(await fetch(`${base}/api/rooms/${id}`)).json();assert.deepEqual(room.annotations,[annotation]);assert.ok(!JSON.stringify(room).includes(owner));
    assert.equal((await fetch(`${base}/api/rooms/not-a-room`)).status,400);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});}
});
test('understanding score combines actual quiz answers with bounded study engagement',()=>{
  const base={id:crypto.randomUUID(),documentId:'a'.repeat(64),author:'You',createdAt:Date.now(),selection:{text:'rates',page:1,rects:[]},answers:{},reviewAt:{},watched:false};
  const questions=Array.from({length:3},(_,i)=>({id:`q${i}`,question:'Rate?',options:['A','B','C','D'],answerIndex:0,explanation:'A',concept:'Rate'}));
  const annotations:Annotation[]=[{...base,type:'quiz',data:{title:'Quiz',questions},answers:{q0:0,q1:1}},{...base,type:'adapt',data:adapted}];
  assert.deepEqual(mastery(annotations),{score:44,correct:1,total:2,engagement:4});assert.equal(mastery(Array.from({length:10},()=>({...base,type:'adapt' as const,data:adapted}))).score,20);assert.equal(mastery([]).score,0);
});
