# 📞 CONTACTO PARA CREDENCIALES AWS

## 🔑 SOLICITAR ACCESO AL PROYECTO

Si eres un nuevo desarrollador y necesitas acceso al proyecto Trinity, sigue estos pasos:

---

## 👤 ADMINISTRADOR DEL PROYECTO

**Contactar a:** Daniel Ibáñez (Administrador Principal)
- **GitHub:** [@danilazar06](https://github.com/danilazar06)
- **Email:** [Solicitar por GitHub Issues]

---

## 📋 INFORMACIÓN A PROPORCIONAR

Cuando solicites acceso, incluye:

1. **Tu información:**
   - Nombre completo
   - Usuario de GitHub
   - Rol en el proyecto (desarrollador, tester, etc.)

2. **Qué necesitas:**
   - Acceso al repositorio (si no lo tienes)
   - Credenciales AWS para desarrollo
   - Acceso a servicios específicos (Lambda, DynamoDB, etc.)

3. **Tu experiencia:**
   - Experiencia con React Native
   - Experiencia con AWS
   - Familiaridad con el stack del proyecto

---

## 🔐 CREDENCIALES QUE RECIBIRÁS

El administrador te proporcionará:

### AWS Credentials:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_DEFAULT_REGION` (eu-west-1)

### API Keys (opcionales):
- `TMDB_API_KEY` (para búsqueda de películas)
- `HF_API_TOKEN` (para recomendaciones IA)

### Información de la infraestructura:
- Nombres de las funciones Lambda
- Nombres de las tablas DynamoDB
- Configuración de Cognito

---

## ⚡ PROCESO DE ONBOARDING

1. **Solicitar acceso** (GitHub Issues o contacto directo)
2. **Recibir credenciales** (por canal seguro)
3. **Configurar entorno local** (seguir `SETUP_PARA_DESARROLLADORES.md`)
4. **Verificar configuración** (`node verify-aws-config.js`)
5. **Primer despliegue de prueba** (`node deploy-lambda-only.js`)
6. **¡Listo para desarrollar!** 🎉

---

## 🚨 IMPORTANTE - SEGURIDAD

### ✅ Buenas prácticas:
- **Nunca** compartir credenciales por email/chat público
- **Nunca** commitear credenciales al repositorio
- **Usar** variables de entorno o AWS CLI
- **Rotar** credenciales regularmente

### 🔒 Canales seguros para recibir credenciales:
- Mensaje directo en GitHub
- Email cifrado
- Herramientas de gestión de secretos del equipo
- Reunión presencial/videollamada

---

## 📚 RECURSOS ADICIONALES

### Documentación del proyecto:
- `README.md` - Información general
- `SETUP_PARA_DESARROLLADORES.md` - Configuración completa
- `CONFIGURACION_AWS_CREDENCIALES.md` - Detalles de AWS
- `arquitectura_proyecto.md` - Arquitectura técnica

### Guías de desarrollo:
- `mobile/README.md` - Desarrollo móvil
- `infrastructure/README.md` - Infraestructura AWS
- Scripts de utilidad en `/scripts/`

---

## 🤝 CONTRIBUIR AL PROYECTO

Una vez configurado tu entorno:

1. **Crear rama** para tu feature: `git checkout -b feature/mi-feature`
2. **Desarrollar** siguiendo las convenciones del proyecto
3. **Probar** localmente antes de hacer push
4. **Crear Pull Request** con descripción detallada
5. **Code Review** por el equipo
6. **Merge** una vez aprobado

---

**📅 Última actualización**: 27 de enero de 2026  
**🔒 Proceso de seguridad**: Implementado  
**👥 Estado del equipo**: Abierto a nuevos colaboradores