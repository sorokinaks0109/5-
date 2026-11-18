
/* Карточки по одной: выбрать одну из N корзин. Необязательно: кейсы (D.cases) или общий контекст (D.context). */
const caseBox=$('#case'), act=$('#act'), bins=$('#bins'), next=$('#next'), prog=$('#prog');
let list, n, ok, res, mist, done;
bins.style.gridTemplateColumns=`repeat(${D.cols||D.bins.length},1fr)`;
D.bins.forEach((b,k)=>{const x=el('button','bin',`${b.t}${b.d?`<small>${b.d}</small>`:''}`);x.style.setProperty('--c',b.color||'#00478D');x.dataset.k=b.k;x.onclick=()=>answer(b.k);bins.appendChild(x)});
function start(){
  list=[];
  if(D.cases)D.cases.forEach(c=>shuffle(D.items.filter(it=>it.c===c.id)).forEach(it=>list.push(it)));
  else list=D.keepOrder?D.items.slice():shuffle(D.items);
  n=0;ok=0;res=[];mist=[];$('#play').style.display='flex';$('#final').style.display='none';show();
}
function drawProg(){prog.innerHTML=list.map((_,i)=>`<i class="${res[i]||(i===n?'cur':'')}"></i>`).join('');score.textContent=`Верно: ${ok} из ${list.length}`}
function show(){
  done=false;const it=list[n];
  if(D.cases){const c=D.cases.find(x=>x.id===it.c);caseBox.style.setProperty('--c',c.color);
    caseBox.innerHTML=`<div class="ctag">${c.tag}</div><div class="lbl">Несоответствие</div><div>${c.nc}</div><div class="lbl">Причина</div><div>${c.cause}</div>`}
  else if(D.context){caseBox.innerHTML=`<div class="ctag">${D.context.tag}</div><div class="lbl">${D.context.lbl||'Ситуация'}</div><div>${D.context.text}</div>`}
  else caseBox.style.display='none';
  act.className='act';act.innerHTML=`<div><small>${D.cardLabel||'Карточка'} ${n+1} из ${list.length}</small>${it.t}</div>`;
  [...bins.children].forEach(b=>{b.disabled=false;b.classList.remove('ok','bad')});
  why.textContent='';next.style.visibility='hidden';drawProg();
}
function answer(k){
  if(done)return;done=true;const it=list[n],good=k===it.a,right=D.bins.find(b=>b.k===it.a);
  [...bins.children].forEach(b=>{b.disabled=true;if(b.dataset.k===it.a)b.classList.add('ok');else if(b.dataset.k===k)b.classList.add('bad')});
  act.classList.add(good?'right':'wrong');
  if(good){ok++;res[n]='ok';why.textContent='Верно. '+it.e}
  else{res[n]='bad';mist.push(it);why.textContent=`Правильный ответ: ${right.t}. `+it.e}
  next.style.visibility='visible';next.textContent=n===list.length-1?'Итоги':'Дальше →';next.focus();drawProg();
}
function finish(){
  $('#play').style.display='none';const f=$('#final');f.style.display='block';
  f.innerHTML=`Верных ответов<b>${ok} из ${list.length}</b>${verdict(ok,list.length)}`+
   (D.summary?`<div class="summary">${D.summary}</div>`:'')+
   (D.lesson?`<h3>${D.lesson}</h3>`:'')+
   (mist.length?`<details><summary>Где ошиблись: ${mist.length}</summary><ul class="mist">${mist.map(m=>`<li><b>${D.bins.find(b=>b.k===m.a).t}:</b> ${m.t}</li>`).join('')}</ul></details>`:'')+
   `<br><button onclick="start()">Пройти ещё раз</button>`;
}
next.onclick=()=>{if(!done)return;n++;if(n<list.length)show();else finish()};
start();
