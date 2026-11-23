# AgroCiclo del Sinú

Aplicación web adaptable a teléfonos, tabletas y computadores para productores y equipo de AgroCiclo. Toda persona inicia sesión con Google. Las cuentas normales de Gmail entran al espacio de agricultor; las cuentas verificadas `@unicartagena.edu.co` reciben además la opción de abrir el panel interno.

## Funciones

- Solicitudes de agricultores guardadas en Firestore con consentimiento, fecha, datos del cultivo y estado de seguimiento.
- Enlace de WhatsApp con el mensaje preparado y el código de la solicitud; el agricultor confirma el envío desde WhatsApp.
- El equipo puede revisar solicitudes y cambiar su estado desde el panel.
- Simulador de liquidación: estima el descuento por insumos y el saldo de una cosecha.
- Panel institucional para registrar productores, financiación y liquidaciones.
- Bandeja de solicitudes con estados pendiente, en proceso y atendida.
- Chat privado del equipo con presencia en tiempo real; `dmorenom3@unicartagena.edu.co` aparece como gerente y los demás miembros como colaboradores.
- Catálogo de productos e insumos seleccionables organizado según el cultivo.
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

## Solicitudes, chat y WhatsApp

El formulario registra la solicitud en Firestore después de que el agricultor acepta el aviso de uso de datos. El equipo institucional puede leerla y cambiar su estado; los agricultores no pueden consultar solicitudes ajenas. Los productos sugeridos son opciones generales, no recomendaciones técnicas de dosis o aplicación.

El chat y la presencia se comparten en tiempo real únicamente entre cuentas verificadas `@unicartagena.edu.co`. El acceso al equipo sigue habilitado para todo el dominio por ahora. El botón de WhatsApp prepara un mensaje y el agricultor confirma el envío desde WhatsApp.
