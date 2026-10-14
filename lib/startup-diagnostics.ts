// Only active inside the explicitly requested, same-origin diagnostic frame.
export const STARTUP_DIAGNOSTICS_SCRIPT = `(function(){
  if(window.parent===window || !/(?:^|[?&])safari_diagnostics=1(?:&|$)/.test(location.search)) return;
  function send(phase, extra){
    window.parent.postMessage({type:'smarttrade-startup',phase:phase,ms:Math.round(performance.now()),extra:extra||''},location.origin);
  }
  send('inline-script');
  window.addEventListener('smarttrade-startup-phase',function(event){
    var allowed=['react-ready','session-start','session-ready','profile-start','profile-ready','auth-ready'];
    if(allowed.indexOf(event.detail)!==-1) send(event.detail);
  });
  window.addEventListener('error',function(event){
    var source='';
    try { var url=new URL(event.filename || '',location.href); if(url.origin===location.origin && url.pathname.indexOf('/_next/static/')===0) source=url.pathname; } catch(e){}
    send('script-error',(event.error && event.error.name || 'Error')+' '+source+':'+(event.lineno||0)+':'+(event.colno||0));
  });
  window.addEventListener('unhandledrejection',function(event){
    var name=event.reason && event.reason.name;
    send('promise-error',/^(Error|TypeError|SyntaxError|ReferenceError|RangeError|ChunkLoadError|AbortError)$/.test(name)?name:'Error');
  });
  document.addEventListener('DOMContentLoaded',function(){send('dom-ready');});
  window.addEventListener('load',function(){send('window-load');});
})();`;

export function markStartupPhase(phase: "react-ready" | "session-start" | "session-ready" | "profile-start" | "profile-ready" | "auth-ready") {
  if (typeof window === "undefined" || window.parent === window) return;
  if (new URLSearchParams(window.location.search).get("safari_diagnostics") !== "1") return;
  window.dispatchEvent(new CustomEvent("smarttrade-startup-phase", { detail: phase }));
}
