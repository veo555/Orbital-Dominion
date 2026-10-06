/* =========================================================================
   MENUS — main menu, pause, settings, help and the post-game report
   ========================================================================= */
const DIFF_DESC={easy:'Relaxed pace. No air units, no hero, no creeping.',normal:'A capable opponent: hero, air, expansions and counters.',hard:'Fast, efficient, relentless — and it reads your army.'};
const HELP_HTML=`
<h3>Goal</h3><p>Destroy <b>every enemy structure</b>. Both sides play by the same rules: fog of war, supply, eras, upgrades. Lose all of your structures and you are out.</p>
<h3>Controls</h3><div class="keys">
<div><b>Left click / drag</b><span>Select · box select</span></div>
<div><b>Right click</b><span>Move · attack · gather · repair · rally</span></div>
<div><b>Shift + right click</b><span>Queue waypoints and orders</span></div>
<div><b>Double / Ctrl + click</b><span>Select all of a type on screen</span></div>
<div><b>Q W E R · A S D F · Z X C V</b><span>Command card (same grid as the buttons)</span></div>
<div><b>A / S / Z</b><span>Attack-move · siege mode · learn hero skills</span></div>
<div><b>Ctrl + 1…9</b><span>Set a control group (Shift + 1…9 adds)</span></div>
<div><b>1…9</b><span>Recall group (press twice to jump the camera)</span></div>
<div><b>Tab</b><span>Cycle the active unit type in a selection</span></div>
<div><b>F1 / F2 / F3</b><span>Idle Hauler · whole army · hero</span></div>
<div><b>Space / Backspace</b><span>Jump to last alert · jump to your Hub</span></div>
<div><b>Wheel</b><span>Zoom</span></div>
<div><b>Middle-drag / arrows / edges</b><span>Pan the camera</span></div>
<div><b>Hold Alt</b><span>Show every health bar</span></div>
<div><b>M</b><span>Economy &amp; market panel</span></div>
<div><b>T</b><span>Cycle tax policy</span></div>
<div><b>O</b><span>Toggle objectives</span></div>
<div><b>+ / −</b><span>Game speed</span></div>
<div><b>P / Esc</b><span>Pause</span></div>
<div><b>H</b><span>This help</span></div>
</div>
<h3>Economy</h3><p><b>Crystals</b> come from patches; <b>ether</b> comes from geysers. For ether: select a Hauler → Build (<b>Z</b>) → <b>Ether Siphon</b> on a geyser, then right-click the Siphon (or the geyser) with Haulers. Rally a building onto a crystal patch or a Siphon and new Haulers start working at once. <b>Depots</b> are forward drop-off points. <b>Generators</b> (+8) and Hubs (+10) raise the supply cap (max 120). More builders on one structure build faster: time ∝ 3/(builders+2).</p>
<h3>Eras</h3><p>The Hub advances your <b>Era</b>. <b>Era II</b> (300 crystals + 100 ether, needs a Garrison) unlocks Rocketeers, Menders, Howitzers, Juggernauts, Skiffs, your unique unit, and the Forum, Exchange, Foundry and Airfield. <b>Era III</b> (500 crystals + 300 ether, needs an Armory) unlocks Titans and level-3 upgrades. Each era also adds +5 morale.</p>
<h3>Morale, Habitats &amp; taxes <small>(Caesar II)</small></h3><p>Habitats house 10 colonists each, who pay taxes every second. <b>Morale</b> = 56 + tax effect + Forums (+6 each, max 3) + era bonus + hero − recent losses + recent kills. It scales mining, building, repair and training speed by 85–115%. Colonists only settle above 45 morale and leave below 25. High taxes pay 4.6× more than low, but cost 32 morale points.</p>
<h3>Market &amp; trade routes <small>(Patrizier)</small></h3><p>An <b>Exchange</b> lets you swap crystals and ether at a shared price that wanders randomly (mean-reverting, with a slow seasonal swing) and moves 3.5% with every trade. <b>Freighters</b> shuttle between your Exchange and neutral <b>Trading Posts</b>: outbound payout = 0.6 × route length × post demand, plus 0.25 × length for the return cargo. Each delivery cuts that post's demand by 12% and it recovers slowly — spread your routes, and escort them.</p>
<h3>Heroes <small>(Warcraft III)</small></h3><p>Every faction has one <b>hero</b> trained at the Hub. Heroes level up from kills and creep camps (max level 6), learn an aura, an active skill and an ultimate (<b>Z</b> to learn, then hotkeys on the grid), and can be revived when they fall. Neutral <b>creep camps</b> guard the map; they sleep at night unless provoked and pay bounty and XP.</p>
<h3>Terrain, vision &amp; day/night <small>(StarCraft)</small></h3><p>The map has three height levels joined by ramps. <b>Units on low ground cannot see high ground</b>; flyers and <b>Watchtowers</b> can. Attacking reveals a unit for a moment. <b>Cloaked</b> units (Specters, Phase Veil) are visible only near detectors: Menders, Turrets, Hubs. A full day lasts 6 minutes; at night every sight radius shrinks by up to 38% and creeps sleep.</p>
<h3>Counters</h3><p>Rock-paper-scissors with armor classes: <b>Raptors/Reavers</b> shred light infantry and lose to <b>Juggernauts</b> and splash. <b>Rocketeers</b> crush armor and air. <b>Howitzers/Titans</b> have splash and wreck structures but are helpless up close. <b>Skiffs</b> ignore terrain but lose to Riflemen, Rocketeers and Turrets. <b>Menders</b> heal biological units. Hover any button for strengths and weaknesses.</p>
<h3>Swarm AI <small>(v3)</small></h3><p>Every unit can be an <b>agent</b>: it picks its own work, carries it out, earns a wallet, levels up and buys gear. Select units and use <b>Enroll as Agents</b> on the command card (or let the Overseer do it). A <b>master</b> — the <b>Overseer</b> — directs the whole colony and you can instruct it in plain words. Everything is optional and switchable at any time: <b>J</b> toggles the whole Swarm AI, <b>K</b> opens the panel (Overseer · Roster · Market · Ledger), <b>Enter</b> or <b>/</b> jumps to the command box. With the AI off the game plays exactly like v2; contracts you signed keep billing.</p>
<div class="keys">
<div><b>K</b><span>Swarm panel</span></div>
<div><b>J</b><span>Swarm AI on / off (master switch)</span></div>
<div><b>Enter or /</b><span>Tell the Overseer something</span></div>
<div><b>Right-click an agent</b><span>Your order wins; the agent resumes its work when it is done (Stop: it stays put for 20 s)</span></div>
</div>
<h3>Individual and collective control</h3><p><b>Individually:</b> select an agent and pick a role on the command card — Miner, Etherworker, Builder, Mechanic, Trader, Scout, Guard, Patrol, Hunter, Raider, Escort, Medic. Point roles (Guard, Patrol, Escort) ask for a spot or a unit. The info card says what the agent is doing and why. <b>Collectively:</b> the Overseer has seven <b>domains</b> — Supply, Economy, Allocation, Army, Technology, Trade, Labour — each <b>Off</b>, <b>Advise</b> (proposes, you approve with one click) or <b>Act</b>. The presets set them all at once: <b>Autopilot</b> (everything on Act), <b>Advisor</b> (everything on Advise), <b>Manual</b> (switched off). Policies refine it: commission, fleeing, field clinic, reacting to alarms, bounties, hunting, assaults.</p>
<h3>Telling the Overseer</h3><p>The command box understands plain sentences such as <i>"keep 14 miners"</i>, <i>"guard the natural with 4 riflemen"</i>, <i>"scout the map"</i>, <i>"hunt creeps"</i>, <i>"hire 2 miners by the day"</i>, <i>"take jobs"</i>, <i>"status"</i>, <i>"why"</i>. It reads your selection, the camera position and your control groups for words like <i>"these"</i>, <i>"here"</i> and <i>"group 2"</i>. <b>Honest note:</b> this is a deterministic grammar plus a rule engine — not a language model. It knows a few dozen phrasings and tells you plainly when it does not understand.</p>
<h3>How the Overseer decides</h3><p><b>Allocation by price signal:</b> for crystals and ether it compares demand (what queued buildings, units and eras will consume) with supply (income plus stock) and moves one worker at a time toward the scarcer resource, with hysteresis so it never oscillates. <b>Fights:</b> it estimates strength by the Lanchester product (total damage per second × total hit points). Creep camps are hunted only with a ≥3.6× edge, which the square law prices at roughly 15% casualties; raiders are never sent unless the army is 2.2× its running estimate of the enemy field army (sightings + unseen production − kills). <b>Defence is collective:</b> when armed raiders approach, every free armed agent rallies at one point between the Hub and the raiders, then strikes together. Large armies spread out when idle (area spells punish blobs), sidestep telegraphed orbital strikes, use Combat Stims when a fight starts and focus-fire an enemy hero (its area spells delete clumps of Riflemen). Armor is researched first because every point is a flat cut per hit. Now and then a fast unit scouts the enemy base so the estimate rests on a sighting; the map is a two-player layout, so the enemy's start corner is known, as it is to you. Abandoned foundations are finished by the nearest free worker, so a stranded Generator never blocks supply. Every decision lands in the log with its reason.</p>
<h3>The swarm economy</h3><p>Agents carry <b>wallets</b>: they earn a 5% commission on what they deliver and a bounty on kills, pay a fee at the field clinic when wounded, and buy <b>gear</b> (Mk I–III) and skill levels out of their own pocket. Wounded agents head for the Hub on their own; Haulers run for cover when armed enemies close in; nearby agents answer alarms. Wages, commissions and fees appear in the Ledger tab.</p>
<h3>Marketplace: hiring and jobs</h3><p>The <b>Market</b> tab has two halves. <b>Freelancers</b> offer to join you: pick a role and a billing cadence — <b>Minute</b>, <b>Hour</b>, <b>Day</b>, <b>Month</b> or <b>per Task</b>. Short cadences cost a flexibility premium and are <b>floating</b> (re-priced every period at the spot wage index W(t), which wanders as a mean-reverting random process with occasional shocks, and rises when you hire many); long cadences are discounted and <b>locked</b> at signing — a hedge. You pay in advance; if the treasury cannot cover two periods in a row the freelancer quits. You can give notice (they work out the period) or dismiss them at once. The <b>Job board</b> works the other way round: neutral clients (Helios, Kestrel, Vantage, Bastion) post tasks — couriers, camp clearing, mining quotas, guard and relay retainers — and your agents take them for pay. Task contracts are held in escrow and refunded if the job fails; retainers pay at the end of each period in proportion to time on station, and a client can terminate a short retainer.</p>
<p><small><b>Calendar abstraction:</b> one colony <i>minute</i> is 10 s of game time, an <i>hour</i> 60 s, a <i>day</i> 360 s (one full day/night cycle) and a <i>month</i> 2160 s — so every cadence is playable inside one match. The wage and fee numbers are tuned for game balance, not taken from real labour markets.</small></p>
<h3>Factions</h3><p><b>Meridian</b>: structures +20% HP, repairs cost half, Bulwark shield-walker. <b>Obsidian</b>: units train 8% faster, cheaper Raptors, life-stealing Reaver. <b>Aurora</b>: +30% trade profit, Haulers carry +1 per trip, Exchange 40% cheaper, permanently cloaked Specter.</p>`;

function buildMenus(){
  const fr=$('facRow');let h='';
  for(const id of FACTION_IDS){const F=FACTIONS[id];
    h+='<div class="fac" data-f="'+id+'" style="--c:'+F.col.base+';--g:'+F.col.glow+'"><div class="fic"><img src="'+iconURL('u:'+F.hero+':'+id)+'"><img src="'+iconURL('u:'+F.unique+':'+id)+'"><img src="'+iconURL('b:hub:'+id)+'"></div><b>'+F.name+'</b><i>'+F.tag+'</i><ul>'+F.bonus.map(x=>'<li>'+x+'</li>').join('')+'</ul><p>'+F.blurb+'</p></div>';}
  fr.innerHTML=h;
  $('enemyRow').innerHTML=['random'].concat(FACTION_IDS).map(id=>'<button class="btn" data-e="'+id+'">'+(id==='random'?'Random':FACTIONS[id].name.split(' ')[0])+'</button>').join('');
  $('diffRow').innerHTML=['easy','normal','hard'].map(d=>'<button class="btn" data-d="'+d+'"><b>'+DIFF_NAMES[d]+'</b><span>'+DIFF_DESC[d]+'</span></button>').join('');
  $('helpBody').innerHTML=HELP_HTML;
  syncMenu();
}
function syncMenu(){
  for(const el of $('facRow').children)el.classList.toggle('sel',el.dataset.f===SET.faction);
  for(const el of $('enemyRow').children)el.classList.toggle('sel',el.dataset.e===SET.enemy);
  for(const el of $('diffRow').children)el.classList.toggle('sel',el.dataset.d===SET.diff);
  document.documentElement.style.setProperty('--acc',FACTIONS[SET.faction].col.base);document.documentElement.style.setProperty('--acc2',FACTIONS[SET.faction].col.glow);
  $('setMusic').value=SET.music*100;$('setSfx').value=SET.sfx*100;
  for(const k of['edge','voice','hints','shake','swarm','swarmHints'])$('set_'+k).checked=!!SET[k];
}
let overlayStack=[];
function showOverlay(id){for(const o of document.querySelectorAll('.overlay'))o.classList.toggle('hidden',o.id!==id);}
function hideOverlays(){for(const o of document.querySelectorAll('.overlay'))o.classList.add('hidden');}
function openSub(id){overlayStack.push(currentOverlay());showOverlay(id);}
function currentOverlay(){const o=document.querySelector('.overlay:not(.hidden)');return o?o.id:null;}
function closeSub(){const prev=overlayStack.pop();if(prev)showOverlay(prev);else hideOverlays();}

function showEnd(){
  const res=ui.endRes,win=res==='victory';ui.endRes=null;
  const T0=G.teams[0],T1=G.teams[1];
  $('endTitle').textContent=win?'Victory':'Defeat';$('endTitle').className=win?'win':'lose';
  $('endSub').textContent=win?'All enemy structures have been destroyed.':'Your last structure has fallen.';
  const row=(l,a,b)=>'<tr><td>'+l+'</td><td class="p0">'+a+'</td><td class="p1">'+b+'</td></tr>';
  $('endStats').innerHTML='<table><tr><th></th><th class="p0">You · '+FACTIONS[T0.faction].name+'</th><th class="p1">Enemy · '+FACTIONS[T1.faction].name+'</th></tr>'+
    row('Game length',fmtTime(G.overT||G.time),'')+row('Final era',ERAS[T0.era].rom,ERAS[T1.era].rom)+row('Enemy units destroyed',T0.kills,T1.kills)+row('Units lost',T0.lost,T1.lost)+
    row('Crystals mined',Math.round(T0.minedC),Math.round(T1.minedC))+row('Ether mined',Math.round(T0.minedE),Math.round(T1.minedE))+row('Tax income',Math.round(T0.taxEarn),Math.round(T1.taxEarn))+row('Trade income',Math.round(T0.tradeEarn),Math.round(T1.tradeEarn))+
    row('Structures built',T0.built,T1.built)+row('Hero level',T0.hero.level,T1.hero.level)+row('Creeps slain',T0.creeps||0,T1.creeps||0)+'</table>';
  drawChart($('chartArmy'),'Army supply','a');drawChart($('chartEco'),'Resources gathered','m');
  showOverlay('endMenu');
}
function drawChart(cvs,title,key){
  const g=cvs.getContext('2d'),W=cvs.width,H=cvs.height,s=G.stats;g.clearRect(0,0,W,H);
  g.fillStyle='rgba(255,255,255,.04)';g.fillRect(0,0,W,H);g.fillStyle='#9fb6cf';g.font='11px system-ui';g.fillText(title,8,14);
  if(s.length<2)return;let mx=1;for(const p of s)mx=Math.max(mx,p[key+'0'],p[key+'1']);const t1=s[s.length-1].t;
  g.strokeStyle='rgba(255,255,255,.1)';g.lineWidth=1;for(let i=1;i<4;i++){g.beginPath();g.moveTo(0,H*i/4);g.lineTo(W,H*i/4);g.stroke();}
  for(let t=0;t<2;t++){g.strokeStyle=G.teams[t].pal.base;g.lineWidth=2;g.beginPath();s.forEach((p,i)=>{const x=6+p.t/t1*(W-12),y=H-8-(p[key+t]/mx)*(H-30);i?g.lineTo(x,y):g.moveTo(x,y);});g.stroke();}
  g.fillStyle='#667a90';g.fillText('max '+Math.round(mx),W-62,14);
}
