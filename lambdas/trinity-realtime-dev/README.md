# trinity-realtime-dev

## Configuración
- **Runtime**: nodejs18.x
- **Handler**: realtime.handler
- **Timeout**: 30s
- **Memory**: 512MB
- **Última modificación**: 2026-01-26T22:58:51.000+0000

## Descripción


## Variables de entorno
```json
{
  "Variables": {
    "ROOM_MATCHES_TABLE": "trinity-room-matches-dev",
    "ROOMS_TABLE": "trinity-rooms-dev-v2",
    "MOVIES_CACHE_TABLE": "trinity-movies-cache-dev",
    "TMDB_API_KEY": "",
    "USERS_TABLE": "trinity-users-dev",
    "ROOM_INVITES_TABLE": "trinity-room-invites-dev-v2",
    "VOTES_TABLE": "trinity-votes-dev",
    "HUGGINGFACE_API_KEY": "",
    "USER_POOL_CLIENT_ID": "l08ofv6tef7dp8eorn022fqpj",
    "USER_POOL_ID": "eu-west-1_EtOx2swvP",
    "CONNECTIONS_TABLE": "trinity-connections-dev",
    "ROOM_MEMBERS_TABLE": "trinity-room-members-dev"
  }
}
```

## Despliegue
Para desplegar esta función:
```bash
cd lambdas/trinity-realtime-dev
zip -r function.zip .
aws lambda update-function-code --function-name trinity-realtime-dev --zip-file fileb://function.zip --region eu-west-1
```
