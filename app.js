import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, reauthenticateWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, updateDoc, deleteDoc, onSnapshot, limit, setDoc, where } from "firebase/firestore";
import { firebaseConfig } from "./firebase-config.js";

const contacts = { instagram: "https://www.instagram.com/agroc_iclo/", whatsapp: "573243175381" };
const towns = ["Cereté", "San Pelayo", "Ciénaga de Oro", "Lorica"];
const managerEmail = "dmorenom3@unicartagena.edu.co";
const crops = [["maiz","Maíz"],["arroz","Arroz"],["frijol","Frijol"],["yuca","Yuca"],["name","Ñame"],["otro","Otro cultivo"]];
const productCatalog = {
 maiz:["Semilla certificada de maíz","Fertilizante compuesto NPK","Urea o fuente de nitrógeno","Fertilizante fosfatado","Enmienda o corrector de suelo","Abono orgánico","Bioinsumos","Manejo fitosanitario (con asesoría técnica)"],
 arroz:["Semilla certificada de arroz","Fertilizante compuesto NPK","Urea o fuente de nitrógeno","Fertilizante fosfatado o potásico","Enmienda o corrector de suelo","Abono orgánico","Bioinsumos","Manejo fitosanitario (con asesoría técnica)"],
 frijol:["Semilla seleccionada o certificada de frijol","Fertilizante compuesto NPK","Fertilizante fosfatado","Abono orgánico","Enmienda o corrector de suelo","Bioinsumos","Manejo fitosanitario (con asesoría técnica)"],
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
let farmerApplications = [];
let stopFarmerListener = null;
let presenceRows = [];
let stopChatListener = null;
let stopPresenceListener = null;
let presenceHeartbeat = null;
let presenceRefresh = null;
let teamRealtimeActive = false;
let chatOpen = false;
let latestChatSnapshot = null;
let requestFilter = "pendiente";
let quoteSequence = 0;
let gmailAccessToken = "";
let gmailAccessTokenExpiresAt = 0;
const emailErrors = new Map();
let scrollRevealObserver = null;
let currentView = "login";
const configured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("REEMPLAZAR");

function option(label, value = label) { return new Option(label, value); }
function cropKey(value){return String(value||"").toLowerCase().replace(/á/g,"a").replace(/é/g,"e").replace(/í/g,"i").replace(/ó/g,"o").replace(/ú/g,"u").replace(/ñ/g,"n");}
function productsForCrop(value){return productCatalog[cropKey(value)]||productCatalog.general;}
function resolvedCrop(form,data){return data.crop==="otro"?(data.cropOther||"").trim():data.crop;}
function bindCropField(form){const select=form.querySelector(".crop-select"),wrap=form.querySelector(".crop-other-field"),input=wrap?.querySelector("input");if(!select)return;select.replaceChildren(option("Selecciona un cultivo",""),...crops.map(([value,label])=>option(label,value)));const sync=()=>{const other=select.value==="otro";if(wrap)wrap.hidden=!other;if(input)input.required=other;};select.addEventListener("change",sync);sync();}
document.querySelectorAll("form").forEach(form=>bindCropField(form));
function renderFarmerProducts(){
 const form=$("#eligibility"),container=$("#farmer-products");if(!form||!container)return;
 const crop=form.querySelector("[name=crop]").value,cropValue=crop==="otro"?form.querySelector("[name=cropOther]").value:crop;
 container.replaceChildren();
 productsForCrop(cropValue).forEach((label,index)=>{
  const row=document.createElement("div");row.className="product-option-row";
  const choice=document.createElement("label"),input=document.createElement("input");input.type="checkbox";input.name="products";input.value=label;input.id="farmer-product-"+index;
  const text=document.createElement("span");text.textContent=label;choice.htmlFor=input.id;choice.append(input,text);
  const quantity=document.createElement("input");quantity.type="number";quantity.name="quantity";quantity.min="0.01";quantity.max="1000000";quantity.step="0.01";quantity.placeholder="Cantidad";quantity.disabled=true;quantity.setAttribute("aria-label","Cantidad de "+label);
  const unit=document.createElement("select");unit.name="unit";unit.disabled=true;unit.setAttribute("aria-label","Unidad de "+label);["kg","bulto","litro","bolsa","unidad","tonelada"].forEach(value=>unit.append(option(value)));
  input.addEventListener("change",()=>{quantity.disabled=!input.checked;unit.disabled=!input.checked;quantity.required=input.checked;if(!input.checked)quantity.value="";});
  row.append(choice,quantity,unit);container.append(row);
 });
}
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
  $("#team-chat-panel").hidden = !authenticated || !teamEligible || currentView !== "team" || !chatOpen;
  const chatToggle=$("#toggle-team-chat"); if(chatToggle){chatToggle.hidden=!authenticated || !teamEligible || currentView!=="team";chatToggle.setAttribute("aria-expanded",String(chatOpen));chatToggle.textContent=chatOpen?"Cerrar chat del equipo":"Abrir chat del equipo";}
  $("#session-bar").hidden = !authenticated;
  $("#farmer-nav").hidden = !authenticated || currentView !== "farmer";
  $("#logout").hidden = !authenticated;
  $("#session-name").textContent = signedInUser?.displayName || signedInUser?.email || "Sesión activa";
  if (signedInUser) {
    const name = signedInUser.displayName?.split(" ")[0] || "agricultor";
    $("#farmer-name").textContent = name;
    $("#role-name").textContent = name;
    $("#team-user").textContent = teamRole(signedInUser) + " · " + signedInUser.email;
  }
  if(authenticated && currentView === "farmer") revealFarmerSections();
}

function revealFarmerSections(){
 if(!("IntersectionObserver" in window)||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
 if(!scrollRevealObserver)scrollRevealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add("is-visible");scrollRevealObserver.unobserve(entry.target);}}),{threshold:.12,rootMargin:"0px 0px -35px 0px"});
 document.querySelectorAll("#farmer .hero,#farmer .steps,#farmer .about-story,#farmer .crop-showcase,#consulta > section,#consulta > aside > section,.farmer-requests").forEach((element,index)=>{
  if(element.dataset.scrollRevealReady)return;
  element.dataset.scrollRevealReady="true";element.style.setProperty("--reveal-delay",Math.min(index%3,2)*90+"ms");element.classList.add("scroll-reveal");scrollRevealObserver.observe(element);
 });
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
 event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form)),selectedItems=[...form.querySelectorAll('input[name="products"]:checked')].map(input=>{const row=input.closest(".product-option-row");return {name:input.value,quantity:Number(row.querySelector('[name="quantity"]').value),unit:row.querySelector('[name="unit"]').value};}),selectedProducts=selectedItems.map(item=>item.name),crop=resolvedCrop(form,data);
 if(!signedInUser||!db){showResult("#eligibility-result","Inicia sesión para registrar tu solicitud.");return;}
 if(!selectedItems.length||selectedItems.some(item=>!Number.isFinite(item.quantity)||item.quantity<=0)){showResult("#eligibility-result","Selecciona al menos un producto e indica una cantidad válida para cada uno.");return;}
 const button=form.querySelector('button[type="submit"]'),link=$("#request-link");button.disabled=true;button.textContent="Registrando solicitud…";link.hidden=true;
 try{
  const request=await addDoc(collections("applications"),{uid:signedInUser.uid,name:(signedInUser.displayName||signedInUser.email||"Agricultor").slice(0,80),email:signedInUser.email,town:data.town,crop,hectares:Number(data.hectares),products:selectedProducts,items:selectedItems,status:"pendiente",consent:true,consentAt:serverTimestamp(),createdAt:serverTimestamp()});
  const covered=towns.includes(data.town);showResult("#eligibility-result",(covered?"Tu municipio está en la zona inicial de atención. ":"Consulta por WhatsApp si podemos atender tu municipio. ")+"Solicitud registrada con código "+request.id+". El equipo podrá hacer seguimiento.");
  link.href=whatsappLink("Hola, AgroCiclo. Quiero consultar financiación de agroinsumos.\\nCódigo de solicitud: "+request.id+"\\nNombre: "+(signedInUser.displayName||"Agricultor")+"\\nMunicipio: "+data.town+"\\nCultivo: "+crop+"\\nÁrea (ha): "+data.hectares+"\\nProductos: "+selectedItems.map(item=>item.name+" — "+item.quantity+" "+item.unit).join(", "));link.textContent="Abrir WhatsApp para enviar la solicitud";link.hidden=false;form.reset();renderFarmerProducts();
 }catch(error){showResult("#eligibility-result",errorText(error));}
 finally{button.disabled=false;button.textContent="Registrar solicitud";}
});
$("#simulation").addEventListener("submit",(event)=>{event.preventDefault();const d=Object.fromEntries(new FormData(event.currentTarget));const gross=Number(d.gross),balance=Number(d.balance),deduction=Math.min(gross,balance);showResult("#simulation-result","Saldo estimado para el productor: "+money(gross-deduction)+"\nDescuento por insumos: "+money(deduction));});

function startFarmerRequests(){
 if(stopFarmerListener||!signedInUser||!db)return;
 stopFarmerListener=onSnapshot(query(collections("applications"),where("uid","==",signedInUser.uid)),snapshot=>{
  farmerApplications=snapshot.docs.map(docSnap=>({id:docSnap.id,...docSnap.data()})).sort((a,b)=>(b.createdAt?.toDate?.().getTime()||0)-(a.createdAt?.toDate?.().getTime()||0));renderFarmerRequests();
 },()=>{$("#farmer-requests-list").textContent="No se pudo cargar el seguimiento. Intenta recargar la página."});
}
function stopFarmerRequests(){if(stopFarmerListener)stopFarmerListener();stopFarmerListener=null;farmerApplications=[];}
function renderFarmerRequests(){
 const container=$("#farmer-requests-list");if(!container)return;container.replaceChildren();
 if(!farmerApplications.length){const p=document.createElement("p");p.className="muted";p.textContent="Aún no tienes solicitudes. Cuando registres una, aquí verás su estado y la respuesta del equipo.";container.append(p);return;}
 farmerApplications.forEach(application=>{
  const card=document.createElement("article");card.className="farmer-request-item";
  const head=document.createElement("div");head.className="farmer-request-head";
  const title=document.createElement("strong");title.textContent=application.crop+" · "+application.town;
  const status=document.createElement("span");status.className="request-pill "+(application.status||"pendiente");status.textContent=application.status==="atendida"?"Atendida":application.status==="en_proceso"?"En proceso":"Pendiente";
  head.append(title,status);
  const details=document.createElement("p");details.className="small muted";details.textContent=(application.createdAt?.toDate?.().toLocaleDateString("es-CO")||"Reciente")+" · "+application.hectares+" ha";
  const items=document.createElement("p");items.className="small";const productText=(application.items||[]).map(item=>item.name+" · "+item.quantity+" "+item.unit);items.textContent=(productText.length?productText:(application.products||[])).join(", ");
  card.append(head,details,items);
  if(application.status==="atendida"){
   const outcome=document.createElement("p");outcome.className="request-outcome";outcome.textContent=application.decision==="aplica"?"El equipo indica que tu solicitud aplica.":application.decision==="no_aplica"?"El equipo indica que tu solicitud no aplica.":"El equipo atendió tu solicitud.";
   card.append(outcome);
   if(application.resolutionNote){const note=document.createElement("p");note.className="small";note.textContent="Respuesta del equipo: "+application.resolutionNote;card.append(note);}
   const contact=document.createElement("p");contact.className="small muted";contact.textContent=application.emailNoticeStatus==="enviado"?"Aviso enviado al correo de tu cuenta Google.":"Aviso por correo pendiente. El equipo puede contactarte también por WhatsApp.";card.append(contact);
  } else {
   const progress=document.createElement("p");progress.className="small muted";progress.textContent=application.status==="en_proceso"?"Un integrante del equipo está revisando tu solicitud.":"El equipo recibirá tu solicitud y la revisará.";card.append(progress);
  }
  container.append(card);
 });
}
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
const requestStatuses=[["pendiente","Pendiente"],["en_proceso","En proceso"]];
function renderApplications(){
 const container=$("#application-table"),counts={pendiente:0,en_proceso:0,atendida:0};
 applications.forEach(item=>counts[item.status||"pendiente"]=(counts[item.status||"pendiente"]||0)+1);
 const total=applications.length, active=counts.pendiente+counts.en_proceso;
 $("#pending-count").textContent=counts.pendiente+(counts.pendiente===1?" pendiente":" pendientes");
 document.querySelectorAll("[data-request-filter]").forEach(button=>{
  const filter=button.dataset.requestFilter,count=filter==="todas"?total:counts[filter]||0;
  const badge=button.querySelector("b");if(badge)badge.textContent=String(count);
  button.classList.toggle("active",filter===requestFilter);
 });
 const shown=requestFilter==="todas"?applications:applications.filter(item=>(item.status||"pendiente")===requestFilter);
 if(!shown.length){container.textContent=requestFilter==="pendiente"?"No hay solicitudes pendientes. Las nuevas aparecerán aquí.":"No hay solicitudes en esta categoría.";return;}
 const t=document.createElement("table"),head=t.createTHead().insertRow();
 ["Fecha","Agricultor","Correo","Municipio","Cultivo","Área (ha)","Productos y cantidades","Estado","Resultado y notificación"].forEach(label=>{const th=document.createElement("th");th.textContent=label;head.append(th);});
 const body=t.createTBody();
 shown.forEach(application=>{
  const row=body.insertRow();
  [application.createdAt?.toDate?.().toLocaleString("es-CO")||"Reciente",application.name,application.email,application.town,application.crop,String(application.hectares),((application.items||[]).map(item=>item.name+" · "+item.quantity+" "+item.unit).join(", ")||(application.products||[]).join(", "))].forEach(value=>td(row,value||""));
  const cell=row.insertCell(),select=document.createElement("select");select.className="request-status";select.dataset.applicationId=application.id;select.dataset.previous=application.status||"pendiente";select.setAttribute("aria-label","Estado de solicitud de "+application.name);
  if(application.status==="atendida"){select.append(option("Atendida","atendida"));select.value="atendida";select.disabled=true;}else{requestStatuses.forEach(([value,label])=>select.append(option(label,value)));select.value=application.status||"pendiente";}cell.append(select);
   const resultCell=row.insertCell();
   if(application.status==="atendida"&&application.decision){
    const outcome=document.createElement("strong");outcome.textContent=application.decision==="aplica"?"Aplica":"No aplica";resultCell.append(outcome);
    if(application.resolutionNote){const note=document.createElement("p");note.className="small";note.textContent=application.resolutionNote;resultCell.append(note);}
    const emailState=document.createElement("p");emailState.className="small muted";emailState.textContent=application.emailNoticeStatus==="enviado"?"Correo enviado":"Correo pendiente de envío";resultCell.append(emailState);
    if(emailErrors.has(application.id)){const errorNote=document.createElement("p");errorNote.className="small danger-text";errorNote.textContent=emailErrors.get(application.id);resultCell.append(errorNote);}
    const resend=document.createElement("button");resend.type="button";resend.className="button outline small-button";resend.dataset.emailApplication=application.id;resend.textContent=application.emailNoticeStatus==="enviado"?"Reenviar correo":"Enviar correo";resultCell.append(resend);
   }else{
    const form=document.createElement("form");form.className="resolve-request-form";
    const decision=document.createElement("select");decision.name="decision";decision.required=true;decision.append(option("Selecciona resultado",""),option("Aplica","aplica"),option("No aplica","no_aplica"));
    const note=document.createElement("textarea");note.name="resolutionNote";note.maxLength=500;note.rows=2;note.placeholder="Respuesta breve para el agricultor (opcional)";
    const finish=document.createElement("button");finish.type="submit";finish.className="button forest small-button";finish.textContent="Atender y notificar";form.append(decision,note,finish);
    form.addEventListener("submit",event=>{event.preventDefault();finalizeApplication(application.id,form,finish);});resultCell.append(form);
   }
 });
 container.replaceChildren(t);
}
function renderProducers(){
 const container=$("#producer-table");
 if(!producers.length){container.textContent="Aún no hay productores registrados.";return;}
 const t=document.createElement("table"),head=t.createTHead().insertRow();
 ["Productor","Municipio","Cultivo","Área (ha)","Saldo pendiente","Acciones"].forEach(label=>{const th=document.createElement("th");th.textContent=label;head.append(th);});
 const body=t.createTBody();
 producers.forEach(producer=>{
  const row=body.insertRow();
  [producer.name,producer.town,producer.crop,String(producer.hectares),money(balanceFor(producer.id))].forEach(value=>td(row,value||""));
  const cell=row.insertCell();if(!isManager(signedInUser)){cell.textContent="Solo gerente";return;}const remove=document.createElement("button");remove.type="button";remove.className="button danger small-button";remove.textContent="Eliminar";remove.setAttribute("aria-label","Eliminar productor "+producer.name);remove.addEventListener("click",async()=>{
   if(entries.some(item=>item.producerId===producer.id)){ $("#team-status").textContent="No se puede eliminar: este productor tiene movimientos en el historial. Conservamos esos registros para proteger la trazabilidad.";return; }
   if(!window.confirm("¿Eliminar el registro de "+producer.name+"? Esta acción no se puede deshacer."))return;
   remove.disabled=true;try{await deleteDoc(doc(db,"producers",producer.id));await refresh();$("#team-status").textContent="Productor eliminado.";}catch(error){remove.disabled=false;$("#team-status").textContent=errorText(error);}
  });cell.append(remove);
 });
 container.replaceChildren(t);
}
function addQuoteLine(){
 const holder=$("#quote-lines"),row=document.createElement("div");row.className="quote-line";
 const productLabel=document.createElement("label");productLabel.textContent="Producto";
 const product=document.createElement("select");product.name="product";product.required=true;productLabel.append(product);
 const customLabel=document.createElement("label");customLabel.className="quote-custom";customLabel.textContent="Describe el producto";
 const custom=document.createElement("input");custom.name="customProduct";custom.maxLength=100;customLabel.append(custom);customLabel.hidden=true;
 const qtyLabel=document.createElement("label");qtyLabel.textContent="Cantidad";
 const qty=document.createElement("input");qty.name="quantity";qty.type="number";qty.min="0.01";qty.max="1000000";qty.step="0.01";qty.value="1";qty.required=true;qtyLabel.append(qty);
 const priceLabel=document.createElement("label");priceLabel.textContent="Precio unitario (COP)";
 const price=document.createElement("input");price.name="unitPrice";price.type="number";price.min="0";price.max="999999999999";price.step="1";price.required=true;price.placeholder="0";priceLabel.append(price);
 const lineTotal=document.createElement("strong");lineTotal.className="quote-line-total";lineTotal.textContent=money(0);
 const remove=document.createElement("button");remove.type="button";remove.className="button outline small-button";remove.textContent="Quitar";remove.addEventListener("click",()=>{row.remove();if(!holder.children.length)addQuoteLine();updateQuoteTotal();});
 product.addEventListener("change",()=>{customLabel.hidden=product.value!=="__otro";custom.required=product.value==="__otro";});
 qty.addEventListener("input",updateQuoteTotal);price.addEventListener("input",updateQuoteTotal);
 row.append(productLabel,customLabel,qtyLabel,priceLabel,lineTotal,remove);holder.append(row);fillQuoteProducts(row);updateQuoteTotal();
}
function fillQuoteProducts(row){
 const select=row.querySelector('[name="product"]'),crop=$("#quote-form [name=crop]").value,previous=select.value;
 select.replaceChildren(option("Selecciona un producto",""),...productsForCrop(crop).map(item=>option(item)),option("Otro producto o servicio","__otro"));
 if([...select.options].some(item=>item.value===previous))select.value=previous;
 const custom=row.querySelector(".quote-custom"),input=custom.querySelector("input");custom.hidden=select.value!=="__otro";input.required=select.value==="__otro";
}
function updateQuoteTotal(){
 const rows=[...$("#quote-lines").querySelectorAll(".quote-line")];let total=0;
 rows.forEach(row=>{const qty=Number(row.querySelector('[name="quantity"]').value)||0,price=Number(row.querySelector('[name="unitPrice"]').value)||0,line=qty*price;total+=line;row.querySelector(".quote-line-total").textContent=money(line);});
 $("#quote-total").textContent=money(total);
}
function quoteText(tag,text,className){const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;}
function buildQuote(event){
 event.preventDefault();const form=$("#quote-form"),data=formData(form),rows=[...$("#quote-lines").querySelectorAll(".quote-line")];
 const items=rows.map(row=>{const product=row.querySelector('[name="product"]').value,customProduct=row.querySelector('[name="customProduct"]').value;return {name:product==="__otro"?customProduct.trim():product,quantity:Number(row.querySelector('[name="quantity"]').value),unitPrice:Number(row.querySelector('[name="unitPrice"]').value)};});
 if(items.some(item=>!item.name)){ $("#quote-status").textContent="Completa el nombre del producto personalizado.";return; }
 quoteSequence++;const now=new Date(),number="COT-"+now.getFullYear()+String(now.getMonth()+1).padStart(2,"0")+String(now.getDate()).padStart(2,"0")+"-"+String(quoteSequence).padStart(3,"0")+"-"+Math.random().toString(36).slice(2,5).toUpperCase(),expires=new Date(now);expires.setDate(expires.getDate()+Number(data.validDays));
 const total=items.reduce((sum,item)=>sum+item.quantity*item.unitPrice,0),doc=$("#quote-document");doc.replaceChildren();
 const brand=quoteText("p","AGROCICLO DEL SINÚ S.A.S. · CÓRDOBA","eyebrow");
 doc.append(brand,quoteText("h1","Cotización"),quoteText("p","N.º "+number+" · Fecha: "+now.toLocaleDateString("es-CO")));
 const client=document.createElement("div");client.className="quote-client";client.append(quoteText("p","Cliente: "+data.client),quoteText("p","Contacto: "+(data.contact||"No indicado")),quoteText("p","Municipio: "+data.town),quoteText("p","Cultivo: "+(data.crop==="otro"?(data.cropOther||"Otro cultivo"):(crops.find(([value])=>value===data.crop)?.[1]||data.crop))),quoteText("p","Válida hasta: "+expires.toLocaleDateString("es-CO")));doc.append(client);
 const tableEl=document.createElement("table"),thead=tableEl.createTHead().insertRow();["Producto o servicio","Cantidad","Valor unitario","Total"].forEach(label=>{const th=document.createElement("th");th.textContent=label;thead.append(th);});
 const tbody=tableEl.createTBody();items.forEach(item=>{const tr=tbody.insertRow();[item.name,String(item.quantity),money(item.unitPrice),money(item.quantity*item.unitPrice)].forEach(value=>td(tr,value));});doc.append(tableEl,quoteText("h2","Total estimado: "+money(total),"quote-grand-total"),quoteText("p","Cotización comercial sujeta a disponibilidad y confirmación de condiciones. Este documento no es factura electrónica.","quote-disclaimer"),quoteText("p","AgroCiclo del Sinú S.A.S. · Córdoba, Colombia","quote-footer"));
 doc.hidden=false;$("#print-quote").hidden=false;$("#quote-status").textContent="Cotización preparada. Puedes imprimirla o guardarla como PDF.";
}
function requestGmailAccessToken(forceAuthorization=false){
 if(!forceAuthorization&&gmailAccessToken&&Date.now()<gmailAccessTokenExpiresAt-60000)return Promise.resolve(gmailAccessToken);
 if(forceAuthorization){gmailAccessToken="";gmailAccessTokenExpiresAt=0;}
 const provider=new GoogleAuthProvider();
 provider.addScope("https://www.googleapis.com/auth/gmail.send");
 provider.addScope("email");
 if(forceAuthorization)provider.setCustomParameters({prompt:"consent"});
 return reauthenticateWithPopup(signedInUser,provider).then(result=>{
  if(result.user.email?.toLowerCase()!==signedInUser.email?.toLowerCase())throw new Error("Autoriza el mismo correo institucional con el que abriste el panel.");
  const credential=GoogleAuthProvider.credentialFromResult(result),token=credential?.accessToken;
  if(!token)throw new Error("Google no entregó permiso de envío. Vuelve a autorizar el correo.");
  gmailAccessToken=token;gmailAccessTokenExpiresAt=Date.now()+50*60*1000;
  $("#email-auth-status").textContent="Correo autorizado para esta sesión: "+signedInUser.email;
  return token;
 });
}
async function sendStatusEmail(id,button,accessToken){
 if(!signedInUser)return;button.disabled=true;$("#team-status").textContent="Enviando respuesta por correo…";
 try{
  const token=await signedInUser.getIdToken();
  const response=await fetch("/api/send-application-email",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify({applicationId:id,googleAccessToken:accessToken})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.message||"No se pudo enviar el correo.");
  await updateDoc(doc(db,"applications",id),{emailNoticeStatus:"enviado",emailNoticeSentAt:serverTimestamp(),updatedAt:serverTimestamp()});
  emailErrors.delete(id);
  await refresh();$("#team-status").textContent="Respuesta enviada al correo del agricultor.";
 }catch(error){button.disabled=false;const message=error.message||errorText(error);emailErrors.set(id,message);const current=applications.find(item=>item.id===id);if(current?.status==="atendida")await updateDoc(doc(db,"applications",id),{emailNoticeStatus:"pendiente",updatedAt:serverTimestamp()}).catch(()=>{});renderApplications();$("#team-status").textContent=message;}
}
async function finalizeApplication(id,form,button){
 const data=formData(form),decision=data.decision,resolutionNote=String(data.resolutionNote||"").trim();
 if(!["aplica","no_aplica"].includes(decision))return;
 button.disabled=true;$("#team-status").textContent="Guardando respuesta y notificando…";
 try{
  const accessToken=await requestGmailAccessToken();
  await updateDoc(doc(db,"applications",id),{status:"atendida",decision,resolutionNote,decidedBy:signedInUser.email,decidedAt:serverTimestamp(),updatedAt:serverTimestamp()});
  await refresh();
  const emailButton=$("#application-table button[data-email-application='"+id+"']")||button;
  await sendStatusEmail(id,emailButton,accessToken);
 }catch(error){button.disabled=false;$("#team-status").textContent=error.message||errorText(error);}
}
async function refresh(){
 producers=await readRows("producers");entries=await readRows("entries");applications=await readRows("applications");
 document.querySelectorAll(".producers").forEach(select=>{const value=select.value;select.replaceChildren(option("Selecciona un productor",""));producers.forEach(p=>select.append(option(p.name+" · "+p.town,p.id)));select.value=value;});
 const total=producers.reduce((sum,p)=>sum+balanceFor(p.id),0);
 const activeRequests=applications.filter(a=>["pendiente","en_proceso"].includes(a.status)).length;
 const cards=[["Productores",producers.length],["Solicitudes por atender",activeRequests],["Saldo de insumos",money(total)],["Liquidaciones",entries.filter(e=>e.type==="harvest").length]];
 $("#totals").replaceChildren(...cards.map(([label,value])=>{const d=document.createElement("div");d.className="total";const strong=document.createElement("strong");strong.textContent=value;d.append(strong,label);return d;}));
 renderProducers();
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
$("#authorize-email").addEventListener("click",async(event)=>{
 const button=event.currentTarget;button.disabled=true;$("#email-auth-status").textContent="Solicitando autorización a Google…";
 try{await requestGmailAccessToken(true);$("#email-auth-status").textContent="Permiso de envío renovado para esta sesión: "+signedInUser.email;}
 catch(error){$("#email-auth-status").textContent=error.message||"No se pudo autorizar el correo.";}
 finally{button.disabled=false;}
});
$("#application-table").addEventListener("click",async(event)=>{
 const button=event.target.closest("button[data-email-application]");if(!button)return;
 button.disabled=true;$("#team-status").textContent="Preparando el correo…";
 try{const accessToken=await requestGmailAccessToken();await sendStatusEmail(button.dataset.emailApplication,button,accessToken);}
 catch(error){button.disabled=false;$("#team-status").textContent=error.message||"No se pudo autorizar el correo.";}
});
document.querySelectorAll("[data-request-filter]").forEach(button=>button.addEventListener("click",()=>{requestFilter=button.dataset.requestFilter;renderApplications();}));
$("#toggle-team-chat").addEventListener("click",()=>{chatOpen=!chatOpen;setPage();if(chatOpen)$("#team-chat-panel").scrollIntoView({behavior:"smooth",block:"start"});});
$("#close-team-chat").addEventListener("click",()=>{chatOpen=false;setPage();$("#toggle-team-chat").focus();});
$("#add-quote-line").addEventListener("click",addQuoteLine);
$("#quote-form").addEventListener("submit",buildQuote);
$("#quote-form").addEventListener("input",updateQuoteTotal);
$("#quote-form [name=crop]").addEventListener("change",()=>document.querySelectorAll("#quote-lines .quote-line").forEach(fillQuoteProducts));
$("#print-quote").addEventListener("click",()=>window.print());
addQuoteLine();
$("#open-team").addEventListener("click",async()=>{
 if(!isTeamUser(signedInUser))return;
 currentView="team";chatOpen=false;setPage();startTeamRealtime();
 try{await refresh();$("#team-status").textContent="Datos actualizados.";}
 catch(error){$("#team-status").textContent=errorText(error);}
});
$("#open-farmer").addEventListener("click",()=>{stopTeamRealtime();currentView="farmer";setPage();startFarmerRequests();});
$("#back-to-roles").addEventListener("click",()=>{if(isTeamUser(signedInUser)){stopTeamRealtime();stopFarmerRequests();currentView="roles";setPage();}});
$("#logout").addEventListener("click",()=>{gmailAccessToken="";gmailAccessTokenExpiresAt=0;stopTeamRealtime();stopFarmerRequests();signOut(auth);});
$("#team-chat-form").addEventListener("submit",async(event)=>{
 event.preventDefault();const form=event.currentTarget,message=String(new FormData(form).get("message")||"").trim(),status=$("#chat-status");if(!message||!isTeamUser(signedInUser))return;
 const button=form.querySelector("button[type=submit]");button.disabled=true;status.textContent="Enviando…";
 try{await addDoc(collections("team_chat"),{uid:signedInUser.uid,name:signedInUser.displayName||signedInUser.email,email:signedInUser.email,role:isManager(signedInUser)?"gerente":"colaborador",message,createdAt:serverTimestamp()});form.reset();status.textContent="Mensaje enviado al equipo.";}catch(error){status.textContent=errorText(error);}finally{button.disabled=false;}
});
function isManager(user){return user?.email?.toLowerCase()===managerEmail;}
function writePresence(online){if(!signedInUser||!isTeamUser(signedInUser)||!db)return Promise.resolve();return setDoc(doc(db,"team_presence",signedInUser.uid),{uid:signedInUser.uid,name:signedInUser.displayName||signedInUser.email,email:signedInUser.email,role:isManager(signedInUser)?"gerente":"colaborador",online,lastSeen:serverTimestamp()},{merge:true});}
function renderPresence(){const box=$("#team-presence");if(!box)return;const now=Date.now(),active=presenceRows.filter(row=>row.online&&(row.uid===signedInUser?.uid||(row.lastSeen?.toDate&&now-row.lastSeen.toDate().getTime()<120000))).sort((a,b)=>a.name.localeCompare(b.name));box.replaceChildren();const heading=document.createElement("strong");heading.textContent="En el equipo ahora · "+active.length;box.append(heading);if(!active.length){const empty=document.createElement("span");empty.className="small muted";empty.textContent="Sin miembros activos";box.append(empty);return;}const list=document.createElement("div");list.className="presence-list";active.forEach(person=>{const item=document.createElement("span");item.className="presence-person";const dot=document.createElement("i");dot.className="online-dot";const label=document.createElement("span");label.textContent=person.name+" · "+(person.role==="gerente"?"Gerente":"Colaborador");item.append(dot,label);list.append(item);});box.append(list);}
function renderChat(snapshot){
 latestChatSnapshot=snapshot;
 const feed=$("#team-chat-feed"),messages=snapshot.docs.map(docSnap=>({id:docSnap.id,...docSnap.data()})).reverse();feed.replaceChildren();
 if(!messages.length){const empty=document.createElement("p");empty.className="muted small";empty.textContent="Aún no hay mensajes. Comparte la primera actualización con el equipo.";feed.append(empty);return;}
 messages.forEach(entry=>{
  const own=entry.uid===signedInUser?.uid,canDelete=own||isManager(signedInUser),bubble=document.createElement("article");bubble.className="chat-message"+(own?" own":"");
  const meta=document.createElement("div");meta.className="chat-meta";
  const author=document.createElement("strong");author.textContent=entry.name||entry.email||"Equipo";
  const role=document.createElement("span");role.className="role-badge"+(entry.role==="gerente"?" manager":"");role.textContent=entry.role==="gerente"?"Gerente":"Colaborador";
  const time=document.createElement("time");time.textContent=(entry.createdAt?.toDate?.().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})||"Ahora")+(entry.editedAt?" · editado":"");
  meta.append(author,role,time);const body=document.createElement("p");body.className="chat-message-body";body.textContent=entry.message;bubble.append(meta,body);
  const actions=document.createElement("div");actions.className="chat-actions";
  if(own){const edit=document.createElement("button");edit.type="button";edit.className="chat-action";edit.textContent="Editar";edit.addEventListener("click",()=>beginMessageEdit(entry,bubble));actions.append(edit);}
  if(canDelete){const remove=document.createElement("button");remove.type="button";remove.className="chat-action danger-text";remove.textContent="Eliminar";remove.addEventListener("click",async()=>{
   if(!window.confirm(own?"¿Eliminar tu mensaje del chat?":"Como gerente, ¿eliminar este mensaje del equipo?"))return;
   remove.disabled=true;$("#chat-status").textContent="Eliminando mensaje…";
   try{await deleteDoc(doc(db,"team_chat",entry.id));$("#chat-status").textContent="Mensaje eliminado.";}catch(error){remove.disabled=false;$("#chat-status").textContent=errorText(error);}
  });actions.append(remove);}
  if(actions.children.length)bubble.append(actions);feed.append(bubble);
 });
 feed.scrollTop=feed.scrollHeight;
}
function beginMessageEdit(entry,bubble){
 const body=bubble.querySelector(".chat-message-body"),form=document.createElement("form");form.className="message-edit-form";
 const area=document.createElement("textarea");area.name="message";area.rows=3;area.maxLength=1800;area.required=true;area.value=entry.message;
 const actions=document.createElement("div");actions.className="chat-actions";
 const save=document.createElement("button");save.type="submit";save.className="chat-action";save.textContent="Guardar";
 const cancel=document.createElement("button");cancel.type="button";cancel.className="chat-action";cancel.textContent="Cancelar";cancel.addEventListener("click",()=>{if(latestChatSnapshot)renderChat(latestChatSnapshot);});
 actions.append(save,cancel);form.append(area,actions);body.replaceWith(form);area.focus();
 form.addEventListener("submit",async event=>{
  event.preventDefault();const message=area.value.trim();if(!message)return;
  save.disabled=true;cancel.disabled=true;$("#chat-status").textContent="Guardando cambios…";
  try{await updateDoc(doc(db,"team_chat",entry.id),{message,editedAt:serverTimestamp()});$("#chat-status").textContent="Mensaje actualizado.";}
  catch(error){save.disabled=false;cancel.disabled=false;$("#chat-status").textContent=errorText(error);}
 });
}
function startTeamRealtime(){if(teamRealtimeActive||!isTeamUser(signedInUser))return;teamRealtimeActive=true;writePresence(true).catch(error=>{$("#team-status").textContent=errorText(error);});stopChatListener=onSnapshot(query(collections("team_chat"),orderBy("createdAt","desc"),limit(80)),renderChat,error=>{$("#chat-status").textContent=errorText(error);});stopPresenceListener=onSnapshot(collections("team_presence"),snapshot=>{presenceRows=snapshot.docs.map(docSnap=>docSnap.data());renderPresence();},error=>{$("#team-status").textContent=errorText(error);});presenceHeartbeat=setInterval(()=>writePresence(true).catch(error=>{$("#team-status").textContent=errorText(error);}),60000);presenceRefresh=setInterval(renderPresence,20000);}
function stopTeamRealtime(){if(presenceHeartbeat)clearInterval(presenceHeartbeat);if(presenceRefresh)clearInterval(presenceRefresh);presenceHeartbeat=null;presenceRefresh=null;if(stopChatListener)stopChatListener();if(stopPresenceListener)stopPresenceListener();stopChatListener=null;stopPresenceListener=null;if(teamRealtimeActive)writePresence(false).catch(()=>{});teamRealtimeActive=false;}
if(configured){
 const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
 onAuthStateChanged(auth,user=>{
  if(signedInUser&&signedInUser.uid!==user?.uid){gmailAccessToken="";gmailAccessTokenExpiresAt=0;stopTeamRealtime();stopFarmerRequests();}
  signedInUser=user;
  if(!user)currentView="login";
  else currentView=isTeamUser(user)?"roles":"farmer";
  setPage();if(!user)renderFarmerProducts();else if(!isTeamUser(user))startFarmerRequests();
 });
}else{
 setPage();
}
