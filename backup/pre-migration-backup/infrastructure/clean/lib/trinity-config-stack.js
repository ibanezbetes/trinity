"use strict";
/**
 * Trinity Configuration Stack
 * Manages AWS Systems Manager Parameter Store configuration
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
exports.TrinityConfigStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const parameter_store_1 = require("../config/parameter-store");
class TrinityConfigStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { config } = props;
        // Create Parameter Store configuration
        this.parameterStore = new parameter_store_1.TrinityParameterStore(this, 'ParameterStore', config);
        // Output parameter paths for reference
        new cdk.CfnOutput(this, 'ParameterStorePrefix', {
            description: 'Parameter Store prefix for this environment',
            value: `/trinity/${config.environment}`,
            exportName: `${this.stackName}:ParameterStorePrefix`,
        });
        new cdk.CfnOutput(this, 'TmdbApiKeyParameter', {
            description: 'TMDB API Key parameter path',
            value: this.parameterStore.parameters.tmdbApiKey.parameterName,
            exportName: `${this.stackName}:TmdbApiKeyParameter`,
        });
        new cdk.CfnOutput(this, 'TablesConfigParameter', {
            description: 'DynamoDB tables configuration parameter path',
            value: this.parameterStore.parameters.tableNames.parameterName,
            exportName: `${this.stackName}:TablesConfigParameter`,
        });
        // Add tags
        cdk.Tags.of(this).add('Project', 'Trinity');
        cdk.Tags.of(this).add('Environment', config.environment);
        cdk.Tags.of(this).add('Stack', 'Config');
    }
}
exports.TrinityConfigStack = TrinityConfigStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJpbml0eS1jb25maWctc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ0cmluaXR5LWNvbmZpZy1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztHQUdHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCxpREFBbUM7QUFFbkMsK0RBQWtFO0FBT2xFLE1BQWEsa0JBQW1CLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFHL0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUE4QjtRQUN0RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRXpCLHVDQUF1QztRQUN2QyxJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksdUNBQXFCLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBRWhGLHVDQUF1QztRQUN2QyxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHNCQUFzQixFQUFFO1lBQzlDLFdBQVcsRUFBRSw2Q0FBNkM7WUFDMUQsS0FBSyxFQUFFLFlBQVksTUFBTSxDQUFDLFdBQVcsRUFBRTtZQUN2QyxVQUFVLEVBQUUsR0FBRyxJQUFJLENBQUMsU0FBUyx1QkFBdUI7U0FDckQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxxQkFBcUIsRUFBRTtZQUM3QyxXQUFXLEVBQUUsNkJBQTZCO1lBQzFDLEtBQUssRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsYUFBYTtZQUM5RCxVQUFVLEVBQUUsR0FBRyxJQUFJLENBQUMsU0FBUyxzQkFBc0I7U0FDcEQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSx1QkFBdUIsRUFBRTtZQUMvQyxXQUFXLEVBQUUsOENBQThDO1lBQzNELEtBQUssRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsYUFBYTtZQUM5RCxVQUFVLEVBQUUsR0FBRyxJQUFJLENBQUMsU0FBUyx3QkFBd0I7U0FDdEQsQ0FBQyxDQUFDO1FBRUgsV0FBVztRQUNYLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDNUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDekQsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUMsQ0FBQztJQUMzQyxDQUFDO0NBQ0Y7QUFuQ0QsZ0RBbUNDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIFRyaW5pdHkgQ29uZmlndXJhdGlvbiBTdGFja1xyXG4gKiBNYW5hZ2VzIEFXUyBTeXN0ZW1zIE1hbmFnZXIgUGFyYW1ldGVyIFN0b3JlIGNvbmZpZ3VyYXRpb25cclxuICovXHJcblxyXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcclxuaW1wb3J0IHsgVHJpbml0eVBhcmFtZXRlclN0b3JlIH0gZnJvbSAnLi4vY29uZmlnL3BhcmFtZXRlci1zdG9yZSc7XHJcbmltcG9ydCB7IFRyaW5pdHlFbnZpcm9ubWVudENvbmZpZyB9IGZyb20gJy4uL2NvbmZpZy9lbnZpcm9ubWVudHMnO1xyXG5cclxuaW50ZXJmYWNlIFRyaW5pdHlDb25maWdTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xyXG4gIGNvbmZpZzogVHJpbml0eUVudmlyb25tZW50Q29uZmlnO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgVHJpbml0eUNvbmZpZ1N0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcclxuICBwdWJsaWMgcmVhZG9ubHkgcGFyYW1ldGVyU3RvcmU6IFRyaW5pdHlQYXJhbWV0ZXJTdG9yZTtcclxuICBcclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogVHJpbml0eUNvbmZpZ1N0YWNrUHJvcHMpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xyXG4gICAgXHJcbiAgICBjb25zdCB7IGNvbmZpZyB9ID0gcHJvcHM7XHJcbiAgICBcclxuICAgIC8vIENyZWF0ZSBQYXJhbWV0ZXIgU3RvcmUgY29uZmlndXJhdGlvblxyXG4gICAgdGhpcy5wYXJhbWV0ZXJTdG9yZSA9IG5ldyBUcmluaXR5UGFyYW1ldGVyU3RvcmUodGhpcywgJ1BhcmFtZXRlclN0b3JlJywgY29uZmlnKTtcclxuICAgIFxyXG4gICAgLy8gT3V0cHV0IHBhcmFtZXRlciBwYXRocyBmb3IgcmVmZXJlbmNlXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUGFyYW1ldGVyU3RvcmVQcmVmaXgnLCB7XHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnUGFyYW1ldGVyIFN0b3JlIHByZWZpeCBmb3IgdGhpcyBlbnZpcm9ubWVudCcsXHJcbiAgICAgIHZhbHVlOiBgL3RyaW5pdHkvJHtjb25maWcuZW52aXJvbm1lbnR9YCxcclxuICAgICAgZXhwb3J0TmFtZTogYCR7dGhpcy5zdGFja05hbWV9OlBhcmFtZXRlclN0b3JlUHJlZml4YCxcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVG1kYkFwaUtleVBhcmFtZXRlcicsIHtcclxuICAgICAgZGVzY3JpcHRpb246ICdUTURCIEFQSSBLZXkgcGFyYW1ldGVyIHBhdGgnLFxyXG4gICAgICB2YWx1ZTogdGhpcy5wYXJhbWV0ZXJTdG9yZS5wYXJhbWV0ZXJzLnRtZGJBcGlLZXkucGFyYW1ldGVyTmFtZSxcclxuICAgICAgZXhwb3J0TmFtZTogYCR7dGhpcy5zdGFja05hbWV9OlRtZGJBcGlLZXlQYXJhbWV0ZXJgLFxyXG4gICAgfSk7XHJcbiAgICBcclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdUYWJsZXNDb25maWdQYXJhbWV0ZXInLCB7XHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnRHluYW1vREIgdGFibGVzIGNvbmZpZ3VyYXRpb24gcGFyYW1ldGVyIHBhdGgnLFxyXG4gICAgICB2YWx1ZTogdGhpcy5wYXJhbWV0ZXJTdG9yZS5wYXJhbWV0ZXJzLnRhYmxlTmFtZXMucGFyYW1ldGVyTmFtZSxcclxuICAgICAgZXhwb3J0TmFtZTogYCR7dGhpcy5zdGFja05hbWV9OlRhYmxlc0NvbmZpZ1BhcmFtZXRlcmAsXHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgLy8gQWRkIHRhZ3NcclxuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnUHJvamVjdCcsICdUcmluaXR5Jyk7XHJcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ0Vudmlyb25tZW50JywgY29uZmlnLmVudmlyb25tZW50KTtcclxuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnU3RhY2snLCAnQ29uZmlnJyk7XHJcbiAgfVxyXG59Il19