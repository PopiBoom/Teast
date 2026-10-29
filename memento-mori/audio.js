// Синтез музыки + звукового дизайна -> WAV (стерео 44.1k/16bit).
// Арка: холодный минорный дрон -> сердцебиение -> обвал -> пустота ->
// перелом минор→мажор на «ЖИВИ» -> тёплый резолв с длинным хвостом.
// SFX (удары, whoosh, crumble) ложатся на визуальные биты.
const fs = require('fs');
const path = require('path');

const SR = 44100, DUR = 22.0, N = Math.ceil(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N), REV = new Float32Array(N);
const T = i => i / SR;
const idx = t => Math.round(t * SR);
const clamp = (v,a,b)=>v<a?a:v>b?b:v;

// ---- аккорды (Гц) ----
const Am = [110.00,164.81,220.00,261.63,329.63];      // i
const F  = [174.61,220.00,261.63,349.23,440.00];      // VI (тёплый подъём)
const C  = [130.81,196.00,261.63,329.63,392.00,523.25]; // резолв

// ---- огибающие ----
function adsr(t, dur, a, d, s, r){
  if (t<0||t>dur+r) return 0;
  if (t<a) return t/a;
  if (t<a+d) return 1-(1-s)*((t-a)/d);
  if (t<dur) return s;
  return s*(1-(t-dur)/r);
}
const perc = (t, dec)=> t<0?0:Math.exp(-t/dec);

// ---- голоса ----
function tone(t0, dur, freq, amp, opt={}){ // аддитивный тон (пиано/колокол/пад-голос)
  const a=opt.a??0.006, d=opt.d??0.12, s=opt.s??0.0, r=opt.r??0.3;
  const harm=opt.harm||[[1,1],[2,0.5],[3,0.28],[4,0.12],[5,0.06]];
  const pan=opt.pan??0, inh=opt.inh??0, vib=opt.vib??0, revAmt=opt.rev??0.25;
  const i0=idx(t0), i1=Math.min(N, idx(t0+dur+r+0.05));
  const gl=Math.cos((pan+1)*Math.PI/4), gr=Math.sin((pan+1)*Math.PI/4);
  for(let i=i0;i<i1;i++){
    const t=T(i)-t0; let e=opt.perc? amp*perc(t,opt.perc): amp*adsr(t,dur,a,d,s,r);
    if(e<=1e-5) continue;
    const vf=vib? (1+vib*Math.sin(2*Math.PI*5*t)) :1;
    let v=0;
    for(const [h,ha] of harm){ const f=freq*h*(1+inh*h*h)*vf; v+=ha*Math.sin(2*Math.PI*f*t); }
    v*=e;
    L[i]+=v*gl; R[i]+=v*gr; REV[i]+=v*revAmt;
  }
}
function pad(t0, t1, chord, amp, opt={}){ // сустейн-аккорд, детюн для ширины
  const dur=t1-t0, a=opt.a??0.6, r=opt.r??0.9, bright=opt.bright??4, rev=opt.rev??0.3;
  chord.forEach((f,k)=>{
    const harm=[]; for(let h=1;h<=bright;h++) harm.push([h, (1/h)*Math.pow(0.7,h-1)]);
    const pan=(k%2?1:-1)*0.5*(opt.width??0.6);
    for(const det of [-0.12,0.12]){
      tone(t0,dur,f*(1+det/100),amp*0.5,{a,d:0.4,s:0.85,r,harm,pan:pan+det*2,vib:opt.vib??0.004,rev});
    }
  });
}
function sub(t0, f0, f1, dur, amp){ // суб-удар с питч-энвелопом
  const i0=idx(t0), i1=Math.min(N, idx(t0+dur+0.1));
  for(let i=i0;i<i1;i++){ const t=T(i)-t0; const e=amp*Math.exp(-t/(dur*0.4));
    const f=f1+(f0-f1)*Math.exp(-t/(dur*0.3)); const v=Math.sin(2*Math.PI*f*t)*e;
    L[i]+=v; R[i]+=v; REV[i]+=v*0.15; }
}
let noiseSeed=12345; function nrand(){noiseSeed=(noiseSeed*1664525+1013904223)|0;return (noiseSeed/2147483648);}
function whoosh(t0, dur, amp, fc0, fc1, pan=0){ // полосовой шум со свипом
  const i0=idx(t0), i1=Math.min(N, idx(t0+dur)); let bp=0, lp=0;
  const gl=Math.cos((pan+1)*Math.PI/4), gr=Math.sin((pan+1)*Math.PI/4);
  for(let i=i0;i<i1;i++){ const t=(i-i0)/(i1-i0); const env=Math.sin(Math.PI*t)*amp;
    const fc=fc0+(fc1-fc0)*t; const alpha=clamp(fc/SR*2,0.001,0.4);
    const x=nrand(); lp+=alpha*(x-lp); const hp=x-lp; bp+=alpha*(hp-bp);
    const v=bp*env; L[i]+=v*gl; R[i]+=v*gr; REV[i]+=v*0.2; }
}
function crumble(t0, dur, amp){ // гранулярный распад (прах)
  const i0=idx(t0), i1=Math.min(N, idx(t0+dur)); let lp=0;
  for(let i=i0;i<i1;i++){ const t=(i-i0)/(i1-i0); const env=amp*(1-t)*(1-t);
    if(nrand()>0.4){ const x=nrand()*env; const fc=0.06*(1-0.6*t); lp+=fc*(x-lp);
      L[i]+=lp*(0.7+0.3*nrand()); R[i]+=lp*(0.7+0.3*nrand()); REV[i]+=lp*0.3; } }
}
function heartbeat(t0, amp){ // lub-dub
  sub(t0, 90, 52, 0.18, amp); sub(t0+0.16, 80, 46, 0.15, amp*0.75);
}
function tick(t0, amp){ // мягкий тик часов
  const i0=idx(t0), i1=Math.min(N, idx(t0+0.04));
  for(let i=i0;i<i1;i++){ const t=T(i)-t0; const e=amp*Math.exp(-t/0.008);
    const v=(nrand()*0.5+Math.sin(2*Math.PI*2400*t))*e; L[i]+=v*0.5; R[i]+=v*0.5; REV[i]+=v*0.2; }
}

/* ============================ АРАНЖИРОВКА ============================ */
// S1 часы (0–2.6): дрон + тики
pad(0.0, 3.2, [110,164.81], 0.11, {a:1.0, r:1.2, bright:3, vib:0.003});
for(let t=0.35;t<2.45;t+=0.55) tick(t, 0.09);
tone(0.4, 3.0, 659.25, 0.015, {a:1.2,d:1,s:0.4,r:1,harm:[[1,1],[2,0.3]],pan:0.3,rev:0.5}); // далёкий шиммер

// S2 MEMENTO MORI: удары + раскрытие минорного пада
whoosh(2.30, 0.30, 0.16, 300, 3600, 0);
sub(2.58, 150, 44, 0.5, 0.5);
pad(2.58, 7.8, Am, 0.12, {a:0.5, r:1.0, bright:4});
whoosh(3.55, 0.22, 0.09, 400, 2600, 0.2);
sub(3.76, 120, 42, 0.38, 0.34);
// пиано-мотив (минор, печальный)
tone(3.3, 1.2, 440.00, 0.14, {perc:1.1, harm:[[1,1],[2,0.55],[3,0.3],[4,0.14],[6,0.05]], inh:0.0004, pan:-0.2, rev:0.4});
tone(3.95,1.2, 523.25, 0.12, {perc:1.1, harm:[[1,1],[2,0.5],[3,0.28],[4,0.12]], inh:0.0004, pan:0.15, rev:0.4});
tone(4.65,1.4, 493.88, 0.12, {perc:1.3, harm:[[1,1],[2,0.5],[3,0.26]], inh:0.0004, pan:-0.1, rev:0.45});
tone(5.4, 1.6, 440.00, 0.11, {perc:1.5, harm:[[1,1],[2,0.45],[3,0.22]], inh:0.0004, pan:0.1, rev:0.5});
tone(6.3, 1.8, 329.63, 0.11, {perc:1.6, harm:[[1,1],[2,0.4],[3,0.2]], inh:0.0003, pan:-0.15, rev:0.55});

// S4 каждый вдох — на один ближе (7.7–10.2): сердцебиение + тревожный сдвиг на F
pad(7.8, 10.5, F, 0.11, {a:0.5, r:0.8, bright:4});
[7.72, 8.5, 9.3, 10.0].forEach(t=>heartbeat(t, 0.5));
whoosh(8.02, 0.18, 0.08, 500, 2800, 0.1);
whoosh(9.25, 0.2, 0.1, 450, 3000, -0.2);
tone(6.8,1.0, 329.63, 0.09,{perc:1.0,harm:[[1,1],[2,0.4]],pan:0.2,rev:0.4});
tone(7.6,1.0, 392.00, 0.09,{perc:1.0,harm:[[1,1],[2,0.4]],pan:-0.2,rev:0.4});
tone(8.9,1.2, 349.23, 0.09,{perc:1.2,harm:[[1,1],[2,0.38]],pan:0.1,rev:0.45});

// S5 правда и провал (10.2–12.8)
whoosh(10.35, 0.3, 0.14, 300, 4200, 0);
sub(10.65, 170, 40, 0.7, 0.6);                 // УМРЁШЬ
pad(10.3, 11.6, Am, 0.12, {a:0.3, r:0.5, bright:5});
crumble(11.45, 1.25, 0.5);                      // распад в прах
sub(11.5, 70, 30, 1.4, 0.4);                    // дак — низкий провал
// S6 петля (12.8–13.8): одинокий низкий тон + далёкий высокий
pad(12.4, 14.0, [110], 0.08, {a:0.6, r:0.8, bright:2});
tone(13.0, 1.0, 329.63, 0.03,{a:0.4,d:0.4,s:0.5,r:0.6,harm:[[1,1],[2,0.3]],pan:0.2,rev:0.6});

// S7 ВОЛЬТА (13.8–17.4): восходящий swell -> перелом в мажор на 14.55
whoosh(13.8, 0.75, 0.2, 200, 6000, 0);          // риз
for(let t=13.8;t<14.5;t+=0.001){ const p=(t-13.8)/0.7; const i=idx(t); if(i<N){ const v=0.12*p*p*Math.sin(2*Math.PI*(180+p*240)*(t-13.8)); L[i]+=v;R[i]+=v;REV[i]+=v*0.3;} } // струнный подъём
sub(14.55, 180, 46, 0.8, 0.62);                 // удар зажигания
pad(14.55, 17.6, F, 0.14, {a:0.25, r:1.0, bright:5, width:0.7});   // тёплый мажор
// колокольный арпеджио
[[14.60,523.25],[14.80,659.25],[15.00,783.99],[15.22,880.00]].forEach(([t,f],k)=>
  tone(t, 2.2, f, 0.12-0.015*k, {perc:1.8, harm:[[1,1],[2.76,0.5],[5.4,0.25],[8.9,0.1]], pan:(k%2?0.3:-0.3), rev:0.5}));
// тёплая мелодия
tone(15.6,1.6, 523.25, 0.1,{perc:1.6,harm:[[1,1],[2,0.4],[3,0.2]],pan:-0.15,rev:0.5});
tone(16.25,1.6,440.00, 0.1,{perc:1.6,harm:[[1,1],[2,0.4],[3,0.2]],pan:0.15,rev:0.5});
tone(16.85,1.8,392.00, 0.09,{perc:1.8,harm:[[1,1],[2,0.38]],pan:-0.1,rev:0.55});

// S8/S9 резолв (17.4–22): тёплый C-мажор, длинный хвост
pad(17.4, 22.0, C, 0.13, {a:0.6, r:1.6, bright:5, width:0.75, vib:0.003});
tone(17.7,2.0, 523.25, 0.08,{perc:2.0,harm:[[1,1],[2,0.4],[3,0.18]],pan:0.1,rev:0.55});
tone(19.9,2.6, 783.99, 0.09,{perc:2.6,harm:[[1,1],[2.76,0.4],[5.4,0.2]],pan:-0.2,rev:0.6}); // финальный колокол
tone(20.4,2.2, 523.25, 0.07,{perc:2.4,harm:[[1,1],[2,0.35]],pan:0.15,rev:0.6});

/* ============================ РЕВЕРБ (Шрёдер) ============================ */
function comb(inp, out, delay, fb, damp){ const buf=new Float32Array(delay); let p=0, store=0;
  for(let i=0;i<N;i++){ const y=buf[p]; store=y*(1-damp)+store*damp; out[i]+=y;
    buf[p]=inp[i]+store*fb; p=(p+1)%delay; } }
function allpass(buf0, delay, fb){ const buf=new Float32Array(delay); let p=0;
  const out=new Float32Array(N);
  for(let i=0;i<N;i++){ const bufout=buf[p]; const y=-buf0[i]+bufout; buf[p]=buf0[i]+bufout*fb; out[i]=y; p=(p+1)%delay; }
  for(let i=0;i<N;i++) buf0[i]=out[i]; }
const wet=new Float32Array(N);
[1557,1617,1491,1422,1277,1356,1188,1116].forEach(d=>comb(REV, wet, d, 0.86, 0.22));
[225,556,441,341].forEach(d=>allpass(wet, d, 0.5));
const WETMIX=0.33, RDELAY=Math.round(0.0008*SR);
for(let i=0;i<N;i++){ L[i]+=wet[i]*WETMIX; const j=i-RDELAY; R[i]+=(j>=0?wet[j]:0)*WETMIX; }

/* ============================ МАСТЕР ============================ */
// fade in/out + мягкий лимитер (tanh) + нормализация
const fin=idx(0.08), fout0=idx(21.5), foutN=N;
let peak=0; for(let i=0;i<N;i++){ peak=Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
const g=peak>0? Math.min(1.0, 0.9/peak) : 1.0;
for(let i=0;i<N;i++){
  let fi=1; if(i<fin) fi=i/fin; if(i>fout0) fi=Math.max(0,(foutN-i)/(foutN-fout0));
  L[i]=Math.tanh(L[i]*g*1.1)*0.96*fi; R[i]=Math.tanh(R[i]*g*1.1)*0.96*fi;
}

/* ============================ ЗАПИСЬ WAV ============================ */
const bytesPerSample=2, numCh=2, dataLen=N*numCh*bytesPerSample;
const buf=Buffer.alloc(44+dataLen);
buf.write('RIFF',0); buf.writeUInt32LE(36+dataLen,4); buf.write('WAVE',8);
buf.write('fmt ',12); buf.writeUInt32LE(16,16); buf.writeUInt16LE(1,20);
buf.writeUInt16LE(numCh,22); buf.writeUInt32LE(SR,24);
buf.writeUInt32LE(SR*numCh*bytesPerSample,28); buf.writeUInt16LE(numCh*bytesPerSample,32);
buf.writeUInt16LE(8*bytesPerSample,34); buf.write('data',36); buf.writeUInt32LE(dataLen,40);
let o=44; for(let i=0;i<N;i++){ for(const ch of [L,R]){ let s=clamp(ch[i],-1,1); buf.writeInt16LE((s*32767)|0,o); o+=2; } }
const out=path.join(__dirname,'audio.wav'); fs.writeFileSync(out, buf);

// отчёт по RMS-огибающей (проверка дин. арки без воспроизведения)
const win=idx(0.25); let report=[];
for(let s=0;s<N;s+=win){ let sum=0,c=0; for(let i=s;i<Math.min(N,s+win);i++){ sum+=L[i]*L[i]+R[i]*R[i]; c+=2; } report.push((T(s)).toFixed(1)+':'+(Math.sqrt(sum/c)).toFixed(3)); }
console.log('WAV', out, (dataLen/1e6).toFixed(2)+'MB', 'dur', (N/SR).toFixed(2)+'s', 'peakPreLimit', peak.toFixed(2));
console.log('RMS/0.25s:', report.join(' '));
