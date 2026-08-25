import test from "node:test";import assert from "node:assert/strict";
import {expectedScore,blendedActualScore,ratingDelta,eligible} from "../src/rating.js";
test("equal Elo expects .5",()=>assert.equal(expectedScore(1500,1500),.5));
test("narrow loss is softer than sweep loss",()=>{
 const narrow=Math.abs(ratingDelta({rating:1500,opponentRating:1500,result:"loss",gamesFor:1,gamesAgainst:2,k:24,gameShareWeight:.15}));
 const sweep=Math.abs(ratingDelta({rating:1500,opponentRating:1500,result:"loss",gamesFor:0,gamesAgainst:2,k:24,gameShareWeight:.15}));
 assert.ok(narrow<sweep);
});
test("2-0 win scores more strongly than 2-1",()=>{
 const sweep=blendedActualScore({result:"win",gamesFor:2,gamesAgainst:0,gameShareWeight:.15});
 const narrow=blendedActualScore({result:"win",gamesFor:2,gamesAgainst:1,gameShareWeight:.15});
 assert.ok(sweep>narrow);
});
test("eligibility needs 3 league events and 8 rated matches",()=>{
 assert.equal(eligible({leagueEventIds:new Set([1,2,3]),ratedMatches:8},{minimumLeagueEvents:3,minimumRatedMatches:8}),true);
 assert.equal(eligible({leagueEventIds:new Set([1,2]),ratedMatches:12},{minimumLeagueEvents:3,minimumRatedMatches:8}),false);
});
