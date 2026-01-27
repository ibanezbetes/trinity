import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoomAutomationService } from './room-automation.service';
import {
  CreateAutomationConfigDto,
  UpdateAutomationConfigDto,
  AutomationFeedbackDto,
  AutomationConfigResponseDto,
  SmartRecommendationResponseDto,
  AutomationPerformanceResponseDto,
  OptimizationDecisionResponseDto,
} from './dto/room-automation.dto';

@ApiTags('Room Automation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('room-automation')
export class RoomAutomationController {
  constructor(private readonly roomAutomationService: RoomAutomationService) {}

  @Post(':roomId/config')
  @ApiOperation({ summary: 'Create automation configuration for a room' })
  @ApiResponse({
    status: 201,
    description: 'Automation configuration created successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid configuration data' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  async createAutomationConfig(
    @Param('roomId') roomId: string,
    @Request() req: any,
    @Body() createConfigDto: CreateAutomationConfigDto,
  ): Promise<AutomationConfigResponseDto> {
    try {
      const config = await this.roomAutomationService.createAutomationConfig(
        roomId,
        req.user.sub,
        createConfigDto,
      );

      return {
        success: true,
        message: 'Automation configuration created successfully',
        data: config,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to create automation configuration',
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get(':roomId/config')
  @ApiOperation({ summary: 'Get automation configuration for a room' })
  @ApiResponse({
    status: 200,
    description: 'Automation configuration retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Automation configuration not found',
  })
  async getAutomationConfig(
    @Param('roomId') roomId: string,
  ): Promise<AutomationConfigResponseDto> {
    const config = await this.roomAutomationService.getAutomationConfig(roomId);

    if (!config) {
      throw new HttpException(
        {
          success: false,
          message: 'Automation configuration not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      success: true,
      message: 'Automation configuration retrieved successfully',
      data: config,
    };
  }

  @Put(':roomId/config')
  @ApiOperation({ summary: 'Update automation configuration for a room' })
  @ApiResponse({
    status: 200,
    description: 'Automation configuration updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid configuration data' })
  @ApiResponse({
    status: 404,
    description: 'Automation configuration not found',
  })
  async updateAutomationConfig(
    @Param('roomId') roomId: string,
    @Request() req: any,
    @Body() updateConfigDto: UpdateAutomationConfigDto,
  ): Promise<AutomationConfigResponseDto> {
    try {
      const config = await this.roomAutomationService.updateAutomationConfig(
        roomId,
        req.user.sub,
        updateConfigDto,
      );

      return {
        success: true,
        message: 'Automation configuration updated successfully',
        data: config,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to update automation configuration',
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post(':roomId/optimize')
  @ApiOperation({ summary: 'Manually trigger room optimization' })
  @ApiResponse({
    status: 200,
    description: 'Room optimization completed successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Room or automation configuration not found',
  })
  async optimizeRoom(
    @Param('roomId') roomId: string,
  ): Promise<OptimizationDecisionResponseDto> {
    try {
      const decisions = await this.roomAutomationService.optimizeRoom(roomId);

      return {
        success: true,
        message: 'Room optimization completed successfully',
        data: {
          roomId,
          decisions,
          optimizedAt: new Date(),
          totalDecisions: decisions.length,
          appliedDecisions: decisions.filter((d) => d.applied).length,
        },
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to optimize room',
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get(':roomId/recommendations')
  @ApiOperation({ summary: 'Get smart recommendations for room improvement' })
  @ApiResponse({
    status: 200,
    description: 'Smart recommendations retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Room not found' })
  async getSmartRecommendations(
    @Param('roomId') roomId: string,
    @Query('limit') limit?: number,
  ): Promise<SmartRecommendationResponseDto> {
    try {
      const recommendations =
        await this.roomAutomationService.generateSmartRecommendations(roomId);

      const limitedRecommendations = limit
        ? recommendations.slice(0, limit)
        : recommendations;

      return {
        success: true,
        message: 'Smart recommendations retrieved successfully',
        data: {
          roomId,
          recommendations: limitedRecommendations,
          totalRecommendations: recommendations.length,
          generatedAt: new Date(),
        },
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to generate recommendations',
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get(':roomId/performance')
  @ApiOperation({ summary: 'Get automation performance metrics for a room' })
  @ApiResponse({
    status: 200,
    description: 'Performance metrics retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Automation configuration not found',
  })
  async getAutomationPerformance(
    @Param('roomId') roomId: string,
  ): Promise<AutomationPerformanceResponseDto> {
    const performance =
      await this.roomAutomationService.getAutomationPerformance(roomId);

    if (!performance) {
      throw new HttpException(
        {
          success: false,
          message: 'Automation performance data not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      success: true,
      message: 'Performance metrics retrieved successfully',
      data: {
        roomId,
        metrics: performance,
        retrievedAt: new Date(),
      },
    };
  }

  @Post(':roomId/feedback')
  @ApiOperation({ summary: 'Provide feedback on automation performance' })
  @ApiResponse({ status: 200, description: 'Feedback submitted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid feedback data' })
  async provideAutomationFeedback(
    @Param('roomId') roomId: string,
    @Request() req: any,
    @Body() feedbackDto: AutomationFeedbackDto,
  ): Promise<{ success: boolean; message: string }> {
    try {
      await this.roomAutomationService.provideAutomationFeedback(
        roomId,
        req.user.sub,
        feedbackDto.automationType,
        feedbackDto.rating,
        feedbackDto.comment,
      );

      return {
        success: true,
        message: 'Feedback submitted successfully',
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to submit feedback',
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get(':roomId/status')
  @ApiOperation({ summary: 'Get automation status and overview for a room' })
  @ApiResponse({
    status: 200,
    description: 'Automation status retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Room not found' })
  async getAutomationStatus(@Param('roomId') roomId: string): Promise<{
    success: boolean;
    message: string;
    data: {
      roomId: string;
      isEnabled: boolean;
      automationLevel: string;
      lastOptimized?: Date;
      totalOptimizations: number;
      successRate: number;
      userSatisfaction?: number;
      activeRecommendations: number;
    };
  }> {
    try {
      const config =
        await this.roomAutomationService.getAutomationConfig(roomId);
      const recommendations =
        await this.roomAutomationService.generateSmartRecommendations(roomId);

      if (!config) {
        return {
          success: true,
          message: 'Automation status retrieved successfully',
          data: {
            roomId,
            isEnabled: false,
            automationLevel: 'none',
            totalOptimizations: 0,
            successRate: 0,
            activeRecommendations: 0,
          },
        };
      }

      const successRate =
        config.performanceMetrics.totalOptimizations > 0
          ? config.performanceMetrics.successfulOptimizations /
            config.performanceMetrics.totalOptimizations
          : 0;

      return {
        success: true,
        message: 'Automation status retrieved successfully',
        data: {
          roomId,
          isEnabled: config.isEnabled,
          automationLevel: config.automationLevel,
          lastOptimized: config.lastOptimizedAt,
          totalOptimizations: config.performanceMetrics.totalOptimizations,
          successRate: Math.round(successRate * 100) / 100,
          userSatisfaction: config.performanceMetrics.userSatisfactionScore,
          activeRecommendations: recommendations.length,
        },
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to get automation status',
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post(':roomId/config/enable')
  @ApiOperation({ summary: 'Enable automation for a room' })
  @ApiResponse({ status: 200, description: 'Automation enabled successfully' })
  async enableAutomation(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ): Promise<{ success: boolean; message: string }> {
    try {
      await this.roomAutomationService.updateAutomationConfig(
        roomId,
        req.user.sub,
        {
          isEnabled: true,
        },
      );

      return {
        success: true,
        message: 'Automation enabled successfully',
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to enable automation',
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post(':roomId/config/disable')
  @ApiOperation({ summary: 'Disable automation for a room' })
  @ApiResponse({ status: 200, description: 'Automation disabled successfully' })
  async disableAutomation(
    @Param('roomId') roomId: string,
    @Request() req: any,
  ): Promise<{ success: boolean; message: string }> {
    try {
      await this.roomAutomationService.updateAutomationConfig(
        roomId,
        req.user.sub,
        {
          isEnabled: false,
        },
      );

      return {
        success: true,
        message: 'Automation disabled successfully',
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to disable automation',
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('health')
  @ApiOperation({ summary: 'Check automation service health' })
  @ApiResponse({ status: 200, description: 'Service health status' })
  async getHealthStatus(): Promise<{
    success: boolean;
    message: string;
    data: {
      status: string;
      timestamp: Date;
      activeAutomations: number;
      systemLoad: string;
    };
  }> {
    // This would typically check system health, database connectivity, etc.
    return {
      success: true,
      message: 'Automation service is healthy',
      data: {
        status: 'healthy',
        timestamp: new Date(),
        activeAutomations: 0, // Would be calculated from actual data
        systemLoad: 'normal',
      },
    };
  }
}
