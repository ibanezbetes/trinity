# Infrastructure

## Estructura

### /clean
Versión limpia y organizada de la infraestructura:
- **cdk/**: Código AWS CDK
- **cloudformation/**: Templates CloudFormation
- **scripts/**: Scripts de deployment

### Archivos Principales
- **package.json**: Dependencias del proyecto
- **cdk.json**: Configuración CDK
- **tsconfig.json**: Configuración TypeScript
- **schema.graphql**: Esquema GraphQL principal

## Uso

### CDK Deployment
```bash
cd infrastructure/clean
npm install
cdk deploy
```

### CloudFormation
```bash
aws cloudformation deploy --template-file template.yaml --stack-name trinity-stack
```

## Notas
- La carpeta original `infrastructure/` contiene el código legacy
- Usa la carpeta `clean/` para nuevos desarrollos
