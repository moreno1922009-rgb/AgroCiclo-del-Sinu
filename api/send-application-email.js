const PROJECT_ID = "agrociclo-del-sinu";
const FIREBASE_API_KEY = "AIzaSyCfGk0V8zwRBaL3mA-Q4z3R9qznNj6uvcI";
const MANAGER_EMAIL = "dmorenom3@unicartagena.edu.co";

function field(document, name) {
  return document?.fields?.[name]?.stringValue ?? "";
}

function numberField(document, name) {
  return Number(document?.fields?.[name]?.integerValue ?? document?.fields?.[name]?.doubleValue ?? 0);
}

function cleanHeader(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function encodeBase64Lines(value) {
  return Buffer.from(value, "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") || "";
}

function encodeRawMessage(to, replyTo, subject, text, html) {
  const subjectHeader = "=?UTF-8?B?" + Buffer.from(subject, "utf8").toString("base64") + "?=";
  const boundary = "agrociclo_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
  const mime = [
    "To: " + cleanHeader(to),
    "Reply-To: " + cleanHeader(replyTo),
    "Subject: " + subjectHeader,
    "MIME-Version: 1.0",
    'Content-Type: multipart/alternative; boundary="' + boundary + '"',
    "",
    "--" + boundary,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encodeBase64Lines(text),
    "--" + boundary,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encodeBase64Lines(html),
    "--" + boundary + "--",
    "",
  ].join("\r\n");
  return Buffer.from(mime, "utf8").toString("base64url");
}

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ message: "Método no permitido." });
  }

  const idToken = String(request.headers.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1];
  const googleAccessToken = typeof request.body?.googleAccessToken === "string" ? request.body.googleAccessToken : "";
  const applicationId = typeof request.body?.applicationId === "string" ? request.body.applicationId.trim() : "";
  if (!idToken || !/^[A-Za-z0-9_-]{10,64}$/.test(applicationId) || googleAccessToken.length < 20 || googleAccessToken.length > 4096) {
    return response.status(400).json({ message: "La sesión, autorización de Google o solicitud no son válidas." });
  }

  try {
    const identityResponse = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_API_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!identityResponse.ok) return response.status(401).json({ message: "La sesión expiró. Vuelve a iniciar sesión." });
    const identity = await identityResponse.json();
    const user = identity.users?.[0];
    const email = String(user?.email || "").toLowerCase();
    if (!user?.emailVerified || !/^[^@]+@unicartagena\.edu\.co$/.test(email)) {
      return response.status(403).json({ message: "Solo el equipo institucional puede enviar respuestas." });
    }

    const googleIdentityResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: "Bearer " + googleAccessToken },
    });
    if (!googleIdentityResponse.ok) {
      console.error("gmail_identity_check_failed", googleIdentityResponse.status);
      return response.status(401).json({ message: "Google no confirmó la cuenta autorizada. Pulsa Autorizar mi correo y vuelve a intentar." });
    }
    const googleIdentity = await googleIdentityResponse.json();
    if (String(googleIdentity.email || "").toLowerCase() !== email || googleIdentity.email_verified !== true) {
      return response.status(403).json({ message: "Autoriza el mismo correo institucional con el que abriste el panel." });
    }

    const documentUrl = "https://firestore.googleapis.com/v1/projects/" + PROJECT_ID +
      "/databases/(default)/documents/applications/" + encodeURIComponent(applicationId);
    const documentResponse = await fetch(documentUrl, { headers: { Authorization: "Bearer " + idToken } });
    if (!documentResponse.ok) return response.status(404).json({ message: "No se encontró la solicitud o no tienes acceso." });
    const document = await documentResponse.json();
    const status = field(document, "status");
    const decision = field(document, "decision");
    if (status !== "atendida" || !["aplica", "no_aplica"].includes(decision)) {
      return response.status(409).json({ message: "Primero guarda el resultado de la solicitud." });
    }

    const to = field(document, "email");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return response.status(422).json({ message: "La solicitud no tiene un correo válido para responder." });
    }

    const name = field(document, "name") || "Agricultor";
    const cropRaw = field(document, "crop");
    const cropLabels = { maiz: "Maíz", arroz: "Arroz", frijol: "Frijol", yuca: "Yuca", name: "Ñame", ñame: "Ñame" };
    const crop = cropLabels[cropRaw.toLowerCase()] || (cropRaw ? cropRaw.charAt(0).toLocaleUpperCase("es-CO") + cropRaw.slice(1) : "No indicado");
    const town = field(document, "town");
    const note = field(document, "resolutionNote").replace(/\*\*/g, "").trim();
    const applies = decision === "aplica";
    const subject = "Resultado de su solicitud: " + (applies ? "Aplica" : "No aplica") + " | AgroCiclo del Sinú";
    const decisionText = applies
      ? "Una vez revisada la información registrada, le informamos que su solicitud aplica para continuar con el proceso de revisión y coordinación. Esta respuesta no confirma por sí sola la disponibilidad de los productos ni el cierre de una financiación. Nuestro equipo se comunicará con usted para validar los siguientes pasos."
      : "Una vez revisada la información registrada, le informamos que su solicitud no aplica bajo las condiciones actuales de AgroCiclo. Si considera que debemos revisar algún dato o desea consultar otra alternativa, puede responder a este correo.";
    const items = document.fields?.items?.arrayValue?.values || [];
    const products = items.map((item) => {
      const fields = item.mapValue?.fields || {};
      return field({ fields }, "name") + " — " + numberField({ fields }, "quantity") + " " + field({ fields }, "unit");
    }).filter((item) => item !== " — 0 ");
    const hectares = numberField(document, "hectares");
    const formattedProducts = products.length ? products : ["No se registraron productos."];
    const text = [
      "AGROCICLO DEL SINÚ S.A.S.",
      "Córdoba, Colombia",
      "",
      "RESPUESTA A SU SOLICITUD",
      "",
      "Estimada/o " + name + ":",
      "",
      "Reciba un cordial saludo.",
      "",
      decisionText,
      "",
      "RESUMEN DE LA SOLICITUD",
      "Cultivo: " + crop,
      "Municipio: " + town,
      ...(hectares ? ["Área reportada: " + hectares + " ha"] : []),
      "Productos solicitados:",
      ...formattedProducts.map((product) => "- " + product),
      ...(note ? ["", "OBSERVACIÓN DEL EQUIPO", note] : []),
      "",
      "Para realizar una consulta o aportar información adicional, puede responder directamente a este correo. También puede comunicarse con AgroCiclo por WhatsApp al +57 324 317 5381.",
      "",
      "Atentamente,",
      "Equipo de Atención",
      "AgroCiclo del Sinú S.A.S.",
      "Córdoba, Colombia",
    ].join("\n");
    const productRows = formattedProducts.map((product) =>
      '<tr><td style="padding:10px 12px;border-bottom:1px solid #e7ece7;color:#26382e;font-size:14px">' + escapeHtml(product) + "</td></tr>"
    ).join("");
    const html = '<!doctype html><html lang="es"><body style="margin:0;padding:24px 10px;background:#f2f5f1;font-family:Arial,Helvetica,sans-serif;color:#26382e">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e0e7df;border-radius:12px;overflow:hidden">' +
      '<tr><td style="padding:24px 30px;background:#193e2c;color:#ffffff"><div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#d9e7d9">AGROCICLO DEL SINÚ</div><div style="font-size:14px;margin-top:6px;color:#ffffff">Sociedad por Acciones Simplificada · Córdoba, Colombia</div></td></tr>' +
      '<tr><td style="padding:30px"><div style="display:inline-block;padding:7px 11px;background:#edf4ea;color:#315d3e;border-radius:20px;font-size:11px;font-weight:bold;letter-spacing:1px">RESPUESTA A SU SOLICITUD</div>' +
      '<h1 style="margin:18px 0 16px;font-size:25px;line-height:1.25;color:#193e2c">Resultado: ' + (applies ? "Aplica" : "No aplica") + "</h1>" +
      '<p style="margin:0 0 14px;font-size:15px;line-height:1.7">Estimada/o ' + escapeHtml(name) + ":</p>" +
      '<p style="margin:0 0 22px;font-size:15px;line-height:1.7">Reciba un cordial saludo. ' + escapeHtml(decisionText) + "</p>" +
      '<h2 style="margin:0 0 10px;font-size:16px;color:#193e2c">Resumen de la solicitud</h2>' +
      '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#f8faf7;border:1px solid #e7ece7;border-radius:8px">' +
      '<tr><td style="padding:10px 12px;border-bottom:1px solid #e7ece7;font-size:14px"><strong>Municipio:</strong> ' + escapeHtml(town) + "</td></tr>" +
      '<tr><td style="padding:10px 12px;border-bottom:1px solid #e7ece7;font-size:14px"><strong>Cultivo:</strong> ' + escapeHtml(crop) + "</td></tr>" +
      (hectares ? '<tr><td style="padding:10px 12px;border-bottom:1px solid #e7ece7;font-size:14px"><strong>Área reportada:</strong> ' + escapeHtml(hectares) + " ha</td></tr>" : "") +
      '<tr><td style="padding:10px 12px 4px;font-size:14px"><strong>Productos solicitados</strong></td></tr>' + productRows +
      "</table>" +
      (note ? '<div style="margin-top:20px;padding:15px 17px;border-left:4px solid #78a66e;background:#f4f8f1"><div style="margin-bottom:6px;font-size:12px;font-weight:bold;letter-spacing:.6px;color:#315d3e;text-transform:uppercase">Observación del equipo</div><div style="font-size:14px;line-height:1.65">' + escapeHtml(note).replace(/\n/g, "<br>") + "</div></div>" : "") +
      '<p style="margin:24px 0 10px;font-size:14px;line-height:1.7">Para realizar una consulta o aportar información adicional, responda directamente a este correo o contáctenos por WhatsApp.</p>' +
      '<p style="margin:0 0 24px"><a href="https://wa.me/573243175381" style="display:inline-block;padding:11px 16px;border-radius:6px;background:#193e2c;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold">Contactar por WhatsApp</a></p>' +
      '<p style="margin:0;font-size:14px;line-height:1.6">Atentamente,<br><strong>Equipo de Atención</strong><br>AgroCiclo del Sinú S.A.S.<br>Córdoba, Colombia</p></td></tr>' +
      '<tr><td style="padding:15px 30px;background:#f8faf7;border-top:1px solid #e7ece7;color:#68766b;font-size:11px;line-height:1.5">Esta comunicación contiene el resultado registrado por AgroCiclo para la solicitud indicada. Para responder, utilice este mismo correo.</td></tr>' +
      "</table></body></html>";
    const raw = encodeRawMessage(to, email, subject, text, html);
    const mailResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + googleAccessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
    if (!mailResponse.ok) {
      const mailError = await mailResponse.json().catch(() => ({}));
      const reason = String(mailError.error?.status || mailError.error?.errors?.[0]?.reason || "unknown");
      const providerMessage = String(mailError.error?.message || "").slice(0, 240);
      console.error("gmail_send_failed", JSON.stringify({ httpStatus: mailResponse.status, reason, providerMessage }));
      const message = reason === "SERVICE_DISABLED"
        ? "Gmail API está desactivada en Google Cloud para este proyecto."
        : /insufficient permission|insufficient authentication scopes/i.test(providerMessage)
          ? "Google no concedió el permiso gmail.send. Pulsa Autorizar / renovar permiso y acepta el envío de correos."
        : mailResponse.status === 401
          ? "La autorización de Gmail venció. Pulsa Autorizar mi correo e inténtalo de nuevo."
          : mailResponse.status === 403
            ? "Google o la Universidad bloqueó el permiso de envío. Revisa la autorización de Gmail API con soporte institucional."
            : "Gmail no pudo enviar el aviso (" + reason + "). Revisa el error y vuelve a intentar.";
      return response.status(502).json({ message, reason });
    }
    return response.status(200).json({ sent: true, sender: email });
  } catch (error) {
    console.error("application_email_handler_failed", error?.name || "UnknownError");
    return response.status(500).json({ message: "No se pudo procesar el envío. Intenta nuevamente." });
  }
};
