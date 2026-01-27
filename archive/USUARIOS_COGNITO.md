# 👥 USUARIOS DE COGNITO - Trinity TFG

**Fecha:** 15 de Enero de 2026  
**User Pool:** eu-west-1_6UxioIj4z

---

## ✅ USUARIOS CONFIRMADOS (Listos para usar)

### 1. Test Trinity App
```
Email:     test@trinity.app
Username:  5265d484-b0e1-7030-0b93-bf05d339a2b0
Name:      Test User
Status:    ✅ CONFIRMED
Email Verified: ✅ true
Created:   26 Dic 2025
```

### 2. Test Trinity Com
```
Email:     test@trinity.com
Username:  3205a484-80e1-7058-303f-b64f983e7cb6
Name:      testuser
Status:    ✅ CONFIRMED
Created:   27 Dic 2025
```

### 3. Prueba
```
Email:     prueba@prueba.com
Username:  e2e524d4-b021-7007-7de1-a887e27b3d5e
Name:      Pruebaa
Status:    ✅ CONFIRMED
Email Verified: ❌ false
Created:   1 Ene 2026
```

### 4. Paco
```
Email:     paco@paco.com
Username:  0275c484-6061-7054-899e-3d81cf1f3a1a
Name:      paco
Status:    ✅ CONFIRMED
Email Verified: ❌ false
Created:   9 Ene 2026
```

### 5. Test 1767054631109
```
Email:     test-1767054631109@trinity.app
Username:  92657414-30a1-7008-2d1f-1174ea09e357
Name:      Usuario Test
Status:    ✅ CONFIRMED
Email Verified: ❌ false
Created:   30 Dic 2025
```

### 6. Dani Lazar
```
Email:     danilazar@gmail.com
Username:  d2255494-20c1-70bc-84eb-1fb03292d8d2
Name:      danilazar
Status:    ✅ CONFIRMED
Created:   26 Dic 2025
```

### 7. Dani
```
Email:     dani@dani.com
Username:  22e55474-d011-7091-d30e-832fec46d3b1
Name:      dani
Status:    ✅ CONFIRMED
Created:   26 Dic 2025
```

### 8. Test 1767296480889
```
Email:     test-1767296480889@trinity.app
Username:  8275c454-b001-7060-fe1d-252d723700a2
Name:      Usuario Test
Status:    ✅ CONFIRMED
Email Verified: ❌ false
Created:   1 Ene 2026
```

### 9. Test Example
```
Email:     test@example.com
Username:  0215e4f4-d0a1-70a4-5ffc-d6e5b78c85ca
Name:      testuser
Status:    ✅ CONFIRMED
Created:   29 Dic 2025
```

---

## ⚠️ USUARIOS CON PROBLEMAS

### Usuario que necesita cambiar password:
```
Email:     d@dani.com
Username:  c225f484-90c1-705b-98b7-31095c8f230b
Status:    ⚠️ FORCE_CHANGE_PASSWORD
Created:   9 Ene 2026

⚠️ Este usuario necesita cambiar su password en el primer login
```

---

## ❌ USUARIOS NO CONFIRMADOS (No se pueden usar)

### 1. Protex Wear
```
Email:     protexwear.dev@gmail.com
Username:  62b5d414-9031-700a-1fd9-08611bea1a20
Name:      Protex Wear
Status:    ❌ UNCONFIRMED
Created:   11 Ene 2026
```

### 2. Test 1767054571785
```
Email:     test-1767054571785@trinity.app
Username:  b2456434-5041-70a8-b82c-1a1fbb2eb1c9
Name:      Usuario Test
Status:    ❌ UNCONFIRMED
Created:   30 Dic 2025
```

### 3. Dani ZGZ
```
Email:     danizgz95@gmail.com
Username:  9225e4d4-5001-7064-34db-5f45744177a5
Name:      D IB
Status:    ❌ UNCONFIRMED
Created:   11 Ene 2026
```

### 4. Test 1767296469317
```
Email:     test-1767296469317@trinity.app
Username:  72555414-e021-7031-858f-a961c8ace93b
Name:      Usuario Test
Status:    ❌ UNCONFIRMED
Created:   1 Ene 2026
```

### 5. Test 1767054503498
```
Email:     test-1767054503498@trinity.app
Username:  527554a4-8091-7053-f7a1-e87a8437b10b
Name:      Usuario Test
Status:    ❌ UNCONFIRMED
Created:   30 Dic 2025
```

---

## 🎯 RECOMENDACIÓN PARA PRUEBAS

### Para probar el sistema de tiempo real con 2 usuarios:

**Dispositivo A:**
```
Email: test@trinity.app
```

**Dispositivo B:**
```
Email: test@trinity.com
```

**Ambos están CONFIRMED y listos para usar.**

---

## ⚠️ IMPORTANTE: PASSWORDS

**Cognito NO almacena las passwords en texto plano.**

Las passwords fueron establecidas cuando se crearon los usuarios. Si no recuerdas la password de un usuario, tienes estas opciones:

### Opción 1: Resetear Password desde AWS Console
```bash
# Ir a AWS Console → Cognito → User Pools → eu-west-1_6UxioIj4z
# Seleccionar usuario → Actions → Reset password
```

### Opción 2: Resetear Password con AWS CLI
```bash
aws cognito-idp admin-set-user-password \
  --user-pool-id eu-west-1_6UxioIj4z \
  --username test@trinity.app \
  --password "NuevaPassword123!" \
  --permanent \
  --region eu-west-1
```

### Opción 3: Usar "Forgot Password" en la App
1. Abre la app
2. Toca "¿Olvidaste tu contraseña?"
3. Ingresa el email
4. Recibirás un código de verificación
5. Ingresa el código y nueva password

### Opción 4: Crear Nuevos Usuarios
Simplemente registra nuevos usuarios desde la app.

---

## 🔧 COMANDOS ÚTILES

### Listar todos los usuarios:
```bash
aws cognito-idp list-users \
  --user-pool-id eu-west-1_6UxioIj4z \
  --region eu-west-1
```

### Ver detalles de un usuario específico:
```bash
aws cognito-idp admin-get-user \
  --user-pool-id eu-west-1_6UxioIj4z \
  --username test@trinity.app \
  --region eu-west-1
```

### Confirmar un usuario manualmente:
```bash
aws cognito-idp admin-confirm-sign-up \
  --user-pool-id eu-west-1_6UxioIj4z \
  --username protexwear.dev@gmail.com \
  --region eu-west-1
```

### Establecer password para un usuario:
```bash
aws cognito-idp admin-set-user-password \
  --user-pool-id eu-west-1_6UxioIj4z \
  --username test@trinity.app \
  --password "Trinity2024!" \
  --permanent \
  --region eu-west-1
```

### Eliminar un usuario:
```bash
aws cognito-idp admin-delete-user \
  --user-pool-id eu-west-1_6UxioIj4z \
  --username test-1767054571785@trinity.app \
  --region eu-west-1
```

---

## 📊 RESUMEN

```
Total de usuarios: 15
✅ Confirmados:    9
⚠️  Force Change:  1
❌ No confirmados: 5
```

---

## 🧪 PARA PRUEBAS DE TIEMPO REAL

Usa estos 2 usuarios que están confirmados y tienen email verificado:

1. **test@trinity.app** (Email verificado ✅)
2. **test@trinity.com** (Confirmado ✅)

Si no sabes las passwords, usa la Opción 2 arriba para establecer nuevas passwords:

```bash
# Usuario 1
aws cognito-idp admin-set-user-password \
  --user-pool-id eu-west-1_6UxioIj4z \
  --username test@trinity.app \
  --password "Trinity2024!" \
  --permanent \
  --region eu-west-1

# Usuario 2
aws cognito-idp admin-set-user-password \
  --user-pool-id eu-west-1_6UxioIj4z \
  --username test@trinity.com \
  --password "Trinity2024!" \
  --permanent \
  --region eu-west-1
```

---

**Generado por:** Kiro AI Assistant  
**Fecha:** 15 de Enero de 2026
