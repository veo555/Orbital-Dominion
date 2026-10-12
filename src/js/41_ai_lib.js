/* =========================================================================
   41_AI_LIB — the maths behind the T2 opponent (SIM-SIDE: headless, deterministic, no Math.random, no DOM, no wall clock).
   Everything here is a pure function of its arguments (plus static unit data), so tests/sim/ai_lib.js can test it in isolation.
   See docs/AI_DESIGN.md for the formulas and where they come from.
     1. airand            mulberry32 on a plain integer state (o.rs), so AI state stays JSON-able for 46_save.js
     2. belief grid        Bayesian occupancy update with an imperfect sensor, hazard prior, mass-conserving diffusion, negative information
     3. pheromone fields   tau <- (1-rho) tau + deposit, then diffusion (ant-colony stigmergy: scouting staleness, defence / repair demand)
     4. combat predictor   heterogeneous Lanchester square-law ODE over unit stacks (range delay, splash, healing) -> P(win)
     5. ideal free distribution   greedy marginal allocation of workers over concave site-income curves (optimal for separable concave sums)
     6. value function     logistic / tiny-MLP evaluation of V(s)=P(win | observation)
     7. swarm geometry     boids-style formation targets, concave arc, potential-field retreat vector
   ========================================================================= */

/* ---------------------------------------------------------------- 1. rng */
function airand(o){let a=(o.rs|0)+0x6D2B79F5|0;o.rs=a;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}
const sigm=x=>x>30?1:x<-30?0:1/(1+Math.exp(-x));

/* ---------------------------------------------------------------- 2. belief grid (coarse cells of BC x BC tiles) */
const BC=4,BW=Math.ceil(MW/BC),BH=Math.ceil(MH/BC),BN=BW*BH,BPX=BC*TILE;
function bcell(x,y){return clamp(y/BPX|0,0,BH-1)*BW+clamp(x/BPX|0,0,BW-1);}
function bcx(i){return((i%BW)+.5)*BPX;}
function bcy(i){return(((i/BW)|0)+.5)*BPX;}
/* Bayes rule for "is there an enemy structure in this cell" with detection probability pd and false-alarm probability pf:
     P(occ | detect)    = P pd / (P pd + (1-P) pf)
     P(occ | no detect) = P (1-pd) / (P (1-pd) + (1-P)(1-pf))                                                      */
function bayesOcc(p,detected,pd,pf){
  if(detected){const a=p*pd,b=(1-p)*pf;return a+b>0?a/(a+b):p;}
  const a=p*(1-pd),b=(1-p)*(1-pf);return a+b>0?a/(a+b):p;
}
/* hazard prior for cells nobody watches: p <- p + h (q - p)   (q = long-run prior, h = per-update hazard) */
function hazard(p,q,h){return p+h*(q-p);}
/* Diffusion on a W x H grid by pairwise fluxes between 4-neighbours: each edge moves k*(a_j - a_i).
   Reflecting boundaries; the total mass is conserved exactly up to float rounding; stable (no negative values) for k <= 0.25.
   mask (optional, Uint8Array): cells with mask 0 neither give nor receive mass (cliffs / void).                           */
function diffuse(a,W,H,k,tmp,mask){
  const n=W*H;tmp.set(a);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;if(mask&&!mask[i])continue;
    if(x+1<W){const j=i+1;if(!mask||mask[j]){const f=k*(a[j]-a[i]);tmp[i]+=f;tmp[j]-=f;}}
    if(y+1<H){const j=i+W;if(!mask||mask[j]){const f=k*(a[j]-a[i]);tmp[i]+=f;tmp[j]-=f;}}}
  for(let i=0;i<n;i++)a[i]=tmp[i];
}
function gsum(a){let s=0;for(let i=0;i<a.length;i++)s+=a[i];return s;}
/* negative information for a location density: cells that are in view and show nothing lose (pd of) their mass; renormalise to 1 */
function densityObserve(a,inView,pd,mask){
  let s=0;for(let i=0;i<a.length;i++){if(inView[i])a[i]*=(1-pd);s+=a[i];}
  if(s<=1e-12){let m=0;for(let i=0;i<a.length;i++)if((!mask||mask[i])&&!inView[i])m++;
    const v=m?1/m:1/a.length;for(let i=0;i<a.length;i++)a[i]=((!mask||mask[i])&&(!inView[i]||!m))?v:0;return;}
  for(let i=0;i<a.length;i++)a[i]/=s;
}

/* ---------------------------------------------------------------- 3. pheromone (stigmergy) */
/* one update:  tau <- (1-rho) tau ;  tau <- tau + deposit (done by the caller with phDeposit) ;  diffusion with rate k */
function phStep(tau,W,H,rho,k,tmp,mask){
  if(rho>0)for(let i=0;i<tau.length;i++)tau[i]*=(1-rho);
  if(k>0)diffuse(tau,W,H,k,tmp,mask);
}
function phDeposit(tau,i,amt,cap){tau[i]+=amt;if(cap&&tau[i]>cap)tau[i]=cap;}
function argmaxIdx(a,score){let b=-1,bs=-1e18;for(let i=0;i<a.length;i++){const s=score?score(i,a[i]):a[i];if(s>bs){bs=s;b=i;}}return b;}

/* ---------------------------------------------------------------- 4. combat predictor */
/* A fighting "stack": n identical units. hp is per unit; dmg/cd/bon/range/splash from UDEF (+ upgrades); armor includes upgrades.
   stack fields: {type,n,hp,armor,parm,tags,fly,air,ground,dmg,bon,cd,range,speed,splash,heal,static}                         */
function cmbStackOf(type,n,o){
  o=o||{};const d=UDEF[type]||BDEF[type],wl=o.wl||0,al=o.al||0,isB=!UDEF[type];
  let hp=o.hp!==undefined?o.hp:(d.hp*(isB&&o.meridian?1.2:1)),dmg=d.dmg||0,cd=d.cd||1,range=d.range||0,splash=d.splash||0,bon=d.bon||{};
  if(o.sieged&&d.siege){dmg=d.siege.dmg;cd=d.siege.cd;range=d.siege.range;splash=d.siege.splash;bon=d.siege.bon||bon;}
  if(d.hero){const L=o.lvl||1;hp=o.hp!==undefined?o.hp:Math.round(d.hp*(1+0.14*(L-1)));dmg*=1+0.10*(L-1);}
  if(isB&&type==='hub')dmg+=3*(o.garr||0);
  return{type,n,hp:Math.max(1,hp),armor:(d.armor||0)+(isB?0:al)+(d.hero?Math.floor(((o.lvl||1)-1)/2):0),parm:d.projArmor||0,tags:d.tags||{},fly:!!d.flying,
    air:!!d.air,ground:d.ground!==false,dmg:dmg*(1+0.15*wl),bon,cd,range,speed:d.speed||0,splash,ranged:!!(d.proj),heal:d.heal?14:0,static:isB,noW:!dmg,cloak:!!d.cloak,detect:!!d.detect,ls:d.lifesteal||0};
}
function cmbDmg(s,t){ // damage per shot of stack s against one unit of stack t (dmgVs in 20_sim.js)
  if(s.noW)return 0;if(t.fly?!s.air:!s.ground)return 0;
  let a=s.dmg;for(const k in s.bon)if(t.tags[k])a+=s.bon[k];
  return Math.max(1,a-t.armor-(s.ranged?t.parm:0));
}
/* Heterogeneous Lanchester square-law ODE ("aimed fire"): each stack s of side X splits its fire over the enemy stacks it can hit,
   in proportion to their remaining numbers; target stack t loses  dH_t/dt = - sum_s n_s(t) * cmbDmg(s,t)/cd_s * share_{s,t} * splashMul.
   n_s(t) = H_s(t)/hp_s (units die continuously), so for one homogeneous stack per side this IS Lanchester's square law:
   A wins iff alpha A0^2 > beta B0^2 with alpha = dps_A/hp_B, beta = dps_B/hp_A.
   Range: a stack starts firing at t0 = max(0, Rmax - range)/v_close (out-ranged units must first close the gap).
   Healing: Menders restore up to 14 HP/s each to bio stacks of their side (capped by an energy pool of 300 HP + regen).
   Returns {win: 1|0|0.5, remA, remB (fractions of the starting HP value), margin, t}.                                           */
function cmbSimulate(A,B,opts){
  opts=opts||{};const dt=opts.dt||0.5,tmax=opts.tmax||40;
  const side=(S)=>S.filter(s=>s.n>0.001).map(s=>({s,H:s.n*s.hp,H0:s.n*s.hp,v:(s.cost||1)}));
  const a=side(A),b=side(B);if(!a.length||!b.length)return{win:a.length?1:(b.length?0:0.5),remA:a.length?1:0,remB:b.length?1:0,margin:a.length?1:(b.length?-1:0),t:0};
  let Rmax=0;for(const x of a)if(!x.s.static)Rmax=Math.max(Rmax,x.s.range);for(const x of b)if(!x.s.static)Rmax=Math.max(Rmax,x.s.range);Rmax+=30;
  const vClose=(L)=>{let v=0,n=0;for(const x of L)if(!x.s.static){v+=x.s.speed*x.s.n;n+=x.s.n;}return n?v/n:0;};
  const vc=Math.max(30,vClose(a)+vClose(b));
  for(const x of a)x.t0=x.s.static?0:Math.max(0,(Rmax-x.s.range-30))/vc;for(const x of b)x.t0=x.s.static?0:Math.max(0,(Rmax-x.s.range-30))/vc;
  // damage-per-second matrices (cmbDmg once per pair)
  // cloak: a side without a detector (Mender, Turret, Hub) cannot shoot cloaked stacks at all
  const det=(L)=>L.some(x=>x.s.detect);const dA0=det(a),dB0=det(b);
  const mat=(X,Y,dX)=>X.map(x=>Y.map(y=>x.s.noW||(y.s.cloak&&!dX)?0:cmbDmg(x.s,y.s)/x.s.cd));
  const MAB=mat(a,b,dA0),MBA=mat(b,a,dB0);
  const healPool=[0,0];for(const x of a)if(x.s.heal)healPool[0]+=300*x.s.n;for(const x of b)if(x.s.heal)healPool[1]+=300*x.s.n;
  let t=0;const dA=new Float64Array(a.length),dB=new Float64Array(b.length);
  const fire=(X,Y,M,dY,dX)=>{
    let ng=0;for(const y of Y)if(y.H>0&&!y.s.fly&&!y.s.static)ng+=y.H/y.s.hp;   // ground units that a splash can catch
    for(let i=0;i<X.length;i++){const x=X[i];if(x.H<=0||t<x.t0)continue;const row=M[i],nx=x.H/x.s.hp;
      let wsum=0;for(let j=0;j<Y.length;j++)if(row[j]>0&&Y[j].H>0)wsum+=Y[j].H/Y[j].s.hp;
      if(wsum<=0)continue;const k=nx*dt/wsum;
      for(let j=0;j<Y.length;j++){const y=Y[j];if(row[j]<=0||y.H<=0)continue;const ny=y.H/y.s.hp;
        // splash: a blob of units ~24 px apart puts about pi R^2 / 576 units in the blast; half of that is in the front of the blob
        const spl=x.s.splash&&!y.s.fly&&!y.s.static?Math.max(1,Math.min(ng,1+0.5*Math.PI*x.s.splash*x.s.splash/576)):1;
        const dd=k*ny*row[j]*spl;dY[j]+=dd;if(x.s.ls)dX[i]-=x.s.ls*Math.min(dd,y.H);}}};   // lifesteal heals the attacker
  const heal=(X,dX,k)=>{if(healPool[k]<=0)return;let rate=0;for(const x of X)if(x.s.heal&&x.H>0)rate+=x.s.heal*(x.H/x.s.hp)*dt;if(rate<=0)return;
    let need=0;for(let i=0;i<X.length;i++)if(X[i].s.tags.bio&&X[i].H>0)need+=dX[i];if(need<=0)return;const h=Math.min(rate,need,healPool[k]);healPool[k]-=h;
    for(let i=0;i<X.length;i++)if(X[i].s.tags.bio&&X[i].H>0)dX[i]-=h*dX[i]/need;};
  const canHurt=(X,Y,M)=>{for(let i=0;i<X.length;i++)if(X[i].H>0)for(let j=0;j<Y.length;j++)if(M[i][j]>0&&Y[j].H>0)return true;return false;};
  let step=0;
  while(t<tmax){
    dA.fill(0);dB.fill(0);fire(a,b,MAB,dB,dA);fire(b,a,MBA,dA,dB);heal(a,dA,0);heal(b,dB,1);
    let la=0,lb=0;for(let i=0;i<a.length;i++){a[i].H=a[i].H>0?Math.min(a[i].H0,Math.max(0,a[i].H-dA[i])):0;la+=a[i].H;}for(let i=0;i<b.length;i++){b[i].H=b[i].H>0?Math.min(b[i].H0,Math.max(0,b[i].H-dB[i])):0;lb+=b[i].H;}
    t+=dt;if(la<=0||lb<=0)break;
    if((++step&7)===0&&!canHurt(a,b,MAB)&&!canHurt(b,a,MBA))break;}
  const val=(L,k)=>{let s=0;for(const x of L)s+=(k?x.H:x.H0)/x.s.hp*x.v;return s;};
  const A0=val(a,0),B0=val(b,0),A1=val(a,1),B1=val(b,1);
  const remA=A0?A1/A0:0,remB=B0?B1/B0:0,margin=(A1-B1)/Math.max(1,A0+B0)*2;
  return{win:A1>0&&B1<=0?1:B1>0&&A1<=0?0:(remA>remB?1:remA<remB?0:0.5),remA,remB,margin,t};
}
/* closed-form Lanchester fighting strength  S = (sum dps)(sum hp)  — the coarse estimate (also used by 25_agents.js lanch()) */
function cmbStrength(S,E){const det=S.some(s=>s.detect);let dps=0,hp=0;
  for(const s of S){let d=0,w=0;for(const e of E){if(e.cloak&&!det)continue;const x=cmbDmg(s,e);if(x>0){d+=x/s.cd*e.n;w+=e.n;}}dps+=s.n*(w?d/w:0);hp+=s.n*s.hp;}return dps*hp;}
/* P(A wins) = sigmoid(kOde * ODE margin + kL * ln(S_A / S_B)): a logistic blend of the ODE and the closed-form Lanchester strength
   ratio, fitted on real-sim skirmishes (tools/league/calib_combat.js; held-out log-loss 0.147 vs 0.166 Lanchester-only, 0.239 ODE-only) */
function cmbPredict(A,B,k){
  const r=cmbSimulate(A,B),c=k||(typeof AI_PARAMS!=='undefined'&&AI_PARAMS.combat)||{kOde:2.1,kL:2.2};
  const ls=Math.log(cmbStrength(A,B)+1)-Math.log(cmbStrength(B,A)+1);
  return{p:sigm(c.kOde*r.margin+c.kL*ls),r,ls};
}

/* ---------------------------------------------------------------- 5. ideal free distribution of workers */
/* Each site s has a concave income curve given by marginal gains g_s(k) (income of the (k+1)-th worker). Measured in the real sim
   (docs/AI_DESIGN.md §IFD): a base mines ~98 crystals/min per worker up to 16 workers, then 0.6x for the next 4, 0.4x up to 24, ~0.1x
   beyond; a siphon gives ~52 ether/min per worker, linear to 6.  Greedy marginal allocation (always give the next worker to the
   site with the largest marginal gain) maximises the total of separable concave incomes (Gross 1956; Fox 1966), and at the optimum
   no worker can raise its own income by moving: the Ideal Free Distribution (Fretwell & Lucas 1970).                          */
function ifdGain(site,k){ // marginal value of the (k+1)th worker at this site
  const s=site.sat,r=site.rate*(site.w===undefined?1:site.w);
  if(site.kind==='e')return k<s?r:k<s+2?r*0.4:0;
  return k<s?r:k<s+4?r*0.6:k<s+8?r*0.4:k<s+14?r*0.1:0;
}
function ifdAlloc(sites,N){
  const n=sites.map(()=>0);
  for(let w=0;w<N;w++){let b=-1,bg=0;for(let i=0;i<sites.length;i++){const g=ifdGain(sites[i],n[i]);if(g>bg+1e-12){bg=g;b=i;}}if(b<0)break;n[b]++;}
  return n;
}
function ifdTotal(sites,n){let s=0;for(let i=0;i<sites.length;i++)for(let k=0;k<n[i];k++)s+=ifdGain(sites[i],k);return s;}

/* ---------------------------------------------------------------- 6. value function V(s) = P(win | features) */
/* model: {kind:'lr', w:[...], b, mu:[...], sd:[...]} or {kind:'mlp', W1 (h x d), b1, w2 (h), b2, mu, sd};  features are standardised */
function vfEval(m,f,buf){
  if(!m||!m.w&&!m.W1)return 0.5;
  const d=f.length,x=buf||new Array(d);for(let i=0;i<d;i++)x[i]=(f[i]-(m.mu?m.mu[i]:0))/(m.sd?m.sd[i]||1:1);
  if(m.kind==='mlp'){let z=m.b2;for(let h=0;h<m.W1.length;h++){let a=m.b1[h];const r=m.W1[h];for(let i=0;i<d;i++)a+=r[i]*x[i];z+=m.w2[h]*Math.tanh(a);}return sigm(z);}
  let z=m.b;for(let i=0;i<d;i++)z+=m.w[i]*x[i];return sigm(z);
}

/* ---------------------------------------------------------------- 7. swarm geometry */
function centroid(L){let x=0,y=0;for(const u of L){x+=u.x;y+=u.y;}return L.length?{x:x/L.length,y:y/L.length}:null;}
function spreadOf(L,c){let s=0;for(const u of L)s+=hyp(u.x-c.x,u.y-c.y);return L.length?s/L.length:0;}
/* boids-style formation move (Reynolds 1987): target_i = goal + cohesion * (x_i - centroid), clamped to a radius that grows with
   sqrt(n) (separation keeps a minimum spacing); alignment comes from moving the whole group at the speed of its slowest member.  */
function boidsTargets(L,goal,coh){
  const c=centroid(L);if(!c)return[];const R=40+18*Math.sqrt(L.length);
  return L.map(u=>{let dx=(u.x-c.x)*coh,dy=(u.y-c.y)*coh;const d=hyp(dx,dy);if(d>R){dx*=R/d;dy*=R/d;}return{x:goal.x+dx,y:goal.y+dy};});
}
/* concave arc: n slots on an arc of radius rad around the enemy centre e, centred on the direction we come from */
function arcSlots(from,e,rad,n,width){
  const a0=Math.atan2(from.y-e.y,from.x-e.x),W=Math.min(width||2.2,0.35*n+0.4),out=[];
  for(let i=0;i<n;i++){const a=a0+(n>1?(i/(n-1)-0.5)*W:0);out.push({x:e.x+Math.cos(a)*rad,y:e.y+Math.sin(a)*rad});}
  return out;
}
/* potential field: attraction to home, 1/d repulsion from each threat (weight w); returns a unit vector */
function fieldDir(p,home,threats,wHome){
  let fx=0,fy=0;const hd=hyp(home.x-p.x,home.y-p.y)||1;fx+=(home.x-p.x)/hd*(wHome||1);fy+=(home.y-p.y)/hd*(wHome||1);
  for(const t of threats){const dx=p.x-t.x,dy=p.y-t.y,d=Math.max(30,hyp(dx,dy));fx+=dx/d*(t.w||1)*200/d;fy+=dy/d*(t.w||1)*200/d;}
  const l=hyp(fx,fy)||1;return{x:fx/l,y:fy/l};
}
