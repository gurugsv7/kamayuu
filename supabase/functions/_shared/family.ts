import {enforceFamily,familyPacket,familyPermissions} from './family-policy.mjs';
export async function familyAccount(server:any,user:string){
 const {data,error}=await server.rpc('family_state',{p_user:user});
 if(error)throw Error('Family safety settings are unavailable. Try again shortly.');
 return data;
}
export async function familyGuard(server:any,user:string,input:any){
 const account=await familyAccount(server,user);
 enforceFamily(account,input);
 if(account.age_band==='under_13'&&['create','join'].includes(input.command))input.name=account.alias;
 if(account.age_band==='under_13'&&input.command==='preferences'&&!familyPermissions(account).rematches)input.allowRematches=false;
 return account;
}
export async function safePacket(server:any,user:string,packet:any){return familyPacket(packet,await familyAccount(server,user));}
