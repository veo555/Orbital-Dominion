/* =========================================================================
   46_SAVE — snapshot / restore of a running match (SIM-SIDE: no DOM, no canvas, no wall clock).
   gameSnapshot()  -> string   the whole of G as a reference-preserving graph (cycles and shared objects survive), JSON text
   gameRestore(s)  -> G|null   rebuilds it, makes it the live G and returns it (null when the text is not a valid snapshot of this version)
   What is NOT saved: render caches (terrainCv, mmBg, tInfo: buildTerrain() makes them again), the Overseer's open proposals (G.sw.props hold
   closures; they are re-proposed within seconds). Objects that are shared static data (UDEF/BDEF/FACTIONS/... entries) are saved by name, not by value,
   so `u.def===UDEF[u.type]` still holds after a restore. The two seeded generators (mulberry32 closures) are saved by state.
   Contract (tests/sim/save.js): snapshot -> restore -> N more ticks gives the same state hash as N more ticks without the round trip.
   ========================================================================= */
const SAVE_V=1;
function saveBuild(){return typeof BUILD!=='undefined'&&BUILD&&typeof BUILD.id==='string'?BUILD.id:'';}   // the build id (a hash of all the game's code); '' in the headless sim harness
/* structural sanity of a decoded snapshot: the arrays the game indexes, finite clocks, and a player hub (startGame() centres the camera on it) */
function saveSane(g){
  return Array.isArray(g.units)&&Array.isArray(g.buildings)&&Array.isArray(g.teams)&&g.teams.length>=2&&typeof g.time==='number'&&isFinite(g.time)&&typeof g.tick==='number'&&isFinite(g.tick)&&
    g.buildings.some(b=>b&&b.team===0&&b.type==='hub'&&isFinite(b.x)&&isFinite(b.y))&&g.teams.every(t=>t&&isFinite(t.c)&&isFinite(t.e)&&typeof t.faction==='string');
}
const SAVE_SKIP={terrainCv:1,mmBg:1,tInfo:1};
let SAVE_STAT=null;                                                    // Map object -> JSON path of the static table it lives in (built once)
function saveRoots(){return{UDEF,BDEF,FACTIONS,DIFF,SKILLS,TECH,TAX,CAMP_TYPES,CADI,ROLES,GEAR,ERAS,TAGNAME,NEUTRAL_COL,JOB_NAMES,PAY,FORT,FORT_NEW,ABIL,DMGX,DTNAME};}
function saveStatics(){
  if(SAVE_STAT)return SAVE_STAT;
  SAVE_STAT=new Map();const R=saveRoots();
  (function walk(o,path,d){if(!o||typeof o!=='object'||d>3||SAVE_STAT.has(o))return;SAVE_STAT.set(o,path);for(const k of Object.keys(o))walk(o[k],path.concat([k]),d+1);})(R,[],0);
  SAVE_STAT.delete(R);return SAVE_STAT;
}
function saveStaticAt(path){let o=saveRoots();for(const k of path){if(o==null)return undefined;o=o[k];}return o;}
const B64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64enc(u8){let s='';const n=u8.length;for(let i=0;i<n;i+=3){const a=u8[i],b=i+1<n?u8[i+1]:0,c=i+2<n?u8[i+2]:0;s+=B64[a>>2]+B64[(a&3)<<4|b>>4]+(i+1<n?B64[(b&15)<<2|c>>6]:'=')+(i+2<n?B64[c&63]:'=');}return s;}
function b64dec(s){
  const n=s.length,pad=s.endsWith('==')?2:s.endsWith('=')?1:0,out=new Uint8Array(n/4*3-pad),L={};for(let i=0;i<64;i++)L[B64[i]]=i;
  let o=0;for(let i=0;i<n;i+=4){const a=L[s[i]],b=L[s[i+1]],c=L[s[i+2]]||0,d=L[s[i+3]]||0;
    if(o<out.length)out[o++]=a<<2|b>>4;if(o<out.length)out[o++]=(b&15)<<4|c>>2;if(o<out.length)out[o++]=(c&3)<<6|d;}
  return out;
}
const SAVE_TA={Uint8Array,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array};
function gameSnapshot(){
  if(!G)return null;
  const ids=new Map(),nodes=[],stat=saveStatics();
  function enc(v){
    if(v===null||typeof v==='boolean'||typeof v==='string')return v;
    if(typeof v==='number')return isFinite(v)?v:{n:String(v)};
    if(v===undefined)return{u:1};
    if(typeof v==='function'){if(v.rngState)return{g:v.rngState()};throw new Error('snapshot: function in state');}
    let i=ids.get(v);if(i!==undefined)return{r:i};
    const sp=stat.get(v);if(sp)return{s:sp};
    if(typeof v.getContext==='function')throw new Error('snapshot: canvas in state');
    i=nodes.length;ids.set(v,i);nodes.push(null);
    let nd;
    if(Array.isArray(v))nd={a:v.map(enc)};
    else if(ArrayBuffer.isView(v))nd={t:v.constructor.name,b:b64enc(new Uint8Array(v.buffer,v.byteOffset,v.byteLength))};
    else if(v instanceof Set)nd={set:[...v].map(enc)};
    else if(v instanceof Map)nd={map:[...v].map(([k,x])=>[enc(k),enc(x)])};
    else{const o={};for(const k of Object.keys(v)){if(v===G&&SAVE_SKIP[k])continue;if(typeof v[k]==='function'&&!v[k].rngState)continue;o[k]=enc(v[k]);}nd={o};}
    nodes[i]=nd;return{r:i};
  }
  const props=G.sw&&G.sw.props;if(G.sw)G.sw.props=[];
  let root;try{root=enc(G);}finally{if(G.sw)G.sw.props=props;}
  return JSON.stringify({v:SAVE_V,b:saveBuild(),root,nodes});
}
function gameRestore(text){
  let S;try{S=JSON.parse(text);}catch(e){return null;}
  if(!S||typeof S!=='object'||S.v!==SAVE_V||S.b!==saveBuild()||!Array.isArray(S.nodes)||!S.root)return null;   // v5: a snapshot written by another BUILD of the game is refused, not guessed at
  const N=S.nodes,objs=new Array(N.length);
  function dec(x){
    if(x===null||typeof x!=='object')return x;
    if(x.r!==undefined)return objs[x.r];
    if(x.s!==undefined)return saveStaticAt(x.s);
    if(x.g!==undefined)return mulberry32(x.g);
    if(x.n!==undefined)return +x.n;
    if(x.u)return undefined;
    throw new Error('bad ref');
  }
  try{
    for(let i=0;i<N.length;i++){const n=N[i];                          // pass 1: allocate every container (so cycles resolve)
      if(n.a)objs[i]=new Array(n.a.length);else if(n.t){const u=b64dec(n.b),C=SAVE_TA[n.t];if(!C)throw new Error('bad typed array');objs[i]=new C(u.buffer,0,u.length/C.BYTES_PER_ELEMENT);}
      else if(n.set)objs[i]=new Set();else if(n.map)objs[i]=new Map();else objs[i]={};}
    for(let i=0;i<N.length;i++){const n=N[i],o=objs[i];                // pass 2: fill
      if(n.a)for(let k=0;k<n.a.length;k++)o[k]=dec(n.a[k]);
      else if(n.set)for(const e of n.set)o.add(dec(e));
      else if(n.map)for(const[k,v]of n.map)o.set(dec(k),dec(v));
      else if(n.o)for(const k of Object.keys(n.o))o[k]=dec(n.o[k]);}
    const g=dec(S.root);if(!g||typeof g!=='object'||!saveSane(g))return null;
    for(const k of Object.keys(SAVE_SKIP))g[k]=null;
    G=g;return G;
  }catch(e){return null;}
}
