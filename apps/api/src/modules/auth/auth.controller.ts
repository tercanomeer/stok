import { Body, Controller, Get, HttpCode, Ip, Post, UsePipes } from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';

import { AuthService, type AuthenticatedUser } from './auth.service.js';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type RefreshInput,
  type RegisterInput,
  type ResetPasswordInput,
} from './dto/auth.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { NoPermissionRequired } from '../../common/decorators/permissions.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';

/**
 * Auth endpoint'lerinde sıkı limit: 5 istek / dakika / IP
 * (03-mimari.md "Güvenlik"). Genel API limiti 100/dk, app.module'de.
 */
@Throttle({ default: { limit: 5, ttl: seconds(60) } })
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @UsePipes(new ZodValidationPipe(registerSchema))
  async register(@Body() body: RegisterInput) {
    return this.auth.register(body);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(@Body() body: LoginInput, @Ip() ip: string) {
    return this.auth.login(body, ip);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(refreshSchema))
  async refresh(@Body() body: RefreshInput) {
    return this.auth.refresh(body.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @UsePipes(new ZodValidationPipe(refreshSchema))
  async logout(@Body() body: RefreshInput): Promise<void> {
    await this.auth.logout(body.refreshToken);
  }

  /** Kullanıcının var olup olmadığı yanıttan anlaşılmaz — her durumda 204. */
  @Public()
  @Post('forgot-password')
  @HttpCode(204)
  @UsePipes(new ZodValidationPipe(forgotPasswordSchema))
  async forgotPassword(@Body() body: ForgotPasswordInput): Promise<void> {
    await this.auth.forgotPassword(body);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(204)
  @UsePipes(new ZodValidationPipe(resetPasswordSchema))
  async resetPassword(@Body() body: ResetPasswordInput): Promise<void> {
    await this.auth.resetPassword(body);
  }

  // İzin gerektirmez: kullanıcı yalnız KENDİ profilini okur, kimlik imzalı
  // token'dan gelir. Guard varsayılanı kapalı olduğu için açıkça işaretlenir.
  @NoPermissionRequired()
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.loadPrincipal(user.id);
  }
}
