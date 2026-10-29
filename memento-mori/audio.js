// Музыка + звуковой дизайн v3 -> audio.wav (стерео 44.1 кГц / 16 бит).
// Сетка 100 BPM (доля 0.6 c). Мотив — «звук уведомления» A5→E6.
// Арка: динь → тики → грув → туннель → кардиомонитор → прямая линия (писк) →
// тишина → тап (удар пульса) → тёплый мажор → половинный грув → розыгрыши и
// реакции (снова грув) → подписка (мотив разрешается) → финал.
const fs = require('fs');
const path = require('path');

const SR = 44100, DUR = 37.8, N = Math.ceil(SR * DUR), B = 0.6;
const bus = () => [new Float32Array(N), new Float32Array(N)];
const MUS = bus(), DRM = bus(), SFX = bus(), REV = new Float32Array(N);
const T = i => i / SR, idx = t => Math.round(t * SR);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) | 0; return seed / 2147483648; };

const NOTE = n => 440 * Math.pow(2, (n - 69) / 12); // MIDI -> Гц
const CH = { Am: [57, 60, 64], F: [53, 57, 60], C: [48, 55, 60, 64], G: [55, 59, 62], E: [52, 56, 59], Cadd9: [48, 55, 62, 64, 67] };

function write(b, i, v, pan, rev) {
  const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
  b[0][i] += v * gl; b[1][i] += v * gr; REV[i] += v * rev;
}
function adsr(t, dur, a, d, s, r) {
  if (t < 0 || t > dur + r) return 0; if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - s) * ((t - a) / d); if (t < dur) return s; return s * (1 - (t - dur) / r);
}
function tone(b, t0, dur, f, amp, o = {}) {
  const harm = o.harm || [[1, 1], [2, .4], [3, .2]], pan = o.pan || 0, rev = o.rev ?? .2;
  const i0 = idx(t0), i1 = Math.min(N, idx(t0 + dur + (o.r ?? .3) + .02));
  for (let i = i0; i < i1; i++) {
    const t = T(i) - t0;
    const e = o.perc ? amp * Math.exp(-t / o.perc) * Math.min(1, t / .003) : amp * adsr(t, dur, o.a ?? .01, o.d ?? .1, o.s ?? .7, o.r ?? .3);
    if (e < 1e-6) continue;
    const vib = o.vib ? 1 + o.vib * Math.sin(2 * Math.PI * 5 * t) : 1;
    let v = 0; for (const [h, ha] of harm) v += ha * Math.sin(2 * Math.PI * f * h * vib * t);
    write(b, i, v * e, pan, rev);
  }
}
const bell = (b, t, f, amp, pan = 0) => tone(b, t, 2, f, amp, { perc: .9, harm: [[1, 1], [2, .35], [3.01, .22], [4.2, .1], [5.4, .05]], pan, rev: .45 });
function pad(t0, t1, notes, amp, o = {}) {
  notes.forEach((n, k) => { const f = NOTE(n);
    for (const det of [-.0018, .0018]) tone(MUS, t0, t1 - t0, f * (1 + det), amp * .5,
      { a: o.a ?? .5, d: .5, s: .85, r: o.r ?? .6, harm: [[1, 1], [2, .35], [3, .16], [4, .07]], pan: (k % 2 ? .45 : -.45) + det * 100, rev: o.rev ?? .35, vib: .003 }); });
}
function bassNote(t, n, dur, amp) { tone(MUS, t, dur, NOTE(n), amp, { a: .004, d: .12, s: .6, r: .08, harm: [[1, 1], [2, .45], [3, .18]], rev: .02 }); }
function pluck(t, n, amp, pan) { tone(MUS, t, .2, NOTE(n), amp, { perc: .16, harm: [[1, 1], [2, .3], [3, .12], [4, .05]], pan, rev: .35 }); }

// ---- ударные ----
const KICKS = [];
function kick(t, amp = .9) {
  KICKS.push(t); const i0 = idx(t), i1 = Math.min(N, idx(t + .45));
  for (let i = i0; i < i1; i++) { const x = T(i) - t; const f = 46 + 120 * Math.exp(-x / .035);
    const v = Math.sin(2 * Math.PI * f * x) * Math.exp(-x / .24) * amp + (x < .004 ? (rnd() * .5) * amp : 0);
    write(DRM, i, v, 0, .03); }
}
function noiseHit(b, t, dur, amp, lpC, hp, pan = 0, rev = .15) {
  const i0 = idx(t), i1 = Math.min(N, idx(t + dur * 5)); let lp = 0, lp2 = 0;
  for (let i = i0; i < i1; i++) { const x = T(i) - t; const n = rnd(); lp += lpC * (n - lp); lp2 += .02 * (lp - lp2);
    const v = (hp ? lp - lp2 : lp) * Math.exp(-x / dur) * amp; write(b, i, v, pan, rev); }
}
function clap(t, amp = .5) { [0, .011, .023].forEach((o, k) => noiseHit(DRM, t + o, k === 2 ? .09 : .012, amp, .55, true, 0, .3));
  tone(DRM, t, .05, 190, amp * .35, { perc: .05, harm: [[1, 1]], rev: .1 }); }
const hat = (t, amp = .12, pan = .25) => noiseHit(DRM, t, .022, amp, .95, true, pan, .05);
function tom(t, f, amp) { const i0 = idx(t), i1 = Math.min(N, idx(t + .5));
  for (let i = i0; i < i1; i++) { const x = T(i) - t; const ff = f * (1 + .5 * Math.exp(-x / .04)); write(DRM, i, Math.sin(2 * Math.PI * ff * x) * Math.exp(-x / .18) * amp, 0, .25); } }

// ---- SFX ----
function sub(t, f0, f1, dur, amp) { const i0 = idx(t), i1 = Math.min(N, idx(t + dur * 2));
  for (let i = i0; i < i1; i++) { const x = T(i) - t; const f = f1 + (f0 - f1) * Math.exp(-x / (dur * .3)); write(SFX, i, Math.sin(2 * Math.PI * f * x) * Math.exp(-x / (dur * .45)) * amp, 0, .1); } }
function whoosh(t, dur, amp, fc0, fc1, pan = 0) { const i0 = idx(t), i1 = Math.min(N, idx(t + dur)); let lp = 0, bp = 0;
  for (let i = i0; i < i1; i++) { const p = (i - i0) / (i1 - i0); const fc = fc0 + (fc1 - fc0) * p * p; const a = clamp(fc / SR * 2, .001, .45);
    const n = rnd(); lp += a * (n - lp); bp += a * ((n - lp) - bp); write(SFX, i, bp * Math.sin(Math.PI * p) * amp, pan, .25); } }
const click = (t, amp = .35, pan = 0) => { noiseHit(SFX, t, .004, amp, .9, true, pan, .05); tone(SFX, t, .02, 2200, amp * .3, { perc: .012, harm: [[1, 1]], pan, rev: .05 }); };
const pop = (t, amp = .3) => { const i0 = idx(t), i1 = idx(t + .12);
  for (let i = i0; i < i1; i++) { const x = T(i) - t; write(SFX, i, Math.sin(2 * Math.PI * (380 + 2600 * x) * x) * Math.exp(-x / .03) * amp, 0, .3); } };
const blip = (t, f, amp = .12, pan = 0) => tone(SFX, t, .05, f, amp, { perc: .05, harm: [[1, 1], [2, .2]], pan, rev: .3 });
function riser(t0, t1, amp) { const i0 = idx(t0), i1 = idx(t1); let lp = 0;
  for (let i = i0; i < i1; i++) { const p = (i - i0) / (i1 - i0); const a = .02 + .4 * p * p; const n = rnd(); lp += a * (n - lp);
    const v = ((n - lp) * .6 + Math.sin(2 * Math.PI * (200 + 900 * p * p) * (T(i) - t0)) * .25) * p * p * amp; write(SFX, i, v, 0, .3); } }

/* ============================ АРАНЖИРОВКА ============================ */
// комнатный тон
for (let i = 0; i < N; i++) { const v = (rnd() - .5) * .004; SFX[0][i] += v; SFX[1][i] += v; }

// S1 уведомление: мотив A5 → E6
bell(SFX, 0.60, NOTE(81), .11, -.1); bell(SFX, 0.75, NOTE(88), .095, .1);
for (let t = 1.2; t < 4.75; t += B) click(t, .1, .3);            // тики часов на долях
// S2 метафора
sub(2.4, 140, 44, .55, .55); pad(2.4, 4.9, CH.Am.map(n => n - 12), .1, { a: .8 });
whoosh(2.25, .3, .25, 400, 5000);
pop(3.6, .32);
riser(4.0, 4.8, .3);

// S3 грув (4.8–9.6): Am | F, бочка 1/3, хлопок 2/4, хэты 8-ми
for (let bar = 0; bar < 2; bar++) {
  const t0 = 4.8 + bar * 2.4, ch = bar ? CH.F : CH.Am, root = bar ? 41 : 45;
  pad(t0, t0 + 2.4, ch, .085, { a: .2, r: .3 });
  [0, 2].forEach(k => kick(t0 + k * B)); [1, 3].forEach(k => clap(t0 + k * B, .38));
  for (let k = 0; k < 8; k++) { hat(t0 + k * B / 2, k % 2 ? .07 : .11); bassNote(t0 + k * B / 2, root + (k % 4 === 2 ? 12 : 0), .26, .2);
    pluck(t0 + k * B / 2, ch[k % 3] + 12, .07, k % 2 ? .4 : -.4); }
}
// одометр 0 → 30 000: трещотка, удар на посадке
for (let k = 0; k < 34; k++) { const p = k / 34; click(5.4 + .6 * (1 - Math.pow(1 - p, 2)) * 1.0, .12, (k % 2 ? .2 : -.2)); }
sub(6.0, 120, 45, .35, .4); clap(6.0, .3);
whoosh(8.95, .32, .35, 300, 6500); // ЛИСТАЕМ
hat(9.3, .12); hat(9.45, .12);

// S4 лента (9.6–16.8): Am | F | G | E, бочка в четыре, хэты 16-е, бас 8-ми, арп 16-е
const prog = [[9.6, CH.Am, 45], [12.0, CH.F, 41], [14.4, CH.G, 43], [15.6, CH.E, 40]];
prog.forEach(([t0, ch, root], j) => {
  const t1 = j < 3 ? prog[j + 1][0] : 16.8;
  pad(t0, t1, ch, .09 + .025 * j, { a: .15, r: .05 });
  for (let t = t0; t < t1 - 1e-6; t += B) { kick(t); }
  for (let t = t0 + B; t < t1 - 1e-6; t += 2 * B) clap(t, .4);
  for (let t = t0; t < t1 - 1e-6; t += B / 4) hat(t, ((t - t0) / (B / 4)) % 2 ? .06 : .1, .3);
  for (let t = t0; t < t1 - 1e-6; t += B / 2) bassNote(t, root + (Math.round((t - t0) / (B / 2)) % 2 ? 12 : 0), .25, .22);
  let k = 0; for (let t = t0; t < t1 - 1e-6; t += B / 4, k++) { const bright = clamp((t - 9.6) / 7.2, 0, 1);
    pluck(t, ch[k % ch.length] + 12 + (k % 8 >= 4 ? 12 : 0), .045 + .035 * bright, k % 2 ? .45 : -.45); }
});
// тики пролистываемых пузырей — ускоряются
{ let t = 9.7; while (t < 16.75) { click(t, .05, rnd() * 1.2 - .6); const k = t - 9.6; t += Math.max(.035, .32 / (1 + .35 * k * k)); } }
// акценты слов
noiseHit(DRM, 10.8, .35, .22, .7, true, 0, .4); sub(10.8, 110, 45, .3, .3);       // не читая
tom(12.0, 110, .5); tom(13.2, 90, .55);                                            // потом / потом
sub(14.4, 160, 40, .7, .7); noiseHit(DRM, 14.4, .5, .3, .6, true, 0, .5);          // ПОТОМ
riser(14.4, 16.8, .85);
// кардиомонитор: писки на пиках кардиограммы (те же времена, что BEATS в index.html)
// писк на F#6 (1480 Гц) — вне нот арпеджио (до B5 = 988 Гц) и их обертонов
const monitor = (t, dur, amp) => tone(SFX, t, dur, 1480, amp, { a: .004, d: .01, s: 1, r: .02, harm: [[1, 1], [3, .08]], rev: .25 });
[15.95, 16.25, 16.47, 16.62, 16.72].forEach(t => monitor(t, .07, .2));

// S5 обрыв (16.8–19.2): тишина, глитч, машинопись, редкое сердце
monitor(16.8, .5, .14);                                                   // прямая линия — непрерывный писк
for (let i = idx(17.33); i < idx(17.39); i++) { const v = (rnd() - .5) * .25 * (1 - (i - idx(17.33)) / idx(.06)); SFX[0][i] += v; SFX[1][i] += v; } // линия схлопнулась
blip(17.48, 1320, .1);                                                    // «?»
for (let k = 0; k < 28; k++) click(17.0 + k * .023 + (rnd() - .5) * .004, .07 + rnd() * .04, (rnd() - .5) * .3);
sub(18.1, 70, 42, .18, .3); sub(18.26, 62, 40, .15, .2);                  // тихое сердце — ещё жив
whoosh(18.4, .55, .22, 300, 2400);
// обратный вдох к тапу (идёт в SFX — не гасится обрывом)
for (let i = idx(18.6); i < idx(19.2); i++) { const p = (T(i) - 18.6) / .6; const v = Math.sin(2 * Math.PI * NOTE(60) * T(i)) * p * p * p * .12 + Math.sin(2 * Math.PI * NOTE(67) * T(i)) * p * p * p * .08; write(SFX, i, v, 0, .2); }

// S6 тап → СЕГОДНЯ: тёплый мажор, мотив в мажоре C6→G6, ✓✓
click(19.2, .45); monitor(19.2, .08, .16); sub(19.25, 150, 38, .9, .75);   // удар пульса: жизнь вернулась
pad(19.25, 21.6, CH.Cadd9, .13, { a: .08, r: .4, rev: .5 });
bell(MUS, 19.28, NOTE(84), .2, -.15); bell(MUS, 19.43, NOTE(91), .18, .15);
blip(19.62, NOTE(91), .13, .3); blip(19.7, NOTE(96), .11, .35);
[[20.0, 76], [20.6, 79], [21.0, 84]].forEach(([t, n]) => tone(MUS, t, .9, NOTE(n), .09, { perc: .9, harm: [[1, 1], [2, .4], [3, .15]], rev: .5 }));

// S7 смысл (21.6–25.8): половинный грув, F | C | G | Am
const prog2 = [[21.6, CH.F, 41], [22.8, CH.C, 36], [24.0, CH.G, 43], [25.2, CH.Am, 45]];
prog2.forEach(([t0, ch, root], j) => {
  const t1 = j < 3 ? prog2[j + 1][0] : 25.8;
  pad(t0, t1, ch.map(n => n < 52 ? n + 12 : n), .1, { a: .12, r: .15 });
  bassNote(t0, root, t1 - t0 - .05, .2);
  for (let t = t0; t < t1 - 1e-6; t += B / 2) hat(t, .05, .2);
});
[21.6, 22.5, 24.0, 24.9].forEach(t => kick(t, .75)); [22.8, 25.2].forEach(t => clap(t, .35));
// фортепиано из мотива
[[21.65, 76], [22.25, 74], [22.85, 72], [23.4, 79], [24.0, 81], [24.6, 76], [25.2, 72]].forEach(([t, n], k) =>
  tone(MUS, t, .5, NOTE(n), .1, { perc: .8, harm: [[1, 1], [2, .45], [3, .2], [4, .08]], pan: k % 2 ? .2 : -.2, rev: .45 }));
sub(23.4, 150, 42, .5, .5); noiseHit(DRM, 23.4, .3, .18, .6, true, 0, .4);   // НЕ ПРОЛИСТАТЬ
bell(MUS, 24.0, NOTE(88), .1, .2);                                               // жизнь.

// S8 розыгрыши + реакции (25.8–31.2): снова грув, Am | F | G
whoosh(25.7, .4, .22, 300, 3200);
[[25.8, CH.Am, 45, 28.2], [28.2, CH.F, 41, 30.6], [30.6, CH.G, 43, 31.2]].forEach(([t0, ch, root, t1]) => {
  pad(t0, t1, ch, .095, { a: .1, r: .08 });
  for (let t = t0; t < t1 - 1e-6; t += B) kick(t, .8);
  for (let t = t0 + B; t < t1 - 1e-6; t += 2 * B) clap(t, .36);
  for (let t = t0; t < t1 - 1e-6; t += B / 2) { hat(t, .07, .25); bassNote(t, root + (Math.round((t - t0) / (B / 2)) % 2 ? 12 : 0), .25, .2); }
  let k = 0; for (let t = t0; t < t1 - 1e-6; t += B / 2, k++) pluck(t, ch[k % ch.length] + 12, .055, k % 2 ? .4 : -.4);
});
sub(26.4, 160, 40, .6, .65); noiseHit(DRM, 26.4, .4, .26, .6, true, 0, .5); tom(26.4, 95, .4);   // РОЗЫГРЫШИ
whoosh(27.25, .45, .25, 250, 3600);                                                               // пост выезжает
[[27.65, 100], [27.75, 103], [27.85, 107]].forEach(([t, n], k) => bell(SFX, t, NOTE(n), .05, k - 1)); // блик
bell(MUS, 27.6, NOTE(81), .07, -.1); bell(MUS, 27.75, NOTE(88), .06, .1);                       // повезти может сегодня
[28.5, 28.65, 28.8, 28.95].forEach((t, k) => pop(t, .2 - k * .02));                              // реакции всплывают
whoosh(28.7, .3, .16, 400, 4000);
click(29.4, .45); pop(29.4, .32);                                                                // тап по 💀
for (let k = 0; k < 9; k++) { const t = 29.42 + k * .04; noiseHit(SFX, t, .008, .18, .8, true, (rnd() - .5) * 1.2, .2); tone(SFX, t, .03, 600 + rnd() * 500, .05, { perc: .025, harm: [[1, 1], [2.7, .4]], rev: .2 }); } // костяной стрёкот
bell(SFX, 29.45, NOTE(93), .07, .2);
whoosh(31.0, .35, .22, 300, 3000);

// S9 карточка (31.2–34.2): F | G -> тап на C
pad(31.2, 32.4, CH.F, .09, { a: .2, r: .1 }); pad(32.4, 33.0, CH.G, .09, { a: .05, r: .05 });
bassNote(31.2, 41, 1.15, .18); bassNote(32.4, 43, .55, .18);
[31.2, 31.8, 32.4].forEach(t => kick(t, .7)); [31.8].forEach(t => clap(t, .3));
for (let t = 31.2; t < 33.0; t += B / 2) hat(t, .06, .25);
riser(32.4, 33.0, .3);
// тап «Подписаться» → мотив разрешается: G5 → C6 → E6
click(33.0, .45); sub(33.02, 130, 40, .6, .5);
bell(SFX, 33.05, NOTE(79), .2, -.2); bell(SFX, 33.2, NOTE(84), .2, 0); bell(SFX, 33.35, NOTE(88), .22, .2);
pad(33.02, 34.2, CH.C, .1, { a: .05, r: .2 }); bassNote(33.02, 36, 1.1, .18);

// S10 подпись (34.2–37.8): финальный аккорд + исходный мотив как воспоминание
sub(34.2, 150, 36, 1.2, .7); kick(34.2, .8);
pad(34.2, 37.0, CH.Cadd9, .11, { a: .1, r: 1.6, rev: .55 }); bassNote(34.2, 36, 2.6, .17);
bell(MUS, 35.4, NOTE(81), .14, -.1); bell(MUS, 35.55, NOTE(88), .12, .1);   // A5 → E6 над до-мажором
tone(MUS, 36.0, 1.5, NOTE(84), .07, { perc: 1.6, harm: [[1, 1], [2, .3]], rev: .6 });

/* ============================ ДАКИНГ / ОБРЫВ / РЕВЕРБ ============================ */
KICKS.sort((a, b) => a - b);
function duck(t) { let g = 1; for (let k = KICKS.length - 1; k >= 0; k--) { if (KICKS[k] <= t) { g = 1 - .38 * Math.exp(-(t - KICKS[k]) / .13); break; } } return g; }
function gate(t) { // жёсткий обрыв 16.8 → тишина → открытие на тап 19.2
  if (t < 16.8) return 1; if (t < 16.81) return 1 - (t - 16.8) / .01;
  if (t < 19.17) return 0; if (t < 19.21) return (t - 19.17) / .04; return 1; }
// ревербератор Шрёдера на посыле
const wet = new Float32Array(N);
function comb(d, fb, damp) { const buf = new Float32Array(d); let p = 0, st = 0;
  for (let i = 0; i < N; i++) { const y = buf[p]; st = y * (1 - damp) + st * damp; wet[i] += y; buf[p] = REV[i] + st * fb; p = (p + 1) % d; } }
function allpass(d, fb) { const buf = new Float32Array(d); let p = 0;
  for (let i = 0; i < N; i++) { const bo = buf[p]; const y = -wet[i] + bo; buf[p] = wet[i] + bo * fb; wet[i] = y; p = (p + 1) % d; } }
[1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].forEach(d => comb(d, .85, .25));
[225, 556, 441, 341].forEach(d => allpass(d, .5));

const L = new Float32Array(N), R = new Float32Array(N), RD = Math.round(.0009 * SR);
for (let i = 0; i < N; i++) {
  const t = T(i), g = gate(t), dk = duck(t);
  const w = .22 * g, wr = i - RD >= 0 ? wet[i - RD] : 0;
  L[i] = (MUS[0][i] * dk * .9 + DRM[0][i] * .85) * g + SFX[0][i] + wet[i] * w;
  R[i] = (MUS[1][i] * dk * .9 + DRM[1][i] * .85) * g + SFX[1][i] + wr * w;
}
/* ============================ МАСТЕР ============================ */
let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const pre = 1.15 / peak, fo0 = idx(36.9);
for (let i = 0; i < N; i++) {
  let f = 1; if (i < idx(.03)) f = i / idx(.03); if (i > fo0) f = Math.max(0, (N - i) / (N - fo0));
  L[i] = Math.tanh(L[i] * pre) * .93 * f; R[i] = Math.tanh(R[i] * pre) * .93 * f;
}
const data = Buffer.alloc(44 + N * 4);
data.write('RIFF', 0); data.writeUInt32LE(36 + N * 4, 4); data.write('WAVE', 8); data.write('fmt ', 12);
data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22); data.writeUInt32LE(SR, 24);
data.writeUInt32LE(SR * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(N * 4, 40);
for (let i = 0, o = 44; i < N; i++, o += 4) { data.writeInt16LE(Math.round(clamp(L[i], -1, 1) * 32767), o); data.writeInt16LE(Math.round(clamp(R[i], -1, 1) * 32767), o + 2); }
fs.writeFileSync(path.join(__dirname, 'audio.wav'), data);

// отчёт: RMS по долям — проверка арки и обрыва без прослушивания
const rep = []; for (let t = 0; t < DUR; t += B) { let s = 0, c = 0; for (let i = idx(t); i < Math.min(N, idx(t + B)); i++) { s += L[i] * L[i] + R[i] * R[i]; c += 2; } rep.push(t.toFixed(1) + ':' + Math.sqrt(s / c).toFixed(3)); }
console.log('audio.wav', (N / SR).toFixed(2) + 's', 'peak(pre)', peak.toFixed(2), 'kicks', KICKS.length);
console.log(rep.join('  '));
