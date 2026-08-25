import {loadPrivateSnapshot} from "./private-snapshot.js";
import fs from "node:fs/promises";

const CONFIG=JSON.parse(await fs.readFile("config.json","utf8"));
const OPTINS=JSON.parse(await fs.readFile(CONFIG.privacy.optInFile,"utf8"));

function norm(s){return String(s??"").trim().toLowerCase();}
const optMap=new Map((OPTINS.players||[]).map(p=>[norm(p.playHubName),p]));

const snapshot=await loadPrivateSnapshot();
const previous=await fs.readFile("public/data/rankings.json","utf8").then(JSON.parse).catch(()=>null);
const prevByName=new Map((previous?.players||[]).filter(p=>p.optedIn&&p.name).map(p=>[norm(p.name),p.rank]));

const publicPlayers=snapshot.players.map((p,i)=>{
  const rank=i+1;
  const oi=optMap.get(norm(p.playHubName));
  if(!oi) return {rank,optedIn:false};
  const name=(oi.publicName||p.playHubName).trim();
  return {
    rank,optedIn:true,name,
    rating:Math.round(p.rating),
    previousRank:prevByName.get(norm(name))??null,
    matches:{w:p.wins,l:p.losses,d:p.draws},
    games:{w:p.gameWins,l:p.gameLosses},
    leagueEvents:p.leagueEvents,
    ratedEvents:p.ratedEvents,
    ratedMatches:p.ratedMatches
  };
});
const topPublic=publicPlayers.find(p=>p.optedIn)||null;
const payload={
  generatedAt:snapshot.generatedAt,
  preview:false,
  window:snapshot.window,
  stores:snapshot.stores,
  methodology:snapshot.methodology,
  highScore:topPublic?{rank:topPublic.rank,name:topPublic.name,rating:topPublic.rating}:null,
  players:publicPlayers,
  diagnostics:{
    eligiblePlayers:publicPlayers.length,
    optedInEligiblePlayers:publicPlayers.filter(p=>p.optedIn).length
  }
};
await fs.writeFile("public/data/rankings.json",JSON.stringify(payload,null,2)+"\n");
await fs.writeFile("data/weekly-meta.json",JSON.stringify({
  generatedAt:snapshot.generatedAt,
  eligiblePlayers:publicPlayers.length,
  optedInEligiblePlayers:publicPlayers.filter(p=>p.optedIn).length
},null,2)+"\n");
console.log(`Published ${publicPlayers.length} placements; ${payload.diagnostics.optedInEligiblePlayers} named opt-ins.`);
