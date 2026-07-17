/* ETI MEALEV — interactions: sticky nav, scroll reveal, hero crossfade, drawer, popup */
(function(){
  var nav=document.querySelector('.nav');
  function onScroll(){ if(!nav) return; if(window.scrollY>60) nav.classList.add('scrolled'); else nav.classList.remove('scrolled'); }
  window.addEventListener('scroll',onScroll,{passive:true}); onScroll();

  // mobile drawer
  var burger=document.querySelector('.nav__burger'), drawer=document.querySelector('.nav__drawer');
  if(burger&&drawer){
    burger.addEventListener('click',function(){drawer.classList.add('open');});
    drawer.querySelectorAll('a,.x').forEach(function(el){el.addEventListener('click',function(){drawer.classList.remove('open');});});
  }

  // scroll reveal
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:.14});
  document.querySelectorAll('[data-reveal]').forEach(function(el){io.observe(el);});

  // hero crossfade (ken burns)
  var slides=document.querySelectorAll('.hero__slide');
  if(slides.length>1){
    var i=0;
    setInterval(function(){
      slides[i].classList.remove('on'); i=(i+1)%slides.length; slides[i].classList.add('on');
    },5200);
  }

  // newsletter popup (contact page): show once on arrival
  var popup=document.querySelector('.popup');
  if(popup && !sessionStorage.getItem('em_pop')){
    setTimeout(function(){popup.classList.add('show');sessionStorage.setItem('em_pop','1');},1400);
    popup.addEventListener('click',function(e){if(e.target===popup)popup.classList.remove('show');});
    var x=popup.querySelector('.x'); if(x)x.addEventListener('click',function(){popup.classList.remove('show');});
  }

  // contact form — no backend yet, elegant acknowledgement
  var form=document.querySelector('form[data-inquiry]');
  if(form)form.addEventListener('submit',function(e){e.preventDefault();
    form.innerHTML='<div style="text-align:center;padding:40px 0"><div style="font-family:var(--serif);font-size:1.6rem;margin-bottom:10px">תודה רבה.</div><p style="color:var(--ink-2)">פנייתך התקבלה. נחזור אלייך בהקדם עם מענה אישי.</p></div>';
  });
})();
