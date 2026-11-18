
/* Матрица 2×2: разложить идеи по четырём квадрантам. Нажать на карточку, потом на квадрант (или перетащить). */
let selected=null, checked=false;
const pool=$('#pool'), mx=$('#mx');
mx.innerHTML=`<div class="ax ay"><span>${D.axisY.hi}</span><b>${D.axisY.name}</b><span>${D.axisY.lo}</span></div>`+
  D.quads.map(q=>`<div class="q" data-pos="${q.pos}" style="--c:${q.color}"><div class="qh">${q.name}<small>${q.hint}</small></div><div class="drop" data-zone="${q.id}"></div></div>`).join('')+
  `<div class="ax ax-x"><span>${D.axisX.lo}</span><b>${D.axisX.name}</b><span>${D.axisX.hi}</span></div>`;
function makeCard(it,i){
  const c=el('div','card');c.id='c'+i;c.textContent=it.t;c.draggable=true;c.dataset.c=it.c;c.dataset.why=it.why||'';
  c.addEventListener('dragstart',e=>e.dataTransfer.setData('text',c.id));
  c.addEventListener('click',e=>{e.stopPropagation();
    if(checked){why.textContent=c.textContent+': '+c.dataset.why;return}
    if(c.parentElement!==pool&&!selected){put(c,pool);return}
    if(selected===c){c.classList.remove('sel');selected=null;return}
    if(selected)selected.classList.remove('sel');selected=c;c.classList.add('sel')});
  return c;
}
function zone(z,box){
  z.addEventListener('click',()=>{if(selected)put(selected,box||z)});
  z.addEventListener('dragover',e=>{e.preventDefault();z.classList.add('hot')});
  z.addEventListener('dragleave',()=>z.classList.remove('hot'));
  z.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();z.classList.remove('hot');const c=document.getElementById(e.dataTransfer.getData('text'));if(c)put(c,box||z)});
}
zone(pool);mx.querySelectorAll('.q').forEach(q=>zone(q,q.querySelector('.drop')));
function put(c,t){if(checked)return;c.classList.remove('sel');selected=null;t.appendChild(c)}
function build(){pool.innerHTML='';mx.querySelectorAll('.drop').forEach(z=>z.innerHTML='');
  shuffle(D.items.map((it,i)=>({...it,i}))).forEach(it=>pool.appendChild(makeCard(it,it.i)));checked=false;selected=null;why.textContent='';score.textContent=''}
function check(){let ok=0;document.querySelectorAll('.card').forEach(c=>{c.classList.remove('ok','bad','sel');const z=c.parentElement.dataset.zone;if(!z)return;if(z===c.dataset.c){c.classList.add('ok');ok++}else c.classList.add('bad')});
  checked=true;selected=null;score.textContent=`Верно: ${ok} из ${D.items.length}`;why.textContent='Нажмите на любую карточку, чтобы увидеть пояснение.'}
function answers(){document.querySelectorAll('.card').forEach(c=>document.querySelector(`[data-zone="${c.dataset.c}"]`).appendChild(c));check()}
function fix(){checked=false;document.querySelectorAll('.card').forEach(c=>c.classList.remove('ok','bad'));why.textContent='';score.textContent=''}
$('#bCheck').onclick=check;$('#bAns').onclick=answers;$('#bRe').onclick=build;$('#bFix').onclick=fix;
build();
