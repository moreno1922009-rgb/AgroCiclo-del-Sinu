# AgroCiclo del Sinú

Aplicación web para productores y equipo de AgroCiclo. Los agricultores consultan la zona de atención, reciben orientación por WhatsApp y calculan una liquidación estimada. El equipo inicia sesión con Google institucional y administra productores, financiación de agroinsumos y liquidaciones en Cloud Firestore.

## Tecnologías

- HTML, CSS y JavaScript nativo
- Firebase Authentication con Google
- Cloud Firestore con reglas que validan el dominio institucional en el servidor
- Vercel para alojamiento web
- Firebase Hosting como alternativa

## Configuración de Firebase

1. Crea un proyecto en Firebase Console.
2. Registra una aplicación web en los ajustes del proyecto.
3. En Authentication → Sign-in method, habilita Google.
4. En Authentication → Settings → Authorized domains, agrega el dominio de Vercel y cualquier dominio propio que uses.
5. En Firestore Database, crea la base de datos y publica las reglas de firestore.rules.
6. Copia la configuración de tu app Firebase en firebase-config.js. Sustituye los valores REEMPLAZAR_...

La configuración del cliente identifica el proyecto. El acceso a la base de datos se controla con firestore.rules. Las reglas solo aceptan usuarios autenticados, con correo verificado y dominio unicartagena.edu.co. Las cuentas de ese dominio pueden leer y crear registros. Las reglas bloquean su edición y eliminación.

## Subir a GitHub

1. Crea un repositorio nuevo en GitHub.
2. Sube el contenido completo de esta carpeta, incluyendo las reglas, las configuraciones y las imágenes.
3. No subas claves privadas ni credenciales de cuentas de servicio. No publiques archivos .firebaserc con proyectos que no quieras compartir.

## Publicar en Vercel

1. En Vercel, crea un proyecto e impórtalo desde el repositorio.
2. Selecciona Other como framework. No hacen falta comandos de instalación ni compilación. Deja vacíos el comando de build y el directorio de salida.
3. Publica el proyecto y agrega su dominio a los dominios autorizados de Firebase Authentication.
4. Abre el sitio, entra en Acceso del equipo e inicia sesión con una cuenta @unicartagena.edu.co.

## Publicar en Firebase Hosting

Instala Firebase CLI, inicia sesión, crea .firebaserc a partir de .firebaserc.example, reemplaza el ID del proyecto y ejecuta:

    firebase deploy --only hosting,firestore:rules

## Datos

Los registros del equipo se guardan en Firestore. Los datos de la consulta pública no se guardan. El formulario abre WhatsApp con la información ingresada para que el agricultor decida si envía el mensaje.

Las imágenes son parte del proyecto. Instagram y WhatsApp se configuran en app.js.

## Prueba local

Sirve la carpeta con un servidor estático, por ejemplo:

    python -m http.server 8000

Abre http://localhost:8000. Configura Firebase y habilita localhost como dominio autorizado antes de iniciar sesión.
