import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, updateDoc, onSnapshot, limit, setDoc } from "firebase/firestore";
import { firebaseConfig } from "./firebase-config.js";

const contacts = { instagram: "https://www.instagram.com/agroc_iclo/", whatsapp: "573243175381" };
const towns = ["Cereté", "San Pelayo", "Ciénaga de Oro", "Lorica"];
const managerEmail = "dmorenom3@unicartagena.edu.co";
const crops = [["maiz","Maíz"],["arroz","Arroz"],["platano","Plátano"],["yuca","Yuca"],["name","Ñame"],["otro","Otro cultivo"]];
const productCatalog = {
 maiz:["Semilla certificada de maíz","Fertilizante compuesto NPK","Urea o fuente de nitrógeno","Fertilizante fosfatado","Enmienda o corrector de suelo","Abono orgánico","Bioinsumos","Manejo fitosanitario (con asesoría técnica)"],
 arroz:["Semilla certificada de arroz","Fertilizante compuesto NPK","Urea o fuente de nitrógeno","Fertilizante fosfatado o potásico","Enmienda o corrector de suelo","Abono orgánico","Bioinsumos","Manejo fitosanitario (con asesoría técnica)"],
 platano:["Colinos o material de siembra","Fertilizante compuesto NPK","Fertilizante con potasio","Abono orgánico","Enmienda o corrector de suelo","Bioinsumos","Manejo fitosanitario (con asesoría técnica)"],
 yuca:["Estacas de siembra seleccionadas","Fertilizante compuesto NPK","Abono orgánico","Enmienda o corrector de suelo","Bioinsumos","Manejo fitosanitario (con asesoría técnica)"],
 name:["Tubérculos o material de siembra","Fertilizante compuesto NPK","Abono orgánico","Enmienda o corrector de suelo","Bioinsumos","Manejo fitosanitario (con asesoría técnica)"],
 general:["Semilla o material de siembra","Fertilizante compuesto NPK","Urea o fuente de nitrógeno","Abono orgánico","Enmienda o corrector de suelo","Bioinsumos","Manejo fitosanitario (con asesoría técnica)"]
};
const $ = (selector) => document.querySelector(selector);
const currency = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const money = (value) => currency.format(value);
let auth;
let db;
let signedInUser = null;
let producers = [];
let entries = [];
let applications = [];
let presenceRows = [];
let stopChatListener = null;
let stopPresenceListener = null;
let presenceHeartbeat = null;
let presenceRefresh = null;
let teamRealtimeActive = false;
let currentView = "login";
const configured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("REEMPLAZAR");

function option(label, value = label) { return new Option(label, value); }
function cropKey(value){return String(value||"").toLowerCase().replace(/á/g,"a").replace(/é/g,"e").replace(/í/g,"i").replace(/ó/g,"o").replace(/ú/g,"u").replace(/ñ/g,"n");}
function productsForCrop(value){return productCatalog[cropKey(value)]||productCatalog.general;}
function resolvedCrop(form,data){return data.crop==="otro"?(data.cropOther||"").trim():data.crop;}
function bindCropField(form){const select=form.querySelector(".crop-select"),wrap=form.querySelector(".crop-other-field"),input=wrap?.querySelector("input");if(!select)return;select.replaceChildren(option("Selecciona un cultivo",""),...crops.map(([value,label])=>option(label,value)));const sync=()=>{const other=select.value==="otro";if(wrap)wrap.hidden=!other;if(input)input.required=other;};select.addEventListener("change",sync);sync();}
document.querySelectorAll("form").forEach(form=>bindCropField(form));
function renderFarmerProducts(){const form=$("#eligibility"),container=$("#farmer-products");if(!form||!container)return;const crop=form.querySelector("[name=crop]").value,cropValue=crop==="otro"?form.querySelector("[name=cropOther]").value:crop;container.replaceChildren();productsForCrop(cropValue).forEach((label,index)=>{const id="farmer-product-"+index,wrap=document.createElement("label"),input=document.createElement("input");input.type="checkbox";input.name="products";input.value=label;input.id=id;const text=document.createElement("span");text.textContent=label;wrap.htmlFor=id;wrap.append(input,text);container.append(wrap);});}
function renderTeamProducts(){const select=$("#team-product-select"),producerId=$("#add-advance [name=producer]")?.value,producer=producers.find(p=>p.id===producerId);if(!select)return;select.replaceChildren(option(producer?"Selecciona un producto":"Selecciona primero un productor",""),...(producer?productsForCrop(producer.crop).map(value=>option(value)):[]),...(producer?[option("Otro insumo o concepto","__otro")]:[]));toggleCustomProduct();}
function toggleCustomProduct(){const select=$("#team-product-select"),wrap=$("#custom-product-wrap"),input=wrap?.querySelector("input"),other=select?.value==="__otro";if(wrap)wrap.hidden=!other;if(input)input.required=Boolean(other);}
document.querySelectorAll(".towns").forEach((select) => {
  select.replaceChildren(option("Selecciona un municipio", ""));
  select.append(...[...towns, "Otro municipio"].map((town) => option(town)));
});

function setPage() {
  const authenticated = Boolean(signedInUser);
  const teamEligible = isTeamUser(signedInUser);
  $("#auth-screen").hidden = authenticated;
  $("#role-screen").hidden = !authenticated || !teamEligible || currentView !== "roles";
  $("#farmer-app").hidden = !authenticated || currentView !== "farmer";
  $("#team").hidden = !authenticated || !teamEligible || currentView !== "team";
  $("#team-dashboard").hidden = !authenticated || !teamEligible || currentView !== "team";
  $("#session-bar").hidden = !authenticated;
  $("#logout").hidden = !authenticated;
  $("#session-name").textContent = signedInUser?.displayName || signedInUser?.email || "Sesión activa";
  if (signedInUser) {
    const name = signedInUser.displayName?.split(" ")[0] || "agricultor";
    $("#farmer-name").textContent = name;
    $("#role-name").textContent = name;
    $("#team-user").textContent = teamRole(signedInUser) + " · " + signedInUser.email;
  }
}

function isTeamUser(user) {
  return Boolean(user?.emailVerified && user.email?.toLowerCase().endsWith("@unicartagena.edu.co"));
}
function teamRole(user){return user?.email?.toLowerCase()===managerEmail?"Gerente":"Colaborador";}

function whatsappLink(message) {
  return "https://wa.me/" + contacts.whatsapp + "?text=" + encodeURIComponent(message);
}
const icons = {
 instagram:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
 whatsapp:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20.5 11.8a8.5 8.5 0 0 1-12.7 7.4L3 20.7l1.4-4.6a8.5 8.5 0 1 1 16.1-4.3Z"/></svg>'
};
function social(label, channel, href) {
  const a=document.createElement("a");a.className="button outline";a.href=href;a.target="_blank";a.rel="noopener noreferrer";a.innerHTML=icons[channel];a.append(label);return a;
}
$("#social-links").append(social("Instagram","instagram",contacts.instagram),social("WhatsApp","whatsapp",whatsappLink("Hola, AgroCiclo. Quisiera conocer sus servicios.")));

function showResult(selector, message) { const node=$(selector);node.textContent=message;node.hidden=false; }
$("#eligibility").addEventListener("submit",async(event)=>{
 event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form)),selectedProducts=[...form.querySelectorAll('input[name="products"]:checked')].map(input=>input.value),crop=resolvedCrop(form,data);
 if(!signedInUser||!db){showResult("#eligibility-result","Inicia sesión para registrar tu solicitud.");return;}
 if(!selectedProducts.length){showResult("#eligibility-result","Selecciona al menos un producto o insumo.");return;}
 const button=form.querySelector('button[type="submit"]'),link=$("#request-link");button.disabled=true;button.textContent="Registrando solicitud…";link.hidden=true;
 try{
  const request=await addDoc(collections("applications"),{uid:signedInUser.uid,name:(signedInUser.displayName||signedInUser.email||"Agricultor").slice(0,80),email:signedInUser.email,town:data.town,crop,hectares:Number(data.hectares),products:selectedProducts,status:"pendiente",consent:true,consentAt:serverTimestamp(),createdAt:serverTimestamp()});
  const covered=towns.includes(data.town);showResult("#eligibility-result",(covered?"Tu municipio está en la zona inicial de atención. ":"Consulta por WhatsApp si podemos atender tu municipio. ")+"Solicitud registrada con código "+request.id+". El equipo podrá hacer seguimiento.");
  link.href=whatsappLink("Hola, AgroCiclo. Quiero consultar financiación de agroinsumos.\\nCódigo de solicitud: "+request.id+"\\nNombre: "+(signedInUser.displayName||"Agricultor")+"\\nMunicipio: "+data.town+"\\nCultivo: "+crop+"\\nÁrea (ha): "+data.hectares+"\\nProductos: "+selectedProducts.join(", "));link.textContent="Abrir WhatsApp para enviar la solicitud";link.hidden=false;form.reset();renderFarmerProducts();
 }catch(error){showResult("#eligibility-result",errorText(error));}
 finally{button.disabled=false;button.textContent="Registrar solicitud";}
});
$("#simulation").addEventListener("submit",(event)=>{event.preventDefault();const d=Object.fromEntries(new FormData(event.currentTarget));const gross=Number(d.gross),balance=Number(d.balance),deduction=Math.min(gross,balance);showResult("#simulation-result","Saldo estimado para el productor: "+money(gross-deduction)+"\nDescuento por insumos: "+money(deduction));});

function errorText(error) {
 const messages={
  "auth/popup-closed-by-user":"Se cerró la ventana de Google antes de terminar.",
  "auth/popup-blocked":"Permite las ventanas emergentes para iniciar sesión con Google.",
  "auth/cancelled-popup-request":"Hay otro inicio de sesión abierto. Inténtalo de nuevo.",
  "auth/network-request-failed":"No se pudo conectar. Revisa tu conexión e inténtalo otra vez.",
  "auth/unauthorized-domain":"Agrega este dominio en Firebase Authentication > Settings > Authorized domains.",
  "permission-denied":"Firebase rechazó el acceso. Revisa las reglas y el dominio institucional.",
 };
 return messages[error.code] || "No se pudo completar la operación. Revisa la configuración de Firebase e inténtalo otra vez.";
}
function collections(name){return collection(db,name);}
function addTeamRecord(name,data){return addDoc(collections(name),{...data,createdAt:serverTimestamp(),createdBy:signedInUser.email});}
function readRows(name){return getDocs(query(collections(name),orderBy("createdAt","desc"))).then(snapshot=>snapshot.docs.map(doc=>({id:doc.id,...doc.data()})));}
function balanceFor(id){return entries.reduce((sum,row)=>sum+(row.producerId===id?(row.type==="advance"?row.amount:-row.deduction):0),0);}
function td(row,value){const cell=row.insertCell();cell.textContent=value;}
function table(container,heads,rows,empty){if(!rows.length){container.textContent=empty;return;}const t=document.createElement("table"),h=t.createTHead().insertRow();heads.forEach(x=>{const th=document.createElement("th");th.textContent=x;h.append(th);});const b=t.createTBody();rows.forEach(values=>{const tr=b.insertRow();values.forEach(v=>td(tr,v));});container.replaceChildren(t);}
const requestStatuses=[["pendiente","Pendiente"],["en_proceso","En proceso"],["atendida","Atendida"]];
function renderApplications(){
 const container=$("#application-table");
 if(!applications.length){container.textContent="Aún no hay solicitudes registradas.";return;}
 const t=document.createElement("table"),head=t.createTHead().insertRow();
 ["Fecha","Agricultor","Correo","Municipio","Cultivo","Área (ha)","Productos solicitados","Estado"].forEach(label=>{const th=document.createElement("th");th.textContent=label;head.append(th);});
 const body=t.createTBody();
 applications.forEach(application=>{
  const row=body.insertRow();
  [application.createdAt?.toDate?.().toLocaleString("es-CO")||"Reciente",application.name,application.email,application.town,application.crop,String(application.hectares),(application.products||[]).join(", ")].forEach(value=>td(row,value||""));
  const cell=row.insertCell(),select=document.createElement("select");select.className="request-status";select.dataset.applicationId=application.id;select.dataset.previous=application.status||"pendiente";select.setAttribute("aria-label","Estado de solicitud de "+application.name);
  requestStatuses.forEach(([value,label])=>select.append(option(label,value)));select.value=application.status||"pendiente";cell.append(select);
 });
 container.replaceChildren(t);
}
async function refresh(){
 producers=await readRows("producers");entries=await readRows("entries");applications=await readRows("applications");
 document.querySelectorAll(".producers").forEach(select=>{const value=select.value;select.replaceChildren(option("Selecciona un productor",""));producers.forEach(p=>select.append(option(p.name+" · "+p.town,p.id)));select.value=value;});
 const total=producers.reduce((sum,p)=>sum+balanceFor(p.id),0);
 const activeRequests=applications.filter(a=>["pendiente","en_proceso"].includes(a.status)).length;
 const cards=[["Productores",producers.length],["Solicitudes por atender",activeRequests],["Saldo de insumos",money(total)],["Liquidaciones",entries.filter(e=>e.type==="harvest").length]];
 $("#totals").replaceChildren(...cards.map(([label,value])=>{const d=document.createElement("div");d.className="total";const strong=document.createElement("strong");strong.textContent=value;d.append(strong,label);return d;}));
 table($("#producer-table"),["Productor","Municipio","Cultivo","Área (ha)","Saldo pendiente"],producers.map(p=>[p.name,p.town,p.crop,p.hectares,money(balanceFor(p.id))]),"Aún no hay productores.");
 table($("#history-table"),["Fecha","Productor","Movimiento","Detalle","Valor"],entries.map(e=>[e.createdAt?.toDate?.().toLocaleDateString("es-CO")||"Hoy",producers.find(p=>p.id===e.producerId)?.name||"",e.type==="advance"?"Financiación":"Liquidación",e.description||money(e.deduction)+" descuento",money(e.amount??e.payout)]),"Aún no hay movimientos.");
 renderApplications();
 renderTeamProducts();
}
function formData(form){return Object.fromEntries(new FormData(form));}
async function operation(form,callback){const status=$("#team-status");try{await callback(formData(form));form.reset();await refresh();status.textContent="Registro guardado.";}catch(error){status.textContent=errorText(error);}}
$("#add-producer").addEventListener("submit",e=>{e.preventDefault();const form=e.currentTarget;operation(form,d=>addTeamRecord("producers",{name:d.name,town:d.town,crop:resolvedCrop(form,d),hectares:Number(d.hectares)}));});
$("#add-advance").addEventListener("submit",e=>{e.preventDefault();operation(e.currentTarget,d=>addTeamRecord("entries",{type:"advance",producerId:d.producer,description:d.product==="__otro"?(d.customProduct||"").trim():d.product,amount:Number(d.amount)}));});
$("#add-harvest").addEventListener("submit",e=>{e.preventDefault();operation(e.currentTarget,d=>{const gross=Number(d.kg)*Number(d.price),balance=balanceFor(d.producer),deduction=Math.min(gross,balance);return addTeamRecord("entries",{type:"harvest",producerId:d.producer,gross,deduction,payout:gross-deduction,kg:Number(d.kg),price:Number(d.price)});});});
$("#google-signin").addEventListener("click",async()=>{
 if(!configured){$("#auth-status").textContent="Firebase aún no está configurado.";return;}
 const button=$("#google-signin");button.disabled=true;$("#auth-status").textContent="Conectando con Google…";
 try{const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:"select_account"});await signInWithPopup(auth,provider);}
 catch(error){$("#auth-status").textContent=errorText(error);}
 finally{button.disabled=false;}
});
$("#eligibility [name=crop]").addEventListener("change",renderFarmerProducts);
$("#add-advance [name=producer]").addEventListener("change",renderTeamProducts);
$("#team-product-select").addEventListener("change",toggleCustomProduct);
$("#application-table").addEventListener("change",async(event)=>{
 const select=event.target.closest(".request-status");if(!select)return;const id=select.dataset.applicationId,status=select.value,previous=select.dataset.previous;select.disabled=true;
 try{await updateDoc(doc(db,"applications",id),{status,updatedAt:serverTimestamp()});await refresh();$("#team-status").textContent="Estado de solicitud actualizado.";}catch(error){select.value=previous;select.disabled=false;$("#team-status").textContent=errorText(error);}
});
$("#open-team").addEventListener("click",async()=>{
 if(!isTeamUser(signedInUser))return;
 currentView="team";setPage();startTeamRealtime();
 try{await refresh();$("#team-status").textContent="Datos actualizados.";}
 catch(error){$("#team-status").textContent=errorText(error);}
});
$("#open-farmer").addEventListener("click",()=>{stopTeamRealtime();currentView="farmer";setPage();});
$("#back-to-roles").addEventListener("click",()=>{if(isTeamUser(signedInUser)){stopTeamRealtime();currentView="roles";setPage();}});
$("#logout").addEventListener("click",()=>{stopTeamRealtime();signOut(auth);});
$("#team-chat-form").addEventListener("submit",async(event)=>{
 event.preventDefault();const form=event.currentTarget,message=String(new FormData(form).get("message")||"").trim(),status=$("#chat-status");if(!message||!isTeamUser(signedInUser))return;
 const button=form.querySelector("button[type=submit]");button.disabled=true;status.textContent="Enviando…";
 try{await addDoc(collections("team_chat"),{uid:signedInUser.uid,name:signedInUser.displayName||signedInUser.email,email:signedInUser.email,role:isManager(signedInUser)?"gerente":"colaborador",message,createdAt:serverTimestamp()});form.reset();status.textContent="Mensaje enviado al equipo.";}catch(error){status.textContent=errorText(error);}finally{button.disabled=false;}
});
function isManager(user){return user?.email?.toLowerCase()===managerEmail;}
function writePresence(online){if(!signedInUser||!isTeamUser(signedInUser)||!db)return Promise.resolve();return setDoc(doc(db,"team_presence",signedInUser.uid),{uid:signedInUser.uid,name:signedInUser.displayName||signedInUser.email,email:signedInUser.email,role:isManager(signedInUser)?"gerente":"colaborador",online,lastSeen:serverTimestamp()},{merge:true});}
function renderPresence(){const box=$("#team-presence");if(!box)return;const now=Date.now(),active=presenceRows.filter(row=>row.online&&(row.uid===signedInUser?.uid||(row.lastSeen?.toDate&&now-row.lastSeen.toDate().getTime()<120000))).sort((a,b)=>a.name.localeCompare(b.name));box.replaceChildren();const heading=document.createElement("strong");heading.textContent="En el equipo ahora · "+active.length;box.append(heading);if(!active.length){const empty=document.createElement("span");empty.className="small muted";empty.textContent="Sin miembros activos";box.append(empty);return;}const list=document.createElement("div");list.className="presence-list";active.forEach(person=>{const item=document.createElement("span");item.className="presence-person";const dot=document.createElement("i");dot.className="online-dot";const label=document.createElement("span");label.textContent=person.name+" · "+(person.role==="gerente"?"Gerente":"Colaborador");item.append(dot,label);list.append(item);});box.append(list);}
function renderChat(snapshot){const feed=$("#team-chat-feed"),messages=snapshot.docs.map(docSnap=>({id:docSnap.id,...docSnap.data()})).reverse();feed.replaceChildren();if(!messages.length){const empty=document.createElement("p");empty.className="muted small";empty.textContent="Aún no hay mensajes. Comparte la primera actualización con el equipo.";feed.append(empty);return;}messages.forEach(entry=>{const bubble=document.createElement("article");bubble.className="chat-message"+(entry.uid===signedInUser?.uid?" own":"");const meta=document.createElement("div");meta.className="chat-meta";const author=document.createElement("strong");author.textContent=entry.name||entry.email||"Equipo";const role=document.createElement("span");role.className="role-badge"+(entry.role==="gerente"?" manager":"");role.textContent=entry.role==="gerente"?"Gerente":"Colaborador";const time=document.createElement("time");time.textContent=entry.createdAt?.toDate?.().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})||"Ahora";meta.append(author,role,time);const body=document.createElement("p");body.textContent=entry.message;bubble.append(meta,body);feed.append(bubble);});feed.scrollTop=feed.scrollHeight;}
function startTeamRealtime(){if(teamRealtimeActive||!isTeamUser(signedInUser))return;teamRealtimeActive=true;writePresence(true).catch(error=>{$("#team-status").textContent=errorText(error);});stopChatListener=onSnapshot(query(collections("team_chat"),orderBy("createdAt","desc"),limit(80)),renderChat,error=>{$("#chat-status").textContent=errorText(error);});stopPresenceListener=onSnapshot(collections("team_presence"),snapshot=>{presenceRows=snapshot.docs.map(docSnap=>docSnap.data());renderPresence();},error=>{$("#team-status").textContent=errorText(error);});presenceHeartbeat=setInterval(()=>writePresence(true).catch(error=>{$("#team-status").textContent=errorText(error);}),60000);presenceRefresh=setInterval(renderPresence,20000);}
function stopTeamRealtime(){if(presenceHeartbeat)clearInterval(presenceHeartbeat);if(presenceRefresh)clearInterval(presenceRefresh);presenceHeartbeat=null;presenceRefresh=null;if(stopChatListener)stopChatListener();if(stopPresenceListener)stopPresenceListener();stopChatListener=null;stopPresenceListener=null;if(teamRealtimeActive)writePresence(false).catch(()=>{});teamRealtimeActive=false;}
if(configured){
 const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
 onAuthStateChanged(auth,user=>{
  if(signedInUser&&signedInUser.uid!==user?.uid)stopTeamRealtime();
  signedInUser=user;
  if(!user)currentView="login";
  else currentView=isTeamUser(user)?"roles":"farmer";
  setPage();if(!user)renderFarmerProducts();
 });
}else{
 setPage();
}
