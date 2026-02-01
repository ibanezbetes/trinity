#!/usr/bin/env ts-node
"use strict";
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
exports.DataIntegrityValidator = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
class DataIntegrityValidator {
    constructor() {
        this.region = 'eu-west-1';
        this.results = [];
    }
    async validateAll() {
        console.log('🔍 Validating Data Integrity...');
        console.log('📋 Ensuring all data is readable via new CDK-managed infrastructure');
        const tables = [
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
            'trinity-filter-cache'
        ];
        for (const table of tables) {
            await this.validateTable(table);
        }
        this.generateReport();
        return this.results;
    }
    async validateTable(tableName) {
        console.log(`\n📊 Validating table: ${tableName}`);
        try {
            // Get item count
            const countOutput = (0, child_process_1.execSync)(`aws dynamodb scan --table-name ${tableName} --select COUNT --region ${this.region} --query "Count" --output text`, { encoding: 'utf8' });
            const itemCount = parseInt(countOutput.trim());
            // Get sample data (first 3 items)
            const sampleOutput = (0, child_process_1.execSync)(`aws dynamodb scan --table-name ${tableName} --limit 3 --region ${this.region} --output json`, { encoding: 'utf8' });
            const sampleData = JSON.parse(sampleOutput);
            this.results.push({
                table: tableName,
                status: 'PASS',
                itemCount,
                sampleData: sampleData.Items || []
            });
            console.log(`   ✅ ${itemCount} items accessible`);
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.results.push({
                table: tableName,
                status: 'FAIL',
                itemCount: 0,
                sampleData: null,
                errors: [err.message]
            });
            console.log(`   ❌ Failed to access table: ${err.message}`);
        }
    }
    generateReport() {
        const reportPath = 'data-integrity-report.json';
        const summary = {
            timestamp: new Date().toISOString(),
            totalTables: this.results.length,
            accessibleTables: this.results.filter(r => r.status === 'PASS').length,
            failedTables: this.results.filter(r => r.status === 'FAIL').length,
            totalItems: this.results.reduce((sum, r) => sum + r.itemCount, 0),
            overallStatus: this.results.every(r => r.status === 'PASS') ? 'PASS' : 'FAIL'
        };
        const report = {
            summary,
            details: this.results
        };
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log('\n📊 Data Integrity Summary:');
        console.log(`   Total Tables: ${summary.totalTables}`);
        console.log(`   Accessible: ${summary.accessibleTables}`);
        console.log(`   Failed: ${summary.failedTables}`);
        console.log(`   Total Items: ${summary.totalItems}`);
        console.log(`   Overall Status: ${summary.overallStatus}`);
        console.log(`   Report saved to: ${reportPath}`);
        if (summary.overallStatus === 'PASS') {
            console.log('\n🎉 All data is accessible via CDK-managed infrastructure!');
            console.log('✅ Data integrity validation - PASSED');
        }
        else {
            console.log('\n⚠️ Some tables failed data integrity validation');
            console.log('❌ Data integrity validation - FAILED');
            const failedTables = this.results.filter(r => r.status === 'FAIL');
            failedTables.forEach(table => {
                console.log(`   ❌ ${table.table}: ${table.errors?.join(', ')}`);
            });
        }
    }
}
exports.DataIntegrityValidator = DataIntegrityValidator;
// Execute if run directly
if (require.main === module) {
    const validator = new DataIntegrityValidator();
    validator.validateAll().then(results => {
        const overallStatus = results.every(r => r.status === 'PASS');
        process.exit(overallStatus ? 0 : 1);
    }).catch(error => {
        console.error('💥 Validation failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFsaWRhdGUtZGF0YS1pbnRlZ3JpdHkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2YWxpZGF0ZS1kYXRhLWludGVncml0eS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUEsaURBQXlDO0FBQ3pDLHVDQUF5QjtBQVV6QixNQUFNLHNCQUFzQjtJQUE1QjtRQUNtQixXQUFNLEdBQUcsV0FBVyxDQUFDO1FBQzlCLFlBQU8sR0FBMkIsRUFBRSxDQUFDO0lBaUgvQyxDQUFDO0lBL0dDLEtBQUssQ0FBQyxXQUFXO1FBQ2YsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO1FBQy9DLE9BQU8sQ0FBQyxHQUFHLENBQUMscUVBQXFFLENBQUMsQ0FBQztRQUVuRixNQUFNLE1BQU0sR0FBRztZQUNiLG1CQUFtQjtZQUNuQixzQkFBc0I7WUFDdEIsMEJBQTBCO1lBQzFCLDZCQUE2QjtZQUM3QixtQkFBbUI7WUFDbkIsMEJBQTBCO1lBQzFCLDBCQUEwQjtZQUMxQix5QkFBeUI7WUFDekIsOEJBQThCO1lBQzlCLGlDQUFpQztZQUNqQyx5QkFBeUI7WUFDekIsc0JBQXNCO1NBQ3ZCLENBQUM7UUFFRixLQUFLLE1BQU0sS0FBSyxJQUFJLE1BQU0sRUFBRSxDQUFDO1lBQzNCLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNsQyxDQUFDO1FBRUQsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ3RCLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQztJQUN0QixDQUFDO0lBRU8sS0FBSyxDQUFDLGFBQWEsQ0FBQyxTQUFpQjtRQUMzQyxPQUFPLENBQUMsR0FBRyxDQUFDLDBCQUEwQixTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBRW5ELElBQUksQ0FBQztZQUNILGlCQUFpQjtZQUNqQixNQUFNLFdBQVcsR0FBRyxJQUFBLHdCQUFRLEVBQzFCLGtDQUFrQyxT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L0IsMEJBQTBCO0FBQzFCLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQztJQUM1QixNQUFNLFNBQVMsR0FBRyxJQUFJLHNCQUFzQixFQUFFLENBQUM7SUFDL0MsU0FBUyxDQUFDLFdBQVcsRUFBRSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRTtRQUNyQyxNQUFNLGFBQWEsR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sS0FBSyxNQUFNLENBQUMsQ0FBQztRQUM5RCxPQUFPLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN0QyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEVBQUU7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLHVCQUF1QixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzlDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbEIsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgdHMtbm9kZVxyXG5cclxuaW1wb3J0IHsgZXhlY1N5bmMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcclxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xyXG5cclxuaW50ZXJmYWNlIERhdGFWYWxpZGF0aW9uUmVzdWx0IHtcclxuICB0YWJsZTogc3RyaW5nO1xyXG4gIHN0YXR1czogJ1BBU1MnIHwgJ0ZBSUwnO1xyXG4gIGl0ZW1Db3VudDogbnVtYmVyO1xyXG4gIHNhbXBsZURhdGE6IGFueTtcclxuICBlcnJvcnM/OiBzdHJpbmdbXTtcclxufVxyXG5cclxuY2xhc3MgRGF0YUludGVncml0eVZhbGlkYXRvciB7XHJcbiAgcHJpdmF0ZSByZWFkb25seSByZWdpb24gPSAnZXUtd2VzdC0xJztcclxuICBwcml2YXRlIHJlc3VsdHM6IERhdGFWYWxpZGF0aW9uUmVzdWx0W10gPSBbXTtcclxuXHJcbiAgYXN5bmMgdmFsaWRhdGVBbGwoKTogUHJvbWlzZTxEYXRhVmFsaWRhdGlvblJlc3VsdFtdPiB7XHJcbiAgICBjb25zb2xlLmxvZygn8J+UjSBWYWxpZGF0aW5nIERhdGEgSW50ZWdyaXR5Li4uJyk7XHJcbiAgICBjb25zb2xlLmxvZygn8J+TiyBFbnN1cmluZyBhbGwgZGF0YSBpcyByZWFkYWJsZSB2aWEgbmV3IENESy1tYW5hZ2VkIGluZnJhc3RydWN0dXJlJyk7XHJcbiAgICBcclxuICAgIGNvbnN0IHRhYmxlcyA9IFtcclxuICAgICAgJ3RyaW5pdHktdXNlcnMtZGV2JyxcclxuICAgICAgJ3RyaW5pdHktcm9vbXMtZGV2LXYyJywgXHJcbiAgICAgICd0cmluaXR5LXJvb20tbWVtYmVycy1kZXYnLFxyXG4gICAgICAndHJpbml0eS1yb29tLWludml0ZXMtZGV2LXYyJyxcclxuICAgICAgJ3RyaW5pdHktdm90ZXMtZGV2JyxcclxuICAgICAgJ3RyaW5pdHktbW92aWVzLWNhY2hlLWRldicsXHJcbiAgICAgICd0cmluaXR5LXJvb20tbWF0Y2hlcy1kZXYnLFxyXG4gICAgICAndHJpbml0eS1jb25uZWN0aW9ucy1kZXYnLFxyXG4gICAgICAndHJpbml0eS1yb29tLW1vdmllLWNhY2hlLWRldicsXHJcbiAgICAgICd0cmluaXR5LXJvb20tY2FjaGUtbWV0YWRhdGEtZGV2JyxcclxuICAgICAgJ3RyaW5pdHktbWF0Y2htYWtpbmctZGV2JyxcclxuICAgICAgJ3RyaW5pdHktZmlsdGVyLWNhY2hlJ1xyXG4gICAgXTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IHRhYmxlIG9mIHRhYmxlcykge1xyXG4gICAgICBhd2FpdCB0aGlzLnZhbGlkYXRlVGFibGUodGFibGUpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB0aGlzLmdlbmVyYXRlUmVwb3J0KCk7XHJcbiAgICByZXR1cm4gdGhpcy5yZXN1bHRzO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyB2YWxpZGF0ZVRhYmxlKHRhYmxlTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zb2xlLmxvZyhgXFxu8J+TiiBWYWxpZGF0aW5nIHRhYmxlOiAke3RhYmxlTmFtZX1gKTtcclxuICAgIFxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gR2V0IGl0ZW0gY291bnRcclxuICAgICAgY29uc3QgY291bnRPdXRwdXQgPSBleGVjU3luYyhcclxuICAgICAgICBgYXdzIGR5bmFtb2RiIHNjYW4gLS10YWJsZS1uYW1lICR7dGFibGVOYW1lfSAtLXNlbGVjdCBDT1VOVCAtLXJlZ2lvbiAke3RoaXMucmVnaW9ufSAtLXF1ZXJ5IFwiQ291bnRcIiAtLW91dHB1dCB0ZXh0YCxcclxuICAgICAgICB7IGVuY29kaW5nOiAndXRmOCcgfVxyXG4gICAgICApO1xyXG4gICAgICBcclxuICAgICAgY29uc3QgaXRlbUNvdW50ID0gcGFyc2VJbnQoY291bnRPdXRwdXQudHJpbSgpKTtcclxuICAgICAgXHJcbiAgICAgIC8vIEdldCBzYW1wbGUgZGF0YSAoZmlyc3QgMyBpdGVtcylcclxuICAgICAgY29uc3Qgc2FtcGxlT3V0cHV0ID0gZXhlY1N5bmMoXHJcbiAgICAgICAgYGF3cyBkeW5hbW9kYiBzY2FuIC0tdGFibGUtbmFtZSAke3RhYmxlTmFtZX0gLS1saW1pdCAzIC0tcmVnaW9uICR7dGhpcy5yZWdpb259IC0tb3V0cHV0IGpzb25gLFxyXG4gICAgICAgIHsgZW5jb2Rpbmc6ICd1dGY4JyB9XHJcbiAgICAgICk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCBzYW1wbGVEYXRhID0gSlNPTi5wYXJzZShzYW1wbGVPdXRwdXQpO1xyXG4gICAgICBcclxuICAgICAgdGhpcy5yZXN1bHRzLnB1c2goe1xyXG4gICAgICAgIHRhYmxlOiB0YWJsZU5hbWUsXHJcbiAgICAgICAgc3RhdHVzOiAnUEFTUycsXHJcbiAgICAgICAgaXRlbUNvdW50LFxyXG4gICAgICAgIHNhbXBsZURhdGE6IHNhbXBsZURhdGEuSXRlbXMgfHwgW11cclxuICAgICAgfSk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zb2xlLmxvZyhgICAg4pyFICR7aXRlbUNvdW50fSBpdGVtcyBhY2Nlc3NpYmxlYCk7XHJcbiAgICAgIFxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc3QgZXJyID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpO1xyXG4gICAgICBcclxuICAgICAgdGhpcy5yZXN1bHRzLnB1c2goe1xyXG4gICAgICAgIHRhYmxlOiB0YWJsZU5hbWUsXHJcbiAgICAgICAgc3RhdHVzOiAnRkFJTCcsXHJcbiAgICAgICAgaXRlbUNvdW50OiAwLFxyXG4gICAgICAgIHNhbXBsZURhdGE6IG51bGwsXHJcbiAgICAgICAgZXJyb3JzOiBbZXJyLm1lc3NhZ2VdXHJcbiAgICAgIH0pO1xyXG4gICAgICBcclxuICAgICAgY29uc29sZS5sb2coYCAgIOKdjCBGYWlsZWQgdG8gYWNjZXNzIHRhYmxlOiAke2Vyci5tZXNzYWdlfWApO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBnZW5lcmF0ZVJlcG9ydCgpOiB2b2lkIHtcclxuICAgIGNvbnN0IHJlcG9ydFBhdGggPSAnZGF0YS1pbnRlZ3JpdHktcmVwb3J0Lmpzb24nO1xyXG4gICAgXHJcbiAgICBjb25zdCBzdW1tYXJ5ID0ge1xyXG4gICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgdG90YWxUYWJsZXM6IHRoaXMucmVzdWx0cy5sZW5ndGgsXHJcbiAgICAgIGFjY2Vzc2libGVUYWJsZXM6IHRoaXMucmVzdWx0cy5maWx0ZXIociA9PiByLnN0YXR1cyA9PT0gJ1BBU1MnKS5sZW5ndGgsXHJcbiAgICAgIGZhaWxlZFRhYmxlczogdGhpcy5yZXN1bHRzLmZpbHRlcihyID0+IHIuc3RhdHVzID09PSAnRkFJTCcpLmxlbmd0aCxcclxuICAgICAgdG90YWxJdGVtczogdGhpcy5yZXN1bHRzLnJlZHVjZSgoc3VtLCByKSA9PiBzdW0gKyByLml0ZW1Db3VudCwgMCksXHJcbiAgICAgIG92ZXJhbGxTdGF0dXM6IHRoaXMucmVzdWx0cy5ldmVyeShyID0+IHIuc3RhdHVzID09PSAnUEFTUycpID8gJ1BBU1MnIDogJ0ZBSUwnXHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBjb25zdCByZXBvcnQgPSB7XHJcbiAgICAgIHN1bW1hcnksXHJcbiAgICAgIGRldGFpbHM6IHRoaXMucmVzdWx0c1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgZnMud3JpdGVGaWxlU3luYyhyZXBvcnRQYXRoLCBKU09OLnN0cmluZ2lmeShyZXBvcnQsIG51bGwsIDIpKTtcclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coJ1xcbvCfk4ogRGF0YSBJbnRlZ3JpdHkgU3VtbWFyeTonKTtcclxuICAgIGNvbnNvbGUubG9nKGAgICBUb3RhbCBUYWJsZXM6ICR7c3VtbWFyeS50b3RhbFRhYmxlc31gKTtcclxuICAgIGNvbnNvbGUubG9nKGAgICBBY2Nlc3NpYmxlOiAke3N1bW1hcnkuYWNjZXNzaWJsZVRhYmxlc31gKTtcclxuICAgIGNvbnNvbGUubG9nKGAgICBGYWlsZWQ6ICR7c3VtbWFyeS5mYWlsZWRUYWJsZXN9YCk7XHJcbiAgICBjb25zb2xlLmxvZyhgICAgVG90YWwgSXRlbXM6ICR7c3VtbWFyeS50b3RhbEl0ZW1zfWApO1xyXG4gICAgY29uc29sZS5sb2coYCAgIE92ZXJhbGwgU3RhdHVzOiAke3N1bW1hcnkub3ZlcmFsbFN0YXR1c31gKTtcclxuICAgIGNvbnNvbGUubG9nKGAgICBSZXBvcnQgc2F2ZWQgdG86ICR7cmVwb3J0UGF0aH1gKTtcclxuICAgIFxyXG4gICAgaWYgKHN1bW1hcnkub3ZlcmFsbFN0YXR1cyA9PT0gJ1BBU1MnKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdcXG7wn46JIEFsbCBkYXRhIGlzIGFjY2Vzc2libGUgdmlhIENESy1tYW5hZ2VkIGluZnJhc3RydWN0dXJlIScpO1xyXG4gICAgICBjb25zb2xlLmxvZygn4pyFIERhdGEgaW50ZWdyaXR5IHZhbGlkYXRpb24gLSBQQVNTRUQnKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdcXG7imqDvuI8gU29tZSB0YWJsZXMgZmFpbGVkIGRhdGEgaW50ZWdyaXR5IHZhbGlkYXRpb24nKTtcclxuICAgICAgY29uc29sZS5sb2coJ+KdjCBEYXRhIGludGVncml0eSB2YWxpZGF0aW9uIC0gRkFJTEVEJyk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCBmYWlsZWRUYWJsZXMgPSB0aGlzLnJlc3VsdHMuZmlsdGVyKHIgPT4gci5zdGF0dXMgPT09ICdGQUlMJyk7XHJcbiAgICAgIGZhaWxlZFRhYmxlcy5mb3JFYWNoKHRhYmxlID0+IHtcclxuICAgICAgICBjb25zb2xlLmxvZyhgICAg4p2MICR7dGFibGUudGFibGV9OiAke3RhYmxlLmVycm9ycz8uam9pbignLCAnKX1gKTtcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG4vLyBFeGVjdXRlIGlmIHJ1biBkaXJlY3RseVxyXG5pZiAocmVxdWlyZS5tYWluID09PSBtb2R1bGUpIHtcclxuICBjb25zdCB2YWxpZGF0b3IgPSBuZXcgRGF0YUludGVncml0eVZhbGlkYXRvcigpO1xyXG4gIHZhbGlkYXRvci52YWxpZGF0ZUFsbCgpLnRoZW4ocmVzdWx0cyA9PiB7XHJcbiAgICBjb25zdCBvdmVyYWxsU3RhdHVzID0gcmVzdWx0cy5ldmVyeShyID0+IHIuc3RhdHVzID09PSAnUEFTUycpO1xyXG4gICAgcHJvY2Vzcy5leGl0KG92ZXJhbGxTdGF0dXMgPyAwIDogMSk7XHJcbiAgfSkuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgY29uc29sZS5lcnJvcign8J+SpSBWYWxpZGF0aW9uIGZhaWxlZDonLCBlcnJvcik7XHJcbiAgICBwcm9jZXNzLmV4aXQoMSk7XHJcbiAgfSk7XHJcbn1cclxuXHJcbmV4cG9ydCB7IERhdGFJbnRlZ3JpdHlWYWxpZGF0b3IgfTsiXX0=