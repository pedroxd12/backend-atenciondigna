import { Test, TestingModule } from '@nestjs/testing';
import { SucursalesService } from './sucursales.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('SucursalesService', () => {
  let service: SucursalesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SucursalesService, PrismaService],
    }).compile();

    service = module.get<SucursalesService>(SucursalesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
