const { execSync } = require('child_process');
const fs = require('fs');

console.log('🔍 Listing AppSync APIs...');

try {
    const apiId = 'yeirvhh7tbasposxcefngulg6i';
    console.log(`✅ API ID Usada: ${apiId}`);

    const resolvers = [
        {
            // NEW: publishVoteUpdateEvent (Detailed)
            type: 'Mutation',
            field: 'publishVoteUpdateEvent',
            req: `{
                "version": "2017-02-28",
                "payload": $util.parseJson($context.arguments.voteUpdateData)
            }`,
            res: `$util.toJson($context.result)`
        },
        {
            // LEGACY: publishVoteEvent (Simple/Legacy frontend compatibility)
            type: 'Mutation',
            field: 'publishVoteEvent',
            req: `{
                "version": "2017-02-28",
                "payload": $util.parseJson($context.arguments.voteData)
            }`,
            res: `$util.toJson($context.result)`
        },
        {
            // Note: Stack defines this as publishMatchFoundEvent, AppSync Publisher uses publishMatchFoundEvent.
            type: 'Mutation',
            field: 'publishMatchFoundEvent',
            req: `{
                "version": "2017-02-28",
                "payload": $util.parseJson($context.arguments.matchData)
            }`,
            res: `$util.toJson($context.result)`
        }
    ];

    for (const res of resolvers) {
        console.log(`🔨 Actualizando resolver ${res.field}...`);

        fs.writeFileSync(`req_${res.field}.vtl`, res.req);
        fs.writeFileSync(`res_${res.field}.vtl`, res.res);

        try {
            const cmd = `aws appsync update-resolver --api-id ${apiId} --type-name ${res.type} --field-name ${res.field} --data-source-name NoneDataSource --request-mapping-template file://req_${res.field}.vtl --response-mapping-template file://res_${res.field}.vtl --region eu-west-1`;
            execSync(cmd, { stdio: 'inherit' });
            console.log(`✅ ${res.field} FIXED.`);
        } catch (e) {
            console.error(`❌ Falló update de ${res.field}:`, e.message);
        }

        // Cleanup
        if (fs.existsSync(`req_${res.field}.vtl`)) fs.unlinkSync(`req_${res.field}.vtl`);
        if (fs.existsSync(`res_${res.field}.vtl`)) fs.unlinkSync(`res_${res.field}.vtl`);
    }

    console.log('\n🎉 Resolvers actualizados.');

} catch (error) {
    console.error('❌ Error:', error.message);
}
