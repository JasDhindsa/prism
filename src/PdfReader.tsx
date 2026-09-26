import { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, Scan, TextSelect, Minus, Plus } from 'lucide-react';
import type { Annotation, LocalDocument, Selection, Rect } from '../shared/contracts';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

type Props = { document: LocalDocument; page: number; onPage: (p: number) => void; onSelection: (s: Selection) => void; onLoaded: (pages: number, text: string[]) => void; onError: (message: string) => void; selected: Selection | null; annotations: Annotation[] };
export default function PdfReader({ document: doc, page, onPage, onSelection, onLoaded, onError, selected, annotations }: Props) {
  const wrapper = useRef<HTMLDivElement>(null); const pageRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(660); const [zoom, setZoom] = useState(1); const [diagram, setDiagram] = useState(false);
  const [drag, setDrag] = useState<Rect | null>(null); const start = useRef<{x:number;y:number} | null>(null);
  const file = useMemo(() => ({ data: doc.bytes.slice() }), [doc.id, doc.bytes]);
  const callback = useRef(onLoaded); callback.current = onLoaded;
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, entry.contentRect.width - 64)));
    if (wrapper.current) observer.observe(wrapper.current); return () => observer.disconnect();
  }, []);
  const selectText = () => {
    if (diagram || !pageRef.current) return;
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!pageRef.current.contains(range.startContainer) || !pageRef.current.contains(range.endContainer)) return;
    const text = selection.toString().trim(); if (!text) return;
    if (text.length > 12000) { onError('Select a passage shorter than 12,000 characters.'); return; }
    const bounds = pageRef.current.getBoundingClientRect();
    const rects = Array.from(range.getClientRects()).filter(r => r.width > 1 && r.height > 1).map(r => ({
      x: Math.max(0, (r.left-bounds.left)/bounds.width), y: Math.max(0,(r.top-bounds.top)/bounds.height),
      width: Math.min(1, r.width/bounds.width), height: Math.min(1,r.height/bounds.height)
    }));
    onSelection({ text, page, rects });
  };
  const coordinates = (e: React.PointerEvent) => {
    const r = pageRef.current!.getBoundingClientRect(); return { x: Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)), y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height)) };
  };
  const endDiagram = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const end = coordinates(e); const s = start.current; start.current = null;
    const box = { x:Math.min(s.x,end.x), y:Math.min(s.y,end.y), width:Math.abs(s.x-end.x), height:Math.abs(s.y-end.y) };
    setDrag(null); if (box.width < .015 || box.height < .015) return;
    const canvas = pageRef.current!.querySelector('canvas'); if (!canvas) return;
    const crop = window.document.createElement('canvas'); const factor = Math.min(1,1200/Math.max(canvas.width*box.width,canvas.height*box.height));
    crop.width = Math.max(1,Math.round(canvas.width*box.width*factor)); crop.height = Math.max(1,Math.round(canvas.height*box.height*factor));
    crop.getContext('2d')!.drawImage(canvas,canvas.width*box.x,canvas.height*box.y,canvas.width*box.width,canvas.height*box.height,0,0,crop.width,crop.height);
    const image = crop.toDataURL('image/jpeg', .8);
    if(image.length > 2800000) { onError('Select a smaller diagram.'); return; }
    onSelection({ text: 'Explain the selected diagram or figure.', page, rects:[box], image });
  };
  async function loaded(pdf: PDFDocumentProxy) {
    // Display the PDF immediately; background indexing only supports contextual AI requests.
    callback.current(pdf.numPages,[]);
    const text: string[] = [];
    try {
      for(let p=1;p<=Math.min(pdf.numPages,200);p++) {
        const data = await (await pdf.getPage(p)).getTextContent();
        text.push(data.items.map(item => 'str' in item ? item.str : '').join(' ').slice(0,15000));
      }
      callback.current(pdf.numPages,text);
    } catch { callback.current(pdf.numPages,text); }
  }
  return <section className="reader" aria-label="PDF reader">
    <div className="reader-toolbar">
      <div className="segmented"><button title="Highlight PDF text" aria-pressed={!diagram} className={!diagram?'active':''} onClick={()=>setDiagram(false)}><TextSelect size={17}/><span>Text</span></button><button title="Select any part of the PDF, including scanned text" aria-pressed={diagram} className={diagram?'active':''} onClick={()=>setDiagram(true)}><Scan size={17}/><span>Area</span></button></div>
      <div className="page-controls"><button aria-label="Previous page" disabled={page<=1} onClick={()=>onPage(page-1)}><ChevronLeft size={18}/></button><span>{page} <i>/ {doc.pages || '…'}</i></span><button aria-label="Next page" disabled={!doc.pages || page>=doc.pages} onClick={()=>onPage(page+1)}><ChevronRight size={18}/></button></div>
      <div className="zoom-controls"><button aria-label="Zoom out" disabled={zoom<=.75} onClick={()=>setZoom(v=>v-.1)}><Minus size={16}/></button><span>{Math.round(zoom*100)}%</span><button aria-label="Zoom in" disabled={zoom>=1.5} onClick={()=>setZoom(v=>v+.1)}><Plus size={16}/></button></div>
    </div>
    {diagram && <div className="diagram-hint">Drag to select any part of the PDF.</div>}
    <div className="pdf-scroll" ref={wrapper}>
      <Document file={file} onLoadSuccess={loaded} onLoadError={()=>onError('This PDF could not be opened. Try an unencrypted PDF.')} loading={<div className="pdf-loading skeleton">Opening your document…</div>}>
        <div className="page-wrap" ref={pageRef} onMouseUp={selectText} onKeyUp={selectText}>
          <Page pageNumber={page} width={Math.min(width,850)*zoom} renderAnnotationLayer={false} loading={<div className="pdf-loading skeleton">Loading page…</div>}/>
          <div className="highlights" aria-hidden="true">{annotations.filter(a=>a.selection.page===page).flatMap(a=>a.selection.rects.map((r,i)=><div key={`${a.id}-${i}`} className={`highlight ${a.type}`} style={{left:`${r.x*100}%`,top:`${r.y*100}%`,width:`${r.width*100}%`,height:`${r.height*100}%`}}/>))}{selected?.page===page && selected.rects.map((r,i)=><div key={`selected-${i}`} className="highlight selected" style={{left:`${r.x*100}%`,top:`${r.y*100}%`,width:`${r.width*100}%`,height:`${r.height*100}%`}}/>)}</div>
          {diagram && <div className="diagram-selector" tabIndex={0} aria-label="Drag to select a figure" onPointerDown={e=>{start.current=coordinates(e);e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(!start.current)return;const p=coordinates(e);setDrag({x:Math.min(p.x,start.current.x),y:Math.min(p.y,start.current.y),width:Math.abs(p.x-start.current.x),height:Math.abs(p.y-start.current.y)});}} onPointerUp={endDiagram} onPointerCancel={()=>{start.current=null;setDrag(null);}}>{drag && <div className="crop-box" style={{left:`${drag.x*100}%`,top:`${drag.y*100}%`,width:`${drag.width*100}%`,height:`${drag.height*100}%`}}/>}</div>}
        </div>
      </Document>
    </div>
  </section>;
}
