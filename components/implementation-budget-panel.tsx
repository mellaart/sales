"use client";
import { useEffect, useState } from "react";
import type { BudgetRow } from "@/lib/implementation-planning";
type Item={key:string;label:string};
export default function ImplementationBudgetPanel({implementationId,items,canEdit,approvals}:{implementationId:string;items:Item[];canEdit:boolean;approvals:Record<string,unknown>}) {
 const [rows,setRows]=useState<Record<string,BudgetRow>>({});
 const [budget,setBudget]=useState<number|null>(null);
 const [hours,setHours]=useState(6);
 const [version,setVersion]=useState<string|null>(null);
 const [loaded,setLoaded]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 useEffect(()=>{
  const controller=new AbortController();setLoaded(false);setRows({});setMessage("");
  void fetch(`/api/implementations/${implementationId}/budget`,{cache:"no-store",signal:controller.signal}).then(async response=>{
   const data=await response.json();if(!response.ok)throw new Error(data.error);
   if(controller.signal.aborted)return;
   setRows(data.rows);setBudget(data.budget);setHours(data.hoursPerDay);setVersion(data.version);setLoaded(true);
  }).catch(error=>{if(!controller.signal.aborted)setMessage(error.message);});
  return ()=>controller.abort();
 },[implementationId]);
 const total=items.reduce((sum,item)=>sum+(rows[item.key]?.days??0),0);
 const balanced=budget!==null && Math.abs(total-budget)<0.005;
 async function save(){
  setBusy(true);setMessage("");
  try{
   const current=Object.fromEntries(items.map(item=>[item.key,rows[item.key]??{days:0,started:false}]));
   const response=await fetch(`/api/implementations/${implementationId}/budget`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({budget,version,rows:current})});
   const data=await response.json();if(!response.ok)throw new Error(data.error);
   setRows(current);setVersion(data.version);setMessage("Dagenbegroting opgeslagen.");
  }catch(error){setMessage(error instanceof Error?error.message:"Opslaan mislukt.");}finally{setBusy(false);}
 }
 const number=(n:number)=>n.toLocaleString("nl-NL",{maximumFractionDigits:2});
 return <section className="card panel" style={{marginTop:24,marginBottom:24}}>
  <h2>Dagenbudget en voortgang</h2>
  <p>{!loaded?"Dagenbudget laden...":budget===null?"Het dagenbudget uit de goedgekeurde offerte is niet beschikbaar. Controleer de oorspronkelijke offerte; er wordt geen budget geschat.":`Goedgekeurde offerte: ${number(budget)} dagen · ${number(hours)} uur per dag`}</p>
  <p>Verdeel het totale dagenbudget over de geselecteerde werkzaamheden. Alleen akkoord van de klant telt als 100% afgerond.</p>
  <div style={{overflowX:"auto"}}><table style={{width:"100%",textAlign:"left"}}><thead><tr><th>Onderdeel</th><th>Begrote dagen</th><th>Status</th></tr></thead><tbody>
  {items.map(item=>{const row=rows[item.key]??{days:0,started:false};const approved=Boolean(approvals[item.key]);return <tr key={item.key}>
   <td>{item.label}</td><td><input className="input" style={{width:110}} aria-label={`Begrote dagen ${item.label}`} type="number" min="0" step="0.01" value={row.days} disabled={!loaded||!canEdit||busy||budget===null} onChange={event=>setRows(previous=>({...previous,[item.key]:{...row,days:Number(event.target.value)}}))}/></td>
   <td><select aria-label={`Status ${item.label}`} value={approved?"approved":row.started?"started":"todo"} disabled={!loaded||!canEdit||busy||approved} onChange={event=>setRows(previous=>({...previous,[item.key]:{...row,started:event.target.value==="started"}}))}>
    <option value="todo">Niet begonnen · 0%</option><option value="started">Bezig · 50%</option>{approved?<option value="approved">Akkoord door klant · 100%</option>:null}
   </select></td></tr>;})}
  </tbody></table></div>
  {loaded&&items.length===0?<p>Selecteer eerst de werkzaamheden voor deze implementatie.</p>:null}
  {budget!==null?<p>Verdeeld: {number(total)} van {number(budget)} dagen. {balanced?"De verdeling klopt.":`Nog te verdelen: ${number(budget-total)} dagen.`}</p>:null}
  <button type="button" className="primary-button" disabled={!loaded||!canEdit||busy||!balanced||!items.length} onClick={()=>void save()}>Dagenbegroting opslaan</button>
  <p role="status">{message}</p>
 </section>;
}
