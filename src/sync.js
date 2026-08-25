import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {
  searchEventsByStore,
  fetchEventDetails,
  fetchTournamentRoundMatches
} from "unofficial-ravensburger-playhub-api";
import {applyRatedMatch,eligible} from "./rating.js";
import {savePrivateSnapshot} from "./private-snapshot.js";

const CONFIG=JSON.parse(await fs.readFile("config.json","utf8"));
const OPTINS=JSON.parse(await fs.readFile(CONFIG.privacy.optInFile,"utf8"));
const optMap=new Map((OPTINS.players||[]).map(p=>[norm(p.playHubName),p]));

function norm(s){return String(s??"").trim().toLowerCase();}
function isoDate(d){return d.toISOString().slice(0,10);}
function daysAgo(days){const d=new Date();d.setUTCDate(d.getUTCDate()-days);return d;}
function nameHas(name,patterns){const n=norm(name);return patterns.some(p=>n.includes(norm(p)));}
function classifyEvent(event){
  const name=event.name||"";
  if(nameHas(name,CONFIG.eligibility.setChampionshipPatterns)) return "setChampionship";
  if(nameHas(name,CONFIG.eligibility.prereleasePatterns)) return "prerelease";
  return "league";
}
function displayName(rel){
  return rel?.user_event_status?.best_identifier ||
         rel?.player?.best_identifier || "";
}
function playerKey(rel){
  if(rel?.player?.id!=null) return `id:${rel.player.id}`;
  const n=displayName(rel);
  return n?`name:${norm(n)}`:null;
}
function winnerSide(match,rels){
  const win=match.winning_player;
  if(win==null) return null;
  for(let i=0;i<rels.length;i++){
    if(rels[i]?.id===win || rels[i]?.player?.id===win) return i;
  }
  return null;
}
function gamesForSides(match,winnerIndex){
  const ww=Number(match.games_won_by_winner??0);
  const lw=Number(match.games_won_by_loser??0);
  if(winnerIndex===0) return [ww,lw];
  if(winnerIndex===1) return [lw,ww];
  return [0,0];
}
function getPlayer(players,key,name){
  if(!players.has(key)){
    players.set(key,{
      key,
      playHubName:name||"Unknown",
      rating:CONFIG.startingRating,
      wins:0,losses:0,draws:0,
      gameWins:0,gameLosses:0,
      ratedMatches:0,
      ratedEventIds:new Set(),
      leagueEventIds:new Set(),
      opponents:new Set()
    });
  } else if(name && players.get(key).playHubName==="Unknown"){
    players.get(key).playHubName=name;
  }
  return players.get(key);
}
async function allStoreEvents(storeId,startDate,endDate){
  const out=[];
  let page=1;
  while(true){
    const r=await searchEventsByStore({
      storeId,statuses:["past"],startDate,endDate,pageSize:100,page
    });
    if(r?.error) throw new Error(r.error);
    out.push(...(r.events||[]));
    if(!r.nextPage) break;
    page=r.nextPage;
  }
  return out;
}
async function allRoundMatches(roundId){
  const out=[];
  let page=1;
  while(true){
    const r=await fetchTournamentRoundMatches(roundId,page,100);
    out.push(...(r.results||[]));
    if(!r.next_page_number) break;
    page=r.next_page_number;
  }
  return out;
}
function flattenRounds(event){
  return (event.tournament_phases||[])
    .flatMap(phase=>(phase.rounds||[]).map(r=>({...r,phaseId:phase.id})))
    .sort((a,b)=>(a.round_number??0)-(b.round_number??0));
}
function publicPreviousMap(previous){
  const m=new Map();
  for(const p of previous?.players||[]){
    if(p.optedIn && p.name) m.set(norm(p.name),p.rank);
  }
  return m;
}
async function readPrevious(){
  try{return JSON.parse(await fs.readFile("public/data/rankings.json","utf8"))}
  catch{return null}
}

async function main(){
  const end=new Date();
  const start=daysAgo(CONFIG.windowWeeks*7);
  const startDate=isoDate(start),endDate=isoDate(end);
  const players=new Map();
  const eventSummaries=[];
  let totalRounds=0,totalMatches=0,skippedByes=0,skippedIds=0,fetchFailures=0;

  console.log(`Collecting ${CONFIG.windowWeeks} weeks: ${startDate} through ${endDate}`);
  for(const store of CONFIG.stores){
    console.log(`\n${store.name} (${store.storeId})`);
    let events=[];
    try{events=await allStoreEvents(store.storeId,startDate,endDate);}
    catch(e){console.warn(`  Event search failed: ${e.message}`);fetchFailures++;continue;}
    console.log(`  ${events.length} events found`);

    for(const eventStub of events.sort((a,b)=>new Date(a.start_datetime)-new Date(b.start_datetime))){
      let event;
      try{event=await fetchEventDetails(eventStub.id);}
      catch(e){console.warn(`  Event ${eventStub.id} details failed: ${e.message}`);fetchFailures++;continue;}
      const eventClass=classifyEvent(event);
      const rounds=flattenRounds(event);
      if(!rounds.length) continue;
      const ratingAllowed=eventClass==="league" || CONFIG.eligibility.specialEventsCountForRating;
      const leagueActivity=eventClass==="league";
      let eventRatedMatches=0;

      for(const round of rounds){
        let matches;
        try{matches=await allRoundMatches(round.id);}
        catch(e){console.warn(`  Round ${round.id} matches failed: ${e.message}`);fetchFailures++;continue;}
        totalRounds++;
        for(const match of matches){
          if(match.match_is_bye){skippedByes++;continue;}
          if(match.match_is_intentional_draw && !CONFIG.matchRules.intentionalDrawsCountForRating) continue;
          if(match.match_is_unintentional_draw && !CONFIG.matchRules.unintentionalDrawsCountForRating) continue;
          if(!ratingAllowed) continue;

          const rels=(match.player_match_relationships||[]).slice(0,2);
          if(rels.length<2) continue;
          const k0=playerKey(rels[0]),k1=playerKey(rels[1]);
          if(!k0||!k1){skippedIds++;continue;}
          const p0=getPlayer(players,k0,displayName(rels[0]));
          const p1=getPlayer(players,k1,displayName(rels[1]));
          const intentional=!!match.match_is_intentional_draw;
          const unintentional=!!match.match_is_unintentional_draw;
          let resultA,winnerIndex=null;
          if(intentional||unintentional){resultA="draw";}
          else{
            winnerIndex=winnerSide(match,rels);
            if(winnerIndex==null) continue;
            resultA=winnerIndex===0?"win":"loss";
          }
          const [g0,g1]=gamesForSides(match,winnerIndex);
          applyRatedMatch(p0,p1,{resultA,gamesA:g0,gamesB:g1},CONFIG);

          if(resultA==="draw"){p0.draws++;p1.draws++;}
          else if(resultA==="win"){p0.wins++;p1.losses++;}
          else{p0.losses++;p1.wins++;}
          p0.gameWins+=g0;p0.gameLosses+=g1;
          p1.gameWins+=g1;p1.gameLosses+=g0;
          p0.ratedMatches++;p1.ratedMatches++;
          p0.ratedEventIds.add(event.id);p1.ratedEventIds.add(event.id);
          if(leagueActivity){p0.leagueEventIds.add(event.id);p1.leagueEventIds.add(event.id);}
          p0.opponents.add(k1);p1.opponents.add(k0);
          totalMatches++;eventRatedMatches++;
        }
      }
      eventSummaries.push({
        id:event.id,name:event.name,storeId:store.storeId,storeName:store.name,
        date:event.start_datetime,class:eventClass,ratedMatches:eventRatedMatches
      });
    }
  }

  const eligiblePlayers=[...players.values()].filter(p=>eligible(p,CONFIG));
  eligiblePlayers.sort((a,b)=>b.rating-a.rating || b.wins-a.wins || a.losses-b.losses);

  const privateSnapshot={
    generatedAt:end.toISOString(),
    window:{start:startDate,end:endDate,weeks:CONFIG.windowWeeks},
    stores:CONFIG.stores.map(s=>s.name),
    methodology:{
      startingRating:CONFIG.startingRating,
      kFactor:CONFIG.kFactor,
      gameShareWeight:CONFIG.gameShareWeight,
      minimumLeagueEvents:CONFIG.minimumLeagueEvents,
      minimumRatedMatches:CONFIG.minimumRatedMatches,
      eligibilityNote:"Set Championships and prereleases count for rating but not league-event eligibility."
    },
    players:eligiblePlayers.map(p=>({
      playHubName:p.playHubName,
      rating:p.rating,
      wins:p.wins,losses:p.losses,draws:p.draws,
      gameWins:p.gameWins,gameLosses:p.gameLosses,
      ratedMatches:p.ratedMatches,
      ratedEvents:p.ratedEventIds.size,
      leagueEvents:p.leagueEventIds.size
    }))
  };

  const privateSave=await savePrivateSnapshot(privateSnapshot);
  console.log(`Private weekly snapshot saved (${privateSave.mode}).`);

  // Generate public leaderboard from the new private snapshot and current opt-in file.
  const previous=await readPrevious();
  const prevMap=publicPreviousMap(previous);
  const publicPlayers=privateSnapshot.players.map((p,i)=>{
    const rank=i+1;
    const oi=optMap.get(norm(p.playHubName));
    if(!oi) return {rank,optedIn:false};
    const publicName=(oi.publicName||p.playHubName).trim();
    return {
      rank,optedIn:true,name:publicName,
      rating:Math.round(p.rating),
      previousRank:prevMap.get(norm(publicName))??null,
      matches:{w:p.wins,l:p.losses,d:p.draws},
      games:{w:p.gameWins,l:p.gameLosses},
      leagueEvents:p.leagueEvents,
      ratedEvents:p.ratedEvents,
      ratedMatches:p.ratedMatches
    };
  });
  const topPublic=publicPlayers.find(p=>p.optedIn)||null;
  const payload={
    generatedAt:privateSnapshot.generatedAt,
    preview:false,
    window:privateSnapshot.window,
    stores:privateSnapshot.stores,
    methodology:privateSnapshot.methodology,
    highScore:topPublic?{rank:topPublic.rank,name:topPublic.name,rating:topPublic.rating}:null,
    players:publicPlayers,
    diagnostics:{
      eligiblePlayers:publicPlayers.length,
      optedInEligiblePlayers:publicPlayers.filter(p=>p.optedIn).length,
      events:eventSummaries.length,totalRounds,totalRatedMatches:totalMatches,
      skippedByes,skippedMissingIdentity:skippedIds,fetchFailures
    }
  };

  await fs.writeFile("public/data/rankings.json",JSON.stringify(payload,null,2)+"\n");
  await fs.writeFile("data/weekly-meta.json",JSON.stringify({
    generatedAt:privateSnapshot.generatedAt,
    eligiblePlayers:publicPlayers.length,
    optedInEligiblePlayers:publicPlayers.filter(p=>p.optedIn).length
  },null,2)+"\n");

  console.log(`\nSaved ${publicPlayers.length} eligible placements (${payload.diagnostics.optedInEligiblePlayers} opted in).`);
  console.log(`Rated matches: ${totalMatches}; event fetch failures: ${fetchFailures}`);
}
main().catch(e=>{console.error(e);process.exit(1);});
