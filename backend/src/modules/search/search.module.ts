import { Module, OnApplicationBootstrap, Logger } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ElasticsearchService } from "./elasticsearch.service";
import { CatalogSyncService, CATALOG_SYNC_QUEUE } from "./catalog-sync.service";
import { CatalogSyncProcessor } from "./catalog-sync.processor";
import { SupabaseModule } from "../../supabase/supabase.module";

@Module({
  imports: [
    BullModule.registerQueue({ name: CATALOG_SYNC_QUEUE }),
    SupabaseModule,
  ],
  providers: [
    ElasticsearchService,
    CatalogSyncService,
    CatalogSyncProcessor,
  ],
  exports: [ElasticsearchService, CatalogSyncService],
})
export class SearchModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(SearchModule.name);

  constructor(private readonly catalogSync: CatalogSyncService) {}

  async onApplicationBootstrap() {
    if (process.env.NODE_ENV !== "production") {
      this.logger.log("Modo desarrollo: sincronización automática en BullMQ en pausa.");
      return;
    }
    // Al inicializar la aplicación, encolar reindexación inicial para que el índice esté poblado
    this.logger.log("Inicializando sincronización de catálogo con motor de búsqueda en segundo plano...");
    await this.catalogSync.enqueueFullReindex();
  }
}
