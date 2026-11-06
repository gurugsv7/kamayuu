export function backAction({panel,tutorial,menu,online}){
 if(panel)return 'close-panel';
 if(tutorial)return 'close-tutorial';
 if(!menu||online)return 'settings';
 return 'minimize';
}
export function soloCanAdvance({hidden,active,panel}){return !hidden&&active&&!panel;}
export function roomShareUrl(native,origin){return native?'https://kamayuu.builtbygsv.in':origin;}
export function secureAuthStorage(plugin){
 return {
  getItem:async(key)=>(await plugin.getItem({key})).value,
  setItem:async(key,value)=>{await plugin.setItem({key,value});},
  removeItem:async(key)=>{await plugin.removeItem({key});},
 };
}
