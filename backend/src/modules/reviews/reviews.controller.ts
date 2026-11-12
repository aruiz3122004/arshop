import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ReviewsService } from "./reviews.service";
import { Public } from "../../common/decorators/public.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/user";
import {
  AdminListReviewsQuery,
  CreateReviewDto,
  ListReviewsQuery,
  ModerateReviewDto,
} from "./dto/review.dto";

@Controller("reviews")
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** Público: reseñas aprobadas + resumen de estrellas del producto. */
  @Public()
  @Get("product/:slug")
  listByProduct(
    @Param("slug") slug: string,
    @Query() query: ListReviewsQuery,
  ) {
    return this.reviews.listByProduct(slug, query);
  }

  /** Autenticado: compras del usuario que puede reseñar para este producto. */
  @Get("eligibility/:slug")
  eligibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param("slug") slug: string,
  ) {
    return this.reviews.eligibility(user, slug);
  }

  /** Autenticado: crear reseña verificada. */
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReviewDto) {
    return this.reviews.create(user, dto);
  }

  @Roles("ADMIN")
  @Get("admin/list")
  adminList(@Query() query: AdminListReviewsQuery) {
    return this.reviews.adminList(query);
  }

  @Roles("ADMIN")
  @Patch("admin/:id")
  moderate(
    @CurrentUser() admin: AuthenticatedUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: ModerateReviewDto,
  ) {
    return this.reviews.moderate(admin, id, dto);
  }
}
