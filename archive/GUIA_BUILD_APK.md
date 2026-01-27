# Guía para Exportar APK con EAS Build

## Requisitos Previos
- Node.js y npm instalados
- Cuenta de Expo (crear en https://expo.dev si no tienes)
- Conexión a internet estable

## Pasos para Construir el APK

### Opción 1: Usar el Script Automático (Recomendado)

1. Ejecuta el archivo `build-apk.bat` desde la raíz del proyecto:
   ```
   build-apk.bat
   ```

2. Si es la primera vez, te pedirá login:
   ```
   eas login
   ```
   - Ingresa tu email y contraseña de Expo
   - O crea una cuenta nueva en https://expo.dev

3. Espera 15-30 minutos mientras EAS construye tu APK en la nube

4. Descarga el APK desde el link que aparecerá en la terminal

### Opción 2: Comandos Manuales

1. **Instalar EAS CLI** (solo la primera vez):
   ```
   npm install -g eas-cli
   ```

2. **Login en EAS** (solo la primera vez):
   ```
   eas login
   ```

3. **Navegar a la carpeta mobile**:
   ```
   cd mobile
   ```

4. **Construir el APK**:
   ```
   eas build --platform android --profile preview
   ```

## Perfiles de Build Disponibles

Tu proyecto tiene 3 perfiles configurados en `mobile/eas.json`:

### 1. `development` (Desarrollo)
```
eas build --platform android --profile development
```
- Para desarrollo y pruebas internas
- Incluye herramientas de debug

### 2. `preview` (Vista Previa) ⭐ RECOMENDADO
```
eas build --platform android --profile preview
```
- APK optimizado para pruebas
- Distribución interna
- **Este es el perfil recomendado para exportar APK**

### 3. `production` (Producción)
```
eas build --platform android --profile production
```
- Para publicar en Google Play Store
- Totalmente optimizado

## Instalación del APK en tu Dispositivo

1. **Descarga el APK** desde el link que te proporciona EAS

2. **Transfiere el APK a tu dispositivo Android**:
   - Por cable USB
   - Por email
   - Por Google Drive/Dropbox
   - Por WhatsApp

3. **Habilita instalación de fuentes desconocidas**:
   - Ve a Configuración > Seguridad
   - Activa "Fuentes desconocidas" o "Instalar apps desconocidas"

4. **Instala el APK**:
   - Abre el archivo APK en tu dispositivo
   - Toca "Instalar"
   - Espera a que termine la instalación
   - Toca "Abrir"

## Solución de Problemas

### Error: "eas" no se reconoce como comando
**Solución**: Instala EAS CLI globalmente:
```
npm install -g eas-cli
```

### Error: No estás autenticado
**Solución**: Ejecuta el login:
```
eas login
```

### Error: Missing build profile 'preview-apk'
**Solución**: Usa el perfil `preview` que ya existe:
```
eas build --platform android --profile preview
```

### El build falla en EAS
**Solución**: Revisa los logs en la terminal o en https://expo.dev/accounts/trinity-app/projects/trinity/builds

### El APK no se instala en el dispositivo
**Solución**: 
- Verifica que hayas habilitado "Fuentes desconocidas"
- Asegúrate de que el APK se descargó completamente
- Intenta desinstalar versiones anteriores de la app

## Información Adicional

- **Project ID**: ba75c98c-9d7c-471e-8ef3-142a3063367c
- **Owner**: trinity-app
- **Package Name**: com.trinity.app
- **Version**: 1.0.0

## Notas Importantes

1. **El build se hace en la nube**: No necesitas Android Studio ni SDK de Android instalado localmente

2. **Tiempo de build**: Normalmente tarda 15-30 minutos dependiendo de la cola de EAS

3. **Límite de builds gratuitos**: Expo ofrece builds gratuitos limitados. Revisa tu plan en https://expo.dev

4. **El APK expira**: Los APKs en EAS tienen un tiempo de vida limitado (30 días). Descárgalo pronto.

5. **Actualizaciones**: Para crear una nueva versión, simplemente ejecuta el comando de build nuevamente

## Enlaces Útiles

- Dashboard de EAS: https://expo.dev/accounts/trinity-app/projects/trinity
- Documentación de EAS Build: https://docs.expo.dev/build/introduction/
- Crear cuenta Expo: https://expo.dev/signup
