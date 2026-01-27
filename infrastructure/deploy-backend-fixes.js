const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Reparando Infraestructura: Backend + AppSync...\n');

try {
    // ---------------------------------------------------------
    // 1. Compilar y empaquetar usando esbuild (FULL BUNDLE)
    // ---------------------------------------------------------
    console.log('📦 Empaquetando Lambdas (incluyendo AWS SDK)...');

    let buildSync;
    try {
        buildSync = require('esbuild').buildSync;
    } catch (e) {
        console.log('⚠️ esbuild not found locally, installing...');
        execSync('npm install esbuild --no-save', { stdio: 'ignore' });
        buildSync = require('esbuild').buildSync;
    }

    // Lista de handlers a desplegar
    const handlers = ['movie', 'vote'];

    if (fs.existsSync('lambda-temp')) {
        fs.rmSync('lambda-temp', { recursive: true, force: true });
    }
    fs.mkdirSync('lambda-temp');

    handlers.forEach(handler => {
        console.log(`🔨 Bundling ${handler}...`);
        buildSync({
            entryPoints: [`src/handlers/${handler}.ts`],
            bundle: true,
            platform: 'node',
            target: 'node18',
            outfile: `lambda-temp/${handler}.js`,
            // NO EXTERNAL: Bundle aws-sdk to ensure @smithy dependencies are present
            external: [],
            minify: false,
            sourcemap: false,
        });
    });

    console.log('✅ Bundling completado.');

    // ---------------------------------------------------------
    // 2. Crear ZIP
    // ---------------------------------------------------------
    console.log('📦 Creando ZIP...');
    let AdmZip;
    try {
        AdmZip = require('adm-zip');
    } catch (e) {
        console.log('⚠️ adm-zip not found, installing...');
        execSync('npm install adm-zip --no-save', { stdio: 'ignore' });
        AdmZip = require('adm-zip');
    }

    const zip = new AdmZip();
    zip.addLocalFolder('lambda-temp');
    zip.writeZip("deploy-bundled.zip");
    console.log('✅ ZIP creado: deploy-bundled.zip');

    // ---------------------------------------------------------
    // 3. Desplegar Lambdas
    // ---------------------------------------------------------
    const functionsToUpdate = [
        { name: 'trinity-vote-dev', prettyName: 'Vote Handler' },
        { name: 'trinity-movie-dev', prettyName: 'Movie Handler' }
    ];

    for (const info of functionsToUpdate) {
        console.log(`🚀 Desplegando ${info.prettyName} (${info.name})...`);
        try {
            execSync(`aws lambda update-function-code --function-name ${info.name} --zip-file fileb://deploy-bundled.zip --region eu-west-1`, { stdio: 'ignore' });
            console.log(`✅ ${info.name} actualizado exitosamente.`);
        } catch (error) {
            console.error(`❌ Error actualizando ${info.name}:`, error.message);
        }
    }

    // ---------------------------------------------------------
    // 4. Reparar AppSync Resolvers (VTL)
    // ---------------------------------------------------------
    console.log('\n🔧 Reparando AppSync Resolvers (VTL)...');

    // Buscar API ID
    let apiId = '';
    try {
        const listCmd = `aws appsync list-graphql-apis --region eu-west-1 --query "graphqlApis[?contains(name, 'trinity')].apiId" --output text`;
        const output = execSync(listCmd).toString().trim();
        // Si hay varios, coger el primero
        apiId = output.split(/\s+/)[0];
    } catch (e) {
        console.warn('⚠️ No se pudo listar APIs de AppSync.');
    }

    if (apiId) {
        console.log(`   API ID encontrada: ${apiId}`);

        const resolversToFix = [
            {
                type: 'Mutation',
                field: 'publishVoteUpdateEvent',
                // Parse the inner JSON string arguments.voteUpdateData
                requestMapping: `{
                    "version": "2017-02-28",
                    "payload": $util.parseJson($context.arguments.voteUpdateData)
                }`,
                responseMapping: `$util.toJson($context.result)`
            },
            {
                type: 'Mutation',
                field: 'publishMatchFoundEvent',
                // Parse the inner JSON string arguments.matchData
                requestMapping: `{
                    "version": "2017-02-28",
                    "payload": $util.parseJson($context.arguments.matchData)
                }`,
                responseMapping: `$util.toJson($context.result)`
            }
        ];

        for (const res of resolversToFix) {
            console.log(`   Reparando resolver ${res.type}.${res.field}...`);
            try {
                // Creates temporary files for templates to avoid escaping hell
                fs.writeFileSync('req.vtl', res.requestMapping);
                fs.writeFileSync('res.vtl', res.responseMapping);

                execSync(`aws appsync update-resolver --api-id ${apiId} --type-name ${res.type} --field-name ${res.field} --data-source-name NoneDataSource --request-mapping-template file://req.vtl --response-mapping-template file://res.vtl --region eu-west-1`, { stdio: 'ignore' });
                console.log(`   ✅ Resolver ${res.field} actualizado.`);
            } catch (error) {
                console.error(`   ❌ Error actualizando resolver ${res.field}:`, error.message);
            }
        }

        // Cleanup VTL files
        if (fs.existsSync('req.vtl')) fs.unlinkSync('req.vtl');
        if (fs.existsSync('res.vtl')) fs.unlinkSync('res.vtl');

    } else {
        console.error('❌ No se encontró API de AppSync. Saltando fix de resolvers.');
    }

    // Limpieza final
    console.log('\n🧹 Limpiando...');
    if (fs.existsSync('lambda-temp')) fs.rmSync('lambda-temp', { recursive: true, force: true });
    if (fs.existsSync('deploy-bundled.zip')) fs.rmSync('deploy-bundled.zip', { force: true });

    console.log('\n🎉 ¡Reparación completa! Reinicia la app y prueba de nuevo.');

} catch (error) {
    console.error('\n❌ Error CRÍTICO:', error);
    process.exit(1);
}
