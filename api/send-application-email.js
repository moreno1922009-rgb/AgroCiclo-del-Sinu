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

function encodeRawMessage(to, replyTo, subject, body) {
  const subjectHeader = "=?UTF-8?B?" + Buffer.from(subject, "utf8").toString("base64") + "?=";
  const bodyBase64 = Buffer.from(body, "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") || "";
  const mime = [
    "To: " + cleanHeader(to),
    "Reply-To: " + cleanHeader(replyTo),
    "Subject: " + subjectHeader,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    bodyBase64,
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
    const crop = field(document, "crop");
    const town = field(document, "town");
    const note = field(document, "resolutionNote");
    const applies = decision === "aplica";
    const subject = applies ? "Tu solicitud sí aplica | AgroCiclo del Sinú" : "Resultado de tu solicitud | AgroCiclo del Sinú";
    const decisionText = applies
      ? "Después de revisar la información que compartiste, tu solicitud sí aplica para continuar con el proceso. El equipo se comunicará contigo para revisar disponibilidad y los siguientes pasos."
      : "Después de revisar la información que compartiste, tu solicitud no aplica a las condiciones actuales de AgroCiclo. Si tienes información adicional o deseas consultar otra opción, responde a este correo.";
    const items = document.fields?.items?.arrayValue?.values || [];
    const products = items.map((item) => {
      const fields = item.mapValue?.fields || {};
      return field({ fields }, "name") + " — " + numberField({ fields }, "quantity") + " " + field({ fields }, "unit");
    }).filter((item) => item !== " — 0 ");
    const body = [
      "AGROCICLO DEL SINÚ S.A.S. · CÓRDOBA",
      "",
      "Hola " + name + ",",
      "",
      decisionText,
      "",
      "Cultivo: " + crop,
      "Municipio: " + town,
      ...(products.length ? ["Productos solicitados:", ...products.map((product) => "• " + product)] : []),
      ...(note ? ["", "Mensaje del colaborador que atendió tu solicitud:", note] : []),
      "",
      "Puedes responder directamente a este correo para comunicarte con la persona que revisó tu caso. También puedes escribirnos por WhatsApp al 324 317 5381.",
      "",
      "AgroCiclo del Sinú S.A.S. · Córdoba, Colombia",
    ].join("\n");
    const raw = encodeRawMessage(to, email, subject, body);
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
