'use client';
import {useSyncExternalStore} from 'react';
import {connectionAvailable} from '@/lib/native';
const subscribe=(change:()=>void)=>{window.addEventListener('online',change);window.addEventListener('offline',change);return()=>{window.removeEventListener('online',change);window.removeEventListener('offline',change);};};
export default function ConnectionStatus(){
 const online=useSyncExternalStore(subscribe,connectionAvailable,()=>true);
 return online?null:<output className="connection-banner">Offline · Practice is available. Online play needs a connection.</output>;
}
