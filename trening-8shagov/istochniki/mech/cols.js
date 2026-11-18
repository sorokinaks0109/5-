
const D = DATA;
const $ = s => document.querySelector(s);
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function el(tag,cls,html){const e=document.createElement(tag);if(cls)e.className=cls;if(html!==undefined)e.innerHTML=html;return e}
const why=$('#why'), score=$('#score');

let selected=null, checked=false;
const pool=$('#pool');
function makeCard(it,i){
  const c=el('div','card');c.id='c'+i;c.textContent=it.t;c.draggable=true;c.dataset.c=it.c;c.dataset.why=it.why||'';
  c.addEventListener('dragstart',e=>e.dataTransfer.setData('text',c.id));
  c.addEventListener('click',e=>{
    e.stopPropagation();
    if(checked){why.textContent=c.textContent+': '+c.dataset.why;return}
    if(c.parentElement!==pool&&!selected){put(c,pool);return}
    if(selected===c){c.classList.remove('sel');selected=null;return}
    if(selected)selected.classList.remove('sel');selected=c;c.classList.add('sel');
  });
  return c;
}
function zone(z,box){
  z.addEventListener('click',()=>{if(selected)put(selected,box||z)});
  z.addEventListener('dragover',e=>{e.preventDefault();z.classList.add('hot')});
  z.addEventListener('dragleave',()=>z.classList.remove('hot'));
  z.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();z.classList.remove('hot');const c=document.getElementById(e.dataTransfer.getData('text'));if(c)put(c,box||z)});
}
zone(pool);
function put(c,target){if(checked)return;c.classList.remove('sel');selected=null;target.appendChild(c);layout()}
function build(){
  pool.innerHTML='';document.querySelectorAll('[data-zone]').forEach(z=>z.innerHTML='');
  shuffle(D.items.map((it,i)=>({...it,i}))).forEach(it=>pool.appendChild(makeCard(it,it.i)));
  checked=false;selected=null;why.textContent='';score.textContent='';layout();
}
function check(){
  let ok=0;
  document.querySelectorAll('.card').forEach(c=>{
    c.classList.remove('ok','bad','sel');const z=c.parentElement.dataset.zone;if(!z)return;
    if(z===c.dataset.c){c.classList.add('ok');ok++}else c.classList.add('bad');
  });
  checked=true;selected=null;score.textContent=`Верно: ${ok} из ${D.items.length}`;
  why.textContent='Нажмите на любую карточку, чтобы увидеть пояснение.';
}
function answers(){document.querySelectorAll('.card').forEach(c=>document.querySelector(`[data-zone="${c.dataset.c}"]`).appendChild(c));layout();check()}
function fix(){checked=false;document.querySelectorAll('.card').forEach(c=>c.classList.remove('ok','bad'));why.textContent='';score.textContent=''}
$('#bCheck').onclick=check;$('#bAns').onclick=answers;$('#bRe').onclick=build;$('#bFix').onclick=fix;

const cols=$('#cols');cols.style.gridTemplateColumns=`repeat(${D.cols.length},1fr)`;
D.cols.forEach(c=>{
  const col=el('div','col',`<h2 style="background:${c.color}">${c.name}${c.hint?`<small>${c.hint}</small>`:''}</h2>`);
  const d=el('div','drop');d.dataset.zone=c.id;col.appendChild(d);zone(col,d);cols.appendChild(col);
});
function layout(){}
build();
