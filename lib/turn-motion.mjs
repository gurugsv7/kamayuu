// Cosmetic movement only: no delayed board writes or gameplay locks. Event faces
// have already been redacted by playerPacket; never infer an opponent's cards.
export function turnFlights(events){
 return events.flatMap(e=>{
  const pos=`p${e.p}-${e.i}`,held=`held${e.p}`;
  if(e.type==='discard')return [{from:held,to:'discard',card:e.card,p:e.p}];
  if(e.type==='replace')return [{from:pos,to:'discard',card:e.old,p:e.p},{from:held,to:pos,card:e.p===0||e.public?e.card:null,p:e.p}];
  if(e.type==='swap')return [{from:pos,to:`p${e.target}-${e.i}`,card:e.outgoing||null,p:e.p},{from:`p${e.target}-${e.i}`,to:pos,card:e.incoming||null,p:e.p}];
  if(e.type==='match')return e.ok?[{from:pos,to:'discard',card:e.card,p:e.p}]:[{from:'discard',to:`p${e.p}-${e.penaltyIndex}`,card:e.penalty,p:e.p}];
  if(e.type==='peek')return [{from:pos,to:pos,card:e.card||null,p:e.p}];
  return [];
 });
}
