import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2, RotateCcw, Download } from 'lucide-react';
import type { AnimationResult, beatSchema } from '../shared/contracts';
import type { z } from 'zod';
import Markdown from './Markdown';
import { download, speech } from './lib';
type Beat = z.infer<typeof beatSchema>;
export function Graphic({ beat }: { beat: Beat }) {
  const labels = beat.labels; const values = beat.values;
  const colors = ['#80d5c1','#ebc56e','#a6b6f7','#ed9f97','#c0d5de','#d4bce7'];
  let drawing: React.ReactNode;
  if(beat.primitive==='curve') {
    const points = Array.from({length:81},(_,i)=>{const x=(i-40)/20; const y=values.slice(0,4).reduce((sum,v,p)=>sum+v*x**p,0);return `${40+i*3.5},${Math.max(24,Math.min(170,130-y*20))}`;}).join(' ');
    drawing=<><path d="M40 24V170H328" stroke="#5b726e" fill="none"/><polyline points={points} stroke={colors[0]} strokeWidth="3" fill="none" pathLength="1" className="draw-line"/><text x="180" y="192" textAnchor="middle">{labels[0]}</text></>;
  } else if(beat.primitive==='vectors') {
    drawing=<><path d="M40 105H320M180 20V190" stroke="#5b726e"/>{[0,1].map(i=><g key={i}><line x1="180" y1="105" x2={180+Math.max(-1,Math.min(1,(values[i*2]||0)/10))*130} y2={105-Math.max(-1,Math.min(1,(values[i*2+1]||0)/10))*75} markerEnd="url(#arrow)" stroke={colors[i]} strokeWidth="3" className="draw-line" pathLength="1"/><text x="40" y={25+i*20}>{labels[i]||''}</text></g>)}</>;
  } else if(beat.primitive==='circle') {
    const positive=labels.map((_,i)=>Math.max(0,values[i]??1));const total=positive.reduce((a,b)=>a+b,0)||1;let offset=0;
    drawing=<>{positive.map((v,i)=>{const fraction=v/total;const previous=offset;offset+=fraction;return <circle key={i} cx="115" cy="105" r="63" fill="none" stroke={colors[i]} strokeWidth="28" strokeDasharray={`${fraction*396} 396`} strokeDashoffset={-previous*396} transform="rotate(-90 115 105)" className="appear"/>;})}{labels.map((label,i)=><g key={i}><rect x="215" y={48+i*24} width="8" height="8" fill={colors[i]}/><text x="230" y={56+i*24}>{label.slice(0,17)}</text></g>)}</>;
  } else if(beat.primitive==='bars'||beat.primitive==='array') {
    const max=Math.max(1,...values.map(Math.abs));const step=290/labels.length;
    drawing=<>{labels.map((label,i)=>{const h=beat.primitive==='array'?58:Math.max(8,Math.abs(values[i]??1)/max*112);return <g key={i} className="appear" style={{animationDelay:`${i*.12}s`}}><rect x={35+i*step} y={160-h} width={step-12} height={h} rx="5" fill={colors[i]} opacity=".85"/><text x={35+i*step+(step-12)/2} y={beat.primitive==='array'?138:148-h} textAnchor="middle" fill={beat.primitive==='array'?'#173a35':'#d8e9e4'}>{values[i]??''}</text><text x={35+i*step+(step-12)/2} y="184" textAnchor="middle">{label.slice(0,12)}</text></g>;})}</>;
  } else {
    const count=labels.length;const step=300/count;
    drawing=<>{labels.map((label,i)=><g key={i} className="appear" style={{animationDelay:`${i*.2}s`}}>{i<count-1&&<path d={`M${30+i*step+step-8} 103h12`} stroke="#80d5c1" strokeWidth="2" markerEnd="url(#arrow)"/>}<rect x={25+i*step} y="69" width={step-12} height="68" rx={beat.primitive==='concept_map'?28:8} fill={colors[i]} fillOpacity=".16" stroke={colors[i]}/><text x={25+i*step+(step-12)/2} y="107" textAnchor="middle">{label.slice(0,count>3?10:18)}</text></g>)}</>;
  }
  return <div className="graphic"><svg viewBox="0 0 360 210" role="img" aria-label={`${beat.primitive}: ${labels.join(', ')}`}><defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="#80d5c1"/></marker></defs>{drawing}</svg>{beat.equation&&<div className="graphic-equation"><Markdown>{`$$${beat.equation}$$`}</Markdown></div>}</div>;
}
export default function Animation({ data, voiceId, onWatched, onError }: { data: AnimationResult; voiceId: string; onWatched: ()=>void; onError: (s:string)=>void }) {
  const [beat, setBeat]=useState(0);const [playing,setPlaying]=useState(false);const [audioUrl,setAudioUrl]=useState('');const [loading,setLoading]=useState(false);
  const audio=useRef<HTMLAudioElement>(null);const urls=useRef<string[]>([]);
  const weights=data.beats.map(b=>Math.max(1,b.narration.split(/\s+/).length));const sum=weights.reduce((a,b)=>a+b,0);
  useEffect(()=>()=>urls.current.forEach(URL.revokeObjectURL),[]);
  useEffect(()=>{setAudioUrl('');setPlaying(false);setBeat(0);},[voiceId]);
  useEffect(()=>{if(!playing||audioUrl)return;const timeout=setTimeout(()=>{if(beat<data.beats.length-1)setBeat(beat+1);else{setPlaying(false);onWatched();}},Math.max(3500,weights[beat]*400));return()=>clearTimeout(timeout);},[playing,beat,audioUrl]);
  async function narrate(){setLoading(true);try{const url=await speech(data.beats.map(b=>b.narration).join('\n\n'),voiceId);urls.current.push(url);setAudioUrl(url);setBeat(0);setPlaying(false);}catch(e){onError((e as Error).message);}finally{setLoading(false);}}
  function sync(){if(!audio.current?.duration)return;const fraction=audio.current.currentTime/audio.current.duration;let cumulative=0;const index=weights.findIndex(w=>{cumulative+=w/sum;return fraction<cumulative;});setBeat(index<0?data.beats.length-1:index);}
  return <div className="animation-player"><div className="visual-stage"><div className="stage-meta">VISUAL EXPLAINER <span>{beat+1} / {data.beats.length}</span></div><h3>{data.beats[beat].title}</h3><Graphic key={beat} beat={data.beats[beat]}/><p>{data.beats[beat].caption}</p></div>
    <div className="beat-progress">{data.beats.map((b,i)=><button key={i} aria-label={`Beat ${i+1}: ${b.title}`} className={i<=beat?'filled':''} onClick={()=>{setBeat(i);setPlaying(false);if(audio.current){audio.current.pause();const offset=weights.slice(0,i).reduce((a,b)=>a+b,0)/sum;audio.current.currentTime=offset*(audio.current.duration||0);}}}/>)}</div>
    <div className="audio-actions"><button className="small-button" onClick={()=>{if(audioUrl&&audio.current){if(playing)audio.current.pause();else audio.current.play().catch(()=>onError('Press play in the audio controls to start narration.'));}else setPlaying(!playing);}}>{playing?<Pause size={15}/>:<Play size={15}/>} {playing?'Pause':'Play visual'}</button><button className="icon-button" aria-label="Restart explainer" onClick={()=>{setBeat(0);if(audio.current)audio.current.currentTime=0;}}><RotateCcw size={15}/></button><button className="small-button" disabled={loading} onClick={narrate}><Volume2 size={15}/>{loading?'Creating voiceover…':audioUrl?'Regenerate voice':'Add narration'}</button></div>
    {audioUrl&&<><audio ref={audio} src={audioUrl} controls onTimeUpdate={sync} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>{setPlaying(false);onWatched();}}/><button className="text-button" onClick={async()=>download(await (await fetch(audioUrl)).blob(),`${data.title}-voiceover.mp3`)}><Download size={14}/> Download voiceover</button></>}
    <details className="transcript"><summary>Read this beat</summary><p>{data.beats[beat].narration}</p></details>
  </div>;
}
