# AgroCiclo del Sinú

Aplicación web adaptable a teléfonos, tabletas y computadores para productores y equipo de AgroCiclo. Toda persona inicia sesión con Google. Las cuentas normales de Gmail entran al espacio de agricultor; las cuentas verificadas `@unicartagena.edu.co` reciben además la opción de abrir el panel interno.

## Funciones

- Solicitudes de agricultores guardadas en Firestore con consentimiento, fecha, datos del cultivo y estado de seguimiento.
- Enlace de WhatsApp con el mensaje preparado y el código de la solicitud; el agricultor confirma el envío desde WhatsApp.
- El equipo puede revisar solicitudes y cambiar su estado desde el panel.
- Simulador de liquidación: estima el descuento por insumos y el saldo de una cosecha.
- Panel institucional para registrar productores, financiación y liquidaciones.
- Autenticación de Google con Firebase y registros internos en Cloud Firestore.
- Contactos directos a Instagram y WhatsApp.

## Proyecto conectado

- Firebase: `agrociclo-del-sinu`
- Sitio de producción: <https://agrociclo-del-sinu.vercel.app>
- Repositorio: <https://github.com/moreno1922009-rgb/AgroCiclo-del-Sinu>
- La rama `main` está conectada con Vercel para desplegar los cambios de GitHub.

La configuración pública del cliente está en `firebase-config.js`. La seguridad no depende de ocultar esa configuración: Firestore valida cada acceso en `firestore.rules`. Solo cuentas autenticadas, verificadas y del dominio institucional pueden consultar o crear registros internos; no se permite modificarlos ni eliminarlos desde el cliente.

## Probar localmente

Sirve la carpeta con un servidor estático, por ejemplo:

```sh
python -m http.server 8000
```

Abre <http://localhost:8000>. Para iniciar sesión en local, agrega `localhost` a los dominios autorizados en Firebase Authentication.

## Solicitudes y WhatsApp

El formulario registra la solicitud en Firestore después de que el agricultor acepta el aviso de uso de datos. El equipo institucional puede leerla y actualizar su estado; los agricultores autenticados no pueden leer las solicitudes de otras personas. El enlace de WhatsApp se prepara con el código y los datos de la solicitud, pero el agricultor debe abrir WhatsApp y pulsar enviar. El envío automático de mensajes requiere una cuenta de WhatsApp Business Platform, un número habilitado, plantillas aprobadas y credenciales guardadas como secretos de servidor; nunca deben incluirse en el código del navegador.
