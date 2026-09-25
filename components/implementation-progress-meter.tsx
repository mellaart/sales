"use client";
import ImplementationForecastCard from "@/components/implementation-forecast";
import { useEffect, useState } from "react";
import { weightedProgress } from "@/lib/implementation-planning";
export default function ImplementationProgressMeter({implementationId}:{implementationId:string}) {
 const [value,setValue]=useState<number|null>(null);
 const [message,setMessage]=useState("Voortgang laden…");
 useEffect(()=>{
  let controller:AbortController|null=null;
  async function load(){
   controller?.abort(); const current=new AbortController();controller=current;
   try {
    const response=await fetch(`/api/implementations/${implementationId}/budget`,{cache:"no-store",signal:current.signal});
    const data=await response.json();if(!response.ok)throw new Error();
    if(current.signal.aborted)return;
    setValue(data.allocationComplete ? weightedProgress(data.budget,data.rows,data.approvals??{},data.hoursPerDay) : null);
    setMessage(data.budget===null?"Dagenbudget ontbreekt":data.budget===0?"Geen implementatiedagen":"Dagenverdeling nog niet compleet");
   }catch {if(!current.signal.aborted){setValue(null);setMessage("Voortgang niet beschikbaar");}}
  }
  void load();const focus=()=>{if(document.visibilityState==="visible")void load();};window.addEventListener("focus",focus);
  return ()=>{controller?.abort();window.removeEventListener("focus",focus);};
 },[implementationId]);
 return <span className="implementation-overview-progress">
   Voortgang
   {value===null?<strong>{message}</strong>:<>
     <strong>{value.toLocaleString("nl-NL",{maximumFractionDigits:1})}% afgerond</strong>
     <span className="implementation-progress-track" role="progressbar" aria-label="Gewogen implementatievoortgang" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
       <span style={{width:`${value}%`}} />
     </span>
     <small>Gewogen op begrote uren</small>
   </>}
 <ImplementationForecastCard implementationId={implementationId}/>
 </span>;
}
