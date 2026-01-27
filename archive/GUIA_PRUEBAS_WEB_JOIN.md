# 🌐 Guía de Pruebas: Unirse a Salas desde Web

## ✅ Estado Actual

**Funcionalidad Implementada:**
- ✅ Página web `/join/[code]` para unirse por código directo
- ✅ Página web `/join` para ingresar código manualmente  
- ✅ Integración con AppSync GraphQL
- ✅ Autenticación con Cognito
- ✅ Manejo de errores y estados de carga
- ✅ Responsive design para móvil y web

**App Web Iniciada:**
- 🌐 URL: http://localhost:8082
- 📱 Compatible con React Native Web
- 🔗 Rutas disponibles: `/join` y `/join/[code]`

## 🧪 Cómo Probar

### Paso 1: Crear una Sala (App Móvil)
1. Abre la app móvil Trinity
2. Inicia sesión con cualquier usuario
3. Crea una nueva sala
4. Anota el código de invitación (ej: ABC123)

### Paso 2: Probar Unirse desde Web
**Opción A - Enlace Directo:**
```
http://localhost:8082/join/ABC123
```

**Opción B - Ingreso Manual:**
```
http://localhost:8082/join
```
Luego ingresa el código ABC123

### Paso 3: Verificar Flujo Completo
1. **Sin autenticar**: Debe mostrar pantalla de login
2. **Con usuario diferente**: Debe unirse a la sala
3. **Con mismo usuario**: Debe mostrar "ya eres miembro"
4. **Código inválido**: Debe mostrar error apropiado

## 🔧 URLs de Prueba

### Desarrollo Local
- **Base**: http://localhost:8082
- **Join manual**: http://localhost:8082/join
- **Join directo**: http://localhost:8082/join/ABC123

### Producción (Futuro)
- **Base**: https://trinity.app
- **Join manual**: https://trinity.app/join  
- **Join directo**: https://trinity.app/join/ABC123

## 📱 Usuarios de Prueba

**Usuario 1:**
- Email: test@trinity.app
- Password: Trinity2024!

**Usuario 2:**  
- Email: dani@dani.com
- Password: Trinity2024!

**Usuario 3:**
- Email: paco@paco.com  
- Password: Trinity2024!

## 🎯 Casos de Prueba

### ✅ Caso 1: Unirse Exitosamente
1. Usuario A crea sala en móvil → Código: XYZ789
2. Usuario B abre http://localhost:8082/join/XYZ789
3. Usuario B inicia sesión
4. Usuario B se une a la sala
5. Usuario B es redirigido a `/room/[id]`

### ❌ Caso 2: Código Inválido
1. Abrir http://localhost:8082/join/INVALID
2. Iniciar sesión
3. Debe mostrar "Código de invitación inválido"

### ⚠️ Caso 3: Ya es Miembro
1. Usuario A crea sala → Código: ABC123
2. Usuario A abre http://localhost:8082/join/ABC123
3. Debe mostrar "Ya eres miembro de esta sala"

### 🔐 Caso 4: Sin Autenticación
1. Abrir http://localhost:8082/join/ABC123 (sin login)
2. Debe mostrar pantalla de login
3. Después del login, debe continuar con el join

## 🐛 Problemas Conocidos

### Lambda Error (uuid module)
**Error**: `Cannot find module 'uuid'`
**Causa**: Lambda no tiene dependencias actualizadas
**Solución**: Redesplegar infrastructure

**Workaround temporal:**
```bash
cd infrastructure
npm install uuid
npm run build
cdk deploy TrinityMvpStack
```

### AppSync Circuit Breaker
**Error**: Conexiones bloqueadas después de 3 fallos
**Causa**: Circuit breaker muy restrictivo
**Solución**: Reiniciar app o esperar 1 minuto

## 🚀 Próximos Pasos

### Mejoras Inmediatas
- [ ] Arreglar error de uuid en Lambda
- [ ] Probar con salas reales
- [ ] Verificar subscripciones en tiempo real
- [ ] Optimizar circuit breaker

### Funcionalidades Futuras
- [ ] Deep links nativos (trinity://join/ABC123)
- [ ] Compartir por WhatsApp/Telegram
- [ ] QR codes para unirse
- [ ] Preview de sala antes de unirse

## 📊 Métricas de Éxito

**Funcionalidad Básica:**
- ✅ Página web carga correctamente
- ✅ Formulario de código funciona
- ✅ Autenticación requerida
- ✅ Errores manejados apropiadamente

**Integración AppSync:**
- ⏳ Crear sala desde móvil
- ⏳ Unirse desde web con código válido
- ⏳ Sincronización en tiempo real
- ⏳ Navegación a sala después de unirse

**UX/UI:**
- ✅ Responsive design
- ✅ Estados de carga
- ✅ Mensajes de error claros
- ✅ Navegación intuitiva

---

## 🎉 Resultado Esperado

Al completar estas pruebas, deberías poder:

1. **Crear sala en móvil** → Obtener código ABC123
2. **Abrir web** → http://localhost:8082/join/ABC123  
3. **Iniciar sesión** → Con usuario diferente
4. **Unirse exitosamente** → Ver "¡Te has unido!"
5. **Ser redirigido** → A la pantalla de votación

**¡Esto confirmaría que la funcionalidad web está funcionando correctamente!** 🚀