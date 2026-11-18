
const D = DATA;
const $ = s => document.querySelector(s);
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function el(tag,cls,html){const e=document.createElement(tag);if(cls)e.className=cls;if(html!==undefined)e.innerHTML=html;return e}
const why=$('#why'), score=$('#score');
function verdict(ok,n){const p=n?ok/n:0;return `<span class="rank">${p>=.85?'Отличный результат':p>=.6?'Хороший результат, есть что закрепить':'Стоит вернуться к материалу'}</span>`}
