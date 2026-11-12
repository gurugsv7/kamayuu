import {Capacitor,registerPlugin,type PluginListenerHandle} from '@capacitor/core';
import {App} from '@capacitor/app';
import {Network} from '@capacitor/network';
import {Haptics,ImpactStyle,NotificationType} from '@capacitor/haptics';
import {SplashScreen} from '@capacitor/splash-screen';
import {secureAuthStorage} from './mobile-policy.mjs';
export const isNative=()=>Capacitor.isNativePlatform();
interface NativeBridge {
 signIn(options:{clientId:string;nonce:string}):Promise<{idToken:string}>;
 clearSignIn():Promise<void>;
 getItem(options:{key:string}):Promise<{value:string|null}>;
 setItem(options:{key:string;value:string}):Promise<void>;
 removeItem(options:{key:string}):Promise<void>;
}
export const NativeIdentity=registerPlugin<NativeBridge>('KamayuuIdentity');
// Supabase supports asynchronous storage adapters. Tokens never enter plain
// WebView localStorage on Android; native AES-GCM keys live in Android Keystore.
export const nativeAuthStorage=secureAuthStorage(NativeIdentity);
let connected:boolean|undefined;
export const connectionAvailable=()=>connected??(typeof navigator==='undefined'||navigator.onLine);
export function nativeVibrate(pattern:number|number[]){
 if(!isNative()){if(typeof navigator!=='undefined')navigator.vibrate?.(pattern);return;}
 void (Array.isArray(pattern)?Haptics.notification({type:NotificationType.Warning}):Haptics.impact({style:ImpactStyle.Light})).catch(()=>{});
}
export async function initializeNative(){
 if(!isNative())return;
 document.documentElement.classList.add('native-app');
 const update=(value:boolean)=>{const previous=connected;connected=value;document.documentElement.dataset.connection=value?'online':'offline';if(previous!==value)window.dispatchEvent(new Event(value?'online':'offline'));};
 try{update((await Network.getStatus()).connected);await Network.addListener('networkStatusChange',s=>update(s.connected));}catch{}
 await App.addListener('appStateChange',({isActive})=>window.dispatchEvent(new CustomEvent('kamayuu:app-state',{detail:{isActive}})));
 // Static local legal pages should stay inside the app instead of opening an
 // external browser at https://localhost. External URLs use the system browser.
 document.addEventListener('click',event=>{const link=(event.target as Element)?.closest<HTMLAnchorElement>('a[href]');if(link&&link.origin===location.origin&&link.target==='_blank'){event.preventDefault();location.assign(link.pathname+link.search+link.hash);}});
}
export function hideNativeSplash(){if(isNative())void SplashScreen.hide({fadeOutDuration:180}).catch(()=>{});}
export async function nativeBack(handler:()=>void):Promise<PluginListenerHandle|null>{return isNative()?App.addListener('backButton',handler):null;}
export function minimizeNative(){void App.minimizeApp();}
