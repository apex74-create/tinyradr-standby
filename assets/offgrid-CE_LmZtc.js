import{r as e}from"./rolldown-runtime-hePW80VL.js";import{t}from"./react-CwJFpaho.js";import{t as n}from"./link-De8nA1so.js";import{t as r}from"./jsx-runtime-NZYk81nU.js";import{pn as i}from"./index-CTQ70rZp.js";import{p as a,r as o}from"./reticulum-BaKvY8uu.js";import{i as s,n as c,t as l}from"./mesh-status-26n979pl.js";var u=e(t(),1),d=r();function f({what:e,mesh:t=!1}){let{state:r}=i(),[a,o]=(0,u.useState)(()=>l());return(0,u.useEffect)(()=>s(o),[]),r===`online`?!t||c(a)?null:(0,d.jsxs)(`div`,{className:`mb-2 rounded-sm border border-scan/60 bg-scan/10 px-2 py-1.5 text-[8px] uppercase tracking-widest`,children:[(0,d.jsx)(`p`,{className:`text-scan`,children:`bridge up · mesh node not attached`}),(0,d.jsx)(`p`,{className:`mt-1 normal-case tracking-normal text-[9px] leading-snug text-muted-foreground`,children:`The phone link is live, but the Reticulum daemon is not running yet, so no mesh traffic can arrive. Attach the node once and it stays up.`}),(0,d.jsx)(n,{to:`/bridge`,className:`mt-1.5 inline-block rounded-sm border border-signal/70 px-2 py-1 text-signal`,children:`attach mesh node →`})]}):(0,d.jsxs)(`div`,{className:`mb-2 rounded-sm border border-warn/60 bg-warn/10 px-2 py-1.5 text-[8px] uppercase tracking-widest`,children:[(0,d.jsx)(`p`,{className:`text-warn`,children:r===`connecting`||r===`agent`?`bridge linking…`:`no bridge · no radio source`}),(0,d.jsxs)(`p`,{className:`mt-1 normal-case tracking-normal text-[9px] leading-snug text-muted-foreground`,children:[e,` runs on the paired phone (adb agent + rnsd). The browser cannot scan Wi-Fi or send mesh traffic by itself, so everything here stays empty until the link is up.`]}),(0,d.jsxs)(`div`,{className:`mt-1.5 flex flex-wrap gap-1`,children:[(0,d.jsx)(n,{to:`/bridge`,className:`inline-block rounded-sm border border-signal/70 px-2 py-1 text-signal`,children:`connect bridge →`}),(0,d.jsx)(n,{to:`/ptt`,className:`inline-block rounded-sm border border-alert/70 px-2 py-1 text-alert`,children:`talk without a bridge · ptt`})]})]})}var p={freq:915e6,bw:125e3,sf:8,txp:17,port:`/dev/ttyUSB0`,tcp:4242},m=[{mode:`auto`,label:`AUTO`,carrier:`IPv6 link-local multicast on any live WiFi/AP leg`,range:`same AP / same subnet`,stanza:()=>`[[Apex Auto]]
  type = AutoInterface
  interface_enabled = True
  discovery_scope = link`},{mode:`hotspot`,label:`HOTSPOT`,carrier:`phone's own SoftAP — peers join the AP, no uplink needed`,range:`WiFi coverage (~50-100 m open)`,stanza:e=>`[[Apex Hotspot]]
  type = AutoInterface
  interface_enabled = True
  discovery_scope = link
  devices = ap0, wlan0, swlan0

[[Apex Hotspot TCP]]
  type = TCPServerInterface
  interface_enabled = True
  listen_ip = 0.0.0.0
  listen_port = ${e.tcp}`},{mode:`rnode`,label:`LORA`,carrier:`RNode LoRa radio over USB-OTG — fully licence-free ISM RF`,range:`1-15 km line of sight`,stanza:e=>`[[Apex RNode]]
  type = RNodeInterface
  interface_enabled = True
  port = ${e.port}
  frequency = ${e.freq}
  bandwidth = ${e.bw}
  txpower = ${e.txp}
  spreadingfactor = ${e.sf}
  codingrate = 5`},{mode:`usb`,label:`TETHER`,carrier:`USB tether / adb reverse between two handsets, cable only`,range:`cable`,stanza:e=>`[[Apex Tether]]
  type = TCPServerInterface
  interface_enabled = True
  listen_ip = 0.0.0.0
  listen_port = ${e.tcp}`}],h=e=>{var t;return(t=m.find(t=>t.mode===e))==null?m[0]:t},g=`/data/data/com.termux/files/home/.reticulum`;function _(e,t=p){return`[reticulum]
  enable_transport = True
  share_instance = Yes
  panic_on_interface_error = No

[logging]
  loglevel = 4

[interfaces]
${h(e).stanza(t)}
`}function v(e,t=p){let n=_(e,t).replace(/'/g,`'\\''`);return a(`mkdir -p ${g} ${o}; cp ${g}/config ${g}/config.bak 2>/dev/null; printf '%s' '${n}' > ${g}/config; pkill -f rnsd; sleep 1; nohup rnsd -d >> ${o}/rnsd.log 2>&1 &`)}var y=`shell settings get global airplane_mode_on`,b=`shell dumpsys telephony.registry | grep -m1 mServiceState`;function x(e,t){return e.trim()===`1`||/mVoiceRegState=3|POWER_OFF|state=3/i.test(t)}function S(e){return/auto|rnode|lora|tcpserver|apex (auto|hotspot|rnode|tether)/i.test(e)}export{S as a,f as c,v as i,b as n,h as o,m as r,x as s,y as t};