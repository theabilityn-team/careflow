import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

type Activity = {kind:"navigation"|"interaction"|"lead_open";page:Page;leadId?:number};
type Page = "dashboard"|"leads"|"lead"|"groups"|"scan"|"bulk-import"|"follow-ups"|"mails"|"customers"|"orders"|"email-templates"|"guide"|"staff"|"measure";
const TrackingWorkspace = createContext<string | null>(null);
export function MeasureTrackingProvider({workspace,children,canMeasure=false}:{workspace:string|null;children:ReactNode;canMeasure?:boolean}) {
  return <TrackingWorkspace.Provider value={workspace}>{workspace&&<MeasureActivityTracker workspace={workspace} canMeasure={canMeasure}/>} {children}</TrackingWorkspace.Provider>;
}
export function measurePage(location:string):{page:Page;leadId?:number}|null {
  const route=location.split("?")[0];if(route==="/")return {page:"dashboard"};
  const lead=route.match(/^\/leads\/(\d+)$/);if(lead)return {page:"lead",leadId:Number(lead[1])};
  const segment=route.split("/")[1];if(["leads","groups","scan","bulk-import","follow-ups","mails","customers","orders","email-templates","guide","staff","measure"].includes(segment))return {page:segment as Page};return null;
}
function useActivityRecorder() {
  const mutation=trpc.measure.record.useMutation({retry:false});
  const send=useRef(mutation.mutate);send.current=mutation.mutate;
  return useRef((activity:Activity)=>{
    // No client timestamps, user IDs, DOM text, form contents or URL query strings.
    const eventId=crypto.randomUUID();send.current({...activity,eventId});
  }).current;
}
export function MeasureActivityTracker({workspace,canMeasure}:{workspace:string;canMeasure:boolean}) {
  const [location]=useLocation();const record=useActivityRecorder();const last=useRef(0);
  const lastNavigation=useRef("");
  useEffect(()=>{const page=measurePage(location);const key=`${workspace}:${location}`;if(lastNavigation.current===key)return;lastNavigation.current=key;if(page&&page.page!=="lead"&&(!["measure","staff"].includes(page.page)||canMeasure))record({...page,kind:"navigation"});},[workspace,location,record,canMeasure]);
  useEffect(()=>{
    const interact=(event:Event)=>{
      if(!event.isTrusted||document.visibilityState!=="visible"||Date.now()-last.current<10_000)return;
      // Count clicks / navigation keys, not typing or presence / periodic heartbeats.
      if(event instanceof KeyboardEvent&&!['Tab','Enter',' '].includes(event.key))return;
      const target=event.target instanceof Element?event.target.closest('button,a,[role="button"],[role="tab"],[role="combobox"]'):null;
      if(!target)return;
      // Phone copy / dial is not proof of a call and never increments contact counters.
      const page=measurePage(location);if(!page||["measure","staff"].includes(page.page)&&!canMeasure)return;last.current=Date.now();record({...page,kind:"interaction"});
    };
    document.addEventListener("click",interact,true);document.addEventListener("keydown",interact,true);
    return()=>{document.removeEventListener("click",interact,true);document.removeEventListener("keydown",interact,true);};
  },[location,workspace,record,canMeasure]);
  return null;
}
/** Mount only after a permitted lead detail successfully loads. Poll refreshes do not create opens. */
export function MeasureLeadOpen({leadId}:{leadId:number}) {
  const workspace=useContext(TrackingWorkspace);
  if(!workspace)return null;
  return <LeadOpenRecorder leadId={leadId} workspace={workspace} />;
}
function LeadOpenRecorder({leadId,workspace}:{leadId:number;workspace:string}) {
  const record=useActivityRecorder();const previous=useRef("");
  useEffect(()=>{const key=`${workspace}:${leadId}`;if(previous.current===key)return;previous.current=key;record({kind:"lead_open",page:"lead",leadId});},[workspace,leadId,record]);return null;
}
