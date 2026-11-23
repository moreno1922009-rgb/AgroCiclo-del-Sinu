# AgroCiclo del Sinú

Aplicación web para productores y equipo de AgroCiclo. Los agricultores consultan la zona de atención, reciben orientación por WhatsApp y calculan una liquidación estimada. El equipo inicia sesión con Google institucional y administra productores, financiación de agroinsumos y liquidaciones en Cloud Firestore.

## Tecnologías

- HTML, CSS y JavaScript nativo
- Firebase Authentication con Google
- Cloud Firestore con reglas que validan el dominio institucional en el servidor
- Vercel para alojamiento web
- Firebase Hosting como alternativa

## Proyecto Firebase

El proyecto Firebase ya está creado con ID `agrociclo-del-sinu`. La app web está registrada y su configuración pública se encuentra en `firebase-config.js`. Cloud Firestore está en la región `southamerica-east1` (São Paulo), con reglas de producción que permiten acceso solo a cuentas autenticadas, verificadas y del dominio `unicartagena.edu.co`. Estas cuentas pueden leer y crear registros; la edición y eliminación están bloqueadas.

En Authentication → Método de acceso, habilita Google y elige el correo empresarial de soporte que se mostrará a los usuarios en la pantalla de inicio de sesión. Después de desplegar la app, agrega el dominio `vercel.app` asignado por Vercel a Authentication → Configuración → Dominios autorizados.

## GitHub y despliegue

Repositorio: [AgroCiclo-del-Sinu](https://github.com/moreno1922009-rgb/AgroCiclo-del-Sinu) (privado).

Conecta la rama `main` con Vercel y usa la configuración para sitio estático: framework Other, sin comandos de instalación ni compilación, y sin directorio de salida. Los siguientes cambios en `main` se publicarán automáticamente.

No subas claves privadas ni credenciales de cuentas de servicio. La configuración web de Firebase es pública y el acceso a datos se protege en las reglas de Firestore.

## Datos

Los registros del equipo se guardan en Firestore. Los datos de la consulta pública no se guardan. El formulario abre WhatsApp con la información ingresada para que el agricultor decida si envía el mensaje. Las imágenes son parte del proyecto. Instagram y WhatsApp se configuran en `app.js`.

## Prueba local

Sirve la carpeta con un servidor estático, por ejemplo:

    python -m http.server 8000

Abre http://localhost:8000. Agrega `localhost` a los dominios autorizados de Firebase Authentication antes de iniciar sesión.
