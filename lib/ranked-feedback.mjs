export function rankedFailure(error){
 const message=error instanceof Error?error.message:String(error||'');
 const auth=error?.status===401||/sign in|session expired/i.test(message);
 return auth?{auth:true,title:'Your seat is waiting',message:'Sign in again to return to the ranked tables.',action:'Sign in'}:
 {auth:false,title:'Let’s reconnect your table',message:'We couldn’t reach ranked just now. Try again to check your match and continue.',action:'Try again'};
}
