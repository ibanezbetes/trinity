#!/usr/bin/env node
"use strict";
/**
 * Environment Configuration Validator
 * Validates that all required environment variables are present before deployment
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEnvironmentConfiguration = validateEnvironmentConfiguration;
const load_env_config_1 = require("./load-env-config");
async function validateEnvironmentConfiguration() {
    console.log('🔍 Validating environment configuration...');
    try {
        // Validate required variables
        load_env_config_1.environmentLoader.validateRequiredVariables();
        // Get all variables
        const allVars = load_env_config_1.environmentLoader.getAllVariables();
        const lambdaVars = load_env_config_1.environmentLoader.getLambdaEnvironmentVariables();
        console.log(`📊 Environment Statistics:`);
        console.log(`   - Total variables in .env: ${Object.keys(allVars).length}`);
        console.log(`   - Lambda variables: ${Object.keys(lambdaVars).length}`);
        // Check critical variables
        const criticalVars = [
            'AWS_REGION',
            'AWS_ACCOUNT_ID',
            'TMDB_API_KEY',
            'GRAPHQL_API_URL'
        ];
        console.log('\n🔑 Critical Variables:');
        for (const varName of criticalVars) {
            const value = load_env_config_1.environmentLoader.getVariable(varName);
            if (value) {
                // Mask sensitive values
                const maskedValue = varName.includes('KEY') || varName.includes('SECRET')
                    ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
                    : value;
                console.log(`   ✅ ${varName}: ${maskedValue}`);
            }
            else {
                console.log(`   ❌ ${varName}: NOT SET`);
            }
        }
        // Check CDK environment
        const cdkEnv = load_env_config_1.environmentLoader.getCDKEnvironment();
        console.log('\n🏗️ CDK Environment:');
        console.log(`   - Account: ${cdkEnv.account}`);
        console.log(`   - Region: ${cdkEnv.region}`);
        // Check Lambda environment variables (exclude AWS_REGION as it's reserved)
        console.log('\n🚀 Lambda Environment Variables:');
        const lambdaVarNames = Object.keys(lambdaVars).sort();
        for (const varName of lambdaVarNames) {
            const value = lambdaVars[varName];
            const maskedValue = varName.includes('KEY') || varName.includes('SECRET') || varName.includes('ACCESS')
                ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
                : value;
            console.log(`   - ${varName}: ${maskedValue}`);
        }
        console.log('\n✅ Environment configuration validation passed!');
    }
    catch (error) {
        console.error('\n❌ Environment configuration validation failed:');
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
// Run validation if called directly
if (require.main === module) {
    validateEnvironmentConfiguration();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsaWRhdGUtZW52LWNvbmZpZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZhbGlkYXRlLWVudi1jb25maWcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFDQTs7O0dBR0c7O0FBd0VNLDRFQUFnQztBQXRFekMsdURBQXNEO0FBRXRELEtBQUssVUFBVSxnQ0FBZ0M7SUFDN0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyw0Q0FBNEMsQ0FBQyxDQUFDO0lBRTFELElBQUksQ0FBQztRQUNILDhCQUE4QjtRQUM5QixtQ0FBaUIsQ0FBQyx5QkFBeUIsRUFBRSxDQUFDO1FBRTlDLG9CQUFvQjtRQUNwQixNQUFNLE9BQU8sR0FBRyxtQ0FBaUIsQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUNwRCxNQUFNLFVBQVUsR0FBRyxtQ0FBaUIsQ0FBQyw2QkFBNkIsRUFBRSxDQUFDO1FBRXJFLE9BQU8sQ0FBQyxHQUFHLENBQUMsNEJBQTRCLENBQUMsQ0FBQztRQUMxQyxPQUFPLENBQUMsR0FBRyxDQUFDLGlDQUFpQyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDNUUsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBRXhFLDJCQUEyQjtRQUMzQixNQUFNLFlBQVksR0FBRztZQUNuQixZQUFZO1lBQ1osZ0JBQWdCO1lBQ2hCLGNBQWM7WUFDZCxpQkFBaUI7U0FDbEIsQ0FBQztRQUVGLE9BQU8sQ0FBQyxHQUFHLENBQUMsMEJBQTBCLENBQUMsQ0FBQztRQUN4QyxLQUFLLE1BQU0sT0FBTyxJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ25DLE1BQU0sS0FBSyxHQUFHLG1DQUFpQixDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNyRCxJQUFJLEtBQUssRUFBRSxDQUFDO2dCQUNWLHdCQUF3QjtnQkFDeEIsTUFBTSxXQUFXLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQztvQkFDdkUsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxFQUFFO29CQUNuRSxDQUFDLENBQUMsS0FBSyxDQUFDO2dCQUNWLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxPQUFPLEtBQUssV0FBVyxFQUFFLENBQUMsQ0FBQztZQUNqRCxDQUFDO2lCQUFNLENBQUM7Z0JBQ04sT0FBTyxDQUFDLEdBQUcsQ0FBQyxRQUFRLE9BQU8sV0FBVyxDQUFDLENBQUM7WUFDMUMsQ0FBQztRQUNILENBQUM7UUFFRCx3QkFBd0I7UUFDeEIsTUFBTSxNQUFNLEdBQUcsbUNBQWlCLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztRQUNyRCxPQUFPLENBQUMsR0FBRyxDQUFDLHdCQUF3QixDQUFDLENBQUM7UUFDdEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDL0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFFN0MsMkVBQTJFO1FBQzNFLE9BQU8sQ0FBQyxHQUFHLENBQUMsb0NBQW9DLENBQUMsQ0FBQztRQUNsRCxNQUFNLGNBQWMsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3RELEtBQUssTUFBTSxPQUFPLElBQUksY0FBYyxFQUFFLENBQUM7WUFDckMsTUFBTSxLQUFLLEdBQUcsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ2xDLE1BQU0sV0FBVyxHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQztnQkFDckcsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxFQUFFO2dCQUNuRSxDQUFDLENBQUMsS0FBSyxDQUFDO1lBQ1YsT0FBTyxDQUFDLEdBQUcsQ0FBQyxRQUFRLE9BQU8sS0FBSyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1FBQ2pELENBQUM7UUFFRCxPQUFPLENBQUMsR0FBRyxDQUFDLGtEQUFrRCxDQUFDLENBQUM7SUFFbEUsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLGtEQUFrRCxDQUFDLENBQUM7UUFDbEUsT0FBTyxDQUFDLEtBQUssQ0FBQyxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUN0RSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2xCLENBQUM7QUFDSCxDQUFDO0FBRUQsb0NBQW9DO0FBQ3BDLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQztJQUM1QixnQ0FBZ0MsRUFBRSxDQUFDO0FBQ3JDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXHJcbi8qKlxyXG4gKiBFbnZpcm9ubWVudCBDb25maWd1cmF0aW9uIFZhbGlkYXRvclxyXG4gKiBWYWxpZGF0ZXMgdGhhdCBhbGwgcmVxdWlyZWQgZW52aXJvbm1lbnQgdmFyaWFibGVzIGFyZSBwcmVzZW50IGJlZm9yZSBkZXBsb3ltZW50XHJcbiAqL1xyXG5cclxuaW1wb3J0IHsgZW52aXJvbm1lbnRMb2FkZXIgfSBmcm9tICcuL2xvYWQtZW52LWNvbmZpZyc7XHJcblxyXG5hc3luYyBmdW5jdGlvbiB2YWxpZGF0ZUVudmlyb25tZW50Q29uZmlndXJhdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcclxuICBjb25zb2xlLmxvZygn8J+UjSBWYWxpZGF0aW5nIGVudmlyb25tZW50IGNvbmZpZ3VyYXRpb24uLi4nKTtcclxuICBcclxuICB0cnkge1xyXG4gICAgLy8gVmFsaWRhdGUgcmVxdWlyZWQgdmFyaWFibGVzXHJcbiAgICBlbnZpcm9ubWVudExvYWRlci52YWxpZGF0ZVJlcXVpcmVkVmFyaWFibGVzKCk7XHJcbiAgICBcclxuICAgIC8vIEdldCBhbGwgdmFyaWFibGVzXHJcbiAgICBjb25zdCBhbGxWYXJzID0gZW52aXJvbm1lbnRMb2FkZXIuZ2V0QWxsVmFyaWFibGVzKCk7XHJcbiAgICBjb25zdCBsYW1iZGFWYXJzID0gZW52aXJvbm1lbnRMb2FkZXIuZ2V0TGFtYmRhRW52aXJvbm1lbnRWYXJpYWJsZXMoKTtcclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coYPCfk4ogRW52aXJvbm1lbnQgU3RhdGlzdGljczpgKTtcclxuICAgIGNvbnNvbGUubG9nKGAgICAtIFRvdGFsIHZhcmlhYmxlcyBpbiAuZW52OiAke09iamVjdC5rZXlzKGFsbFZhcnMpLmxlbmd0aH1gKTtcclxuICAgIGNvbnNvbGUubG9nKGAgICAtIExhbWJkYSB2YXJpYWJsZXM6ICR7T2JqZWN0LmtleXMobGFtYmRhVmFycykubGVuZ3RofWApO1xyXG4gICAgXHJcbiAgICAvLyBDaGVjayBjcml0aWNhbCB2YXJpYWJsZXNcclxuICAgIGNvbnN0IGNyaXRpY2FsVmFycyA9IFtcclxuICAgICAgJ0FXU19SRUdJT04nLFxyXG4gICAgICAnQVdTX0FDQ09VTlRfSUQnLCBcclxuICAgICAgJ1RNREJfQVBJX0tFWScsXHJcbiAgICAgICdHUkFQSFFMX0FQSV9VUkwnXHJcbiAgICBdO1xyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZygnXFxu8J+UkSBDcml0aWNhbCBWYXJpYWJsZXM6Jyk7XHJcbiAgICBmb3IgKGNvbnN0IHZhck5hbWUgb2YgY3JpdGljYWxWYXJzKSB7XHJcbiAgICAgIGNvbnN0IHZhbHVlID0gZW52aXJvbm1lbnRMb2FkZXIuZ2V0VmFyaWFibGUodmFyTmFtZSk7XHJcbiAgICAgIGlmICh2YWx1ZSkge1xyXG4gICAgICAgIC8vIE1hc2sgc2Vuc2l0aXZlIHZhbHVlc1xyXG4gICAgICAgIGNvbnN0IG1hc2tlZFZhbHVlID0gdmFyTmFtZS5pbmNsdWRlcygnS0VZJykgfHwgdmFyTmFtZS5pbmNsdWRlcygnU0VDUkVUJykgXHJcbiAgICAgICAgICA/IGAke3ZhbHVlLnN1YnN0cmluZygwLCA0KX0uLi4ke3ZhbHVlLnN1YnN0cmluZyh2YWx1ZS5sZW5ndGggLSA0KX1gXHJcbiAgICAgICAgICA6IHZhbHVlO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGAgICDinIUgJHt2YXJOYW1lfTogJHttYXNrZWRWYWx1ZX1gKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhgICAg4p2MICR7dmFyTmFtZX06IE5PVCBTRVRgKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBDaGVjayBDREsgZW52aXJvbm1lbnRcclxuICAgIGNvbnN0IGNka0VudiA9IGVudmlyb25tZW50TG9hZGVyLmdldENES0Vudmlyb25tZW50KCk7XHJcbiAgICBjb25zb2xlLmxvZygnXFxu8J+Pl++4jyBDREsgRW52aXJvbm1lbnQ6Jyk7XHJcbiAgICBjb25zb2xlLmxvZyhgICAgLSBBY2NvdW50OiAke2Nka0Vudi5hY2NvdW50fWApO1xyXG4gICAgY29uc29sZS5sb2coYCAgIC0gUmVnaW9uOiAke2Nka0Vudi5yZWdpb259YCk7XHJcbiAgICBcclxuICAgIC8vIENoZWNrIExhbWJkYSBlbnZpcm9ubWVudCB2YXJpYWJsZXMgKGV4Y2x1ZGUgQVdTX1JFR0lPTiBhcyBpdCdzIHJlc2VydmVkKVxyXG4gICAgY29uc29sZS5sb2coJ1xcbvCfmoAgTGFtYmRhIEVudmlyb25tZW50IFZhcmlhYmxlczonKTtcclxuICAgIGNvbnN0IGxhbWJkYVZhck5hbWVzID0gT2JqZWN0LmtleXMobGFtYmRhVmFycykuc29ydCgpO1xyXG4gICAgZm9yIChjb25zdCB2YXJOYW1lIG9mIGxhbWJkYVZhck5hbWVzKSB7XHJcbiAgICAgIGNvbnN0IHZhbHVlID0gbGFtYmRhVmFyc1t2YXJOYW1lXTtcclxuICAgICAgY29uc3QgbWFza2VkVmFsdWUgPSB2YXJOYW1lLmluY2x1ZGVzKCdLRVknKSB8fCB2YXJOYW1lLmluY2x1ZGVzKCdTRUNSRVQnKSB8fCB2YXJOYW1lLmluY2x1ZGVzKCdBQ0NFU1MnKVxyXG4gICAgICAgID8gYCR7dmFsdWUuc3Vic3RyaW5nKDAsIDQpfS4uLiR7dmFsdWUuc3Vic3RyaW5nKHZhbHVlLmxlbmd0aCAtIDQpfWBcclxuICAgICAgICA6IHZhbHVlO1xyXG4gICAgICBjb25zb2xlLmxvZyhgICAgLSAke3Zhck5hbWV9OiAke21hc2tlZFZhbHVlfWApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZygnXFxu4pyFIEVudmlyb25tZW50IGNvbmZpZ3VyYXRpb24gdmFsaWRhdGlvbiBwYXNzZWQhJyk7XHJcbiAgICBcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcignXFxu4p2MIEVudmlyb25tZW50IGNvbmZpZ3VyYXRpb24gdmFsaWRhdGlvbiBmYWlsZWQ6Jyk7XHJcbiAgICBjb25zb2xlLmVycm9yKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSk7XHJcbiAgICBwcm9jZXNzLmV4aXQoMSk7XHJcbiAgfVxyXG59XHJcblxyXG4vLyBSdW4gdmFsaWRhdGlvbiBpZiBjYWxsZWQgZGlyZWN0bHlcclxuaWYgKHJlcXVpcmUubWFpbiA9PT0gbW9kdWxlKSB7XHJcbiAgdmFsaWRhdGVFbnZpcm9ubWVudENvbmZpZ3VyYXRpb24oKTtcclxufVxyXG5cclxuZXhwb3J0IHsgdmFsaWRhdGVFbnZpcm9ubWVudENvbmZpZ3VyYXRpb24gfTsiXX0=