
/* Рыбья кость: карточки по одной, кладём на кость или в «Не причина» */
const fish=$('#fish'), fc=$('#fcard'), trash=$('#trash');
let deck, n, ok, busy, placed;
const tops=D.cats.slice(0,3), bots=D.cats.slice(3,6);
function zoneHtml(c){return `<div class="zone" data-zone="${c.k}" style="--c:${c.col}"><div class="zh">${c.ic} ${c.t}</div><div class="zd">${c.d}</div><div class="chips"></div></div>`}
fish.innerHTML=  tops.map(zoneHtml).join('')+`<div class="spine"></div><div class="fhead"><small>Проблема · голова рыбы</small>${D.problem}</div>`+bots.map(zoneHtml).join('');
[...fish.querySelectorAll('.zone')].forEach((z,i)=>{z.style.gridColumn=(i%3)+1;z.style.gridRow=i<3?1:3;z.classList.add(i<3?'zt':'zb')});
document.querySelectorAll('[data-zone]').forEach(z=>z.onclick=()=>place(z.dataset.zone,z));
function start(){
  deck=shuffle(D.cards);n=0;ok=0;busy=false;
  document.querySelectorAll('[data-zone] .chips').forEach(c=>c.innerHTML='');
  $('#again').style.display='none';show();
}
function show(){
  if(n>=deck.length)return finish();
  fc.className='fcard';fc.innerHTML=`<small>Карточка ${n+1} из ${deck.length}</small><span>${deck[n].t}</span>`;
  score.textContent=`Верно с первого раза: ${ok}`;
}
function chip(card,zk){const z=document.querySelector(`[data-zone="${zk}"] .chips`);const c=el('div','chip2',card.t);c.title=card.e;c.onclick=e=>{e.stopPropagation();why.textContent=card.t+': '+card.e};z.appendChild(c)}
function flash(z,cls){z.classList.add(cls);setTimeout(()=>z.classList.remove(cls),1100)}
function place(zk,z){
  if(busy||n>=deck.length)return;busy=true;const card=deck[n];
  if(zk===card.a){ok++;flash(z,'flashok');why.textContent='Верно! '+card.e;chip(card,zk);n++;setTimeout(()=>{busy=false;show()},700)}
  else{
    const right=document.querySelector(`[data-zone="${card.a}"]`);flash(z,'flashbad');right.classList.add('target');
    const name=card.a==='none'?'«Не причина»':'«'+D.cats.find(c=>c.k===card.a).t+'»';
    why.textContent=`Не совсем: место этой карточки ${name}. `+card.e;
    setTimeout(()=>{right.classList.remove('target');chip(card,card.a);n++;busy=false;show()},2600);
  }
}
function finish(){
  fc.className='fcard done';fc.innerHTML=`<span>Диаграмма собрана. Верно с первого раза: ${ok} из ${deck.length}.</span>`;
  why.textContent='Нажмите на любую причину на кости, чтобы прочитать пояснение.';$('#again').style.display='';score.textContent='';
}
$('#again').onclick=start;
start();
