'use client';
import {useRef,useState,type ButtonHTMLAttributes,type ReactNode} from 'react';

export function ActivityMark(){return <span className="activity-mark" aria-hidden="true"/>;}

/** Owns request feedback; callers retain their existing error handling. */
export default function ActionButton({children,busy=false,busyLabel='Please wait…',onAction,disabled,className='',...props}:Omit<ButtonHTMLAttributes<HTMLButtonElement>,'onClick'> & {children:ReactNode;busy?:boolean;busyLabel?:string;onAction:()=>void|Promise<void>}){
 const locked=useRef(false),[pending,setPending]=useState(false);
 const loading=busy||pending;
 return <button {...props} type={props.type||'button'} className={`primary action-button ${className}`} disabled={disabled||loading} aria-busy={loading} onClick={async()=>{
  if(locked.current||loading)return;locked.current=true;setPending(true);
  try{await onAction();}finally{locked.current=false;setPending(false);}
 }}><span className="action-button-label">{loading&&<ActivityMark/>}{loading?busyLabel:children}</span></button>;
}
