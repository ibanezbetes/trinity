#!/usr/bin/env node
"use strict";
/**
 * Configuration Validation Script
 * Validates Trinity configuration from both Parameter Store and environment variables
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateConfiguration = validateConfiguration;
const config_loader_1 = require("../src/shared/config-loader");
async function validateConfiguration() {
    console.log('🔍 Trinity Configuration Validation');
    console.log('─'.repeat(50));
    try {
        const loader = new config_loader_1.ConfigLoader();
        const summary = await loader.getConfigurationSummary();
        // Display summary
        console.log(`Environment: ${summary.environment}`);
        console.log(`Region: ${summary.region}`);
        console.log(`Parameter Count: ${summary.parameterCount}`);
        console.log(`Parameter Store Connectivity: ${summary.connectivity ? '✅' : '❌'}`);
        console.log('');
        // Display validation results
        if (summary.validation.isValid) {
            console.log('✅ Configuration validation PASSED');
        }
        else {
            console.log('❌ Configuration validation FAILED');
            if (summary.validation.missingParameters.length > 0) {
                console.log('\n📋 Missing Parameters:');
                summary.validation.missingParameters.forEach(param => {
                    console.log(`  ❌ ${param}`);
                });
            }
            if (summary.validation.invalidParameters.length > 0) {
                console.log('\n⚠️ Invalid Parameters:');
                summary.validation.invalidParameters.forEach(param => {
                    console.log(`  ⚠️ ${param}`);
                });
            }
            if (summary.validation.errors.length > 0) {
                console.log('\n🚨 Validation Errors:');
                summary.validation.errors.forEach(error => {
                    console.log(`  🚨 ${error}`);
                });
            }
        }
        // List all parameters
        console.log('\n📋 Parameter Store Contents:');
        const parameters = await loader.listTrinityParameters();
        if (parameters.length === 0) {
            console.log('  ⚠️ No parameters found. Run "npm run hydrate-ssm" to create them.');
        }
        else {
            parameters.forEach(param => {
                const typeIcon = param.type === 'SecureString' ? '🔒' : '📝';
                const lastModified = param.lastModified ? param.lastModified.toISOString().split('T')[0] : 'Unknown';
                console.log(`  ${typeIcon} ${param.name} (v${param.version || 1}, ${lastModified})`);
            });
        }
        // Test configuration loading
        console.log('\n🧪 Testing Configuration Loading:');
        try {
            const config = await config_loader_1.ConfigUtils.loadConfig();
            console.log('✅ Configuration loaded successfully');
            console.log(`  - External API endpoints: ${Object.keys(config.external).length}`);
            console.log(`  - DynamoDB tables: ${Object.keys(config.tables).length}`);
            console.log(`  - Feature flags: ${config.featureFlags ? Object.keys(config.featureFlags).length : 0}`);
        }
        catch (error) {
            console.log('❌ Configuration loading failed');
            console.log(`  Error: ${error.message}`);
        }
        console.log('\n─'.repeat(50));
        if (summary.validation.isValid && summary.connectivity) {
            console.log('🎉 All configuration checks passed!');
            process.exit(0);
        }
        else {
            console.log('⚠️ Configuration issues detected. Please review and fix.');
            process.exit(1);
        }
    }
    catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error('❌ Configuration validation failed:', err.message);
        process.exit(1);
    }
}
// Run validation
if (require.main === module) {
    validateConfiguration();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsaWRhdGUtY29uZmlnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmFsaWRhdGUtY29uZmlnLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQ0E7OztHQUdHOztBQWlHTSxzREFBcUI7QUEvRjlCLCtEQUF3RTtBQUd4RSxLQUFLLFVBQVUscUJBQXFCO0lBQ2xDLE9BQU8sQ0FBQyxHQUFHLENBQUMscUNBQXFDLENBQUMsQ0FBQztJQUNuRCxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUU1QixJQUFJLENBQUM7UUFDSCxNQUFNLE1BQU0sR0FBRyxJQUFJLDRCQUFZLEVBQUUsQ0FBQztRQUNsQyxNQUFNLE9BQU8sR0FBRyxNQUFNLE1BQU0sQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO1FBRXZELGtCQUFrQjtRQUNsQixPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixPQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztRQUNuRCxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDekMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsT0FBTyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7UUFDMUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQ0FBaUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBQ2pGLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFaEIsNkJBQTZCO1FBQzdCLElBQUksT0FBTyxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUMvQixPQUFPLENBQUMsR0FBRyxDQUFDLG1DQUFtQyxDQUFDLENBQUM7UUFDbkQsQ0FBQzthQUFNLENBQUM7WUFDTixPQUFPLENBQUMsR0FBRyxDQUFDLG1DQUFtQyxDQUFD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QkFBaUI7QUFDakIsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLE1BQU0sRUFBRSxDQUFDO0lBQzVCLHFCQUFxQixFQUFFLENBQUM7QUFDMUIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcclxuLyoqXHJcbiAqIENvbmZpZ3VyYXRpb24gVmFsaWRhdGlvbiBTY3JpcHRcclxuICogVmFsaWRhdGVzIFRyaW5pdHkgY29uZmlndXJhdGlvbiBmcm9tIGJvdGggUGFyYW1ldGVyIFN0b3JlIGFuZCBlbnZpcm9ubWVudCB2YXJpYWJsZXNcclxuICovXHJcblxyXG5pbXBvcnQgeyBDb25maWdMb2FkZXIsIENvbmZpZ1V0aWxzIH0gZnJvbSAnLi4vc3JjL3NoYXJlZC9jb25maWctbG9hZGVyJztcclxuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi4vc3JjL3NoYXJlZC9sb2dnZXInO1xyXG5cclxuYXN5bmMgZnVuY3Rpb24gdmFsaWRhdGVDb25maWd1cmF0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gIGNvbnNvbGUubG9nKCfwn5SNIFRyaW5pdHkgQ29uZmlndXJhdGlvbiBWYWxpZGF0aW9uJyk7XHJcbiAgY29uc29sZS5sb2coJ+KUgCcucmVwZWF0KDUwKSk7XHJcblxyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBsb2FkZXIgPSBuZXcgQ29uZmlnTG9hZGVyKCk7XHJcbiAgICBjb25zdCBzdW1tYXJ5ID0gYXdhaXQgbG9hZGVyLmdldENvbmZpZ3VyYXRpb25TdW1tYXJ5KCk7XHJcblxyXG4gICAgLy8gRGlzcGxheSBzdW1tYXJ5XHJcbiAgICBjb25zb2xlLmxvZyhgRW52aXJvbm1lbnQ6ICR7c3VtbWFyeS5lbnZpcm9ubWVudH1gKTtcclxuICAgIGNvbnNvbGUubG9nKGBSZWdpb246ICR7c3VtbWFyeS5yZWdpb259YCk7XHJcbiAgICBjb25zb2xlLmxvZyhgUGFyYW1ldGVyIENvdW50OiAke3N1bW1hcnkucGFyYW1ldGVyQ291bnR9YCk7XHJcbiAgICBjb25zb2xlLmxvZyhgUGFyYW1ldGVyIFN0b3JlIENvbm5lY3Rpdml0eTogJHtzdW1tYXJ5LmNvbm5lY3Rpdml0eSA/ICfinIUnIDogJ+KdjCd9YCk7XHJcbiAgICBjb25zb2xlLmxvZygnJyk7XHJcblxyXG4gICAgLy8gRGlzcGxheSB2YWxpZGF0aW9uIHJlc3VsdHNcclxuICAgIGlmIChzdW1tYXJ5LnZhbGlkYXRpb24uaXNWYWxpZCkge1xyXG4gICAgICBjb25zb2xlLmxvZygn4pyFIENvbmZpZ3VyYXRpb24gdmFsaWRhdGlvbiBQQVNTRUQnKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgQ29uZmlndXJhdGlvbiB2YWxpZGF0aW9uIEZBSUxFRCcpO1xyXG4gICAgICBcclxuICAgICAgaWYgKHN1bW1hcnkudmFsaWRhdGlvbi5taXNzaW5nUGFyYW1ldGVycy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1xcbvCfk4sgTWlzc2luZyBQYXJhbWV0ZXJzOicpO1xyXG4gICAgICAgIHN1bW1hcnkudmFsaWRhdGlvbi5taXNzaW5nUGFyYW1ldGVycy5mb3JFYWNoKHBhcmFtID0+IHtcclxuICAgICAgICAgIGNvbnNvbGUubG9nKGAgIOKdjCAke3BhcmFtfWApO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoc3VtbWFyeS52YWxpZGF0aW9uLmludmFsaWRQYXJhbWV0ZXJzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBjb25zb2xlLmxvZygnXFxu4pqg77iPIEludmFsaWQgUGFyYW1ldGVyczonKTtcclxuICAgICAgICBzdW1tYXJ5LnZhbGlkYXRpb24uaW52YWxpZFBhcmFtZXRlcnMuZm9yRWFjaChwYXJhbSA9PiB7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZyhgICDimqDvuI8gJHtwYXJhbX1gKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG5cclxuICAgICAgaWYgKHN1bW1hcnkudmFsaWRhdGlvbi5lcnJvcnMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdcXG7wn5qoIFZhbGlkYXRpb24gRXJyb3JzOicpO1xyXG4gICAgICAgIHN1bW1hcnkudmFsaWRhdGlvbi5lcnJvcnMuZm9yRWFjaChlcnJvciA9PiB7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZyhgICDwn5qoICR7ZXJyb3J9YCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBMaXN0IGFsbCBwYXJhbWV0ZXJzXHJcbiAgICBjb25zb2xlLmxvZygnXFxu8J+TiyBQYXJhbWV0ZXIgU3RvcmUgQ29udGVudHM6Jyk7XHJcbiAgICBjb25zdCBwYXJhbWV0ZXJzID0gYXdhaXQgbG9hZGVyLmxpc3RUcmluaXR5UGFyYW1ldGVycygpO1xyXG4gICAgXHJcbiAgICBpZiAocGFyYW1ldGVycy5sZW5ndGggPT09IDApIHtcclxuICAgICAgY29uc29sZS5sb2coJyAg4pqg77iPIE5vIHBhcmFtZXRlcnMgZm91bmQuIFJ1biBcIm5wbSBydW4gaHlkcmF0ZS1zc21cIiB0byBjcmVhdGUgdGhlbS4nKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHBhcmFtZXRlcnMuZm9yRWFjaChwYXJhbSA9PiB7XHJcbiAgICAgICAgY29uc3QgdHlwZUljb24gPSBwYXJhbS50eXBlID09PSAnU2VjdXJlU3RyaW5nJyA/ICfwn5SSJyA6ICfwn5OdJztcclxuICAgICAgICBjb25zdCBsYXN0TW9kaWZpZWQgPSBwYXJhbS5sYXN0TW9kaWZpZWQgPyBwYXJhbS5sYXN0TW9kaWZpZWQudG9JU09TdHJpbmcoKS5zcGxpdCgnVCcpWzBdIDogJ1Vua25vd24nO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGAgICR7dHlwZUljb259ICR7cGFyYW0ubmFtZX0gKHYke3BhcmFtLnZlcnNpb24gfHwgMX0sICR7bGFzdE1vZGlmaWVkfSlgKTtcclxuICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gVGVzdCBjb25maWd1cmF0aW9uIGxvYWRpbmdcclxuICAgIGNvbnNvbGUubG9nKCdcXG7wn6eqIFRlc3RpbmcgQ29uZmlndXJhdGlvbiBMb2FkaW5nOicpO1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgY29uZmlnID0gYXdhaXQgQ29uZmlnVXRpbHMubG9hZENvbmZpZygpO1xyXG4gICAgICBjb25zb2xlLmxvZygn4pyFIENvbmZpZ3VyYXRpb24gbG9hZGVkIHN1Y2Nlc3NmdWxseScpO1xyXG4gICAgICBjb25zb2xlLmxvZyhgICAtIEV4dGVybmFsIEFQSSBlbmRwb2ludHM6ICR7T2JqZWN0LmtleXMoY29uZmlnLmV4dGVybmFsKS5sZW5ndGh9YCk7XHJcbiAgICAgIGNvbnNvbGUubG9nKGAgIC0gRHluYW1vREIgdGFibGVzOiAke09iamVjdC5rZXlzKGNvbmZpZy50YWJsZXMpLmxlbmd0aH1gKTtcclxuICAgICAgY29uc29sZS5sb2coYCAgLSBGZWF0dXJlIGZsYWdzOiAke2NvbmZpZy5mZWF0dXJlRmxhZ3MgPyBPYmplY3Qua2V5cyhjb25maWcuZmVhdHVyZUZsYWdzKS5sZW5ndGggOiAwfWApO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5sb2coJ+KdjCBDb25maWd1cmF0aW9uIGxvYWRpbmcgZmFpbGVkJyk7XHJcbiAgICAgIGNvbnNvbGUubG9nKGAgIEVycm9yOiAkeyhlcnJvciBhcyBFcnJvcikubWVzc2FnZX1gKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zb2xlLmxvZygnXFxu4pSAJy5yZXBlYXQoNTApKTtcclxuICAgIFxyXG4gICAgaWYgKHN1bW1hcnkudmFsaWRhdGlvbi5pc1ZhbGlkICYmIHN1bW1hcnkuY29ubmVjdGl2aXR5KSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCfwn46JIEFsbCBjb25maWd1cmF0aW9uIGNoZWNrcyBwYXNzZWQhJyk7XHJcbiAgICAgIHByb2Nlc3MuZXhpdCgwKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCfimqDvuI8gQ29uZmlndXJhdGlvbiBpc3N1ZXMgZGV0ZWN0ZWQuIFBsZWFzZSByZXZpZXcgYW5kIGZpeC4nKTtcclxuICAgICAgcHJvY2Vzcy5leGl0KDEpO1xyXG4gICAgfVxyXG5cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc3QgZXJyID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpO1xyXG4gICAgY29uc29sZS5lcnJvcign4p2MIENvbmZpZ3VyYXRpb24gdmFsaWRhdGlvbiBmYWlsZWQ6JywgZXJyLm1lc3NhZ2UpO1xyXG4gICAgcHJvY2Vzcy5leGl0KDEpO1xyXG4gIH1cclxufVxyXG5cclxuLy8gUnVuIHZhbGlkYXRpb25cclxuaWYgKHJlcXVpcmUubWFpbiA9PT0gbW9kdWxlKSB7XHJcbiAgdmFsaWRhdGVDb25maWd1cmF0aW9uKCk7XHJcbn1cclxuXHJcbmV4cG9ydCB7IHZhbGlkYXRlQ29uZmlndXJhdGlvbiB9OyJdfQ==