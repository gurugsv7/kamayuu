import type {CapacitorConfig} from '@capacitor/cli';
const config:CapacitorConfig={
 appId:'in.builtbygsv.kamayuu',appName:'Kamayuu',webDir:'dist-mobile',
 loggingBehavior:'none',
 server:{hostname:'localhost',androidScheme:'https'},
 android:{backgroundColor:'#0b0e14',allowMixedContent:false},
 plugins:{SplashScreen:{launchAutoHide:false,backgroundColor:'#0b0e14',showSpinner:false,androidSplashResourceName:'kamayuu_logo',androidScaleType:'CENTER_INSIDE'},StatusBar:{style:'DARK',backgroundColor:'#0b0e14'}}
};
export default config;
