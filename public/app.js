const $=s=>document.querySelector(s);
const data=await fetch(`./data/rankings.json?v=${Date.now()}`,{
  cache:'no-store',
  headers:{'Cache-Control':'no-cache'}
}).then(r=>{
  if(!r.ok) throw new Error(`Could not load rankings (${r.status})`);
  return r.json();
});
const list=$('#leaderboard'), toggle=$('#anonToggle');
const hi=data.highScore || data.players.find(p=>p.optedIn) || null;
$('#highScore').textContent=hi?.rating!=null?String(hi.rating).padStart(5,'0'):'-----';
$('#playerOneScore').textContent=hi?.rating!=null?String(hi.rating).padStart(5,'0'):'-----';
$('#highScoreName').textContent=(hi?.name||'NO PLAYER').toUpperCase();

function mv(p){if(p.previousRank==null)return ['NEW','up'];const d=p.previousRank-p.rank;if(d>0)return [`▲ ${d}`,'up'];if(d<0)return [`▼ ${Math.abs(d)}`,'down'];return ['—','same']}
function rec(x){return `${x.w}-${x.l}-${x.d}`}
function render(){
 const visible=data.players.filter(p=>p.optedIn||toggle.checked);
 list.innerHTML=visible.map(p=>{
   const [m,c]=mv(p);
   if(!p.optedIn)return `<div class="score-row anon"><div class="rank">${String(p.rank).padStart(2,'0')}</div><div class="name">ANONYMOUS</div><div class="pwr">••••</div><div class="match">HIDDEN</div><div class="game">HIDDEN</div><div class="trend">—</div></div>`;
   return `<div class="score-row" data-rank="${p.rank}"><div class="rank">${String(p.rank).padStart(2,'0')}</div><div class="name">${p.name.toUpperCase()}</div><div class="pwr">${p.rating}</div><div class="match">${rec(p.matches)}</div><div class="game">${p.games.w}-${p.games.l}</div><div class="trend ${c}">${m}</div></div>`;
 }).join('');
 document.querySelectorAll('.score-row[data-rank]').forEach(el=>el.onclick=()=>showCard(data.players.find(p=>p.rank===+el.dataset.rank)));
 updateThumb();
}
function showCard(p){
 $('#playerCard').classList.remove('hidden');
 $('#cardName').textContent=p.name.toUpperCase();
 $('#cardPower').textContent=`${p.rating} PWR`;
 $('#cardStats').innerHTML=`<p><strong>Match:</strong> ${rec(p.matches)} · <strong>Game:</strong> ${p.games.w}-${p.games.l}</p><p><strong>League events:</strong> ${p.leagueEvents} · <strong>Rated events:</strong> ${p.ratedEvents}</p>`;
}
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).classList.add('hidden'));
$('#playerCard').onclick=e=>{if(e.target.id==='playerCard')$('#playerCard').classList.add('hidden')};
$('#optInModal').onclick=e=>{if(e.target.id==='optInModal')$('#optInModal').classList.add('hidden')};

function openOptIn(action){
 $('#optInModal').classList.remove('hidden');
 $('#actionChoice').value=action;
 $('#formSuccess').classList.add('hidden');
}
$('#joinButton').onclick=()=>openOptIn('Join the leaderboard');
$('#manageButton').onclick=()=>openOptIn('Update my leaderboard name');

$('#actionChoice').onchange=()=>{
 const remove=$('#actionChoice').value==='Remove me from the leaderboard';
 $('#consent').required=!remove;
};
$('#optInForm').onsubmit=e=>{
 e.preventDefault();
 const remove=$('#actionChoice').value==='Remove me from the leaderboard';
 if(!remove && !$('#consent').checked){
   alert('Please check the consent box to join or update the public leaderboard.');
   return;
 }
 $('#formSuccess').classList.remove('hidden');
};

toggle.onchange=render;
$('#stores').innerHTML=data.stores.map(s=>`<div class="store">${s}</div>`).join('');

function updateThumb(){
 const track=$('.rail-track'), thumb=$('#railThumb');
 const max=list.scrollHeight-list.clientHeight;
 if(max<=0){thumb.style.top='0px';thumb.style.height='100%';return}
 const ratio=list.clientHeight/list.scrollHeight;
 const h=Math.max(48,track.clientHeight*ratio);
 thumb.style.height=`${h}px`;
 thumb.style.top=`${(track.clientHeight-h)*(list.scrollTop/max)}px`;
}

const railThumb=$('#railThumb');
const railTrack=$('.rail-track');
let draggingThumb=false;
let dragStartY=0;
let dragStartTop=0;

railThumb.style.cursor='grab';

railThumb.addEventListener('pointerdown',e=>{
  draggingThumb=true;
  dragStartY=e.clientY;
  dragStartTop=parseFloat(railThumb.style.top)||0;
  railThumb.setPointerCapture(e.pointerId);
  railThumb.style.cursor='grabbing';
  e.preventDefault();
});

railThumb.addEventListener('pointermove',e=>{
  if(!draggingThumb) return;
  const maxScroll=list.scrollHeight-list.clientHeight;
  if(maxScroll<=0) return;

  const maxTop=Math.max(0,railTrack.clientHeight-railThumb.offsetHeight);
  const nextTop=Math.min(maxTop,Math.max(0,dragStartTop+(e.clientY-dragStartY)));
  const ratio=maxTop ? nextTop/maxTop : 0;
  list.scrollTop=ratio*maxScroll;
  e.preventDefault();
});

function stopThumbDrag(e){
  if(!draggingThumb) return;
  draggingThumb=false;
  railThumb.style.cursor='grab';
  try{ railThumb.releasePointerCapture(e.pointerId); }catch{}
}
railThumb.addEventListener('pointerup',stopThumbDrag);
railThumb.addEventListener('pointercancel',stopThumbDrag);

railTrack.addEventListener('pointerdown',e=>{
  if(e.target===railThumb) return;
  const rect=railTrack.getBoundingClientRect();
  const clickY=e.clientY-rect.top;
  const thumbCenter=(parseFloat(railThumb.style.top)||0)+(railThumb.offsetHeight/2);
  const direction=clickY<thumbCenter?-1:1;
  list.scrollBy({top:direction*list.clientHeight*.85,behavior:'smooth'});
});

list.addEventListener('scroll',updateThumb);
window.addEventListener('resize',updateThumb);
$('#scrollUp').onclick=()=>list.scrollBy({top:-180,behavior:'smooth'});
$('#scrollDown').onclick=()=>list.scrollBy({top:180,behavior:'smooth'});
render();
