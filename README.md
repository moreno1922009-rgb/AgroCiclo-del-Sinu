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
- Catálogo de cultivos que incluye maíz, arroz, frijol, yuca y ñame, con productos seleccionables organizados por cultivo.
- Cotizador imprimible o exportable a PDF para preparar propuestas comerciales (no factura electrónica).
- Chat plegable; colaboradores editan o eliminan sus propios mensajes y el gerente puede eliminar cualquier mensaje.
- Historial con eliminación de productores sin movimientos, disponible para el gerente.
- Autenticación de Google con Firebase y registros internos en Cloud Firestore.
- Contactos directos a Instagram y WhatsApp.

## Proyecto conectado

- Firebase: `agrociclo-del-sinu`
- Sitio de producción: <https://agrociclo-del-sinu.vercel.app>
- Repositorio: <https://github.com/moreno1922009-rgb/AgroCiclo-del-Sinu>
- La rama `main` está conectada con Vercel para desplegar los cambios de GitHub.

La configuración pública del cliente está en `firebase-config.js`. La seguridad no depende de ocultar esa configuración: Firestore valida cada acceso en `firestore.rules`. Solo cuentas autenticadas y verificadas del dominio institucional pueden consultar o crear registros internos. El estado de solicitudes puede actualizarse sin editar el resto de sus datos; las financiaciones y liquidaciones no se editan ni eliminan. Solo el gerente puede eliminar productores, y el cotizador no guarda datos.

## Probar localmente

Sirve la carpeta con un servidor estático, por ejemplo:

```sh
python -m http.server 8000
```

Abre <http://localhost:8000>. Para iniciar sesión en local, agrega `localhost` a los dominios autorizados en Firebase Authentication.

## Solicitudes, chat y WhatsApp

El formulario registra la solicitud en Firestore después de que el agricultor acepta el aviso de uso de datos y captura la cantidad y unidad de cada insumo. Cada agricultor puede consultar únicamente sus propias solicitudes; el equipo institucional ve la bandeja completa y registra el estado, la decisión y una respuesta breve. Los productos sugeridos son opciones generales, no recomendaciones técnicas de dosis o aplicación.

El chat y la presencia se comparten en tiempo real únicamente entre cuentas verificadas `@unicartagena.edu.co`. Cada miembro puede editar o eliminar sus propios mensajes; el gerente puede borrar mensajes de cualquier miembro. El chat se abre desde un botón en el panel. El botón de WhatsApp prepara un mensaje y el agricultor confirma el envío desde WhatsApp.


## Respuesta de solicitudes por correo

El equipo registra la decisión **Aplica** o **No aplica** y una respuesta opcional desde la bandeja. La aplicación redacta el mensaje según el resultado y lo envía desde la cuenta institucional del colaborador que atiende el caso. En su primera autorización, cada colaborador conecta su cuenta desde el panel; los nuevos miembros usan el mismo botón. El permiso y el token de Google se mantienen solo en memoria durante la sesión y no se guardan en Firestore ni en Vercel. Después de recargar o iniciar otra sesión, Google puede volver a pedir autorización.

Para habilitar el envío en Google Cloud, activa Gmail API en el proyecto `agrociclo-del-sinu` y permite el alcance OAuth `https://www.googleapis.com/auth/gmail.send` para la aplicación. La organización puede requerir revisión o aprobación del administrador de Google Workspace para ese permiso. Si el permiso no está habilitado, la decisión queda guardada y la fila permite reintentar cuando el correo esté autorizado.
