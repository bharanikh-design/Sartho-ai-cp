"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";

type Slide = { eyebrow:string; title:string; description:string; outcome:string; route:string; visual:{kicker:string; title:string; detail:string; metric?:string}[] };
const SESSION_DISMISS_KEY="sartho-onboarding-dismissed-this-session";
const slides:Slide[]=[
 {eyebrow:"01 · KNOW ME",title:"One résumé. Your career comes alive.",description:"Upload once. Sartho turns your real career into evidence it can use everywhere — while your original document stays yours.",outcome:"Résumé → Career Evidence → Career Intelligence",route:"Résumé Studio",visual:[{kicker:"SOURCE",title:"Master résumé",detail:"Original safely stored",metric:"✓"},{kicker:"PROFILE",title:"Career evidence",detail:"Roles · outcomes · capabilities",metric:"142"},{kicker:"READY",title:"Career intelligence",detail:"Grounded in what you proved",metric:"LIVE"}]},
 {eyebrow:"02 · FIND MY NEXT MOVE",title:"Don't just repeat your past. Explore what's realistically next.",description:"Sartho connects your transferable capabilities with career directions and live opportunities — close moves, adjacent moves and credible stretches.",outcome:"Evidence → Possibilities → Real market demand",route:"Career Direction",visual:[{kicker:"STRONG",title:"Natural progression",detail:"Evidence-backed next level"},{kicker:"ADJACENT",title:"New industry",detail:"Transferable capability bridge"},{kicker:"MARKET",title:"Jobs available now",detail:"Employer + Google discovery",metric:"→"}]},
 {eyebrow:"03 · DECIDE WITH EVIDENCE",title:"Know why a role fits before you spend time applying.",description:"Sartho reads the actual job requirements, shows mandatory gaps, and traces every strength back to your career evidence.",outcome:"Role → Requirements → Evidence → Decision",route:"Analyse Role",visual:[{kicker:"JOB MATCH",title:"Strong fit",detail:"8 of 10 important requirements",metric:"82"},{kicker:"MANDATORY",title:"Requirements covered",detail:"Evidence behind every match",metric:"✓"},{kicker:"GAP",title:"Know what is missing",detail:"No invented experience"}]},
 {eyebrow:"04 · APPLY READY",title:"Turn the right opportunity into an ATS-ready application.",description:"Tailor from your evidence, choose the right market-aware presentation, validate what the ATS can read, then export with confidence.",outcome:"Match → Tailor → Validate → Apply",route:"Résumé Studio",visual:[{kicker:"TAILORED",title:"Role-specific résumé",detail:"Built from approved evidence"},{kicker:"ATS",title:"Readable & checked",detail:"Requirements surfaced",metric:"✓"},{kicker:"NEXT",title:"Ready to apply",detail:"Your journey keeps moving",metric:"GO"}]},
];

export function OnboardingCarousel({user}:{user:User}){
 const pathname=usePathname(),router=useRouter(),params=useSearchParams(),panelRef=useRef<HTMLDivElement>(null);
 const [index,setIndex]=useState(0),[dismissed,setDismissed]=useState(true),[saving,setSaving]=useState(false);
 const completed=user.user_metadata?.sartho_onboarding_complete===true;
 const [dontShowAgain,setDontShowAgain]=useState(completed);
 useEffect(()=>{queueMicrotask(()=>setDismissed(window.sessionStorage.getItem(SESSION_DISMISS_KEY)==="true"));},[pathname]);
 const replay=params.get("tour")==="1";
 const visible=pathname==="/"&&(replay||(!completed&&!dismissed));
 const finish=useCallback(async()=>{
   if(saving)return;
   /* Close immediately. Persistence must never trap the user inside the tour. */
   setDismissed(true); setSaving(true);
   window.sessionStorage.setItem(SESSION_DISMISS_KEY,"true");
   router.replace("/",{scroll:false});
   try{
     if(completed!==dontShowAgain){const supabase=createClient();await supabase.auth.updateUser({data:{sartho_onboarding_complete:dontShowAgain}});}
   }finally{setSaving(false);}
 },[completed,dontShowAgain,router,saving]);
 useEffect(()=>{if(!visible)return;const panel=panelRef.current;const focusable=()=>Array.from(panel?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),[href],[tabindex]:not([tabindex="-1"])')??[]);requestAnimationFrame(()=>focusable()[0]?.focus());const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();void finish();return}if(e.key==="ArrowRight"){e.preventDefault();setIndex(i=>Math.min(slides.length-1,i+1));return}if(e.key==="ArrowLeft"){e.preventDefault();setIndex(i=>Math.max(0,i-1));return}if(e.key!=="Tab")return;const items=focusable();if(!items.length)return;const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}};window.addEventListener("keydown",onKey);const overflow=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{window.removeEventListener("keydown",onKey);document.body.style.overflow=overflow}},[finish,visible]);
 if(!visible)return null;const slide=slides[index],last=index===slides.length-1;
 return <div className="tour-backdrop" role="dialog" aria-modal="true" aria-labelledby="tour-title"><div className="tour-cinema" ref={panelRef}>
   <div className="tour-topline"><span className="tour-brand">SARTHO · 45 SECOND TOUR</span><button type="button" className="tour-close" onClick={()=>void finish()} aria-label="Close product tour">×</button></div>
   <div className="tour-stage" key={index}><section className="tour-copy"><span className="tour-eyebrow">{slide.eyebrow}</span><h1 id="tour-title">{slide.title}</h1><p>{slide.description}</p><strong className="tour-outcome">{slide.outcome}</strong><span className="tour-route">{slide.route}</span></section>
   <section className="tour-visual" aria-label={slide.route}><span className="tour-orbit" aria-hidden="true"/>{slide.visual.map((item,i)=><article key={item.title} className={"tour-hero-card card-"+i}><small>{item.kicker}</small><div><strong>{item.title}</strong><p>{item.detail}</p></div>{item.metric?<b>{item.metric}</b>:<span>→</span>}</article>)}</section></div>
   <footer className="tour-footer"><div className="tour-progress" aria-label={"Step "+(index+1)+" of "+slides.length}>{slides.map((s,i)=><button type="button" key={s.eyebrow} className={i===index?"is-active":""} onClick={()=>setIndex(i)} aria-label={"Go to step "+(i+1)}/>)}</div>
   <label className="tour-dismiss"><input type="checkbox" checked={dontShowAgain} onChange={e=>setDontShowAgain(e.target.checked)}/> Don’t show this again</label>
   <div className="tour-actions"><button type="button" className="tour-skip" onClick={()=>void finish()}>Skip</button>{index>0?<button type="button" className="tour-secondary" onClick={()=>setIndex(index-1)}>Back</button>:null}<button type="button" className="tour-primary" onClick={()=>last?void finish():setIndex(index+1)}>{last?"Enter Sartho":"Continue"}</button></div></footer>
 </div></div>
}
