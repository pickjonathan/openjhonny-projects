import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RefreshJwtGuard } from './guards/refresh-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @UseGuards(RefreshJwtGuard)
  @Post('refresh')
  refresh(@Req() req: any, @Body() dto: RefreshDto) {
    return this.auth.refresh(req.user, dto.refreshToken);
  }

  @UseGuards(RefreshJwtGuard)
  @Post('logout')
  logout(@Req() req: any) {
    return this.auth.logout(req.user.sid);
  }
}
