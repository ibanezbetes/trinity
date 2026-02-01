#!/usr/bin/env node
"use strict";
/**
 * Schema Validation Script
 * Compares CDK-generated CloudFormation template against live DynamoDB tables
 * Ensures perfect match before CDK import operation
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchemaValidator = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class SchemaValidator {
    constructor() {
        this.dynamoClient = new client_dynamodb_1.DynamoDBClient({ region: 'eu-west-1' });
        this.expectedTables = [
            'trinity-users-dev',
            'trinity-rooms-dev-v2',
            'trinity-room-members-dev',
            'trinity-room-invites-dev-v2',
            'trinity-votes-dev',
            'trinity-movies-cache-dev',
            'trinity-room-matches-dev',
            'trinity-connections-dev',
            'trinity-room-movie-cache-dev',
            'trinity-room-cache-metadata-dev',
            'trinity-matchmaking-dev',
            'trinity-filter-cache',
        ];
    }
    async validateAll() {
        console.log('🔍 Trinity Schema Validation');
        console.log('Comparing CDK definitions with live AWS tables');
        console.log('─'.repeat(60));
        // Generate CloudFormation template
        console.log('📋 Generating CloudFormation template...');
        const templatePath = path.join(process.cwd(), 'cdk-template.json');
        try {
            // Use stderr redirection to avoid warnings in JSON output
            const synthOutput = (0, child_process_1.execSync)('npm run build && cdk synth TrinityDatabaseStack --json 2>/dev/null || cdk synth TrinityDatabaseStack --json', {
                cwd: process.cwd(),
                encoding: 'utf8',
                stdio: 'pipe'
            });
            // Extract JSON from output (skip warnings and notices)
            const lines = synthOutput.split('\n');
            const jsonStartIndex = lines.findIndex(line => line.trim().startsWith('{'));
            // Find last closing brace (use reverse iteration instead of findLastIndex)
            let jsonEndIndex = -1;
            for (let i = lines.length - 1; i >= 0; i--) {
                if (lines[i].trim().endsWith('}')) {
                    jsonEndIndex = i;
                    break;
                }
            }
            if (jsonStartIndex === -1 || jsonEndIndex === -1) {
                console.error('❌ Could not find JSON in CDK output');
                return false;
            }
            const jsonContent = lines.slice(jsonStartIndex, jsonEndIndex + 1).join('\n');
            fs.writeFileSync(templatePath, jsonContent);
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            console.error('❌ Failed to generate CDK template:', err.message);
            return false;
        }
        // Load CDK template
        if (!fs.existsSync(templatePath)) {
            console.error('❌ CDK template not found');
            return false;
        }
        let template;
        try {
            const templateContent = fs.readFileSync(templatePath, 'utf8');
            template = JSON.parse(templateContent);
        }
        catch (error) {
            console.error('❌ Failed to parse CDK template as JSON:', error);
            return false;
        }
        const cdkTables = this.extractTablesFromTemplate(template);
        console.log(`📊 Found ${Object.keys(cdkTables).length} tables in CDK template`);
        // Validate each table
        let allValid = true;
        for (const tableName of this.expectedTables) {
            console.log(`\n🔍 Validating ${tableName}...`);
            const isValid = await this.validateTable(tableName, cdkTables[tableName]);
            if (!isValid) {
                allValid = false;
            }
        }
        // Cleanup
        if (fs.existsSync(templatePath)) {
            fs.unlinkSync(templatePath);
        }
        console.log('\n' + '─'.repeat(60));
        console.log(allValid ? '✅ All schemas match!' : '❌ Schema mismatches found!');
        return allValid;
    }
    extractTablesFromTemplate(template) {
        const tables = {};
        if (template.Resources) {
            for (const [resourceId, resource] of Object.entries(template.Resources)) {
                const res = resource;
                if (res.Type === 'AWS::DynamoDB::Table') {
                    const tableName = res.Properties.TableName;
                    if (tableName) {
                        tables[tableName] = res.Properties;
                    }
                }
            }
        }
        return tables;
    }
    async validateTable(tableName, cdkDefinition) {
        try {
            // Get live table description
            const command = new client_dynamodb_1.DescribeTableCommand({ TableName: tableName });
            const response = await this.dynamoClient.send(command);
            const liveTable = response.Table;
            if (!liveTable) {
                console.error(`❌ Table ${tableName} not found in AWS`);
                return false;
            }
            if (!cdkDefinition) {
                console.error(`❌ Table ${tableName} not found in CDK template`);
                return false;
            }
            // Validate key schema
            const keySchemaMatch = this.compareKeySchema(liveTable.KeySchema || [], cdkDefinition.KeySchema || []);
            // Validate attribute definitions
            const attributesMatch = this.compareAttributeDefinitions(liveTable.AttributeDefinitions || [], cdkDefinition.AttributeDefinitions || []);
            // Validate GSIs
            const gsiMatch = this.compareGlobalSecondaryIndexes(liveTable.GlobalSecondaryIndexes || [], cdkDefinition.GlobalSecondaryIndexes || []);
            // Validate billing mode
            const billingMatch = liveTable.BillingModeSummary?.BillingMode === cdkDefinition.BillingMode;
            const isValid = keySchemaMatch && attributesMatch && gsiMatch && billingMatch;
            if (isValid) {
                console.log(`✅ ${tableName} - Schema matches`);
            }
            else {
                console.log(`❌ ${tableName} - Schema mismatch:`);
                if (!keySchemaMatch)
                    console.log('  - Key schema mismatch');
                if (!attributesMatch)
                    console.log('  - Attribute definitions mismatch');
                if (!gsiMatch)
                    console.log('  - Global Secondary Indexes mismatch');
                if (!billingMatch)
                    console.log('  - Billing mode mismatch');
            }
            return isValid;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            console.error(`❌ Error validating ${tableName}:`, err.message);
            return false;
        }
    }
    compareKeySchema(live, cdk) {
        if (live.length !== cdk.length)
            return false;
        const liveKeys = live.map(k => ({ name: k.AttributeName, type: k.KeyType }))
            .sort((a, b) => a.name.localeCompare(b.name));
        const cdkKeys = cdk.map(k => ({ name: k.AttributeName, type: k.KeyType }))
            .sort((a, b) => a.name.localeCompare(b.name));
        return JSON.stringify(liveKeys) === JSON.stringify(cdkKeys);
    }
    compareAttributeDefinitions(live, cdk) {
        if (live.length !== cdk.length)
            return false;
        const liveAttrs = live.map(a => ({ name: a.AttributeName, type: a.AttributeType }))
            .sort((a, b) => a.name.localeCompare(b.name));
        const cdkAttrs = cdk.map(a => ({ name: a.AttributeName, type: a.AttributeType }))
            .sort((a, b) => a.name.localeCompare(b.name));
        return JSON.stringify(liveAttrs) === JSON.stringify(cdkAttrs);
    }
    compareGlobalSecondaryIndexes(live, cdk) {
        if (live.length !== cdk.length)
            return false;
        // Compare index names and key schemas
        for (const liveIndex of live) {
            const cdkIndex = cdk.find(i => i.IndexName === liveIndex.IndexName);
            if (!cdkIndex)
                return false;
            const keySchemaMatch = this.compareKeySchema(liveIndex.KeySchema || [], cdkIndex.KeySchema || []);
            if (!keySchemaMatch)
                return false;
        }
        return true;
    }
}
exports.SchemaValidator = SchemaValidator;
// Run validation if called directly
if (require.main === module) {
    const validator = new SchemaValidator();
    validator.validateAll().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('❌ Schema validation failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsaWRhdGUtc2NoZW1hLW1hdGNoLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmFsaWRhdGUtc2NoZW1hLW1hdGNoLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQ0E7Ozs7R0FJRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsOERBQWdGO0FBQ2hGLGlEQUF5QztBQUN6Qyx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBYTdCLE1BQU0sZUFBZTtJQUFyQjtRQUNVLGlCQUFZLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUM7UUFFM0QsbUJBQWMsR0FBRztZQUN2QixtQkFBbUI7WUFDbkIsc0JBQXNCO1lBQ3RCLDBCQUEwQjtZQUMxQiw2QkFBNkI7WUFDN0IsbUJBQW1CO1lBQ25CLDBCQUEwQjtZQUMxQiwwQkFBMEI7WUFDMUIseUJBQXlCO1lBQ3pCLDhCQUE4QjtZQUM5QixpQ0FBaUM7WUFDakMseUJBQXlCO1lBQ3pCLHNCQUFzQjtTQUN2QixDQUFDO0lBMk1KLENBQUM7SUF6TUMsS0FBSyxDQUFDLFdBQVc7UUFDZixPQUFPLENBQUMsR0FBRyxDQUFDLDhCQUE4QixDQUFDLENBQUM7UUFDNUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnREFBZ0QsQ0FBQyxDQUFDO1FBQzlELE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTVCLG1DQUFtQztRQUNuQyxPQUFPLENBQUMsR0FBRyxDQUFDLDBDQUEwQyxDQUFDLENBQUM7UUFDeEQsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztRQUVuRSxJQUFJLENBQUM7WUFDSCwwREFBMEQ7WUFDMUQsTUFBTSxXQUFXLEdBQUcsSUFBQSx3QkFBUSxFQUFDLDZHQUE2RyxFQUFFO2dC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SyxDQUFDO1FBQ3BDLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7Q0FDRjtBQWFRLDBDQUFlO0FBWHhCLG9DQUFvQztBQUNwQyxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssTUFBTSxFQUFFLENBQUM7SUFDNUIsTUFBTSxTQUFTLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztJQUN4QyxTQUFTLENBQUMsV0FBVyxFQUFFLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ3JDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBRTtRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsNkJBQTZCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDcEQsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNsQixDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXHJcbi8qKlxyXG4gKiBTY2hlbWEgVmFsaWRhdGlvbiBTY3JpcHRcclxuICogQ29tcGFyZXMgQ0RLLWdlbmVyYXRlZCBDbG91ZEZvcm1hdGlvbiB0ZW1wbGF0ZSBhZ2FpbnN0IGxpdmUgRHluYW1vREIgdGFibGVzXHJcbiAqIEVuc3VyZXMgcGVyZmVjdCBtYXRjaCBiZWZvcmUgQ0RLIGltcG9ydCBvcGVyYXRpb25cclxuICovXHJcblxyXG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCwgRGVzY3JpYmVUYWJsZUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xyXG5pbXBvcnQgeyBleGVjU3luYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xyXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XHJcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XHJcblxyXG5pbnRlcmZhY2UgVGFibGVTY2hlbWEge1xyXG4gIHRhYmxlTmFtZTogc3RyaW5nO1xyXG4gIGtleVNjaGVtYTogYW55W107XHJcbiAgYXR0cmlidXRlRGVmaW5pdGlvbnM6IGFueVtdO1xyXG4gIGdsb2JhbFNlY29uZGFyeUluZGV4ZXM/OiBhbnlbXTtcclxuICBsb2NhbFNlY29uZGFyeUluZGV4ZXM/OiBhbnlbXTtcclxuICBiaWxsaW5nTW9kZTogc3RyaW5nO1xyXG4gIHN0cmVhbVNwZWNpZmljYXRpb24/OiBhbnk7XHJcbiAgdGltZVRvTGl2ZURlc2NyaXB0aW9uPzogYW55O1xyXG59XHJcblxyXG5jbGFzcyBTY2hlbWFWYWxpZGF0b3Ige1xyXG4gIHByaXZhdGUgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHsgcmVnaW9uOiAnZXUtd2VzdC0xJyB9KTtcclxuICBcclxuICBwcml2YXRlIGV4cGVjdGVkVGFibGVzID0gW1xyXG4gICAgJ3RyaW5pdHktdXNlcnMtZGV2JyxcclxuICAgICd0cmluaXR5LXJvb21zLWRldi12MicsXHJcbiAgICAndHJpbml0eS1yb29tLW1lbWJlcnMtZGV2JyxcclxuICAgICd0cmluaXR5LXJvb20taW52aXRlcy1kZXYtdjInLFxyXG4gICAgJ3RyaW5pdHktdm90ZXMtZGV2JyxcclxuICAgICd0cmluaXR5LW1vdmllcy1jYWNoZS1kZXYnLFxyXG4gICAgJ3RyaW5pdHktcm9vbS1tYXRjaGVzLWRldicsXHJcbiAgICAndHJpbml0eS1jb25uZWN0aW9ucy1kZXYnLFxyXG4gICAgJ3RyaW5pdHktcm9vbS1tb3ZpZS1jYWNoZS1kZXYnLFxyXG4gICAgJ3RyaW5pdHktcm9vbS1jYWNoZS1tZXRhZGF0YS1kZXYnLFxyXG4gICAgJ3RyaW5pdHktbWF0Y2htYWtpbmctZGV2JyxcclxuICAgICd0cmluaXR5LWZpbHRlci1jYWNoZScsXHJcbiAgXTtcclxuXHJcbiAgYXN5bmMgdmFsaWRhdGVBbGwoKTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgICBjb25zb2xlLmxvZygn8J+UjSBUcmluaXR5IFNjaGVtYSBWYWxpZGF0aW9uJyk7XHJcbiAgICBjb25zb2xlLmxvZygnQ29tcGFyaW5nIENESyBkZWZpbml0aW9ucyB3aXRoIGxpdmUgQVdTIHRhYmxlcycpO1xyXG4gICAgY29uc29sZS5sb2coJ+KUgCcucmVwZWF0KDYwKSk7XHJcblxyXG4gICAgLy8gR2VuZXJhdGUgQ2xvdWRGb3JtYXRpb24gdGVtcGxhdGVcclxuICAgIGNvbnNvbGUubG9nKCfwn5OLIEdlbmVyYXRpbmcgQ2xvdWRGb3JtYXRpb24gdGVtcGxhdGUuLi4nKTtcclxuICAgIGNvbnN0IHRlbXBsYXRlUGF0aCA9IHBhdGguam9pbihwcm9jZXNzLmN3ZCgpLCAnY2RrLXRlbXBsYXRlLmpzb24nKTtcclxuICAgIFxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gVXNlIHN0ZGVyciByZWRpcmVjdGlvbiB0byBhdm9pZCB3YXJuaW5ncyBpbiBKU09OIG91dHB1dFxyXG4gICAgICBjb25zdCBzeW50aE91dHB1dCA9IGV4ZWNTeW5jKCducG0gcnVuIGJ1aWxkICYmIGNkayBzeW50aCBUcmluaXR5RGF0YWJhc2VTdGFjayAtLWpzb24gMj4vZGV2L251bGwgfHwgY2RrIHN5bnRoIFRyaW5pdHlEYXRhYmFzZVN0YWNrIC0tanNvbicsIHsgXHJcbiAgICAgICAgY3dkOiBwcm9jZXNzLmN3ZCgpLFxyXG4gICAgICAgIGVuY29kaW5nOiAndXRmOCcsXHJcbiAgICAgICAgc3RkaW86ICdwaXBlJyBcclxuICAgICAgfSk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBFeHRyYWN0IEpTT04gZnJvbSBvdXRwdXQgKHNraXAgd2FybmluZ3MgYW5kIG5vdGljZXMpXHJcbiAgICAgIGNvbnN0IGxpbmVzID0gc3ludGhPdXRwdXQuc3BsaXQoJ1xcbicpO1xyXG4gICAgICBjb25zdCBqc29uU3RhcnRJbmRleCA9IGxpbmVzLmZpbmRJbmRleChsaW5lID0+IGxpbmUudHJpbSgpLnN0YXJ0c1dpdGgoJ3snKSk7XHJcbiAgICAgIFxyXG4gICAgICAvLyBGaW5kIGxhc3QgY2xvc2luZyBicmFjZSAodXNlIHJldmVyc2UgaXRlcmF0aW9uIGluc3RlYWQgb2YgZmluZExhc3RJbmRleClcclxuICAgICAgbGV0IGpzb25FbmRJbmRleCA9IC0xO1xyXG4gICAgICBmb3IgKGxldCBpID0gbGluZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICBpZiAobGluZXNbaV0udHJpbSgpLmVuZHNXaXRoKCd9JykpIHtcclxuICAgICAgICAgIGpzb25FbmRJbmRleCA9IGk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIGlmIChqc29uU3RhcnRJbmRleCA9PT0gLTEgfHwganNvbkVuZEluZGV4ID09PSAtMSkge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBDb3VsZCBub3QgZmluZCBKU09OIGluIENESyBvdXRwdXQnKTtcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIGNvbnN0IGpzb25Db250ZW50ID0gbGluZXMuc2xpY2UoanNvblN0YXJ0SW5kZXgsIGpzb25FbmRJbmRleCArIDEpLmpvaW4oJ1xcbicpO1xyXG4gICAgICBmcy53cml0ZUZpbGVTeW5jKHRlbXBsYXRlUGF0aCwganNvbkNvbnRlbnQpO1xyXG4gICAgICBcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnN0IGVyciA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvciA6IG5ldyBFcnJvcihTdHJpbmcoZXJyb3IpKTtcclxuICAgICAgY29uc29sZS5lcnJvcign4p2MIEZhaWxlZCB0byBnZW5lcmF0ZSBDREsgdGVtcGxhdGU6JywgZXJyLm1lc3NhZ2UpO1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gTG9hZCBDREsgdGVtcGxhdGVcclxuICAgIGlmICghZnMuZXhpc3RzU3luYyh0ZW1wbGF0ZVBhdGgpKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBDREsgdGVtcGxhdGUgbm90IGZvdW5kJyk7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgdGVtcGxhdGU7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCB0ZW1wbGF0ZUNvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmModGVtcGxhdGVQYXRoLCAndXRmOCcpO1xyXG4gICAgICB0ZW1wbGF0ZSA9IEpTT04ucGFyc2UodGVtcGxhdGVDb250ZW50KTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBGYWlsZWQgdG8gcGFyc2UgQ0RLIHRlbXBsYXRlIGFzIEpTT046JywgZXJyb3IpO1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbiAgICBjb25zdCBjZGtUYWJsZXMgPSB0aGlzLmV4dHJhY3RUYWJsZXNGcm9tVGVtcGxhdGUodGVtcGxhdGUpO1xyXG5cclxuICAgIGNvbnNvbGUubG9nKGDwn5OKIEZvdW5kICR7T2JqZWN0LmtleXMoY2RrVGFibGVzKS5sZW5ndGh9IHRhYmxlcyBpbiBDREsgdGVtcGxhdGVgKTtcclxuXHJcbiAgICAvLyBWYWxpZGF0ZSBlYWNoIHRhYmxlXHJcbiAgICBsZXQgYWxsVmFsaWQgPSB0cnVlO1xyXG4gICAgZm9yIChjb25zdCB0YWJsZU5hbWUgb2YgdGhpcy5leHBlY3RlZFRhYmxlcykge1xyXG4gICAgICBjb25zb2xlLmxvZyhgXFxu8J+UjSBWYWxpZGF0aW5nICR7dGFibGVOYW1lfS4uLmApO1xyXG4gICAgICBcclxuICAgICAgY29uc3QgaXNWYWxpZCA9IGF3YWl0IHRoaXMudmFsaWRhdGVUYWJsZSh0YWJsZU5hbWUsIGNka1RhYmxlc1t0YWJsZU5hbWVdKTtcclxuICAgICAgaWYgKCFpc1ZhbGlkKSB7XHJcbiAgICAgICAgYWxsVmFsaWQgPSBmYWxzZTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIENsZWFudXBcclxuICAgIGlmIChmcy5leGlzdHNTeW5jKHRlbXBsYXRlUGF0aCkpIHtcclxuICAgICAgZnMudW5saW5rU3luYyh0ZW1wbGF0ZVBhdGgpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnNvbGUubG9nKCdcXG4nICsgJ+KUgCcucmVwZWF0KDYwKSk7XHJcbiAgICBjb25zb2xlLmxvZyhhbGxWYWxpZCA/ICfinIUgQWxsIHNjaGVtYXMgbWF0Y2ghJyA6ICfinYwgU2NoZW1hIG1pc21hdGNoZXMgZm91bmQhJyk7XHJcbiAgICBcclxuICAgIHJldHVybiBhbGxWYWxpZDtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgZXh0cmFjdFRhYmxlc0Zyb21UZW1wbGF0ZSh0ZW1wbGF0ZTogYW55KTogeyBba2V5OiBzdHJpbmddOiBhbnkgfSB7XHJcbiAgICBjb25zdCB0YWJsZXM6IHsgW2tleTogc3RyaW5nXTogYW55IH0gPSB7fTtcclxuICAgIFxyXG4gICAgaWYgKHRlbXBsYXRlLlJlc291cmNlcykge1xyXG4gICAgICBmb3IgKGNvbnN0IFtyZXNvdXJjZUlkLCByZXNvdXJjZV0gb2YgT2JqZWN0LmVudHJpZXModGVtcGxhdGUuUmVzb3VyY2VzIGFzIGFueSkpIHtcclxuICAgICAgICBjb25zdCByZXMgPSByZXNvdXJjZSBhcyBhbnk7XHJcbiAgICAgICAgaWYgKHJlcy5UeXBlID09PSAnQVdTOjpEeW5hbW9EQjo6VGFibGUnKSB7XHJcbiAgICAgICAgICBjb25zdCB0YWJsZU5hbWUgPSByZXMuUHJvcGVydGllcy5UYWJsZU5hbWU7XHJcbiAgICAgICAgICBpZiAodGFibGVOYW1lKSB7XHJcbiAgICAgICAgICAgIHRhYmxlc1t0YWJsZU5hbWVdID0gcmVzLlByb3BlcnRpZXM7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiB0YWJsZXM7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzeW5jIHZhbGlkYXRlVGFibGUodGFibGVOYW1lOiBzdHJpbmcsIGNka0RlZmluaXRpb246IGFueSk6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gR2V0IGxpdmUgdGFibGUgZGVzY3JpcHRpb25cclxuICAgICAgY29uc3QgY29tbWFuZCA9IG5ldyBEZXNjcmliZVRhYmxlQ29tbWFuZCh7IFRhYmxlTmFtZTogdGFibGVOYW1lIH0pO1xyXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZHluYW1vQ2xpZW50LnNlbmQoY29tbWFuZCk7XHJcbiAgICAgIGNvbnN0IGxpdmVUYWJsZSA9IHJlc3BvbnNlLlRhYmxlO1xyXG5cclxuICAgICAgaWYgKCFsaXZlVGFibGUpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgVGFibGUgJHt0YWJsZU5hbWV9IG5vdCBmb3VuZCBpbiBBV1NgKTtcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmICghY2RrRGVmaW5pdGlvbikge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBUYWJsZSAke3RhYmxlTmFtZX0gbm90IGZvdW5kIGluIENESyB0ZW1wbGF0ZWApO1xyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gVmFsaWRhdGUga2V5IHNjaGVtYVxyXG4gICAgICBjb25zdCBrZXlTY2hlbWFNYXRjaCA9IHRoaXMuY29tcGFyZUtleVNjaGVtYShcclxuICAgICAgICBsaXZlVGFibGUuS2V5U2NoZW1hIHx8IFtdLFxyXG4gICAgICAgIGNka0RlZmluaXRpb24uS2V5U2NoZW1hIHx8IFtdXHJcbiAgICAgICk7XHJcblxyXG4gICAgICAvLyBWYWxpZGF0ZSBhdHRyaWJ1dGUgZGVmaW5pdGlvbnNcclxuICAgICAgY29uc3QgYXR0cmlidXRlc01hdGNoID0gdGhpcy5jb21wYXJlQXR0cmlidXRlRGVmaW5pdGlvbnMoXHJcbiAgICAgICAgbGl2ZVRhYmxlLkF0dHJpYnV0ZURlZmluaXRpb25zIHx8IFtdLFxyXG4gICAgICAgIGNka0RlZmluaXRpb24uQXR0cmlidXRlRGVmaW5pdGlvbnMgfHwgW11cclxuICAgICAgKTtcclxuXHJcbiAgICAgIC8vIFZhbGlkYXRlIEdTSXNcclxuICAgICAgY29uc3QgZ3NpTWF0Y2ggPSB0aGlzLmNvbXBhcmVHbG9iYWxTZWNvbmRhcnlJbmRleGVzKFxyXG4gICAgICAgIGxpdmVUYWJsZS5HbG9iYWxTZWNvbmRhcnlJbmRleGVzIHx8IFtdLFxyXG4gICAgICAgIGNka0RlZmluaXRpb24uR2xvYmFsU2Vjb25kYXJ5SW5kZXhlcyB8fCBbXVxyXG4gICAgICApO1xyXG5cclxuICAgICAgLy8gVmFsaWRhdGUgYmlsbGluZyBtb2RlXHJcbiAgICAgIGNvbnN0IGJpbGxpbmdNYXRjaCA9IGxpdmVUYWJsZS5CaWxsaW5nTW9kZVN1bW1hcnk/LkJpbGxpbmdNb2RlID09PSBjZGtEZWZpbml0aW9uLkJpbGxpbmdNb2RlO1xyXG5cclxuICAgICAgY29uc3QgaXNWYWxpZCA9IGtleVNjaGVtYU1hdGNoICYmIGF0dHJpYnV0ZXNNYXRjaCAmJiBnc2lNYXRjaCAmJiBiaWxsaW5nTWF0Y2g7XHJcblxyXG4gICAgICBpZiAoaXNWYWxpZCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGDinIUgJHt0YWJsZU5hbWV9IC0gU2NoZW1hIG1hdGNoZXNgKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhg4p2MICR7dGFibGVOYW1lfSAtIFNjaGVtYSBtaXNtYXRjaDpgKTtcclxuICAgICAgICBpZiAoIWtleVNjaGVtYU1hdGNoKSBjb25zb2xlLmxvZygnICAtIEtleSBzY2hlbWEgbWlzbWF0Y2gnKTtcclxuICAgICAgICBpZiAoIWF0dHJpYnV0ZXNNYXRjaCkgY29uc29sZS5sb2coJyAgLSBBdHRyaWJ1dGUgZGVmaW5pdGlvbnMgbWlzbWF0Y2gnKTtcclxuICAgICAgICBpZiAoIWdzaU1hdGNoKSBjb25zb2xlLmxvZygnICAtIEdsb2JhbCBTZWNvbmRhcnkgSW5kZXhlcyBtaXNtYXRjaCcpO1xyXG4gICAgICAgIGlmICghYmlsbGluZ01hdGNoKSBjb25zb2xlLmxvZygnICAtIEJpbGxpbmcgbW9kZSBtaXNtYXRjaCcpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4gaXNWYWxpZDtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zdCBlcnIgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IgOiBuZXcgRXJyb3IoU3RyaW5nKGVycm9yKSk7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciB2YWxpZGF0aW5nICR7dGFibGVOYW1lfTpgLCBlcnIubWVzc2FnZSk7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgY29tcGFyZUtleVNjaGVtYShsaXZlOiBhbnlbXSwgY2RrOiBhbnlbXSk6IGJvb2xlYW4ge1xyXG4gICAgaWYgKGxpdmUubGVuZ3RoICE9PSBjZGsubGVuZ3RoKSByZXR1cm4gZmFsc2U7XHJcbiAgICBcclxuICAgIGNvbnN0IGxpdmVLZXlzID0gbGl2ZS5tYXAoayA9PiAoeyBuYW1lOiBrLkF0dHJpYnV0ZU5hbWUsIHR5cGU6IGsuS2V5VHlwZSB9KSlcclxuICAgICAgLnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSkpO1xyXG4gICAgY29uc3QgY2RrS2V5cyA9IGNkay5tYXAoayA9PiAoeyBuYW1lOiBrLkF0dHJpYnV0ZU5hbWUsIHR5cGU6IGsuS2V5VHlwZSB9KSlcclxuICAgICAgLnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSkpO1xyXG4gICAgXHJcbiAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkobGl2ZUtleXMpID09PSBKU09OLnN0cmluZ2lmeShjZGtLZXlzKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgY29tcGFyZUF0dHJpYnV0ZURlZmluaXRpb25zKGxpdmU6IGFueVtdLCBjZGs6IGFueVtdKTogYm9vbGVhbiB7XHJcbiAgICBpZiAobGl2ZS5sZW5ndGggIT09IGNkay5sZW5ndGgpIHJldHVybiBmYWxzZTtcclxuICAgIFxyXG4gICAgY29uc3QgbGl2ZUF0dHJzID0gbGl2ZS5tYXAoYSA9PiAoeyBuYW1lOiBhLkF0dHJpYnV0ZU5hbWUsIHR5cGU6IGEuQXR0cmlidXRlVHlwZSB9KSlcclxuICAgICAgLnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSkpO1xyXG4gICAgY29uc3QgY2RrQXR0cnMgPSBjZGsubWFwKGEgPT4gKHsgbmFtZTogYS5BdHRyaWJ1dGVOYW1lLCB0eXBlOiBhLkF0dHJpYnV0ZVR5cGUgfSkpXHJcbiAgICAgIC5zb3J0KChhLCBiKSA9PiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUpKTtcclxuICAgIFxyXG4gICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGxpdmVBdHRycykgPT09IEpTT04uc3RyaW5naWZ5KGNka0F0dHJzKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgY29tcGFyZUdsb2JhbFNlY29uZGFyeUluZGV4ZXMobGl2ZTogYW55W10sIGNkazogYW55W10pOiBib29sZWFuIHtcclxuICAgIGlmIChsaXZlLmxlbmd0aCAhPT0gY2RrLmxlbmd0aCkgcmV0dXJuIGZhbHNlO1xyXG4gICAgXHJcbiAgICAvLyBDb21wYXJlIGluZGV4IG5hbWVzIGFuZCBrZXkgc2NoZW1hc1xyXG4gICAgZm9yIChjb25zdCBsaXZlSW5kZXggb2YgbGl2ZSkge1xyXG4gICAgICBjb25zdCBjZGtJbmRleCA9IGNkay5maW5kKGkgPT4gaS5JbmRleE5hbWUgPT09IGxpdmVJbmRleC5JbmRleE5hbWUpO1xyXG4gICAgICBpZiAoIWNka0luZGV4KSByZXR1cm4gZmFsc2U7XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCBrZXlTY2hlbWFNYXRjaCA9IHRoaXMuY29tcGFyZUtleVNjaGVtYShcclxuICAgICAgICBsaXZlSW5kZXguS2V5U2NoZW1hIHx8IFtdLFxyXG4gICAgICAgIGNka0luZGV4LktleVNjaGVtYSB8fCBbXVxyXG4gICAgICApO1xyXG4gICAgICBcclxuICAgICAgaWYgKCFrZXlTY2hlbWFNYXRjaCkgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gdHJ1ZTtcclxuICB9XHJcbn1cclxuXHJcbi8vIFJ1biB2YWxpZGF0aW9uIGlmIGNhbGxlZCBkaXJlY3RseVxyXG5pZiAocmVxdWlyZS5tYWluID09PSBtb2R1bGUpIHtcclxuICBjb25zdCB2YWxpZGF0b3IgPSBuZXcgU2NoZW1hVmFsaWRhdG9yKCk7XHJcbiAgdmFsaWRhdG9yLnZhbGlkYXRlQWxsKCkudGhlbihzdWNjZXNzID0+IHtcclxuICAgIHByb2Nlc3MuZXhpdChzdWNjZXNzID8gMCA6IDEpO1xyXG4gIH0pLmNhdGNoKGVycm9yID0+IHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBTY2hlbWEgdmFsaWRhdGlvbiBmYWlsZWQ6JywgZXJyb3IpO1xyXG4gICAgcHJvY2Vzcy5leGl0KDEpO1xyXG4gIH0pO1xyXG59XHJcblxyXG5leHBvcnQgeyBTY2hlbWFWYWxpZGF0b3IgfTsiXX0=