const fs=require('fs'),vm=require('vm'),path=require('path');
module.exports=function load(dir){
  dir=dir||path.join(__dirname,'..','..','baseline','v2','src','js');
  const files=fs.readdirSync(dir).filter(f=>/^(00|10|20|30|40)_/.test(f)).sort();
  let code=files.map(f=>fs.readFileSync(path.join(dir,f),'utf8')).join('\n');
  code+=`
function toast(t,c){(globalThis.__toasts=globalThis.__toasts||[]).push(t);} function sfx(){} function uiDirty(){} function onVision(){} function onStepEnd(){} function onGameOver(r){globalThis.__over=r;}
`;
  const store={};
  let _rs=(+process.env.RS||0)>>>0;const MathR=Object.create(Math);if(_rs){MathR.random=function(){_rs=(_rs+0x6D2B79F5)>>>0;let t=_rs;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}else MathR.random=Math.random;
  const sandbox={window:{},document:{getElementById:()=>({})},localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v;}},console,Math:MathR,Date,Uint8Array,Float32Array,Int32Array,Uint32Array,Set,Map,Array,Object,Symbol,Number,String,JSON,performance,Infinity,NaN,parseFloat,parseInt,isNaN};
  vm.createContext(sandbox);
  vm.runInContext(code,sandbox,{filename:'sim.js'});
  vm.runInContext('globalThis.__run=(c)=>eval(c);',sandbox);
  vm.runInContext('globalThis.__API={newGame,step,get G(){return G},UDEF,BDEF,TICK}',sandbox);
  return Object.assign(sandbox.__API,{__run:(c)=>vm.runInContext(c,sandbox),sandbox});
};
