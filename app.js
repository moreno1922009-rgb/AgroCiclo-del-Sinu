import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, serverTimestamp } from "firebase/firestore";
import { firebaseConfig } from "./firebase-config.js";

const contacts = { instagram: "https://www.instagram.com/agroc_iclo/", whatsapp: "573243175381" };
const towns = ["Cereté", "San Pelayo", "Ciénaga de Oro", "Lorica"];
const $ = (selector) => document.querySelector(selector);
const currency = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const money = (value) => currency.format(value);
let auth;
let db;
let signedInUser = null;
let producers = [];
let entries = [];
const configured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("REEMPLAZAR");

function option(label, value = label) { return new Option(label, value); }

document.querySelectorAll(".towns").forEach((select) => {
  select.replaceChildren(option("Selecciona un municipio", ""));
  select.append(...[...towns, "Otro municipio"].map((town) => option(town)));
});

function setPage() {
  const teamPage = location.hash === "#equipo";
  const authenticated = Boolean(signedInUser);
  $("#farmer").hidden = teamPage;
  $("#team").hidden = !teamPage || !authenticated;
  $("#team-login").hidden = !teamPage || authenticated;
  document.querySelectorAll("[data-tab]").forEach((link) => {
    const active = link.dataset.tab === (teamPage ? "equipo" : "inicio");
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  if (teamPage && !configured) $("#login-status").textContent = "Configura Firebase siguiendo README.md para activar el acceso.";
}
window.addEventListener("hashchange", setPage);
setPage();

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
$("#eligibility").addEventListener("submit",(event)=>{
 event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));const covered=towns.includes(data.town);
 showResult("#eligibility-result",covered?"Tu municipio está en la zona inicial de atención. Escríbenos para revisar tu solicitud.":"Consulta por WhatsApp si podemos atender tu municipio.");
 const link=$("#request-link");link.href=whatsappLink("Hola, AgroCiclo. Quiero consultar financiación de agroinsumos.\nMunicipio: "+data.town+"\nCultivo: "+data.crop+"\nÁrea (ha): "+data.hectares+"\nInsumos: "+data.supplies);link.hidden=false;
});
$("#simulation").addEventListener("submit",(event)=>{event.preventDefault();const d=Object.fromEntries(new FormData(event.currentTarget));const gross=Number(d.gross),balance=Number(d.balance),deduction=Math.min(gross,balance);showResult("#simulation-result","Saldo estimado para el productor: "+money(gross-deduction)+"\nDescuento por insumos: "+money(deduction));});

function errorText(error) {
 const messages={
  "auth/popup-closed-by-user":"Se cerró la ventana de Google antes de terminar.",
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
async function refresh(){
 producers=await readRows("producers");entries=await readRows("entries");
 document.querySelectorAll(".producers").forEach(select=>{const value=select.value;select.replaceChildren(option("Selecciona un productor",""));producers.forEach(p=>select.append(option(p.name+" · "+p.town,p.id)));select.value=value;});
 const total=producers.reduce((sum,p)=>sum+balanceFor(p.id),0);
 const cards=[["Productores",producers.length],["Saldo de insumos",money(total)],["Liquidaciones",entries.filter(e=>e.type==="harvest").length]];
 $("#totals").replaceChildren(...cards.map(([label,value])=>{const d=document.createElement("div");d.className="total";const strong=document.createElement("strong");strong.textContent=value;d.append(strong,label);return d;}));
 table($("#producer-table"),["Productor","Municipio","Cultivo","Área (ha)","Saldo pendiente"],producers.map(p=>[p.name,p.town,p.crop,p.hectares,money(balanceFor(p.id))]),"Aún no hay productores.");
 table($("#history-table"),["Fecha","Productor","Movimiento","Detalle","Valor"],entries.map(e=>[e.createdAt?.toDate?.().toLocaleDateString("es-CO")||"Hoy",producers.find(p=>p.id===e.producerId)?.name||"",e.type==="advance"?"Financiación":"Liquidación",e.description||money(e.deduction)+" descuento",money(e.amount??e.payout)]),"Aún no hay movimientos.");
}
function formData(form){return Object.fromEntries(new FormData(form));}
async function operation(form,callback){const status=$("#team-status");try{await callback(formData(form));form.reset();await refresh();status.textContent="Registro guardado.";}catch(error){status.textContent=errorText(error);}}
$("#add-producer").addEventListener("submit",e=>{e.preventDefault();operation(e.currentTarget,d=>addTeamRecord("producers",{name:d.name,town:d.town,crop:d.crop,hectares:Number(d.hectares)}));});
$("#add-advance").addEventListener("submit",e=>{e.preventDefault();operation(e.currentTarget,d=>addTeamRecord("entries",{type:"advance",producerId:d.producer,description:d.description,amount:Number(d.amount)}));});
$("#add-harvest").addEventListener("submit",e=>{e.preventDefault();operation(e.currentTarget,d=>{const gross=Number(d.kg)*Number(d.price),balance=balanceFor(d.producer),deduction=Math.min(gross,balance);return addTeamRecord("entries",{type:"harvest",producerId:d.producer,gross,deduction,payout:gross-deduction,kg:Number(d.kg),price:Number(d.price)});});});
$("#team-login-form").addEventListener("submit",async e=>{e.preventDefault();if(!configured)return;const button=e.currentTarget.querySelector("button");button.disabled=true;try{const provider=new GoogleAuthProvider();provider.setCustomParameters({hd:"unicartagena.edu.co"});const result=await signInWithPopup(auth,provider);if(!result.user.emailVerified||!result.user.email?.toLowerCase().endsWith("@unicartagena.edu.co")){await signOut(auth);$("#login-status").textContent="Usa una cuenta verificada @unicartagena.edu.co.";return;}location.hash="#equipo";}catch(error){$("#login-status").textContent=errorText(error);}finally{button.disabled=false;}});
$("#logout").addEventListener("click",()=>signOut(auth));
if(configured){
 const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
 onAuthStateChanged(auth,async user=>{signedInUser=user;if(user){try{await refresh();$("#team-user").textContent="Sesión: "+user.email;}catch(error){$("#team-status").textContent=errorText(error);}}setPage();});
}else if(location.hash==="#equipo") $("#login-status").textContent="Firebase aún no está configurado. Sigue los pasos de README.md.";
