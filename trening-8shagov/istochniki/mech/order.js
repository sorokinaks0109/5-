
const D = DATA;
const $ = s => document.querySelector(s);
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function el(tag,cls,html){const e=document.createElement(tag);if(cls)e.className=cls;if(html!==undefined)e.innerHTML=html;return e}
const why=$('#why'), score=$('#score');

const box=$('#order');let drag=null;
function build(){
  box.innerHTML='';why.textContent='';score.textContent='';
  let s=shuffle(D.steps.map((x,i)=>({...x,i})));while(s.every((x,k)=>x.i===k))s=shuffle(s);
  s.forEach(x=>{
    const r=el('div','orow',`<span class="n"></span><span class="t">${x.t}<span class="w"></span></span><button class="sec up">▲</button><button class="sec dn">▼</button>`);
    r.dataset.i=x.i;r.draggable=true;r.querySelector('.w').dataset.why=x.why||'';
    r.querySelector('.up').onclick=()=>{if(r.previousElementSibling)box.insertBefore(r,r.previousElementSibling);num()};
    r.querySelector('.dn').onclick=()=>{if(r.nextElementSibling)box.insertBefore(r.nextElementSibling,r);num()};
    r.addEventListener('dragstart',()=>{drag=r;r.classList.add('drag')});
    r.addEventListener('dragend',()=>{r.classList.remove('drag');drag=null;num()});
    r.addEventListener('dragover',e=>{e.preventDefault();if(!drag||drag===r)return;const b=r.getBoundingClientRect();box.insertBefore(drag,e.clientY<b.top+b.height/2?r:r.nextElementSibling)});
    box.appendChild(r);
  });num();
}
function num(){[...box.children].forEach((r,k)=>{r.querySelector('.n').textContent=k+1;r.classList.remove('ok','bad')})}
function check(){let ok=0;[...box.children].forEach((r,k)=>{const good=+r.dataset.i===k;r.classList.add(good?'ok':'bad');if(good)ok++;r.querySelector('.w').textContent=good?r.querySelector('.w').dataset.why:''});
  score.textContent=`На своём месте: ${ok} из ${D.steps.length}`}
function answers(){[...box.children].sort((a,b)=>a.dataset.i-b.dataset.i).forEach(r=>box.appendChild(r));num();check()}
$('#bCheck').onclick=check;$('#bAns').onclick=answers;$('#bRe').onclick=build;
build();
