export function expectedScore(a,b){
  return 1/(1+10**((b-a)/400));
}

export function blendedActualScore({result, gamesFor=0, gamesAgainst=0, gameShareWeight=0.15}){
  const matchScore=result==="win"?1:result==="draw"?0.5:0;
  const total=gamesFor+gamesAgainst;
  const gameShare=total>0?gamesFor/total:matchScore;
  return (1-gameShareWeight)*matchScore + gameShareWeight*gameShare;
}

export function ratingDelta({rating, opponentRating, result, gamesFor, gamesAgainst, k=24, gameShareWeight=0.15}){
  const expected=expectedScore(rating,opponentRating);
  const actual=blendedActualScore({result,gamesFor,gamesAgainst,gameShareWeight});
  return k*(actual-expected);
}

export function applyRatedMatch(a,b,match,cfg){
  const aActual = match.resultA;
  const bActual = aActual==="win"?"loss":aActual==="loss"?"win":"draw";
  const da=ratingDelta({
    rating:a.rating,opponentRating:b.rating,result:aActual,
    gamesFor:match.gamesA,gamesAgainst:match.gamesB,
    k:cfg.kFactor,gameShareWeight:cfg.gameShareWeight
  });
  const db=ratingDelta({
    rating:b.rating,opponentRating:a.rating,result:bActual,
    gamesFor:match.gamesB,gamesAgainst:match.gamesA,
    k:cfg.kFactor,gameShareWeight:cfg.gameShareWeight
  });
  // Compute simultaneously from pre-match ratings.
  a.rating+=da;
  b.rating+=db;
  return {deltaA:da,deltaB:db};
}

export function eligible(player,cfg){
  return player.leagueEventIds.size>=cfg.minimumLeagueEvents &&
         player.ratedMatches>=cfg.minimumRatedMatches;
}
