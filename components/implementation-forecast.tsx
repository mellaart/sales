"use client";
import {useEffect,useState} from "react";
import type {ImplementationForecast} from "@/lib/implementation-forecast";
const number=(n:number)=>n.toLocaleString("nl-NL",{maximumFractionDigits:1});
export function ImplementationForecastView({data,customer=false,showProgress=false}:{data:ImplementationForecast;customer?:boolean;showProgress?:boolean}){
 const labels={unavailable:"Prognose nog niet beschikbaar",early:"Prognose vanaf 30% dagenverbruik",on_track:"Op koers",discuss:"Bespreken in het volgende overleg",notify:customer?"Afstemming over de planning nodig":"Melden aan klant"};
 return <span className={`implementation-forecast forecast-${data.signal}${showProgress?" dashboard-progress-forecast":""}`}>
  {showProgress ? <span className="dashboard-progress-visual">
    <span className="dashboard-progress-heading"><span>Werk afgerond</span><b>{data.progressPercent===null?"Nog onbekend":`${number(data.progressPercent)}%`}</b></span>
    {data.progressPercent!==null ? <span className="dashboard-progress-track" role="progressbar" aria-label="Gewogen voortgang implementatie" aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.progressPercent}>
      <span className="dashboard-progress-fill" style={{width:`${Math.max(0,Math.min(100,data.progressPercent))}%`}}/>
    </span> : <span className="dashboard-progress-track unavailable" aria-hidden="true"/>}
    <span className="dashboard-progress-scale" aria-hidden="true"><span>0%</span><span>50%</span><span>100%</span></span>
  </span> : null}
  <strong>{labels[data.signal]}</strong>
  <small>{data.progressPercent===null?"Dagenverdeling ontbreekt of is niet compleet":`${number(data.progressPercent)}% werk afgerond`}{data.usedPercent!==null?` · ${number(data.usedPercent)}% dagen verbruikt`:" · Geboekte uren niet beschikbaar"}</small>
  {data.usedDays!==null&&data.budgetDays!==null?<small>{number(data.usedDays)} van {number(data.budgetDays)} begrote dagen verbruikt</small>:null}
  {data.expectedDays!==null?<small>Verwacht totaal: <b>{number(data.expectedDays)} dagen</b> ({Math.abs(data.differenceDays??0)<0.05?"volgens begroting":`${number(Math.abs(data.differenceDays??0))} dagen ${(data.differenceDays??0)>0?"boven":"onder"} begroting`})</small>:data.signal==="notify"&&data.progressPercent===0?<small>Er zijn uren geboekt, maar nog geen voortgang vastgelegd. Een eindprognose is nog niet mogelijk.</small>:null}
 </span>;
}
export default function ImplementationForecastCard({implementationId,refreshKey,showProgress=false}:{implementationId:string;refreshKey?:string|null;showProgress?:boolean}){
 const [data,setData]=useState<ImplementationForecast|null>(null);const [error,setError]=useState(false);
 useEffect(()=>{
  setData(null);
  let controller:AbortController|null=null;
  async function load(){controller?.abort();const active=new AbortController();controller=active;setError(false);
   try{const response=await fetch(`/api/implementations/${implementationId}/forecast`,{cache:"no-store",signal:active.signal});if(!response.ok)throw new Error();const value=await response.json();if(!active.signal.aborted)setData(value);}catch{if(!active.signal.aborted){setData(null);setError(true);}}}
  void load();const focus=()=>{if(document.visibilityState==="visible")void load();};window.addEventListener("focus",focus);return()=>{controller?.abort();window.removeEventListener("focus",focus);};
 },[implementationId,refreshKey]);
 return data?<ImplementationForecastView data={data} showProgress={showProgress}/>:<small>{error?"Prognose tijdelijk niet beschikbaar":"Prognose laden…"}</small>;
}
