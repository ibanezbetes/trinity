# 📡 API Endpoints - Users Module

Base URL: `http://localhost:3000`

---

## 1️⃣ CREATE - Crear Usuario

**POST** `/users`

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "nombre": "Lucía Gómez",
  "token": "token123",
  "activo": true
}
```

**Respuesta Exitosa (201):**
```json
{
  "id": 1,
  "nombre": "Lucía Gómez",
  "token": "token123",
  "activo": true
}
```

---

## 2️⃣ GET ALL - Obtener Todos los Usuarios

**GET** `/users`

**Respuesta Exitosa (200):**
```json
[
  {
    "id": 1,
    "nombre": "Lucía Gómez",
    "token": "token123",
    "activo": true
  },
  {
    "id": 2,
    "nombre": "Carlos Pérez",
    "token": "token456",
    "activo": true
  }
]
```

---

## 3️⃣ GET ALL ACTIVE - Obtener Solo Usuarios Activos

**GET** `/users?active=true`

**Respuesta Exitosa (200):**
```json
[
  {
    "id": 1,
    "nombre": "Lucía Gómez",
    "token": "token123",
    "activo": true
  }
]
```

---

## 4️⃣ GET ONE - Obtener Usuario por ID

**GET** `/users/1`

**Respuesta Exitosa (200):**
```json
{
  "id": 1,
  "nombre": "Lucía Gómez",
  "token": "token123",
  "activo": true
}
```

**Respuesta Error (404):**
```json
{
  "statusCode": 404,
  "message": "User not found"
}
```

---

## 5️⃣ GET BY TOKEN - Obtener Usuario por Token

**GET** `/users/by-token/token123`

**Respuesta Exitosa (200):**
```json
{
  "id": 1,
  "nombre": "Lucía Gómez",
  "token": "token123",
  "activo": true
}
```

**Respuesta Error (404):**
```json
{
  "statusCode": 404,
  "message": "User not found"
}
```

---

## 6️⃣ UPDATE - Actualizar Usuario

**PATCH** `/users/1`

**Headers:**
```
Content-Type: application/json
```

**Body (todos los campos son opcionales):**
```json
{
  "nombre": "Lucía Gómez Actualizada",
  "activo": false
}
```

**Respuesta Exitosa (200):**
```json
{
  "id": 1,
  "nombre": "Lucía Gómez Actualizada",
  "token": "token123",
  "activo": false
}
```

**Respuesta Error (404):**
```json
{
  "statusCode": 404,
  "message": "User not found"
}
```

---

## 7️⃣ DELETE - Eliminar Usuario

**DELETE** `/users/1`

**Respuesta Exitosa (200):**
```json
{
  "message": "User deleted successfully"
}
```

**Respuesta Error (404):**
```json
{
  "statusCode": 404,
  "message": "User not found"
}
```

---

## 🧪 Secuencia de Prueba Completa

### 1. Crear varios usuarios
```bash
POST http://localhost:3000/users
Body: {"nombre": "Lucía Gómez", "token": "token123", "activo": true}

POST http://localhost:3000/users
Body: {"nombre": "Carlos Pérez", "token": "token456", "activo": true}

POST http://localhost:3000/users
Body: {"nombre": "Ana Torres", "token": "token789", "activo": false}

POST http://localhost:3000/users
Body: {"nombre": "Miguel Ruiz", "token": "token321", "activo": true}

POST http://localhost:3000/users
Body: {"nombre": "Laura Sánchez", "token": "token654", "activo": false}
```

### 2. Listar todos
```bash
GET http://localhost:3000/users
```

### 3. Listar solo activos
```bash
GET http://localhost:3000/users?active=true
```

### 4. Obtener uno por ID
```bash
GET http://localhost:3000/users/1
```

### 5. Obtener por token
```bash
GET http://localhost:3000/users/by-token/token123
```

### 6. Actualizar
```bash
PATCH http://localhost:3000/users/1
Body: {"nombre": "Lucía Gómez Modificada", "activo": false}
```

### 7. Eliminar
```bash
DELETE http://localhost:3000/users/1
```

### 8. Verificar eliminación
```bash
GET http://localhost:3000/users/1
# Debería devolver 404
```

---

## 📋 Colección cURL para Terminal

```bash
# CREATE
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Lucía Gómez","token":"token123","activo":true}'

# GET ALL
curl http://localhost:3000/users

# GET ACTIVE
curl http://localhost:3000/users?active=true

# GET ONE
curl http://localhost:3000/users/1

# GET BY TOKEN
curl http://localhost:3000/users/by-token/token123

# UPDATE
curl -X PATCH http://localhost:3000/users/1 \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Lucía Actualizada","activo":false}'

# DELETE
curl -X DELETE http://localhost:3000/users/1
```
