// Procedural, short tactile sounds. Audio starts only after a user gesture.
export class TableAudio {
 constructor(){this.ctx=null;this.enabled=true;this.haptics=true;}
 unlock(){if(!this.ctx){const A=window.AudioContext||window.webkitAudioContext;if(A)this.ctx=new A();}this.ctx?.resume();}
 play(kind='slide',side=0){if(!this.enabled||!this.ctx)return;const c=this.ctx,t=c.currentTime;const gain=c.createGain();const pan=c.createStereoPanner();pan.pan.value=side*.35;gain.connect(pan);pan.connect(c.destination);
 const tones={buzz:[75,.5,'sawtooth'],win:[659,.65,'sine'],lose:[174,.45,'triangle'],peek:[880,.22,'sine'],swap:[440,.32,'sine'],zero:[1047,.45,'sine'],success:[784,.22,'triangle'],fail:[110,.2,'sawtooth'],flip:[280,.08,'triangle'],deal:[190,.045,'triangle'],slide:[130,.1,'triangle'],impact:[95,.1,'triangle']};
 const [f,d,type]=tones[kind]||tones.slide;const osc=c.createOscillator();osc.type=type;osc.frequency.setValueAtTime(f,t);osc.frequency.exponentialRampToValueAtTime(kind==='buzz'?35:f*.65,t+d);gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(kind==='buzz'?.14:.065,t+.008);gain.gain.exponentialRampToValueAtTime(.0001,t+d);osc.connect(gain);osc.start(t);osc.stop(t+d+.02);osc.onended=()=>{osc.disconnect();gain.disconnect();pan.disconnect();};
 if(this.haptics&&navigator.vibrate&&['buzz','success','fail','impact'].includes(kind))navigator.vibrate(kind==='buzz'?[35,20,60]:kind==='fail'?[15,20,15]:12);
 }
}
