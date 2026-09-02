import { Controller, Get } from '@nestjs/common';

export interface HealthStatus {
  status: 'up';
  service: string;
  timestamp: string;
  uptimeSeconds: number;
}

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthStatus {
    return {
      status: 'up',
      service: '@stokk/api',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
