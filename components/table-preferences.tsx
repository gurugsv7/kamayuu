'use client';
import {Switch} from '@/components/ui/switch';
import type {restoreSettings} from '@/lib/table-settings.mjs';

type Settings = ReturnType<typeof restoreSettings>;
export default function TablePreferences({settings,onChange,onUnlock,online}:{
 settings:Settings;onChange:(key:keyof Settings,value:boolean)=>void;onUnlock:()=>void;online:boolean;
}){
 const toggle=(key:keyof Settings,label:string)=><label key={key}><span>{label}</span><Switch checked={Boolean(settings[key])} onCheckedChange={value=>{if(key==='sound')onUnlock();onChange(key,value);}}/></label>;
 return <>
  <div className="preference-group" aria-label="Sound and motion">
   {toggle('sound','Table sounds')}
   {toggle('haptics','Haptics')}
   {toggle('motion','Shorter movements')}
  </div>
  {online&&<div className="preference-group" aria-label="Opponent controls">
   {toggle('muteEmotes','Mute opponent emotes')}
   {toggle('muteMessages','Mute opponent messages')}
   {toggle('allowRematches','Allow rematch requests')}
  </div>}
 </>;
}
