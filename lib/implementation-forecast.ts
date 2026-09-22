export type ImplementationForecast = {
  budgetDays: number | null; progressPercent: number | null; usedDays: number | null;
  usedPercent: number | null; expectedDays: number | null; differenceDays: number | null;
  signal: "unavailable" | "early" | "on_track" | "discuss" | "notify";
};
export function calculateImplementationForecast(budgetDays:number|null,progressPercent:number|null,usedDays:number|null):ImplementationForecast {
 const result:ImplementationForecast={budgetDays,progressPercent,usedDays,usedPercent:null,expectedDays:null,differenceDays:null,signal:"unavailable"};
 if(budgetDays===null||!Number.isFinite(budgetDays)||budgetDays<=0||usedDays===null||!Number.isFinite(usedDays)||usedDays<0)return result;
 result.usedPercent=usedDays/budgetDays*100;
 if(progressPercent===null||!Number.isFinite(progressPercent)||progressPercent<0||progressPercent>100)return result;
 if(result.usedPercent<30){result.signal="early";return result;}
 const index=progressPercent/result.usedPercent;
 result.signal=index>=0.95?"on_track":index>=0.8?"discuss":"notify";
 if(progressPercent>0){result.expectedDays=usedDays/(progressPercent/100);result.differenceDays=result.expectedDays-budgetDays;}
 return result;
}
