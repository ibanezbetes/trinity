const { CognitoIdentityProviderClient, ListUsersCommand } = require('@aws-sdk/client-cognito-identity-provider');

// Load credentials from .env file
require('dotenv').config();

async function listCognitoUsers() {
  console.log('🔍 Listando usuarios de Cognito...\n');

  const client = new CognitoIdentityProviderClient({
    region: 'eu-west-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });

  try {
    const command = new ListUsersCommand({
      UserPoolId: 'eu-west-1_6UxioIj4z',
      Limit: 60
    });

    const response = await client.send(command);
    
    console.log(`📊 Total de usuarios encontrados: ${response.Users.length}\n`);
    console.log('=' .repeat(80));

    response.Users.forEach((user, index) => {
      console.log(`\n👤 Usuario ${index + 1}:`);
      console.log(`   Username (Cognito): ${user.Username}`);
      console.log(`   Estado: ${user.UserStatus}`);
      console.log(`   Habilitado: ${user.Enabled ? 'Sí' : 'No'}`);
      console.log(`   Creado: ${new Date(user.UserCreateDate).toLocaleString()}`);
      
      // Extraer atributos importantes
      const attributes = {};
      user.Attributes.forEach(attr => {
        attributes[attr.Name] = attr.Value;
      });

      console.log(`   Email: ${attributes.email || 'N/A'}`);
      console.log(`   Email verificado: ${attributes.email_verified === 'true' ? 'Sí' : 'No'}`);
      console.log(`   Nombre: ${attributes.name || attributes.preferred_username || 'N/A'}`);
      
      if (attributes.identities) {
        try {
          const identities = JSON.parse(attributes.identities);
          console.log(`   Proveedor: ${identities[0]?.providerName || 'Email/Password'}`);
        } catch (e) {
          console.log(`   Proveedor: Email/Password`);
        }
      } else {
        console.log(`   Proveedor: Email/Password`);
      }

      console.log('   ' + '-'.repeat(76));
    });

    console.log('\n' + '=' .repeat(80));
    console.log('\n📝 RESUMEN DE ACCESO:\n');
    
    response.Users.forEach((user, index) => {
      const attributes = {};
      user.Attributes.forEach(attr => {
        attributes[attr.Name] = attr.Value;
      });

      if (user.UserStatus === 'CONFIRMED' && user.Enabled) {
        console.log(`${index + 1}. Email: ${attributes.email}`);
        console.log(`   Usuario: ${attributes.preferred_username || attributes.name || 'N/A'}`);
        console.log(`   Estado: ✅ Puede iniciar sesión\n`);
      } else {
        console.log(`${index + 1}. Email: ${attributes.email}`);
        console.log(`   Estado: ⚠️ ${user.UserStatus} - ${user.Enabled ? 'Habilitado' : 'Deshabilitado'}\n`);
      }
    });

    console.log('=' .repeat(80));
    console.log('\n💡 Para iniciar sesión necesitas:');
    console.log('   - Email del usuario');
    console.log('   - Contraseña (si no la sabes, puedes resetearla desde AWS Console)\n');

  } catch (error) {
    console.error('❌ Error al listar usuarios:', error.message);
  }
}

listCognitoUsers();
