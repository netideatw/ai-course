/* 全站共用：推廣追蹤、瀏覽統計、課程開關；首頁另有意願表單。
   推廣連結 …/?ref=代碼：進站時記住代碼 30 天，填表時一併送出。
   Storage 名稱與原課程網站分開：同一個 github.io 網域會共用 localStorage */
(function(){
  var COURSES={genai:'生成式AI多媒體轉化與創作',promo:'AI驅動個人化促銷',line:'AI客服工具操作與回應管理',creative:'AI創意行銷素材生成'};
  var KEY='tc_ref', DAYS=30, ref='';
  var m=location.search.match(/[?&]ref=([^&#]*)/);
  if(m){
    try{ref=decodeURIComponent(m[1].replace(/\+/g,' '))}catch(e){ref=m[1]}
    ref=ref.replace(/[^\w一-鿿-]/g,'').slice(0,30);
    if(ref){try{localStorage.setItem(KEY,JSON.stringify({ref:ref,t:Date.now()}))}catch(e){}}
  }
  if(!ref){try{var s=JSON.parse(localStorage.getItem(KEY)||'null');if(s&&Date.now()-s.t<DAYS*864e5)ref=s.ref}catch(e){}}

  // 瀏覽與點擊統計，後台「數據分析」可看
  var vid='';
  try{vid=localStorage.getItem('tc_vid')||'';if(!vid){vid=Date.now().toString(36)+Math.random().toString(36).slice(2,10);localStorage.setItem('tc_vid',vid)}}catch(e){}
  var utm=location.search.match(/[?&]utm_source=([^&#]*)/),src='';
  if(utm){try{src=decodeURIComponent(utm[1])}catch(e){src=utm[1]}}
  else if(document.referrer){try{var rh=new URL(document.referrer).hostname;if(rh!==location.hostname)src=rh.replace(/^www\./,'')}catch(e){}}
  var sw=Math.min(screen.width,screen.height),touch=matchMedia('(pointer:coarse)').matches;
  var device=touch&&sw<600?'mobile':touch&&sw<=1100?'tablet':'desktop';
  function track(type,target){if(window.RegDB)RegDB.track({type:type,vid:vid,ref:ref,target:target?String(target).slice(0,40):null,src:src.slice(0,60),device:device})}
  var WHERE={top:'首屏',course:'課程頁',notes:'注意事項',contact:'頁尾',apply:'表單'};
  function clickName(el){
    if(el.matches('button[type=submit]'))return '送出意願';
    var h=el.getAttribute('href')||'',sec=el.closest('section[id],header[id]');
    var where=el.closest('.nav')?'導覽列':el.closest('.mbar')?'手機底部列':sec?(WHERE[sec.id]||sec.id):'';
    if(/#apply$/.test(h))return '填寫意願按鈕・'+where;
    if(el.closest('.nav .links'))return '選單・'+el.textContent.trim();
    if(/^tel:/.test(h))return '撥打電話';
    if(/^mailto:/.test(h))return '寄 Email';
    if(/admin\.html/.test(h))return '';
    return (el.textContent.trim()||h).slice(0,24);
  }
  document.addEventListener('DOMContentLoaded',function(){track('view')});
  document.addEventListener('click',function(e){
    var el=e.target.closest('a[href],#regForm button[type=submit]');if(!el)return;
    var n=clickName(el);if(n)track('click',n);
  });

  var f=document.getElementById('regForm');

  // 依後台設定標示已關閉（額滿）的課程，首頁與課程頁都適用
  document.addEventListener('DOMContentLoaded',function(){
    RegDB.batches().then(function(list){
      var openCount=0;
      list.forEach(function(b){
        if(b.open){openCount++;return}
        var c=document.querySelector('[data-course-card="'+b.name+'"]');
        if(c)c.querySelector('.full').hidden=false;
        document.querySelectorAll('[data-pick="'+b.name+'"]').forEach(function(x){x.setAttribute('aria-disabled','true');x.textContent='已額滿'});
        if(!f)return;
        var inp=f.querySelector('[name=batch][value="'+b.name+'"]');if(!inp)return;
        inp.disabled=true;inp.checked=false;
        var lab=inp.closest('label');lab.classList.add('closed');
        lab.querySelector('small.st').textContent='已額滿，意願調查已截止';
      });
      if(f&&list.length&&!openCount){
        document.getElementById('regCard').innerHTML='<div class="done"><h3>本期意願調查已全數額滿</h3><p>感謝您的關注！如有疑問，歡迎來電 02-2332-8558 #355 洽詢朱小姐。</p></div>';
      }
    },function(){});
  });

  if(!f)return;
  f.addEventListener('focusin',function once(){f.removeEventListener('focusin',once);track('form_start')});
  f.ref.value=ref;

  function pick(name){
    var r=f.querySelector('[name=batch][value="'+name+'"]');
    if(r&&!r.disabled){r.checked=true;err('batch','')}
  }
  // 從課程頁帶入：index.html?course=line#apply
  var cm=location.search.match(/[?&]course=([a-z]+)/);
  if(cm&&COURSES[cm[1]])pick(COURSES[cm[1]]);
  // 首頁的「我有興趣」按鈕
  document.addEventListener('click',function(e){
    var a=e.target.closest('[data-pick]');if(a)pick(a.dataset.pick);
  });

  function err(name,msg){
    var el=f.querySelector('[data-err="'+name+'"]');if(el)el.textContent=msg||'';
    var inp=f.querySelector('[name="'+name+'"]');if(inp)inp.setAttribute('aria-invalid',msg?'true':'false');
    return !msg;
  }
  function val(n){return (f.elements[n].value||'').trim()}

  f.addEventListener('submit',function(e){
    e.preventDefault();
    var phone=val('phone').replace(/[\s()-]/g,'');
    var batch=f.querySelector('[name=batch]:checked'),mode=f.querySelector('[name=mode]:checked');
    var checks=[
      err('batch',batch?'':'請選擇有興趣的課程'),
      err('mode',mode?'':'請選擇上課方式'),
      err('name',val('name')?'':'請填寫姓名'),
      err('email',/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val('email'))?'':'Email 格式不正確'),
      err('phone',/^0\d{8,9}$/.test(phone)?'':'請填寫正確的電話號碼，手機為 09 開頭 10 碼'),
      err('agree',f.elements.agree.checked?'':'請勾選同意個人資料蒐集聲明')
    ];
    if(!checks.every(Boolean)){
      var first=f.querySelector('[aria-invalid="true"]');
      if(first){(first.closest('.fld')||first.closest('fieldset')||first.closest('.pdpa')).scrollIntoView({behavior:'smooth',block:'center'});first.focus({preventScroll:true})}
      return;
    }

    var btn=f.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='送出中…';
    var old=document.getElementById('dupMsg');if(old)old.remove();
    // 同一門課，相同 Email 或電話已填過：提醒不需重複填寫
    function showDup(d){
      btn.disabled=false;btn.textContent='送出意願';
      if(d.email)err('email','這個 Email 已經填過這門課了');
      if(d.phone)err('phone','這支電話已經填過這門課了');
      var box=document.createElement('div');box.id='dupMsg';box.className='dup';box.setAttribute('role','alert');
      box.innerHTML='<b>您已經填過這門課了，不需要重複填寫</b><p>系統查到相同的'+(d.email&&d.phone?' Email 與電話 ':d.email?' Email ':d.phone?'電話':' Email 或電話 ')+'已有這門課的意願紀錄。經濟部公告課程後，將會通知您前往報名網站進行報名（找不到信請看垃圾郵件匣）。</p><p>如需更改資料，或確認不是您本人填寫，請洽朱小姐：02-2332-8558 #355。</p>';
      btn.parentNode.insertBefore(box,btn);
      box.scrollIntoView({behavior:'smooth',block:'center'});
    }
    function submit(){
      RegDB.add({batch:batch.value,mode:mode.value,name:val('name'),email:val('email'),phone:phone,ref:f.ref.value}).then(function(){
        document.getElementById('regCard').innerHTML='<div class="done"><span class="ok-ic" aria-hidden="true">✓</span><h3>感謝您的填寫！</h3><p>我們已收到您的資料。<b>目前尚未完成報名</b>，等經濟部公告課程後，將會通知您前往報名網站進行報名。</p><p>還想填其他課程？<a href="index.html#apply" onclick="location.reload()">再填一門</a></p><p class="mail-tip"><b>📧 確認信已寄到您填寫的 Email</b>若幾分鐘內沒有收到，請到信箱的「垃圾郵件」或「促銷內容」資料夾找找看，並將寄件者設為「非垃圾郵件」，以免錯過報名通知。</p></div>';
        document.getElementById('apply').scrollIntoView({behavior:'smooth'});
      },function(e){
        if(e&&e.message==='DUPLICATE'){showDup({});return}
        btn.disabled=false;btn.textContent='送出意願';
        alert('送出失敗：所選課程可能剛額滿關閉，請重新整理頁面確認；或來電 02-2332-8558 #355 洽詢朱小姐。');
      });
    }
    RegDB.checkRegistered(val('email'),phone,batch.value).then(function(d){return d},function(){return {}}).then(function(d){
      if(d&&(d.email||d.phone)){showDup(d);return}
      submit();
    });
  });
})();
