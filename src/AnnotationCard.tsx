import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles, ListChecks, Clapperboard, Volume2, Download, BookOpen, Check, X } from 'lucide-react';
import type { AdaptResult, Annotation, AnimationResult, PrerequisiteResult, QuizResult } from '../shared/contracts';
import Markdown from './Markdown';
import Animation from './Animation';
import { download, speech } from './lib';
export const actionLabels = { adapt:'Adapt', quiz:'Quiz', animate:'Animate', prerequisites:'Review first' };
export const actionIcons = { adapt:Sparkles, quiz:ListChecks, animate:Clapperboard, prerequisites:BookOpen };
export default function AnnotationCard({ annotation:a, onChange, onPage, onPrerequisites, onError, voiceId, autoNarrate, own, reviewMode }: {
  annotation:Annotation; onChange:(a:Annotation)=>void; onPage:(p:number)=>void; onPrerequisites:()=>void; onError:(s:string)=>void; voiceId:string; autoNarrate:boolean; own:boolean; reviewMode:boolean
}) {
  const [open,setOpen]=useState(true);const [audioUrl,setAudioUrl]=useState('');const [loading,setLoading]=useState(false);const audio=useRef<HTMLAudioElement>(null);const urls=useRef<string[]>([]);const autoStarted=useRef(false);
  useEffect(()=>()=>urls.current.forEach(URL.revokeObjectURL),[]);
  useEffect(()=>{setAudioUrl('');},[voiceId]);
  const narrated = a.type==='adapt'?(a.data as AdaptResult).narration:'';
  async function narrate(text=narrated){setLoading(true);try{const url=await speech(text,voiceId);urls.current.push(url);setAudioUrl(url);}catch(e){onError((e as Error).message);}finally{setLoading(false);}}
  useEffect(()=>{if(autoNarrate&&narrated&&!autoStarted.current&&Date.now()-a.createdAt<15000){autoStarted.current=true;void narrate();}},[autoNarrate,narrated]);
  const Icon=actionIcons[a.type];
  return <article className={`annotation-card ${a.type}`}>
    <button className="card-heading" aria-expanded={open} onClick={()=>setOpen(!open)}><span className="type-icon"><Icon size={17}/></span><span><small>{actionLabels[a.type]} <i>· Page {a.selection.page}</i></small><strong>{a.data.title}</strong></span>{open?<ChevronDown size={17}/>:<ChevronRight size={17}/>}</button>
    {open&&<div className="card-content"><button className="passage" onClick={()=>onPage(a.selection.page)}>{a.selection.text.length>220?`${a.selection.text.slice(0,220)}…`:a.selection.text}</button>
      {a.type==='adapt'&&<><Markdown>{(a.data as AdaptResult).explanation}</Markdown><div className="takeaway"><Sparkles size={16}/><p>{(a.data as AdaptResult).takeaway}</p></div><button className="small-button" disabled={loading} onClick={()=>narrate()}><Volume2 size={15}/>{loading?'Creating narration…':audioUrl?'Regenerate narration':'Listen with your tutor'}</button></>}
      {a.type==='quiz'&&<div className="quiz">{(a.data as QuizResult).questions.filter(q=>!reviewMode||(a.reviewAt[q.id]||Infinity)<=Date.now()).map((q,index)=>{const answer=a.answers[q.id];const answered=answer!==undefined;const correct=answer===q.answerIndex;return <fieldset key={q.id}><legend><span>QUESTION {index+1}</span>{q.question}</legend>{q.options.map((option,i)=><button key={i} disabled={answered||!own} className={`quiz-option ${answered&&i===q.answerIndex?'correct':''} ${answered&&i===answer&&!correct?'incorrect':''}`} onClick={()=>onChange({...a,answers:{...a.answers,[q.id]:i},reviewAt:{...a.reviewAt,[q.id]:i===q.answerIndex?0:Date.now()+86400000}})}><span>{String.fromCharCode(65+i)}</span>{option}{answered&&i===q.answerIndex?<Check size={16}/>:answered&&i===answer?<X size={16}/>:null}</button>)}{answered&&<div className={`feedback ${correct?'success':'retry'}`}><strong>{correct?'You’ve got it.':'Let’s unpack this.'}</strong><Markdown>{q.explanation}</Markdown>{!correct&&<><p className="review-note">This question returns for review tomorrow.</p><button className="text-button" onClick={onPrerequisites}><BookOpen size={14}/> Find what to review first</button></>}<button className="text-button" disabled={loading} onClick={()=>narrate(q.explanation)}><Volume2 size={14}/> Listen to feedback</button>{own&&<button className="text-button" onClick={()=>{const answers={...a.answers};delete answers[q.id];onChange({...a,answers});}}>Try again</button>}</div>}</fieldset>;})}</div>}
      {a.type==='animate'&&<Animation data={a.data as AnimationResult} voiceId={voiceId} onError={onError} onWatched={()=>{if(own&&!a.watched)onChange({...a,watched:true});}}/>}
      {a.type==='prerequisites'&&(a.data as PrerequisiteResult).suggestions.map((s,i)=><div className="prerequisite" key={i}><strong>{s.concept}</strong><p>{s.reason}</p><Markdown>{s.review}</Markdown>{s.page?<button className="text-button" onClick={()=>onPage(s.page)}><BookOpen size={14}/> Review page {s.page}</button>:<small>Background knowledge · not found in earlier pages</small>}</div>)}
      {audioUrl&&<div className="narration"><audio ref={audio} src={audioUrl} controls autoPlay/><button className="text-button" onClick={async()=>download(await(await fetch(audioUrl)).blob(),`${a.data.title}-narration.mp3`)}><Download size={14}/> Save audio</button></div>}
      <footer className="card-footer"><span>{a.author}</span><span>{new Date(a.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span></footer>
    </div>}
  </article>;
}
