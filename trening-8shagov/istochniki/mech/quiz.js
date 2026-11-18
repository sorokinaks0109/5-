
const D = DATA;
const $ = s => document.querySelector(s);
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function el(tag,cls,html){const e=document.createElement(tag);if(cls)e.className=cls;if(html!==undefined)e.innerHTML=html;return e}
const why=$('#why'), score=$('#score');

let n=0, ok=0, res=[], timerId=null, left=0, done=false, teams=[0,0];
const box=$('#q'), opts=$('#opts'), next=$('#next'), prog=$('#prog'), tm=$('#tm');
function drawTeams(){if(!D.teams)return;$('#t0').textContent=teams[0];$('#t1').textContent=teams[1]}
if(D.teams){$('#teams').style.display='grid';document.querySelectorAll('[data-team]').forEach(b=>b.onclick=()=>{teams[+b.dataset.team]++;drawTeams()})}
function drawProg(){prog.innerHTML=D.questions.map((_,i)=>`<i class="${res[i]||(i===n?'cur':'')}"></i>`).join('')}
function show(){
  done=false;why.textContent='';next.disabled=true;
  const q=D.questions[n];
  box.innerHTML=`<div style="font-size:18px;color:#777">Вопрос ${n+1} из ${D.questions.length}</div>${q.q}${q.img?`<img src="${q.img}" alt="">`:''}`;
  opts.innerHTML='';
  q.opts.forEach((o,i)=>{const b=el('button','opt',q.optsHtml?q.optsHtml[i]:o);b.title=o;b.onclick=()=>answer(i);opts.appendChild(b)});
  drawProg();clearInterval(timerId);tm.textContent='';
  if(D.timer){left=D.timer;tm.textContent=left;timerId=setInterval(()=>{left--;tm.textContent=left;if(left<=0){clearInterval(timerId);answer(-1)}},1000)}
}
function answer(i){
  if(done)return;done=true;clearInterval(timerId);
  const q=D.questions[n];
  [...opts.children].forEach((b,k)=>{b.disabled=true;b.style.opacity=1;if(k===q.a)b.classList.add('ok');else if(k===i)b.classList.add('bad')});
  if(i===q.a){ok++;res[n]='ok';why.textContent='Верно! '+q.why+(D.teams?' Начислите балл команде.':'')}
  else{res[n]='bad';why.textContent=(i<0?'Время вышло. ':'Неверно. ')+'Правильный ответ: '+q.opts[q.a]+'. '+q.why}
  drawProg();next.disabled=false;next.textContent=n===D.questions.length-1?'Итог':'Дальше →';
}
next.onclick=()=>{n++;if(n<D.questions.length)show();else finish()};
function finish(){
  clearInterval(timerId);tm.textContent='';$('#play').style.display='none';
  const f=$('#final');f.style.display='block';
  if(D.teams){const w=teams[0]===teams[1]?'Ничья!':`Победила команда ${teams[0]>teams[1]?'1':'2'}!`;
    f.innerHTML=`${w}<b>${teams[0]} : ${teams[1]}</b><button onclick="location.reload()">Сыграть ещё раз</button>`;return}
  const p=ok/D.questions.length;
  f.innerHTML=`Правильных ответов<b>${ok} из ${D.questions.length}</b>${p>=.8?'Отличный результат!':p>=.5?'Хорошо, но есть что повторить.':'Есть повод вернуться к материалу.'}<br><br><button onclick="location.reload()">Пройти ещё раз</button>`;
}
show();
