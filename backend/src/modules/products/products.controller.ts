import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ProductsService } from "./products.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { ListProductsQuery } from "./dto/list-products.query";
import { Public } from "../../common/decorators/public.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { CatalogSyncService } from "../search/catalog-sync.service";
import type { AuthenticatedUser } from "../../common/types/user";

@Controller("products")
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly audit: AuditLogsService,
    private readonly catalogSync: CatalogSyncService,
  ) {}

  @Public()
  @Get()
  list(@Query() query: ListProductsQuery) {
    return this.products.list(query);
  }

  /**
   * Búsqueda full-text pública. Siempre filtra inactivos: visitantes no
   * autenticados no pueden listar drops ocultos ni borradores.
   */
  @Public()
  @Get("search")
  search(
    @Query("q") query?: string,
    @Query("gender") gender?: string,
    @Query("category") category?: string,
  ) {
    return this.products.searchFullText(query || "", {
      gender,
      category,
      includeInactive: false,
    });
  }

  /** Variante admin: incluye productos inactivos. */
  @Roles("ADMIN")
  @Get("admin/search")
  adminSearch(
    @Query("q") query?: string,
    @Query("gender") gender?: string,
    @Query("category") category?: string,
    @Query("includeInactive") includeInactive?: string,
  ) {
    return this.products.searchFullText(query || "", {
      gender,
      category,
      includeInactive: includeInactive !== "false",
    });
  }

  /** Panel admin: todos los productos (activos e inactivos). */
  @Roles("ADMIN")
  @Get("admin/list")
  adminList() {
    return this.products.adminList();
  }

  /** Panel admin: exportar catálogo en JSON desde el motor aislado (sin tocar la DB principal) */
  @Roles("ADMIN")
  @Get("admin/export/json")
  exportJson() {
    return this.products.exportCatalogFromSearchIndex();
  }

  /** Panel admin: reindexar catálogo en segundo plano */
  @Roles("ADMIN")
  @Post("admin/search/reindex")
  async triggerReindex(@CurrentUser() admin: AuthenticatedUser) {
    await this.catalogSync.enqueueFullReindex();
    await this.audit.record(admin.id, "CATALOG_REINDEX", "catalog", {});
    return { ok: true, message: "Reindexación del catálogo iniciada en segundo plano." };
  }

  /** Panel admin: detalle por id (incluye inactivos). */
  @Roles("ADMIN")
  @Get("admin/:id")
  adminDetail(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.products.detailById(id);
  }

  @Public()
  @Get(":slug")
  detail(@Param("slug") slug: string) {
    return this.products.detail(slug);
  }

  @Public()
  @Get(":slug/availability")
  availability(@Param("slug") slug: string) {
    return this.products.availability(slug);
  }

  @Roles("ADMIN")
  @Post()
  async create(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: CreateProductDto,
  ) {
    const created = await this.products.create(dto);
    await this.audit.record(admin.id, "PRODUCT_CREATE", created.id, { slug: created.slug });
    return created;
  }

  @Roles("ADMIN")
  @Patch(":id")
  async update(
    @CurrentUser() admin: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const result = await this.products.update(id, dto);
    await this.audit.record(admin.id, "PRODUCT_UPDATE", id, { patch: dto });
    return result;
  }

  @Roles("ADMIN")
  @Delete(":id")
  async remove(
    @CurrentUser() admin: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    const result = await this.products.remove(id);
    await this.audit.record(
      admin.id,
      result.archived ? "PRODUCT_ARCHIVE" : "PRODUCT_DELETE",
      id,
      {},
    );
    return result;
  }
}
