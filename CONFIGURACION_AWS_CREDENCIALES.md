# 🔐 CONFIGURACIÓN DE CREDENCIALES AWS

## 🚨 IMPORTANTE: SEGURIDAD DE CREDENCIALES

Las credenciales de AWS **NUNCA** deben estar hardcodeadas en el código fuente por razones de seguridad. Este documento explica cómo configurarlas correctamente.

---

## 📋 CREDENCIALES REMOVIDAS

### Credenciales que se removieron del código:
```
Access Key ID: YOUR_ACCESS_KEY_ID (reemplazada por variables de entorno)
Secret Access Key: YOUR_SECRET_ACCESS_KEY (reemplazada por variables de entorno)
Region: eu-west-1
```

**⚠️ NOTA IMPORTANTE**: Las credenciales reales deben obtenerse del administrador del proyecto o del archivo `.env.example`. Ver `CREDENCIALES_REALES_UBICACION.md` para más detalles.

### Archivos que fueron corregidos:
- `deploy-lambda-only.js`
- `debug-filtering-issue.js`
- `test-final-configuration.js`
- `investigate-table-schema.js`
- `test-mobile-genre-loading.js`
- `test-mobile-config-update.js`
- `list-dynamodb-tables-and-delete.js`
- `deploy-lambda-fixed.js`
- `delete-rooms-correct-table.js`
- `debug-tmdb-in-lambda.js`
- `delete-all-test-rooms.js`
- `debug-lambda-detailed.js`

---

## ⚙️ MÉTODOS DE CONFIGURACIÓN

### 1. Variables de Entorno (RECOMENDADO)

#### En Windows (PowerShell):
```powershell
# Configurar para la sesión actual
$env:AWS_ACCESS_KEY_ID = "YOUR_ACCESS_KEY_ID"
$env:AWS_SECRET_ACCESS_KEY = "YOUR_SECRET_ACCESS_KEY"
$env:AWS_DEFAULT_REGION = "eu-west-1"

# Configurar permanentemente (requiere reiniciar terminal)
[Environment]::SetEnvironmentVariable("AWS_ACCESS_KEY_ID", "YOUR_ACCESS_KEY_ID", "User")
[Environment]::SetEnvironmentVariable("AWS_SECRET_ACCESS_KEY", "YOUR_SECRET_ACCESS_KEY", "User")
[Environment]::SetEnvironmentVariable("AWS_DEFAULT_REGION", "eu-west-1", "User")
```

#### En Linux/Mac (Bash):
```bash
# Configurar para la sesión actual
export AWS_ACCESS_KEY_ID="YOUR_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="YOUR_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="eu-west-1"

# Configurar permanentemente (agregar al ~/.bashrc o ~/.zshrc)
echo 'export AWS_ACCESS_KEY_ID="YOUR_ACCESS_KEY_ID"' >> ~/.bashrc
echo 'export AWS_SECRET_ACCESS_KEY="YOUR_SECRET_ACCESS_KEY"' >> ~/.bashrc
echo 'export AWS_DEFAULT_REGION="eu-west-1"' >> ~/.bashrc
```

### 2. Archivo .env (Para desarrollo local)

Crear archivo `.env` en la raíz del proyecto:
```env
# AWS Configuration
AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY=YOUR_SECRET_ACCESS_KEY
AWS_DEFAULT_REGION=eu-west-1

# TMDB Configuration
TMDB_API_KEY=tu_tmdb_api_key_aqui
```

**⚠️ IMPORTANTE**: El archivo `.env` ya está en `.gitignore` para evitar que se suba al repositorio.

### 3. AWS CLI (RECOMENDADO para desarrollo)

#### Instalar AWS CLI:
```bash
# Windows (usando Chocolatey)
choco install awscli

# Windows (usando pip)
pip install awscli

# Mac (usando Homebrew)
brew install awscli

# Linux (usando pip)
pip install awscli
```

#### Configurar AWS CLI:
```bash
aws configure
```

Te pedirá:
```
AWS Access Key ID [None]: YOUR_ACCESS_KEY_ID
AWS Secret Access Key [None]: YOUR_SECRET_ACCESS_KEY
Default region name [None]: eu-west-1
Default output format [None]: json
```

### 4. Archivo de credenciales AWS

El AWS CLI crea automáticamente estos archivos:

#### Windows:
```
C:\Users\{username}\.aws\credentials
C:\Users\{username}\.aws\config
```

#### Linux/Mac:
```
~/.aws/credentials
~/.aws/config
```

#### Contenido de `~/.aws/credentials`:
```ini
[default]
aws_access_key_id = YOUR_ACCESS_KEY_ID
aws_secret_access_key = YOUR_SECRET_ACCESS_KEY
```

#### Contenido de `~/.aws/config`:
```ini
[default]
region = eu-west-1
output = json
```

---

## 🔧 ACTUALIZACIÓN DEL CÓDIGO

### Antes (❌ INSEGURO):
```javascript
AWS.config.update({ 
  region: 'eu-west-1',
  accessKeyId: 'YOUR_ACCESS_KEY_ID',
  secretAccessKey: 'YOUR_SECRET_ACCESS_KEY'
});
```

### Después (✅ SEGURO):
```javascript
AWS.config.update({ 
  region: 'eu-west-1'
  // AWS credentials are automatically loaded from:
  // 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
  // 2. AWS credentials file (~/.aws/credentials)
  // 3. IAM roles (in production)
});
```

### Para usar variables de entorno explícitamente:
```javascript
AWS.config.update({ 
  region: process.env.AWS_DEFAULT_REGION || 'eu-west-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});
```

---

## 🧪 VERIFICAR CONFIGURACIÓN

### Script de verificación:
```javascript
// verify-aws-config.js
const AWS = require('aws-sdk');

async function verifyAWSConfig() {
    try {
        // Verificar configuración
        console.log('🔍 Verificando configuración de AWS...');
        console.log('Region:', AWS.config.region);
        
        // Probar conexión con STS (Security Token Service)
        const sts = new AWS.STS();
        const identity = await sts.getCallerIdentity().promise();
        
        console.log('✅ Configuración correcta!');
        console.log('Account ID:', identity.Account);
        console.log('User ARN:', identity.Arn);
        
        // Probar Lambda
        const lambda = new AWS.Lambda();
        const functions = await lambda.listFunctions({ MaxItems: 5 }).promise();
        console.log(`✅ Lambda accesible. Funciones encontradas: ${functions.Functions.length}`);
        
        // Probar DynamoDB
        const dynamodb = new AWS.DynamoDB();
        const tables = await dynamodb.listTables({ Limit: 5 }).promise();
        console.log(`✅ DynamoDB accesible. Tablas encontradas: ${tables.TableNames.length}`);
        
    } catch (error) {
        console.error('❌ Error de configuración:', error.message);
        console.log('\n🔧 Posibles soluciones:');
        console.log('1. Verificar variables de entorno AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY');
        console.log('2. Ejecutar: aws configure');
        console.log('3. Verificar permisos de IAM');
    }
}

verifyAWSConfig();
```

### Ejecutar verificación:
```bash
node verify-aws-config.js
```

---

## 🚀 CONFIGURACIÓN PARA DIFERENTES ENTORNOS

### Desarrollo Local
```javascript
// Usar variables de entorno o AWS CLI
AWS.config.update({ 
  region: 'eu-west-1'
});
```

### Producción (Lambda)
```javascript
// Las credenciales se obtienen automáticamente del rol IAM de Lambda
AWS.config.update({ 
  region: process.env.AWS_REGION || 'eu-west-1'
});
```

### CI/CD (GitHub Actions)
```yaml
# .github/workflows/deploy.yml
env:
  AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
  AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
  AWS_DEFAULT_REGION: eu-west-1
```

---

## 🔐 MEJORES PRÁCTICAS DE SEGURIDAD

### ✅ Hacer:
1. **Usar variables de entorno** para credenciales
2. **Usar AWS CLI** para desarrollo local
3. **Usar roles IAM** en producción
4. **Rotar credenciales** regularmente
5. **Usar permisos mínimos** necesarios
6. **Monitorear uso** de credenciales

### ❌ No hacer:
1. **Hardcodear credenciales** en el código
2. **Subir credenciales** al repositorio
3. **Compartir credenciales** por email/chat
4. **Usar credenciales de root** para aplicaciones
5. **Dejar credenciales** en logs
6. **Usar credenciales** en URLs

---

## 🛠️ COMANDOS ÚTILES

### Verificar configuración actual:
```bash
aws sts get-caller-identity
aws configure list
```

### Listar funciones Lambda:
```bash
aws lambda list-functions --region eu-west-1
```

### Listar tablas DynamoDB:
```bash
aws dynamodb list-tables --region eu-west-1
```

### Probar despliegue:
```bash
# Configurar credenciales primero
aws configure

# Luego ejecutar despliegue
node deploy-lambda-only.js
```

---

## 🚨 EN CASO DE COMPROMISO DE CREDENCIALES

### Si las credenciales fueron expuestas:

1. **Inmediatamente**:
   ```bash
   # Desactivar credenciales en AWS Console
   # IAM > Users > [tu-usuario] > Security credentials > Make inactive
   ```

2. **Crear nuevas credenciales**:
   ```bash
   # En AWS Console: IAM > Users > [tu-usuario] > Security credentials > Create access key
   ```

3. **Actualizar configuración**:
   ```bash
   aws configure
   # Introducir las nuevas credenciales
   ```

4. **Verificar actividad sospechosa**:
   ```bash
   # Revisar CloudTrail logs
   # Verificar facturación inusual
   ```

---

## 📞 SOPORTE Y TROUBLESHOOTING

### Error: "Unable to locate credentials"
```bash
# Solución 1: Configurar AWS CLI
aws configure

# Solución 2: Variables de entorno
export AWS_ACCESS_KEY_ID="tu-access-key"
export AWS_SECRET_ACCESS_KEY="tu-secret-key"

# Solución 3: Verificar archivos
ls ~/.aws/
cat ~/.aws/credentials
```

### Error: "Access Denied"
```bash
# Verificar permisos IAM
aws iam get-user
aws iam list-attached-user-policies --user-name tu-usuario
```

### Error: "Region not specified"
```bash
# Configurar región por defecto
aws configure set region eu-west-1
```

### 🔑 Obtener credenciales reales
Ver `CREDENCIALES_REALES_UBICACION.md` para información sobre dónde obtener las credenciales reales del proyecto.

---

## 📋 CHECKLIST DE CONFIGURACIÓN

- [ ] Credenciales removidas del código fuente
- [ ] Variables de entorno configuradas
- [ ] AWS CLI instalado y configurado
- [ ] Verificación de conexión exitosa
- [ ] Scripts de despliegue funcionando
- [ ] Documentación actualizada
- [ ] .gitignore incluye archivos sensibles
- [ ] Equipo informado sobre nuevos procedimientos

---

**📅 Fecha de actualización**: 27 de enero de 2026  
**🔄 Estado**: Configuración de seguridad implementada  
**🚀 Próxima revisión**: Rotación de credenciales (recomendado cada 90 días)