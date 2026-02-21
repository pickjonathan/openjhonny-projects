import { Injectable } from '@nestjs/common';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  roles: string[];
  isActive: boolean;
}

@Injectable()
export class UsersService {
  private readonly users: UserRecord[] = [];

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.users.find((u) => u.id === id) ?? null;
  }
}
