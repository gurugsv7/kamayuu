export const TABLE_DEFAULTS=Object.freeze({players:4,difficulty:'medium',sound:true,haptics:true,motion:false,muteEmotes:false,muteMessages:false,allowRematches:true});
/** @returns {{players:number,difficulty:string,sound:boolean,haptics:boolean,motion:boolean,muteEmotes:boolean,muteMessages:boolean,allowRematches:boolean}} */
export function restoreSettings(value) {
  const result={...TABLE_DEFAULTS};
  if(!value||typeof value!=='object')return result;
  for(const key of ['sound','haptics','motion','muteEmotes','muteMessages','allowRematches'])if(typeof value[key]==='boolean')result[key]=value[key];
  if([2,3,4].includes(value.players))result.players=value.players;
  if(['easy','medium','hard'].includes(value.difficulty))result.difficulty=value.difficulty;
  return result;
}
