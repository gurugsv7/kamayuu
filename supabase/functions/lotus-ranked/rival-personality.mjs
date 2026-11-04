export const EMOTES=Object.freeze(['haha','angry','noooo','crying','cool']);
export const QUICK_MESSAGES=Object.freeze(['Good luck!','Nice move!','Oops!','Well played!','Your turn!']);
export function rivalRoll(seed,key) {
  let h=seed>>>0;
  for(const c of key){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}
  h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;
  return (h>>>0)/4294967296;
}
export function rivalTraits(config) {
  return {patient:{socialChance:0.13,rematchChance:0.35,lossBonus:0.1,pace:1.12},
    opportunist:{socialChance:0.3,rematchChance:0.7,lossBonus:0.17,pace:0.95},
    tracker:{socialChance:0.2,rematchChance:0.5,lossBonus:0.1,pace:1}}[config.styleId] ||
    {socialChance:0.15,rematchChance:0.5,lossBonus:0.1,pace:1};
}
export function rivalDelay(config,phase,action,key,reaction=false) {
  const sample=rivalRoll(config.seed,`pace:${key}`);
  if(reaction)return Math.round(config.reactionMinMs+sample*(config.reactionMaxMs-config.reactionMinMs));
  const [min,max]=phase==='memory'?[4000,8000]:action?.type==='buzz'?[2000,5000]:
    phase==='swap'||phase==='swapConfirm'?[2000,3500]:phase==='decision'||phase==='peek'?[2000,4500]:[1200,2800];
  return Math.round((min+sample*(max-min))*rivalTraits(config).pace);
}
export function rematchPersonality(record) {
  const bot=record.participants.find(p=>p.kind==='bot');
  if(!bot)return {offer:false,accept:false,offerDelayMs:4000,replyDelayMs:3000};
  const cfg=bot.bot_config,traits=rivalTraits(cfg),s=record.data.state;
  const lost=!s.winners.includes(bot.seat),gap=Math.abs(s.totals[0]-s.totals[1]);
  const close=gap<=8,series=record.series_index||1;
  const chance=Math.max(0.05,traits.rematchChance+(lost?traits.lossBonus:0)+(close?0.12:-0.15)-Math.max(0,series-2)*0.12);
  return {offer:rivalRoll(cfg.seed,`offer:${record.id}`)<chance*0.65,
    accept:rivalRoll(cfg.seed,`accept:${record.id}`)<chance,
    offerDelayMs:3000+Math.round(rivalRoll(cfg.seed,`offer-delay:${record.id}`)*3000),
    replyDelayMs:2000+Math.round(rivalRoll(cfg.seed,`reply-delay:${record.id}`)*3000)};
}
export function queueRivalSocial(room,participants,events,now) {
  const ranked=room.ranked ||= {};
  if(ranked.pendingSocial || (ranked.socialCount||0)>=4 || now-(ranked.lastSocialAt??-Infinity)<15000)return;
  for(const bot of participants.filter(p=>p.kind==='bot')) {
    if(events.some(e=>e.type==='final')&&rivalRoll(bot.bot_config.seed,`finish:${room.matchId}`)<0.5){
      appendSocial(room,{type:'message',text:'Well played!',p:bot.seat},now+2000);
      ranked.socialCount=(ranked.socialCount||0)+1;return;
    }
    const relevant=events.find(e=>(e.type==='match' || e.type==='swap') && e.p!==undefined);
    if(!relevant || room.state.phase==='finished')continue;
    const cfg=bot.bot_config,key=`${room.state.turn}:${relevant.type}:${relevant.p}`;
    if(rivalRoll(cfg.seed,`social:${key}`)>rivalTraits(cfg).socialChance)continue;
    const own=relevant.p===bot.seat;
    const event=relevant.type==='match' && !relevant.ok && own ?
      cfg.styleId==='tracker'?{type:'message',text:'Oops!'}:{type:'emote',name:cfg.styleId==='opportunist'?'angry':'noooo'} :
      own?{type:'emote',name:rivalRoll(cfg.seed,`celebrate:${key}`)<0.25?'haha':'cool'}:{type:'message',text:'Nice move!'};
    ranked.pendingSocial={due:now+1200+Math.round(rivalRoll(cfg.seed,`social-delay:${key}`)*1700),event:{...event,p:bot.seat}};
  }
}
export function appendSocial(room,event,now) {
  const ranked=room.ranked ||= {};
  ranked.socialSeq=(ranked.socialSeq||0)+1;
  ranked.socialFeed=[...(ranked.socialFeed||[]),{...event,id:ranked.socialSeq,at:now}].slice(-20);
}
