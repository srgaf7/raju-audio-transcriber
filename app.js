import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
env.allowLocalModels=false;env.useBrowserCache=true;
const $=x=>document.querySelector(x),file=$('#file'),go=$('#go'),out=$('#out'),status=$('#status'),prog=$('#prog');
let transcriber=null,loadedModel='';
const setStatus=s=>status.textContent=s;
const fmt=s=>{s=Math.max(0,Math.round(s));return Math.floor(s/3600)?`${Math.floor(s/3600)}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`:`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`};
async function loadModel(){
 const model=$('#model').value;
 if(transcriber&&loadedModel===model)return;
 setStatus('Loading Whisper model…');
 transcriber=await pipeline('automatic-speech-recognition',model,{quantized:true,progress_callback:p=>{if(p.progress){prog.value=Math.min(.15,(p.progress/100)*.15)}}});
 loadedModel=model;
}
async function getDuration(f){
 return new Promise((resolve,reject)=>{const a=document.createElement('audio');a.preload='metadata';a.onloadedmetadata=()=>{resolve(a.duration);URL.revokeObjectURL(a.src)};a.onerror=()=>reject(new Error('Could not read audio duration.'));a.src=URL.createObjectURL(f)});
}
async function decodeWindow(f,start,duration){
 const blob=f.slice(0,f.size); const arr=await blob.arrayBuffer();
 const ctx=new (window.AudioContext||window.webkitAudioContext)();
 const decoded=await ctx.decodeAudioData(arr);
 const sr=16000,frames=Math.ceil(Math.min(duration,decoded.duration-start)*sr);
 const offline=new OfflineAudioContext(1,Math.max(1,frames),sr);
 const src=offline.createBufferSource();src.buffer=decoded;src.connect(offline.destination);src.start(0,start,Math.min(duration,decoded.duration-start));
 const rendered=await offline.startRendering();await ctx.close();return rendered.getChannelData(0);
}
async function transcribeShort(f,total){
 setStatus('Preparing audio…');const audio=await decodeWindow(f,0,total);
 setStatus('Transcribing…');const r=await transcriber(audio,{chunk_length_s:25,stride_length_s:4});
 out.value=r.text||'';prog.value=1;
}
go.onclick=async()=>{
 const f=file.files[0];if(!f){setStatus('Choose an audio file first.');return}
 go.disabled=true;out.value='';prog.value=0;
 try{
  await loadModel();const total=await getDuration(f);
  // iOS Safari is memory-constrained. Refuse unsafe long decode rather than silently reloading.
  if(total>20*60){
   setStatus('This recording is '+fmt(total)+'. iPhone Safari cannot safely decode this whole MP3 locally yet.');
   out.value='Long recording detected ('+fmt(total)+').\n\nYour file was NOT uploaded. This version stopped before iOS could reload the page and lose your work.\n\nFor now, split the recording into sections of 20 minutes or less, or use the desktop version. A true streaming decoder is required for unlimited-length iPhone transcription.';
   prog.value=0;return;
  }
  await transcribeShort(f,total);setStatus('Finished — '+fmt(total)+' transcribed.');
 }catch(e){console.error(e);setStatus('Stopped with an error.');out.value='Error: '+(e?.message||String(e))+'\n\nYour audio was not uploaded.'}
 finally{go.disabled=false}
};
$('#copy').onclick=async()=>{await navigator.clipboard.writeText(out.value);setStatus('Transcript copied.')};
$('#clear').onclick=()=>{out.value='';prog.value=0;setStatus('Ready')};
$('#txt').onclick=()=>{const b=new Blob([out.value],{type:'text/plain'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=(file.files[0]?.name||'transcript').replace(/\.[^.]+$/,'')+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').then(r=>r.update());