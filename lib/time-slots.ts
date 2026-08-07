export type TimeSlot = { label:string; startMinute:number; endMinute:number };
function formatHour(hour:number){const n=((hour%24)+24)%24;const suffix=n>=12?"PM":"AM";const h=n%12===0?12:n%12;return `${h}:00 ${suffix}`;}
export const TIME_SLOTS:TimeSlot[]=Array.from({length:24},(_,i)=>{const hour=(4+i)%24;const next=(hour+1)%24;return{label:`${formatHour(hour)} - ${formatHour(next)}`,startMinute:hour*60,endMinute:next*60};});
