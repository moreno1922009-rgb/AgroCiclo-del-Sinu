const PROJECT_ID = "agrociclo-del-sinu";
const FIREBASE_API_KEY = "AIzaSyCfGk0V8zwRBaL3mA-Q4z3R9qznNj6uvcI";

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function field(document, name) {
  return document?.fields?.[name]?.stringValue ?? "";
}

function numberField(document, name) {
  return Number(document?.fields?.[name]?.integerValue ?? document?.fields?.[name]?.doubleValue ?? 0);
}

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ message: "Método no permitido." });
  }

  const match = String(request.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  const token = match?.[1];
  const applicationId = typeof request.body?.applicationId === "string" ? request.body.applicationId.trim() : "";
  if (!token || !/^[A-Za-z0-9_-]{10,64}$/.test(applicationId)) {
    return response.status(400).json({ message: "La sesión o el código de solicitud no son válidos." });
  }

  try {
    const identity = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_API_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    });
    if (!identity.ok) return response.status(401).json({ message: "La sesión expiró. Vuelve a iniciar sesión." });
    const identityData = await identity.json();
    const user = identityData.users?.[0];
    const email = String(user?.email || "").toLowerCase();
    if (!user?.emailVerified || !/^[^@]+@unicartagena\.edu\.co$/.test(email)) {
      return response.status(403).json({ message: "Solo el equipo institucional puede enviar respuestas." });
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL;
    const resendKey = process.env.RESEND_API_KEY;
    if (!fromEmail || !resendKey) {
      return response.status(503).json({
        message: "La respuesta quedó guardada, pero falta configurar RESEND_API_KEY y RESEND_FROM_EMAIL en Vercel para activar el correo.",
      });
    }

    const documentUrl = "https://firestore.googleapis.com/v1/projects/" + PROJECT_ID +
      "/databases/(default)/documents/applications/" + encodeURIComponent(applicationId);
    const documentResponse = await fetch(documentUrl, { headers: { Authorization: "Bearer " + token } });
    if (!documentResponse.ok) return response.status(404).json({ message: "No se encontró la solicitud o no tienes acceso." });
    const document = await documentResponse.json();
    const status = field(document, "status");
    const decision = field(document, "decision");
    if (status !== "atendida" || !["aplica", "no_aplica"].includes(decision)) {
      return response.status(409).json({ message: "Primero guarda la decisión de la solicitud." });
    }

    const to = field(document, "email");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return response.status(422).json({ message: "La cuenta de Google del agricultor no contiene un correo válido." });
    }

    const name = field(document, "name") || "Agricultor";
    const crop = field(document, "crop");
    const town = field(document, "town");
    const note = field(document, "resolutionNote");
    const decisionText = decision === "aplica" ? "Tu solicitud aplica" : "Tu solicitud no aplica";
    const items = document.fields?.items?.arrayValue?.values || [];
    const products = items.map((item) => {
      const fields = item.mapValue?.fields || {};
      return field({ fields }, "name") + " — " + numberField({ fields }, "quantity") + " " + field({ fields }, "unit");
    }).filter((item) => item !== " — 0 ");
    const decidedAt = field(document, "decidedAt") || document.fields?.decidedAt?.timestampValue || "sin-fecha";
    const idempotencyKey = "agrociclo-" + applicationId + "-" + decision + "-" + String(decidedAt).replace(/[^A-Za-z0-9]/g, "").slice(0, 32);

    const html = "<div style=\"font-family:Arial,sans-serif;color:#193e2c;max-width:620px;margin:auto;padding:28px\">" +
      "<p style=\"letter-spacing:.12em;font-size:12px;font-weight:bold\">AGROCICLO DEL SINÚ</p>" +
      "<h1 style=\"font-size:25px\">" + escapeHtml(decisionText) + "</h1>" +
      "<p>Hola " + escapeHtml(name) + ", el equipo revisó tu solicitud de acompañamiento agrícola.</p>" +
      "<p><b>Cultivo:</b> " + escapeHtml(crop) + "<br><b>Municipio:</b> " + escapeHtml(town) + "</p>" +
      (products.length ? "<p><b>Productos solicitados:</b><br>" + products.map(escapeHtml).join("<br>") + "</p>" : "") +
      (note ? "<div style=\"background:#f1f6ed;padding:14px;border-radius:10px\"><b>Respuesta del equipo:</b><br>" + escapeHtml(note) + "</div>" : "") +
      "<p>Si tienes dudas, responde este correo o escríbenos por WhatsApp al 324 317 5381.</p>" +
      "<p style=\"color:#657569;font-size:13px\">AgroCiclo del Sinú S.A.S. · Córdoba, Colombia</p></div>";
    const text = "AgroCiclo del Sinú\n\nHola " + name + ", " + decisionText.toLowerCase() + ".\nCultivo: " + crop +
      "\nMunicipio: " + town + (products.length ? "\nProductos: " + products.join(", ") : "") +
      (note ? "\nRespuesta del equipo: " + note : "") +
      "\n\nDudas: WhatsApp 324 317 5381.";

    const mailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + resendKey,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: "AgroCiclo del Sinú <" + fromEmail + ">",
        to: [to],
        reply_to: "dmorenom3@unicartagena.edu.co",
        subject: "Actualización de tu solicitud en AgroCiclo",
        html,
        text,
      }),
    });
    if (!mailResponse.ok) {
      const mailError = await mailResponse.json().catch(() => ({}));
      const message = mailResponse.status === 403 || mailResponse.status === 422
        ? "El servicio de correo rechazó el remitente. Verifica en Resend que el dominio esté habilitado."
        : "El servicio de correo no pudo enviar el aviso. Puedes reintentar desde la bandeja de solicitudes.";
      return response.status(502).json({ message, providerCode: mailError.name || undefined });
    }
    return response.status(200).json({ sent: true });
  } catch {
    return response.status(500).json({ message: "No se pudo procesar el envío. Intenta nuevamente." });
  }
};
