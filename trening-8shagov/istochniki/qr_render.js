/* QR-коды на слайдах с чек-листом. Ссылка берётся из nastroiki.js */
(function(){
  var N=window.NASTROIKI||{};
  function url(kind){return (kind==='posle'?(N.anketa_posle||N.anketa_do):N.anketa_do)||''}
  document.querySelectorAll('[data-qr]').forEach(function(box){
    var u=url(box.getAttribute('data-qr')).trim();
    if(!u){box.innerHTML='<div class="ph">Ссылка на анкету не задана.<br>Откройте файл <b>nastroiki.js</b> в Блокноте и вставьте ссылку Oprosso.</div>';return}
    try{var q=qrcode(0,'M');q.addData(u);q.make();box.innerHTML=q.createSvgTag({cellSize:8,margin:0,scalable:true})}
    catch(e){box.innerHTML='<div class="ph">Не удалось построить QR-код. Проверьте ссылку в nastroiki.js</div>'}
  });
  document.querySelectorAll('[data-qrurl]').forEach(function(el){el.textContent=url(el.getAttribute('data-qrurl'))});
})();
