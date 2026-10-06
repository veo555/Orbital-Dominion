/* =========================================================================
   SUPPORT — optional "support the game" payments (Stripe-hosted pages). OFF unless src/support.config.json enables it.
   Principles (docs/MONETIZATION.md):
     * No Stripe.js, no card fields, no secrets: the player is sent to a Stripe-hosted page (Payment Link or Checkout Session).
     * Perks are cosmetic only. In-game currency is never sold, nothing in the simulation reads any of this.
     * Zero network requests unless the player acts (or returns from a payment, or already holds a token and a backend is configured).
     * The store build and native wrappers never show it (Apple 3.1.1 / Google Play payments policy: digital extras in store apps
       must use the store's own billing).
   Two modes, chosen by what the config contains:
     payment links   each tier has a paymentLink; Stripe redirects back to  <game>/?supporter=<tierId>   (honour system: fine for cosmetics)
     checkout API    checkoutEndpoint creates a Checkout Session server-side, Stripe redirects back to  <game>/?supporter=<session id>,
                     verifyEndpoint turns the session into a signed token, entitlementEndpoint re-validates it (refunds revoke it)
   ========================================================================= */
const SUP={on:false,tier:null,token:null,honor:false,cfg:SUPPORT_CFG||{}};
const SUPKEY='orbital_dominion_v3_supporter';
const STRIPE_LINK=/^https:\/\/(buy|checkout|donate)\.stripe\.com\//;
const THEMES={gold:{base:'#e0a526',glow:'#ffd566'},magenta:{base:'#d94fb0',glow:'#ff84dc'},ice:{base:'#4fd0e8',glow:'#a6f0ff'}};

function supSave(){try{if(SUP.tier)localStorage.setItem(SUPKEY,JSON.stringify({tier:SUP.tier,token:SUP.token,honor:SUP.honor}));else localStorage.removeItem(SUPKEY);}catch(e){}}
function supLoad(){try{const s=JSON.parse(localStorage.getItem(SUPKEY)||'null');if(s&&s.tier){SUP.tier=String(s.tier);SUP.token=s.token||null;SUP.honor=!!s.honor;}}catch(e){}}
function supIsSupporter(){return !!SUP.tier;}
function supEnabled(){
  const c=SUP.cfg;
  return !!(c.enabled&&BUILD.variant!=='store'&&!PLAT.native&&((c.tiers||[]).some(t=>STRIPE_LINK.test(t.paymentLink||''))||/^https:\/\//.test(c.checkoutEndpoint||'')));
}
/* cosmetic perks */
function supApplyPerks(){
  const b=$('supBadge');if(b)b.classList.toggle('hidden',!supIsSupporter());
  const row=$('themeRow');if(row)row.classList.toggle('hidden',!supIsSupporter());
  if(!supIsSupporter()&&SET.theme){SET.theme='';saveSettings();}
  if(typeof syncMenu==='function'&&typeof FACTIONS!=='undefined')syncMenu();
}
function supAccent(col){   // called by setAccent(): supporters may override the interface accent (UI only, never team colours)
  const t=supIsSupporter()&&THEMES[SET.theme];return t?{base:t.base,glow:t.glow}:col;
}

/* ------------------------------ backend calls (only when configured and only on a player action) ------------------------------ */
function supPost(url,body){
  return fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'omit',cache:'no-store'}).then(r=>r.json().then(j=>({ok:r.ok,j})));
}
function supBeginTier(id){
  const t=(SUP.cfg.tiers||[]).find(x=>x.id===id);if(!t)return;
  if(/^https:\/\//.test(SUP.cfg.checkoutEndpoint||'')){
    $('supMsg').textContent='Opening Stripe…';
    supPost(SUP.cfg.checkoutEndpoint,{tier:id}).then(r=>{
      if(r.ok&&r.j&&/^https:\/\/checkout\.stripe\.com\//.test(r.j.url||''))location.assign(r.j.url);
      else $('supMsg').textContent='Could not start checkout. Please try again later.';
    }).catch(()=>{$('supMsg').textContent='Could not reach the payment service. Check your connection.';});
    return;
  }
  if(!STRIPE_LINK.test(t.paymentLink||'')){$('supMsg').textContent='This option is not available yet.';return;}
  window.open(t.paymentLink,'_blank','noopener,noreferrer');
  $('supMsg').textContent='Stripe opened in a new tab. Thank you for supporting the game!';
}
function supReturnFromPayment(){
  let q;try{q=new URLSearchParams(location.search);}catch(e){return;}
  const v=q.get('supporter');if(!v)return;
  try{q.delete('supporter');history.replaceState(null,'',location.pathname+(q.toString()?'?'+q:'')+location.hash);}catch(e){}   // never leave the id in the address bar
  const cfg=SUP.cfg;
  if(/^cs_(test|live)_[A-Za-z0-9]+$/.test(v)&&/^https:\/\//.test(cfg.verifyEndpoint||'')){
    fetch(cfg.verifyEndpoint+(cfg.verifyEndpoint.includes('?')?'&':'?')+'session_id='+encodeURIComponent(v),{credentials:'omit',cache:'no-store'})
      .then(r=>r.json()).then(j=>{if(j&&j.ok&&j.token&&j.tier){SUP.tier=j.tier;SUP.token=j.token;SUP.honor=false;supSave();supApplyPerks();toastAny('Thank you for supporting Orbital Dominion!');}})
      .catch(()=>{});
  }else if((cfg.tiers||[]).some(t=>t.id===v)&&!/^https:\/\//.test(cfg.verifyEndpoint||'')){   // payment-link (honour) mode
    SUP.tier=v;SUP.token=null;SUP.honor=true;supSave();supApplyPerks();toastAny('Thank you for supporting Orbital Dominion!');
  }
}
function supRevalidate(){   // a refunded payment revokes the perks (checkout-API mode only); runs once, shortly after start, if online
  if(!SUP.token||!/^https:\/\//.test(SUP.cfg.entitlementEndpoint||'')||navigator.onLine===false)return;
  supPost(SUP.cfg.entitlementEndpoint,{token:SUP.token}).then(r=>{if(r.ok&&r.j&&r.j.valid===false){SUP.tier=null;SUP.token=null;supSave();supApplyPerks();}}).catch(()=>{});
}

/* ------------------------------ UI ------------------------------ */
function supRender(){
  const c=SUP.cfg;
  $('supTitle').textContent=c.title||'Support the game';$('supBlurb').textContent=c.blurb||'';
  $('supPerks').textContent=(c.perks&&c.perks.length)?'Supporters get: '+c.perks.join(' · ')+'.':'';
  $('supTiers').innerHTML=(c.tiers||[]).filter(t=>STRIPE_LINK.test(t.paymentLink||'')||/^https:\/\//.test(c.checkoutEndpoint||''))
    .map(t=>'<button class="tier" data-tier="'+String(t.id).replace(/[^\w-]/g,'')+'"><b>'+String(t.label).replace(/[<>&]/g,'')+'</b><span>'+String(t.amount||'').replace(/[<>&]/g,'')+'</span></button>').join('');
  $('supMsg').textContent=supIsSupporter()?'You are a supporter — thank you!':'';
}
function supInit(){
  supLoad();SUP.on=supEnabled();
  const btn=$('bSupport');btn.classList.toggle('hidden',!SUP.on);
  if(SUP.on){
    btn.onclick=()=>{supRender();openSub('supportMenu');};
    $('bSupX').onclick=closeSub;
    $('supTiers').addEventListener('click',e=>{const b=e.target.closest('.tier');if(b)supBeginTier(b.dataset.tier);});
    supReturnFromPayment();setTimeout(supRevalidate,4000);
  }else{SUP.tier=null;SUP.token=null;}   // a disabled build never honours a stored token
  $('set_theme').addEventListener('change',e=>{SET.theme=e.target.value;saveSettings();setAccent(FACTIONS[SET.faction].col);});
  $('set_theme').value=SET.theme||'';
  supApplyPerks();
}
