import { Module } from "@nestjs/common";
import { InventoryService } from "./inventory.service";
import { InventoryController } from "./inventory.controller";
import { ReservationsCleanupService } from "./reservations-cleanup.service";
import { SearchModule } from "../search/search.module";

@Module({
  imports: [SearchModule],
  controllers: [InventoryController],
  providers: [InventoryService, ReservationsCleanupService],
  exports: [InventoryService],
})
export class InventoryModule {}
