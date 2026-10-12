/* =========================================================================
   41_AI_MCTS — the T2 opponent's MACRO PLANNER (SIM-SIDE: headless, deterministic, no Math.random, no DOM, no wall clock).
   AlphaGo-style search over macro-actions on a fast ABSTRACT model of the game. Pure functions of their arguments (plus AI_PARAMS),
   so tests/sim/ai_mcts.js can test them in isolation. Formulas and sources: docs/AI_DESIGN.md §17.
     1. abstract model   per side: bank, workers, bases, siphons, production, era, upgrades, army value (+ Lanchester dps/hp per value),
                         turrets, structures, army location; 10-s steps: economy integration, worker/army production, expansion / tech /
                         production timers, Lanchester square-law combat (calibrated predictor link), raids, harassment
     2. prior P(s,a)     softmax over the theta utilities (the league-tuned policy = our "policy network") + a learned linear policy head
     3. leaf value       V = (1-lambda) v(s_L) + lambda z_L   (v = the embedded V(s) MLP on abstract features, z = fast-rollout result)
     4. PUCT             a* = argmax Q(s,a) + c P(s,a) sqrt(sum_b N(s,b)) / (1 + N(s,a));  backup: Q = mean of leaf values
     5. determinisation  information-set MCTS: K worlds sampled from the AI's beliefs (never from hidden state), one tree per world,
                         root visit counts summed; the move is the most visited macro-action (training: N^(1/tau) sampling + Dirichlet noise)
   The opponent inside the model is not searched: in every simulation it samples its macro-action from the same prior applied to its
   (mirrored) side with the default theta0, i.e. open-loop MCTS over a stochastic environment.
   ========================================================================= */
const PL_ACTS=['grow','expand','tech','mass','attack','defend','harass'],PL_NA=7;
const PA_GROW=0,PA_EXPAND=1,PA_TECH=2,PA_MASS=3,PA_ATTACK=4,PA_DEFEND=5,PA_HARASS=6;
/* abstract state: Float64Array, two sides of PS_N fields + global time */
const PS_C=0,PS_E=1,PS_W=2,PS_H=3,PS_HT=4,PS_SIP=5,PS_P=6,PS_PT=7,PS_ERA=8,PS_ERT=9,PS_A=10,PS_D=11,PS_HP=12,PS_TUR=13,PS_LOC=14,PS_TRV=15,
  PS_ST=16,PS_KIL=17,PS_LOS=18,PS_UP=19,PS_UPT=20,PS_WMX=21,PS_A0=22,PS_HERO=23,PS_FST=24,PS_N=25,PS_T=50,PS_LEN=51;
/* model constants (calibrated against the real sim by tools/league/calib_model.js; AI_PARAMS.plm overrides) */
const PL_K0={inc:0.4852,einc:0.2519,prod:5.832,eng:0.214,turD:20,turH:320,hubD:8,hubH:1500,trav:60,wt:14,hubT:85,prodT:45,sup:47.17,ret:0.625,
  raid:2.576,wk:0.08654,har:0.000436,harL:0.15,up:0.08,eraQ:0.36,minAtk:150,zk:12,gar:0.96,oth:0.1926};   // fitted on 18 real games (docs/AI_LEAGUE_RESULTS.md §9)
function plK(){return(typeof AI_PARAMS!=='undefined'&&AI_PARAMS.plm)?AI_PARAMS.plm:PL_K0;}
const PL_ERA_COST=[null,null,{c:300,e:100,t:40},{c:500,e:300,t:60}];
const plClamp=(x,a,b)=>x<a?a:x>b?b:x;

/* ---------------------------------------------------------------- 1. abstract model */
function plIncome(s,o,K,dt){ // adds dt seconds of crystal and ether income (Ideal-Free-Distribution curve of 41_ai_lib.js, measured in the real sim); returns crystals/s
  const W=s[o+PS_W],H=s[o+PS_H];if(H<=0.01)return 0;
  const we=Math.min(W*0.3,s[o+PS_SIP]*3),wc=W-we,per=wc/H,c=H*(Math.min(per,16)+0.6*plClamp(per-16,0,4)+0.4*plClamp(per-20,0,4))*1.6333*K.inc;
  s[o+PS_C]+=c*dt;s[o+PS_E]+=we*0.8667*K.einc*dt;return c;
}
function plSupply(s,o,K){return s[o+PS_W]+s[o+PS_A]/K.sup;}
/* one side's economy, spending and timers for dt seconds under macro-action a */
function plEcon(s,o,a,K,dt){
  if(s[o+PS_HT]>0){s[o+PS_HT]-=dt;if(s[o+PS_HT]<=0){s[o+PS_HT]=0;s[o+PS_H]+=1;s[o+PS_ST]+=400;}}
  if(s[o+PS_PT]>0){s[o+PS_PT]-=dt;if(s[o+PS_PT]<=0){s[o+PS_PT]=0;s[o+PS_P]+=1;s[o+PS_ST]+=200;}}
  if(s[o+PS_ERT]>0){s[o+PS_ERT]-=dt;if(s[o+PS_ERT]<=0){s[o+PS_ERT]=0;s[o+PS_ERA]+=1;s[o+PS_D]*=1+K.eraQ;s[o+PS_HP]*=1+K.eraQ;}}
  if(s[o+PS_UPT]>0){s[o+PS_UPT]-=dt;if(s[o+PS_UPT]<=0){s[o+PS_UPT]=0;s[o+PS_UP]+=1;s[o+PS_D]*=1+K.up;s[o+PS_HP]*=1+K.up*0.6;}}
  const cps=plIncome(s,o,K,dt),sup0=plSupply(s,o,K);
  const H=s[o+PS_H],eco=a===PA_GROW||a===PA_EXPAND||a===PA_TECH;
  // standing spending of the real macro: production sized to income (theta.gar), and a share of the income into other structures
  if(s[o+PS_PT]<=0&&s[o+PS_P]<Math.min(9,Math.round(K.gar*cps*60/300))&&s[o+PS_C]>=150){s[o+PS_C]-=150;s[o+PS_PT]=K.prodT;}
  const oth=Math.min(Math.max(0,s[o+PS_C]),K.oth*cps*dt);s[o+PS_C]-=oth;s[o+PS_ST]+=oth;
  // workers: every hub trains one per K.wt seconds up to the cap (economic actions) or a lean cap (army-first actions)
  const wcap=eco?s[o+PS_WMX]:Math.min(s[o+PS_WMX],Math.max(14,12*H+2*s[o+PS_SIP]));
  if(s[o+PS_W]<wcap&&plSupply(s,o,K)<MAXSUP&&H>0){const n=Math.min(wcap-s[o+PS_W],H*dt/K.wt,Math.max(0,s[o+PS_C])/50);if(n>0){s[o+PS_W]+=n;s[o+PS_C]-=50*n;}}
  let resC=0;
  if(a===PA_EXPAND&&s[o+PS_HT]<=0&&H<4){if(s[o+PS_C]>=400){s[o+PS_C]-=400;s[o+PS_HT]=K.hubT;}else resC=400;}
  if(a===PA_TECH){const era=s[o+PS_ERA];
    if(era<3&&s[o+PS_ERT]<=0){const E=PL_ERA_COST[era+1];if(s[o+PS_C]>=E.c&&s[o+PS_E]>=E.e){s[o+PS_C]-=E.c;s[o+PS_E]-=E.e;s[o+PS_ERT]=E.t;}else resC=E.c;}
    else if(s[o+PS_UPT]<=0&&s[o+PS_UP]<2*era){const c=100+75*Math.floor(s[o+PS_UP]/2);if(s[o+PS_C]>=c&&s[o+PS_E]>=c){s[o+PS_C]-=c;s[o+PS_E]-=c;s[o+PS_UPT]=45;}else resC=c;}}
  if((a===PA_MASS||a===PA_ATTACK||a===PA_HARASS)&&s[o+PS_PT]<=0&&s[o+PS_P]<9&&s[o+PS_C]>=250){s[o+PS_C]-=150;s[o+PS_PT]=K.prodT;}
  if(a===PA_DEFEND&&s[o+PS_TUR]<2+2*H&&s[o+PS_C]>=100){s[o+PS_TUR]+=1;s[o+PS_C]-=100;s[o+PS_ST]+=100;}
  // army production: production capacity, supply cap, bank (crystals beyond the reservation; ether share grows with the era)
  const es=s[o+PS_ERA]>=2?0.3:0.08;
  let v=Math.min(s[o+PS_P]*K.prod*dt*(eco?0.75:1),Math.max(0,(MAXSUP-plSupply(s,o,K))*K.sup),Math.max(0,s[o+PS_C]-resC)/(1-es));
  if(es>0)v=Math.min(v,Math.max(0,s[o+PS_E])/es);
  if(v>0){s[o+PS_A]+=v;s[o+PS_C]-=v*(1-es);s[o+PS_E]-=v*es;}
  const gen=Math.max(0,plSupply(s,o,K)-sup0)*12.5;s[o+PS_C]-=gen;s[o+PS_ST]+=gen;   // Generators: 100 crystals per 8 supply
}
/* Lanchester square law on value units: side X loses (sum of the other side's dps) / (X's hp per value) value per second.
   d = dps per value, h = hp per value (from the real unit stacks at the root, cmbStackOf); statics (turrets, hubs) fire for the
   defender. Engagement efficiency K.eng < 1: real fights are partial (units arrive in a stream, retreat, re-target). */
function plFight(s,i,j,K,dt,home){ // i attacks j (home: j fights at its base with its statics); both may lose value
  const Ai=s[i+PS_A],Aj=s[j+PS_A];if(Ai<=0)return;
  const dI=s[i+PS_D]*Ai,sD=home?K.turD*s[j+PS_TUR]+K.hubD*s[j+PS_H]:0,dJ=s[j+PS_D]*Aj+sD;
  // the attacker's fire goes to the army first, then the statics / economy (raid)
  const toArmy=!home?1:Aj>1?Math.min(1,(Aj*s[j+PS_HP])/(Aj*s[j+PS_HP]+0.25*K.turH*s[j+PS_TUR]+1)):0;
  const lossI=Math.min(Ai,K.eng*dJ*dt/Math.max(0.05,s[i+PS_HP])),lossJ=Math.min(Aj,K.eng*dI*toArmy*dt/Math.max(0.05,s[j+PS_HP]));
  s[i+PS_A]-=lossI;s[j+PS_A]-=lossJ;s[i+PS_KIL]+=lossJ;s[j+PS_KIL]+=lossI;s[i+PS_LOS]+=lossI;s[j+PS_LOS]+=lossJ;
  if(home&&Aj<0.15*Ai){ // the defence is broken: the attacker raids workers, turrets and structures
    const dmg=K.eng*K.raid*dI*(1-toArmy*0.5)*dt;
    const tk=Math.min(s[j+PS_TUR],dmg*0.3/K.turH);s[j+PS_TUR]-=tk;s[j+PS_ST]-=100*tk;
    const wk=Math.min(s[j+PS_W],dmg*0.35*K.wk/45);s[j+PS_W]-=wk;s[i+PS_KIL]+=50*wk;
    const sd=Math.min(s[j+PS_ST],dmg*0.35/3.75);s[j+PS_ST]-=sd;
    s[j+PS_H]=Math.max(0,s[j+PS_H]-dmg*0.12/K.hubH);}
}
/* one model step of dt seconds with macro-actions a0 (side 0) and a1 (side 1) */
function plStep(s,a0,a1,K,dt){
  const o0=0,o1=PS_N;
  for(let k=0;k<2;k++){const o=k?o1:o0,a=k?a1:a0;
    if(a===PA_ATTACK&&s[o+PS_LOC]===0&&s[o+PS_A]>=K.minAtk){s[o+PS_LOC]=1;s[o+PS_TRV]=K.trav;s[o+PS_A0]=s[o+PS_A];}
    else if(a===PA_DEFEND&&s[o+PS_LOC]===1){s[o+PS_LOC]=0;s[o+PS_TRV]=0;}
    plEcon(s,o,a,K,dt);
    if(a===PA_HARASS&&s[o+PS_LOC]===0&&s[o+PS_FST]*s[o+PS_A]>=200){const p=k?o0:o1,sq=Math.min(s[o+PS_FST]*s[o+PS_A],0.35*s[o+PS_A]),def=s[p+PS_LOC]===0?s[p+PS_A]:0;
      const wk=Math.min(s[p+PS_W],K.har*sq*dt/(1+def/Math.max(1,sq)));s[p+PS_W]-=wk;s[o+PS_KIL]+=50*wk;
      const ls=Math.min(sq,K.harL*K.eng*s[p+PS_D]*def*dt/Math.max(0.05,s[o+PS_HP])*0.2);s[o+PS_A]-=ls;s[o+PS_LOS]+=ls;s[p+PS_KIL]+=ls;}}
  // movement and combat
  const away0=s[o0+PS_LOC]===1,away1=s[o1+PS_LOC]===1;
  if(away0&&s[o0+PS_TRV]>0)s[o0+PS_TRV]=Math.max(0,s[o0+PS_TRV]-dt);
  if(away1&&s[o1+PS_TRV]>0)s[o1+PS_TRV]=Math.max(0,s[o1+PS_TRV]-dt);
  if(away0||away1)for(let h=0;h<2;h++){                                 // combat in two Euler half-steps
    if(away0&&away1)plFight(s,o0,o1,K,dt/2,false);                      // both armies on the march: they meet in the field
    else{if(away0&&s[o0+PS_TRV]<=0)plFight(s,o0,o1,K,dt/2,true);
         if(away1&&s[o1+PS_TRV]<=0)plFight(s,o1,o0,K,dt/2,true);}}
  for(let k=0;k<2;k++){ // the attack ends when the army is spent or clearly out-matched (the real agent's retreat rule)
    const o=k?o1:o0;if(s[o+PS_LOC]!==1)continue;const p=o?o0:o1;
    const Si=s[o+PS_D]*s[o+PS_HP]*s[o+PS_A]*s[o+PS_A],Sj=s[p+PS_D]*s[p+PS_HP]*s[p+PS_A]*s[p+PS_A];
    if(s[o+PS_A]<K.ret*s[o+PS_A0]||s[o+PS_A]<60||Si<0.5*Sj&&s[o+PS_TRV]<=0){s[o+PS_LOC]=0;s[o+PS_TRV]=0;}}
  s[PS_T]+=dt;
}
/* material score (tools/league/game.js score(): army + structures + workers + bank + era), and P(side 0 wins) from the material share */
function plScore(s,o){return s[o+PS_A]+Math.max(0,s[o+PS_ST])+50*s[o+PS_W]+0.3*(Math.max(0,s[o+PS_C])+Math.max(0,s[o+PS_E]))+200*(s[o+PS_ERA]-1);}
function plShare(s){const a=plScore(s,0),b=plScore(s,PS_N);return a/Math.max(1,a+b);}
/* the 11 value-function features (aiFeatures in 42_ai_agent.js) from an abstract state, for side 0 */
function plFeatures(s,f){
  const o=0,p=PS_N;f=f||new Array(11);
  f[0]=Math.log((s[o+PS_A]+100)/(s[p+PS_A]+100));f[1]=Math.log((s[o+PS_W]+2)/(s[p+PS_W]+2));f[2]=s[o+PS_H]-s[p+PS_H];f[3]=s[o+PS_ERA]-s[p+PS_ERA];
  f[4]=s[PS_T]/600;f[5]=(s[o+PS_A]-s[p+PS_A])/1000;f[6]=(s[o+PS_W]+s[o+PS_A]/55)/120;f[7]=Math.log((Math.max(0,s[o+PS_C])+Math.max(0,s[o+PS_E])+100)/100);
  f[8]=s[o+PS_HERO]-s[p+PS_HERO];f[9]=(s[o+PS_KIL]-s[p+PS_KIL])/1000;f[10]=Math.log((Math.max(0,s[o+PS_ST])+400)/(Math.max(0,s[p+PS_ST])+400));
  return f;
}

/* ---------------------------------------------------------------- 2. prior policy P(s,a) */
/* features of the policy head (side o's view; o=PS_N mirrors) */
const PL_XN=12;
function plX(s,o,x){
  const p=o?0:PS_N;x=x||new Float64Array(PL_XN);
  x[0]=1;x[1]=Math.log((s[o+PS_A]+100)/(s[p+PS_A]+100));x[2]=Math.log((s[o+PS_W]+2)/(s[p+PS_W]+2));x[3]=s[o+PS_H]+(s[o+PS_HT]>0?0.5:0)-s[p+PS_H];
  x[4]=s[o+PS_ERA]-s[p+PS_ERA];x[5]=s[PS_T]/600;x[6]=Math.max(0,s[o+PS_C])/1000;x[7]=Math.max(0,s[o+PS_E])/1000;x[8]=s[o+PS_W]/40;
  x[9]=s[p+PS_LOC];x[10]=s[o+PS_LOC];x[11]=Math.log(1+s[o+PS_A]/500);
  return x;
}
/* the theta utilities: the league-tuned rules of 42_ai_agent.js written as scores of the seven macro-actions */
function plUtil(s,o,th,u){
  const p=o?0:PS_N,t=s[PS_T],K=plK();u=u||new Float64Array(PL_NA);
  const W=s[o+PS_W],H=s[o+PS_H],era=s[o+PS_ERA],A=s[o+PS_A];
  const wantW=Math.min(th.wMax,H*th.wBase+s[o+PS_SIP]*th.wEther+2);
  let baseWant=1+(t>th.expandAt?1:0)+(t>th.expandAt+150+300*(1-th.expandRate)?1:0)+(t>th.expandAt+400+400*(1-th.expandRate)?1:0);
  if(W>=H*th.wBase*0.85&&t>th.expandAt*0.7)baseWant=Math.max(baseWant,H+1);
  const Si=s[o+PS_D]*s[o+PS_HP]*A*A,Sj=s[p+PS_D]*s[p+PS_HP]*s[p+PS_A]*s[p+PS_A],pG=A<1?0:sigm(2.2*(Math.log(Si+1)-Math.log(Sj+1)));
  const eraDue=era===1?th.era2:era===2?th.era3:1e9,thr=s[p+PS_LOC]===1;
  u[PA_GROW]=0.3+0.6*plClamp((wantW-W)/6,-1,1);
  u[PA_EXPAND]=(H+(s[o+PS_HT]>0?1:0)<baseWant?1.2:-0.8)+(s[o+PS_C]>=400?0.3:0)-(thr?0.8:0);
  u[PA_TECH]=era<3&&t>=eraDue?1.2:(s[o+PS_UP]<2*era?0.4*th.tech-0.3:-1);
  u[PA_MASS]=(pG<0.45?1.0:-0.2)+(thr?0.5:0);
  u[PA_ATTACK]=s[o+PS_LOC]===1?0.5:(t<th.firstAtk?-1.5:4*(pG-th.aggr))+(A/K.sup>=th.atkSup?0:-1.5);
  u[PA_DEFEND]=(thr?1.5:-0.5)+0.3*th.turret;
  u[PA_HARASS]=th.harass>=0.3&&t>=200&&s[o+PS_FST]*A>=300?0.6*th.harass:-1.5;
  return u;
}
/* legal macro-actions (a mask) */
function plLegal(s,o,m){
  m=m||new Uint8Array(PL_NA);for(let a=0;a<PL_NA;a++)m[a]=1;
  if(s[o+PS_A]<plK().minAtk)m[PA_ATTACK]=0;
  if(s[o+PS_H]+(s[o+PS_HT]>0?1:0)>=4||s[o+PS_HT]>0)m[PA_EXPAND]=0;
  if(s[o+PS_ERA]>=3&&s[o+PS_UP]>=6)m[PA_TECH]=0;
  if(s[o+PS_FST]*s[o+PS_A]<200)m[PA_HARASS]=0;                          // a raid needs fast units (Raptor, Reaver, Skiff), as in the real agent
  return m;
}
/* P(s,a) = softmax((u_theta(s,a) + phi_a . x(s)) / T) over the legal actions */
function plPrior(s,o,th,phi,out,tmp){
  const u=plUtil(s,o,th,tmp&&tmp.u),x=phi?plX(s,o,tmp&&tmp.x):null,m=plLegal(s,o,tmp&&tmp.m);out=out||new Float64Array(PL_NA);
  let mx=-1e9;for(let a=0;a<PL_NA;a++){let z=u[a];if(phi){const r=phi[a];for(let j=0;j<PL_XN;j++)z+=r[j]*x[j];}out[a]=m[a]?z/0.6:-1e9;if(out[a]>mx)mx=out[a];}
  let S=0;for(let a=0;a<PL_NA;a++){out[a]=m[a]?Math.exp(out[a]-mx):0;S+=out[a];}for(let a=0;a<PL_NA;a++)out[a]/=S;
  return out;
}
function plSample(p,r){let x=r,i=0;for(;i<p.length-1;i++){x-=p[i];if(x<=0)break;}while(i>0&&p[i]<=0)i--;return i;}

/* ---------------------------------------------------------------- 3./4. PUCT search on one determinised world */
/* PUCT selection (AlphaGo; Silver et al. 2016): argmax_a Q(a) + c P(a) sqrt(sum_b N(b)) / (1 + N(a)). Unvisited actions get the
   first-play value fpu (the parent's mean). Exposed for the toy-tree tests. */
function puctSelect(N,W,P,c,fpu,legal){
  let tot=0;for(let a=0;a<N.length;a++)tot+=N[a];const sq=Math.sqrt(tot+1e-9);
  let best=-1,bs=-1e18;
  for(let a=0;a<N.length;a++){if(legal&&!legal[a]||P[a]<=0)continue;
    const q=N[a]>0?W[a]/N[a]:fpu,sc=q+c*P[a]*sq/(1+N[a]);if(sc>bs){bs=sc;best=a;}}
  return best;
}
/* generic PUCT tree search on any environment (toy trees in tests/sim/ai_mcts.js, the Overseer's advice): env = {na, prior(s), step(s,a,rng),
   value(s,rng) in [0,1], terminal(s)}; one tree, mean backup; returns the root {N, W, P, n, w}. plSimulate below is the same loop on the
   abstract game model with an opponent sampled inside step. */
function puctSearch(env,s0,sims,c,rng,maxDepth){
  const mk=(s)=>({N:new Float64Array(env.na),W:new Float64Array(env.na),P:env.prior(s),ch:new Array(env.na),n:0,w:0}),root=mk(s0);
  for(let i=0;i<sims;i++){let node=root,s=s0,d=0;const path=[];
    while(true){const a=puctSelect(node.N,node.W,node.P,c,node.n>0?node.w/node.n:0.5,null);path.push(node,a);s=env.step(s,a,rng);d++;
      if(env.terminal(s)||d>=maxDepth)break;
      if(!node.ch[a]){node.ch[a]=mk(s);break;}node=node.ch[a];}
    const V=env.value(s,rng);for(let k=0;k<path.length;k+=2){const n=path[k],a=path[k+1];n.N[a]+=1;n.W[a]+=V;n.n+=1;n.w+=V;}}
  return root;
}
function plNode(s,th,phi,tmp){const n={N:new Float64Array(PL_NA),W:new Float64Array(PL_NA),P:plPrior(s,0,th,phi,null,tmp),ch:new Array(PL_NA),n:0,w:0};return n;}
/* one simulation: descend with PUCT for at most `depth` macro-steps of `D` seconds, expand one node, evaluate the leaf
   (value network + fast rollout to the horizon), back up the mean */
function plSimulate(root,s0,C,rng,tmp){
  const s=tmp.s;s.set(s0);const K=C.K,path=[];let node=root,d=0;
  const opp=(st)=>plSample(plPrior(st,PS_N,C.thE,null,tmp.pe,tmp),rng());
  while(true){
    const a=puctSelect(node.N,node.W,node.P,C.c,node.n>0?node.w/node.n:0.5,null);path.push(node,a);
    plStep(s,a,opp(s),K,C.D);
    d++;
    if(s[PS_ST]<=1||s[PS_N+PS_ST]<=1)break;
    if(d>=C.depth)break;
    if(!node.ch[a]){node.ch[a]=plNode(s,C.th,C.phi,tmp);break;}
    node=node.ch[a];}
  // leaf evaluation: V = (1 - lambda) v(s_L) + lambda z_L
  let v=0.5;if(C.vf){plFeatures(s,tmp.f);v=vfEval(C.vf,tmp.f,tmp.vx);}
  let z=v;
  if(C.lam>0){
    while(s[PS_T]<C.tEnd-1&&s[PS_ST]>1&&s[PS_N+PS_ST]>1){const a0=plSample(plPrior(s,0,C.th,null,tmp.pr,tmp),rng());plStep(s,a0,opp(s),K,C.D);}   // fast rollout policy: theta utilities only
    z=sigm(K.zk*(plShare(s)-0.5));}
  const V=C.vf?(1-C.lam)*v+C.lam*z:z;
  for(let i=0;i<path.length;i+=2){const n=path[i],a=path[i+1];n.N[a]+=1;n.W[a]+=V;n.n+=1;n.w+=V;}
  return V;
}
/* Dirichlet(alpha) noise from a uniform generator (Marsaglia-Tsang gamma; alpha < 1 boosted) — AlphaGo Zero's root exploration */
function plGamma(a,rng){
  if(a<1){const u=Math.max(1e-12,rng());return plGamma(a+1,rng)*Math.pow(u,1/a);}
  const d=a-1/3,c=1/Math.sqrt(9*d);
  for(let it=0;it<100;it++){let x,v;do{const u1=Math.max(1e-12,rng()),u2=rng();x=Math.sqrt(-2*Math.log(u1))*Math.cos(6.283185307179586*u2);v=1+c*x;}while(v<=0);
    v=v*v*v;const u=Math.max(1e-12,rng());if(Math.log(u)<0.5*x*x+d-d*v+d*Math.log(v))return d*v;}
  return d;
}
function plDirichlet(P,alpha,eps,rng){const g=new Float64Array(P.length);let S=0;for(let a=0;a<P.length;a++){g[a]=P[a]>0?plGamma(alpha,rng):0;S+=g[a];}
  if(S>0)for(let a=0;a<P.length;a++)P[a]=(1-eps)*P[a]+eps*g[a]/S;}
/* search one world: returns {N, W} of the root (plain arrays) */
function plSearch(s0,C,rng,sims,rootP){
  const tmp={s:new Float64Array(PS_LEN),f:new Array(11),vx:new Float64Array(11),pe:new Float64Array(PL_NA),pr:new Float64Array(PL_NA),u:new Float64Array(PL_NA),x:new Float64Array(PL_XN),m:new Uint8Array(PL_NA)};
  const root=plNode(s0,C.th,C.phi,tmp);if(rootP)root.P=rootP;           // the root prior from the point estimate (identical in every world)
  if(C.noise)plDirichlet(root.P,0.3,0.25,rng);
  for(let i=0;i<sims;i++)plSimulate(root,s0,C,rng,tmp);
  return{N:Array.from(root.N),W:Array.from(root.W),P:Array.from(root.P)};
}

/* ---------------------------------------------------------------- 5. determinisation: sample a world from the AI's beliefs */
/* est: {A, known, stale, W, Wseen, H, sites:[p...], era, eraSeen, tur, St, P, away, hero, c} — everything comes from memory / belief
   (42_ai_agent.js aiPlanRoot builds it); the sampled world is a plain Float64Array. */
function plGauss(rng){const u=Math.max(1e-12,rng()),v=rng();return Math.sqrt(-2*Math.log(u))*Math.cos(6.283185307179586*v);}
function plWorld(base,est,rng){
  const s=new Float64Array(PS_LEN);s.set(base);const o=PS_N;
  const sd=0.12+0.35*est.stale;
  s[o+PS_A]=Math.max(est.known,est.A*Math.exp(sd*plGauss(rng)-sd*sd/2));
  s[o+PS_W]=Math.max(est.Wseen,est.W*Math.exp(0.18*plGauss(rng)));
  let H=est.H;for(const p of est.sites)if(rng()<p)H++;s[o+PS_H]=Math.min(4,H);
  s[o+PS_ERA]=Math.max(est.eraSeen,est.era>est.eraSeen&&rng()<0.6?est.era:est.eraSeen);
  s[o+PS_C]=est.c*Math.exp(0.5*plGauss(rng));s[o+PS_E]=0.6*s[o+PS_C];
  s[o+PS_ST]=Math.max(est.St,est.St*Math.exp(0.15*plGauss(rng)))+400*(s[o+PS_H]-est.H);
  s[o+PS_P]=Math.max(1,est.P*Math.exp(0.2*plGauss(rng)));
  return s;
}
